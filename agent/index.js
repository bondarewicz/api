const spec = require('./agent.json');
const guard = require('./guard');
const { client: redis } = require('../redis');
const store = require('./store');
const keys = require('./keys');
const admin = require('./admin');
const { prompt, respond, promptProfile } = require('./respond');
const { makeLeadHandler, saveLead, isEmail } = require('./lead');
const { notify, adminLink, where } = require('./notify');
const { modelConfig } = require('./providers/anthropic');
const voice = require('./voice');

const limits = spec.limits;
// fixed replies in the languages the site comes in
const RESTING = {
  en: 'The assistant is resting for now. Leave your email with the button below and Łukasz will get back to you.',
  pl: 'Asystent na razie odpoczywa. Zostaw swój e-mail przyciskiem poniżej, a Łukasz się odezwie.',
};
const PAUSED = {
  en: 'Let\'s leave it there for now. If you have a question about Łukasz\'s work later, I\'m happy to help.',
  pl: 'Na razie na tym zakończmy. Jeśli później będziesz mieć pytanie o pracę Łukasza, chętnie pomogę.',
};
const PAUSED_OFF_TOPIC = {
  en: 'Too many off-topic questions in a row. Try again in an hour, or leave your email below.',
  pl: 'Za dużo pytań nie na temat z rzędu. Spróbuj ponownie za godzinę albo zostaw swój e-mail poniżej.',
};
const TOO_MANY = {
  en: 'That\'s a lot of questions for one hour. Try again later, or leave your email below.',
  pl: 'To sporo pytań jak na jedną godzinę. Spróbuj później albo zostaw swój e-mail poniżej.',
};
const ABUSE_LIMIT = 2;
const OFF_TOPIC_LIMIT = 6;

function validate(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return 'messages must be a non-empty array';
  if (messages.length > limits.maxTurns * 2) return 'conversation too long, please start a new one';
  for (const m of messages) {
    if (!m || !['user', 'assistant'].includes(m.role)) return 'invalid role';
    if (typeof m.content !== 'string' || !m.content.trim()) return 'empty message';
    if (m.content.length > limits.maxMessageChars) return `message too long (max ${limits.maxMessageChars} characters)`;
  }
  if (messages[0].role !== 'user' || messages[messages.length - 1].role !== 'user') return 'conversation must start and end with a user message';
  return null;
}

// Worst case for one Claude call: every input character a token (generous) plus the full output.
function estimateUsd(systemText, messages) {
  const { priceUsdPerMTok: price, maxOutputTokens } = modelConfig(spec.providers.anthropic);
  const chars = systemText.length + messages.reduce((n, m) => n + m.content.length, 0);
  return ((chars / 3) * price.input + (maxOutputTokens || limits.maxOutputTokens) * price.output) / 1e6;
}

/**
 * Picks the provider for this request. A Claude call first reserves its worst-case cost from
 * today's budget and takes one of a few concurrent slots; when either runs out it falls back
 * to Ollama if AGENT_FALLBACK=ollama, otherwise the agent rests.
 */
async function pickProvider(systemText, messages) {
  if (process.env.AGENT_ENABLED === 'false' || (await guard.killState())) return null;
  const wanted = process.env.AGENT_PROVIDER || 'ollama';
  if (wanted !== 'anthropic') return { name: 'ollama', reserved: 0 };
  const fallback = process.env.AGENT_FALLBACK === 'ollama' ? { name: 'ollama', reserved: 0 } : null;
  if (!process.env.ANTHROPIC_API_KEY) return fallback;

  const budget = parseFloat(process.env.AGENT_DAILY_BUDGET_USD || limits.dailyBudgetUsd);
  const reserved = estimateUsd(systemText, messages);
  if (!(await guard.reserve(reserved, budget))) return fallback;
  if (!(await guard.acquireSlot(limits.maxConcurrentCalls))) {
    await guard.settle(-reserved);
    return fallback;
  }
  return { name: 'anthropic', reserved };
}

const emptyReply = (answer, status) => ({ answer, fit: { strong: [], discuss: [] }, followups: [], offer_contact: true, visitor: {}, status });

/**
 * Saves the turn to the conversation log, notifies on a new conversation,
 * and turns contact details the visitor typed into a lead. Never fails the request.
 * Returns { contactSaved, messageId }.
 */
async function record({ req, ip, body, question, reply, model, costUsd, notifyNew = true }) {
  // the site's language when the answer was given, so it's spoken in that language's voice
  const lang = body.lang === 'pl' ? 'pl' : 'en';
  try {
    const { conv, isNew, messageId } = await store.recordTurn({ id: body.conversationId, req, ip, meta: body.meta, question, reply, model, costUsd, lang });
    if (!conv) return { contactSaved: false };
    // one "new conversation" push per visitor per hour, however many ids they make up
    if (isNew && notifyNew && (await guard.firstTime(keys.perVisitor('notified', ip), 3600))) {
      notify({ title: `New conversation · ${where(conv)}`, pushTitle: 'New conversation', text: question.slice(0, 500), link: adminLink(conv.id), sendEmail: false });
    }
    const v = reply.visitor || {};
    if (isEmail(v.email) && (await store.setVisitor(conv.id, { name: v.name, email: v.email, company: v.company, role: v.role }, ip))) {
      await saveLead({ name: v.name, email: v.email, company: v.company, note: v.role, conversationId: conv.id, ip, source: 'chat' });
      return { contactSaved: true, messageId };
    }
    return { contactSaved: false, messageId };
  } catch (err) {
    console.error('agent record failed', err);
  }
  return { contactSaved: false };
}

async function agentChat(req, res) {
  const body = req.body || {};
  const messages = body.messages;
  const invalid = validate(messages);
  if (invalid) return res.status(400).json({ error: invalid });

  const ip = guard.visitorIp(req);
  const question = messages[messages.length - 1].content;
  const lang = body.lang === 'pl' ? 'pl' : 'en';
  try {
    const paused = await guard.isPaused(ip);
    if (paused) {
      // someone who only drifted off-topic may still be a lead; an abusive visitor isn't courted
      const offTopic = paused === 'off_topic';
      return res.status(429).json({ error: 'paused', answer: offTopic ? PAUSED_OFF_TOPIC[lang] : PAUSED[lang], offer_contact: offTopic, remaining: 0 });
    }
    const admitted = await guard.admit('chat', ip, limits);
    if (!admitted.ok) {
      const answer = admitted.reason === 'visitor'
        ? TOO_MANY[lang]
        : RESTING[lang];
      // over a limit: answer without recording or notifying, so the limits can't be used to flood
      return res.status(admitted.status).json({ error: admitted.reason, answer, offer_contact: true, remaining: 0 });
    }

    const known = await store.visitorKnown(body.conversationId, ip);
    const turn = prompt(messages, known, { lang });

    const picked = await pickProvider(turn.system, turn.messages);
    if (!picked) {
      await record({ req, ip, body, question, reply: emptyReply(RESTING[lang], 'resting') });
      return res.status(503).json({ error: 'resting', answer: RESTING[lang], offer_contact: true, remaining: admitted.remaining });
    }
    const { name, reserved } = picked;

    let reply, result;
    try {
      ({ reply, result } = await respond({ provider: name, turn, known, conversationId: body.conversationId }));
    } catch (err) {
      if (reserved) await guard.settle(-reserved);
      throw err;
    } finally {
      if (name === 'anthropic') await guard.releaseSlot();
    }
    if (reserved) await guard.settle(result.costUsd - reserved);
    console.log(`agent: ${result.model} in=${result.usage.input} out=${result.usage.output} $${result.costUsd.toFixed(5)}`);

    const genuine = reply.intent === 'genuine';
    if (!genuine) {
      await guard.strike(ip, reply.intent, { abusive: ABUSE_LIMIT, off_topic: OFF_TOPIC_LIMIT });
    } else {
      await guard.clearStrikes(ip, 'off_topic');
    }

    const { contactSaved, messageId } = await record({ req, ip, body, question, reply: { ...reply, status: genuine ? 'ok' : reply.intent }, model: result.model, costUsd: result.costUsd, notifyNew: genuine });
    const { visitor, ...publicReply } = reply;
    res.json({ ...publicReply, contact_saved: contactSaved, message_id: messageId, remaining: admitted.remaining });
  } catch (err) {
    console.error('agent error', err);
    await record({ req, ip, body, question, reply: emptyReply(RESTING[lang], 'error') });
    res.status(502).json({ error: 'agent unavailable', answer: RESTING[lang], offer_contact: true });
  }
}

function agentProfile(req, res) {
  res.json(promptProfile); // public part only: no private projects, no email
}

/**
 * Whether the agent can answer right now: Redis reachable and the agent not switched off
 * (kill switch or AGENT_ENABLED). The site's online dot uses it.
 */
async function agentStatus(req, res) {
  res.set('Cache-Control', 'no-store');
  try {
    // a Redis that's down would leave the command waiting, so give up after 2 seconds
    await Promise.race([redis.ping(), new Promise((_, reject) => setTimeout(() => reject(new Error('redis timeout')), 2000))]);
    const off = process.env.AGENT_ENABLED === 'false' || Boolean(await guard.killState());
    // voice: whether answers can be spoken (an ElevenLabs key and characters left this month)
    res.json({ online: !off, voice: !off && (await voice.available()) });
  } catch (err) {
    res.status(503).json({ online: false });
  }
}

const agentLead = makeLeadHandler({ visitorIp: guard.visitorIp, admit: guard.admit, limits });

module.exports = { agentChat, agentProfile, agentStatus, agentLead, admin, voice };
