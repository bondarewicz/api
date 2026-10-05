const fs = require('fs');
const path = require('path');
const spec = require('./agent.json');
const profile = require('./profile.json');
const guard = require('./guard');
const { answerSchema, normalise } = require('./schema');
const { makeLeadHandler } = require('./lead');
const providers = {
  ollama: require('./providers/ollama'),
  anthropic: require('./providers/anthropic'),
};

const system = fs.readFileSync(path.join(__dirname, spec.system), 'utf8') + JSON.stringify(profile, null, 2);
const sourceIds = [...profile.projects.map((p) => p.id), ...profile.experience.map((e) => e.id)];
const schema = answerSchema(sourceIds);
const limits = spec.limits;
const JD_MIN_CHARS = 300;
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

async function agentChat(req, res) {
  const messages = req.body && req.body.messages;
  const invalid = validate(messages);
  if (invalid) return res.status(400).json({ error: invalid });

  const ip = guard.visitorIp(req);
  try {
    const admitted = await guard.admit('chat', ip, limits);
    if (!admitted.ok) {
      const answer = admitted.reason === 'visitor'
        ? `That's a lot of questions for one hour. Try again later, or leave your email below.`
        : RESTING;
      return res.status(admitted.status).json({ error: admitted.reason, answer, offer_contact: true, remaining: 0 });
    }

    const name = await pickProvider();
    if (!name) return res.status(503).json({ error: 'resting', answer: RESTING, offer_contact: true, remaining: admitted.remaining });

    const result = await providers[name].run({
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      schema,
      limits,
      config: spec.providers[name],
    });
    await guard.addSpend(result.costUsd);
    console.log(`agent: ${result.model} in=${result.usage.input} out=${result.usage.output} $${result.costUsd.toFixed(5)}`);

    const reply = normalise(result.raw, sourceIds);
    // a fit report only makes sense against a pasted job description
    if (messages[messages.length - 1].content.length < JD_MIN_CHARS) reply.fit = { strong: [], discuss: [] };
    if (!reply.answer && !reply.fit.strong.length) reply.answer = 'Sorry, I couldn\'t answer that. Leave your email and Łukasz will reply himself.';
    res.json({ ...reply, remaining: admitted.remaining });
  } catch (err) {
    console.error('agent error', err);
    res.status(502).json({ error: 'agent unavailable', answer: RESTING, offer_contact: true });
  }
}

function agentProfile(req, res) {
  res.json(profile);
}

const agentLead = makeLeadHandler({ visitorIp: guard.visitorIp, admit: guard.admit, limits });

module.exports = { agentChat, agentProfile, agentLead };
