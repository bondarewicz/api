const fs = require('fs');
const path = require('path');
const spec = require('./agent.json');
const profile = require('./profile.json');
const guard = require('./guard');
const store = require('./store');
const admin = require('./admin');
const { answerSchema, normalise } = require('./schema');
const { makeLeadHandler, saveLead, isEmail } = require('./lead');
const { notify, adminLink, where } = require('./notify');
const providers = {
  ollama: require('./providers/ollama'),
  anthropic: require('./providers/anthropic'),
};

const system = fs.readFileSync(path.join(__dirname, spec.system), 'utf8') + JSON.stringify(profile, null, 2);
const sourceIds = [...profile.projects.map((p) => p.id), ...profile.experience.map((e) => e.id)];
const schema = answerSchema(sourceIds);
const limits = spec.limits;
const JD_MIN_CHARS = 150;
const ASK_WHO = 'By the way, who am I talking to? Share your name and the best email to reach you, and I\'ll make sure Łukasz gets back to you.';
const RESTING = `The assistant is resting for now. You can email Łukasz directly at ${profile.contact.email}.`;

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

/**
 * Picks the provider for this request. Claude only runs while today's spend is under budget;
 * after that it falls back to Ollama if AGENT_FALLBACK=ollama, otherwise the agent rests.
 */
async function pickProvider() {
  if (process.env.AGENT_ENABLED === 'false') return null;
  const wanted = process.env.AGENT_PROVIDER || 'ollama';
  if (wanted !== 'anthropic') return 'ollama';
  const budget = parseFloat(process.env.AGENT_DAILY_BUDGET_USD || limits.dailyBudgetUsd);
  if (process.env.ANTHROPIC_API_KEY && (await guard.spentToday()) < budget) return 'anthropic';
  return process.env.AGENT_FALLBACK === 'ollama' ? 'ollama' : null;
}

const emptyReply = (answer, status) => ({ answer, fit: { strong: [], discuss: [] }, sources: [], followups: [], offer_contact: true, visitor: {}, status });

/**
 * Saves the turn to the conversation log, notifies on a new conversation,
 * and turns contact details the visitor typed into a lead. Never fails the request.
 */
async function record({ req, ip, body, question, reply, model, costUsd }) {
  try {
    const { conv, isNew } = await store.recordTurn({ id: body.conversationId, req, ip, meta: body.meta, question, reply, model, costUsd });
    if (!conv) return false;
    if (isNew) {
      notify({ title: `New conversation · ${where(conv)}`, text: question.slice(0, 500), link: adminLink(conv.id), sendEmail: false });
    }
    const v = reply.visitor || {};
    if (isEmail(v.email) && (await store.setVisitor(conv.id, { name: v.name, email: v.email, company: v.company, role: v.role }))) {
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
    const admitted = await guard.admit('chat', ip, limits);
    if (!admitted.ok) {
      const answer = admitted.reason === 'visitor'
        ? `That's a lot of questions for one hour. Try again later, or leave your email below.`
        : RESTING;
      if (admitted.reason === 'global') await record({ req, ip, body, question, reply: emptyReply(answer, 'over daily limit') });
      return res.status(admitted.status).json({ error: admitted.reason, answer, offer_contact: true, remaining: 0 });
    }

    const name = await pickProvider();
    if (!name) {
      await record({ req, ip, body, question, reply: emptyReply(RESTING, 'resting') });
      return res.status(503).json({ error: 'resting', answer: RESTING, offer_contact: true, remaining: admitted.remaining });
    }

    // tell the model where the conversation stands, so it asks who the visitor is early and only once
    const known = store.ID_RE.test(body.conversationId || '') && Boolean(((await store.get(body.conversationId)) || { visitor: {} }).visitor.email);
    const visitorTurn = messages.filter((m) => m.role === 'user').length;
    const state = `\n\nConversation state: this is the visitor's message number ${visitorTurn}. Their contact details are ${known ? 'already known' : 'NOT known yet'}.`;

    const result = await providers[name].run({
      system: system + state,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      schema,
      limits,
      config: spec.providers[name],
    });
    await guard.addSpend(result.costUsd);
    console.log(`agent: ${result.model} in=${result.usage.input} out=${result.usage.output} $${result.costUsd.toFixed(5)}`);

    const reply = normalise(result.raw, sourceIds);
    // a fit report only makes sense against a pasted job description
    if (question.length < JD_MIN_CHARS) reply.fit = { strong: [], discuss: [] };
    if (!reply.answer && !reply.fit.strong.length) reply.answer = 'Sorry, I couldn\'t answer that. Leave your email and Łukasz will reply himself.';
    // the model doesn't reliably ask on its own, so make sure the first answer does
    if (!known && visitorTurn === 1 && !/\?\s*$/.test(reply.answer)) reply.answer = `${reply.answer}\n\n${ASK_WHO}`;

    const contactSaved = await record({ req, ip, body, question, reply: { ...reply, status: 'ok' }, model: result.model, costUsd: result.costUsd });
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
