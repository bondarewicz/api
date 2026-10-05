const fs = require('fs');
const path = require('path');
const spec = require('./agent.json');
const profile = require('./profile.json');
const guard = require('./guard');
const store = require('./store');
const keys = require('./keys');
const admin = require('./admin');
const { answerSchema, normalise } = require('./schema');
const { makeLeadHandler, saveLead, isEmail } = require('./lead');
const { notify, adminLink, where } = require('./notify');
const providers = {
  ollama: require('./providers/ollama'),
  anthropic: require('./providers/anthropic'),
};

// the model only gets public links, never an email address it could hand out
const promptProfile = { ...profile, contact: { github: profile.contact.github, npm: profile.contact.npm } };
const system = fs.readFileSync(path.join(__dirname, spec.system), 'utf8') + JSON.stringify(promptProfile, null, 2);
const sourceIds = [...profile.projects.map((p) => p.id), ...profile.experience.map((e) => e.id)];
const schema = answerSchema(sourceIds);
const limits = spec.limits;
const JD_MIN_CHARS = 150;
const ASK_WHO = 'By the way, who am I talking to? Share your name and the best email to reach you, and I\'ll make sure Łukasz gets back to you.';
const RESTING = 'The assistant is resting for now. Leave your email with the button below and Łukasz will get back to you.';
const PAUSED = 'Let\'s leave it there for now. If you have a question about Łukasz\'s work later, I\'m happy to help.';
const ABUSE_LIMIT = 2;
const OFF_TOPIC_LIMIT = 4;

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
  const price = spec.providers.anthropic.priceUsdPerMTok;
  const chars = systemText.length + messages.reduce((n, m) => n + m.content.length, 0);
  return ((chars / 3) * price.input + limits.maxOutputTokens * price.output) / 1e6;
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

function isVisitorQuestion(q) {
  // \b treats Ł as a non-letter, so match the name separately
  return (/\b(he|his|him)\b/i.test(q) || /[łl]ukasz/i.test(q)) && !/\b(you|your|you're|yours)\b/i.test(q);
}

const emptyReply = (answer, status) => ({ answer, fit: { strong: [], discuss: [] }, sources: [], followups: [], offer_contact: true, visitor: {}, status });

/**
 * Saves the turn to the conversation log, notifies on a new conversation,
 * and turns contact details the visitor typed into a lead. Never fails the request.
 */
async function record({ req, ip, body, question, reply, model, costUsd, notifyNew = true }) {
  try {
    const { conv, isNew } = await store.recordTurn({ id: body.conversationId, req, ip, meta: body.meta, question, reply, model, costUsd });
    if (!conv) return false;
    // one "new conversation" push per visitor per hour, however many ids they make up
    if (isNew && notifyNew && (await guard.firstTime(keys.perVisitor('notified', ip), 3600))) {
      notify({ title: `New conversation · ${where(conv)}`, text: question.slice(0, 500), link: adminLink(conv.id), sendEmail: false });
    }
    const v = reply.visitor || {};
    if (isEmail(v.email) && (await store.setVisitor(conv.id, { name: v.name, email: v.email, company: v.company, role: v.role }, ip))) {
      await saveLead({ name: v.name, email: v.email, company: v.company, note: v.role, conversationId: conv.id, ip, source: 'chat' });
      return true;
    }
  } catch (err) {
    console.error('agent record failed', err);
  }
  return false;
}

async function agentChat(req, res) {
  const body = req.body || {};
  const messages = body.messages;
  const invalid = validate(messages);
  if (invalid) return res.status(400).json({ error: invalid });

  const ip = guard.visitorIp(req);
  const question = messages[messages.length - 1].content;
  try {
    if (await guard.isPaused(ip)) {
      return res.status(429).json({ error: 'paused', answer: PAUSED, offer_contact: false, remaining: 0 });
    }
    const admitted = await guard.admit('chat', ip, limits);
    if (!admitted.ok) {
      const answer = admitted.reason === 'visitor'
        ? `That's a lot of questions for one hour. Try again later, or leave your email below.`
        : RESTING;
      // over a limit: answer without recording or notifying, so the limits can't be used to flood
      return res.status(admitted.status).json({ error: admitted.reason, answer, offer_contact: true, remaining: 0 });
    }

    // tell the model where the conversation stands, so it asks who the visitor is early and only once
    const known = await store.visitorKnown(body.conversationId, ip);
    const visitorTurn = messages.filter((m) => m.role === 'user').length;
    const state = `\n\nConversation state: today is ${new Date().toISOString().slice(0, 10)}. This is the visitor's message number ${visitorTurn}. Their contact details are ${known ? 'already known' : 'NOT known yet'}.`;
    const turnMessages = messages.map((m) => ({ role: m.role, content: m.content }));

    const picked = await pickProvider(system + state, turnMessages);
    if (!picked) {
      await record({ req, ip, body, question, reply: emptyReply(RESTING, 'resting') });
      return res.status(503).json({ error: 'resting', answer: RESTING, offer_contact: true, remaining: admitted.remaining });
    }
    const { name, reserved } = picked;

    let result;
    try {
      result = await providers[name].run({ system: system + state, messages: turnMessages, schema, limits, config: spec.providers[name] });
    } catch (err) {
      if (reserved) await guard.settle(-reserved);
      throw err;
    } finally {
      if (name === 'anthropic') await guard.releaseSlot();
    }
    if (reserved) await guard.settle(result.costUsd - reserved);
    console.log(`agent: ${result.model} in=${result.usage.input} out=${result.usage.output} $${result.costUsd.toFixed(5)}`);

    const reply = normalise(result.raw, sourceIds);
    // follow-ups become the visitor's next message when clicked, so they must be questions
    // about Łukasz, never the agent asking the visitor something ("What role are you hiring for?")
    reply.followups = reply.followups.filter(isVisitorQuestion);
    // house style: no em dashes, whatever the model does
    reply.answer = reply.answer.replace(/\s*—\s*/g, ', ');
    const genuine = reply.intent === 'genuine';
    if (!genuine) {
      // keep it short and don't court someone who's abusing or messing with the agent
      Object.assign(reply, { offer_contact: false, followups: [], fit: { strong: [], discuss: [] }, visitor: {} });
      await guard.strike(ip, reply.intent, { abusive: ABUSE_LIMIT, off_topic: OFF_TOPIC_LIMIT });
    } else {
      await guard.clearStrikes(ip, 'off_topic');
    }
    // a fit report only makes sense against a pasted job description
    if (question.length < JD_MIN_CHARS) reply.fit = { strong: [], discuss: [] };
    if (!reply.answer && !reply.fit.strong.length) reply.answer = 'Sorry, I couldn\'t answer that. Leave your email and Łukasz will reply himself.';
    // the model doesn't reliably ask on its own, so make sure the first answer does
    if (genuine && !known && visitorTurn === 1 && !/\?\s*$/.test(reply.answer) && !/email/i.test(reply.answer)) reply.ask = ASK_WHO;

    const contactSaved = await record({ req, ip, body, question, reply: { ...reply, status: genuine ? 'ok' : reply.intent }, model: result.model, costUsd: result.costUsd, notifyNew: genuine });
    const { visitor, ...publicReply } = reply;
    res.json({ ...publicReply, contact_saved: contactSaved, remaining: admitted.remaining });
  } catch (err) {
    console.error('agent error', err);
    await record({ req, ip, body, question, reply: emptyReply(RESTING, 'error') });
    res.status(502).json({ error: 'agent unavailable', answer: RESTING, offer_contact: true });
  }
}

function agentProfile(req, res) {
  res.json(profile);
}

const agentLead = makeLeadHandler({ visitorIp: guard.visitorIp, admit: guard.admit, limits });

module.exports = { agentChat, agentProfile, agentLead, admin };
