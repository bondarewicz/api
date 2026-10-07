const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const spec = require('./agent.json');
const { promptProfile } = require('./prompt-profile');
const { answerSchema, normalise, isEmail } = require('./schema');
const { traced, log, source } = require('./trace');
const providers = {
  ollama: require('./providers/ollama'),
  anthropic: require('./providers/anthropic'),
};

const system = fs.readFileSync(path.join(__dirname, spec.system), 'utf8') + JSON.stringify(promptProfile, null, 2);
// changes whenever system.md or the profile does, so traces and experiments can be compared per prompt
const promptVersion = crypto.createHash('sha256').update(system).digest('hex').slice(0, 12);
const schema = answerSchema();
const limits = spec.limits;
const JD_MIN_CHARS = 150;
const ASK_WHO = 'By the way, who am I talking to? Share your name and the best email to reach you, and I\'ll make sure Łukasz gets back to you.';

function isVisitorQuestion(q) {
  // \b treats Ł as a non-letter, so match the name separately
  return (/\b(he|his|him)\b/i.test(q) || /[łl]ukasz/i.test(q)) && !/\b(you|your|you're|yours)\b/i.test(q);
}

/**
 * The full prompt for this turn: system.md + profile, then where the conversation stands,
 * so the model asks who the visitor is early and only once.
 */
function prompt(messages, known, today = new Date().toISOString().slice(0, 10)) {
  const visitorTurn = messages.filter((m) => m.role === 'user').length;
  const availabilityMentioned = messages.some((m) => m.role === 'assistant' && /finishing up|looking for (his|a) (next|new)/i.test(m.content));
  const state = `\n\nConversation state: today is ${today}. This is the visitor's message number ${visitorTurn}. Their contact details are ${known ? 'already known' : 'NOT known yet'}. His availability has ${availabilityMentioned ? 'ALREADY been mentioned, so don\'t mention it again unless asked directly' : 'not been mentioned yet'}.`;
  return { system: system + state, state: state.trim(), messages: messages.map((m) => ({ role: m.role, content: m.content })), visitorTurn };
}

/**
 * Runs one turn on the given provider and applies the house rules to the reply.
 * Used by the chat route and by experiments, so both see exactly the same agent.
 */
async function respond({ provider, turn, known }) {
  const result = await providers[provider].run({ system: turn.system, messages: turn.messages, schema, limits, config: spec.providers[provider] });
  const question = turn.messages[turn.messages.length - 1].content;

  const reply = normalise(result.raw);
  // follow-ups become the visitor's next message when clicked, so they must be questions
  // about Łukasz, never the agent asking the visitor something ("What role are you hiring for?")
  reply.followups = reply.followups.filter(isVisitorQuestion);
  // house style: no em dashes, whatever the model does
  reply.answer = reply.answer.replace(/\s*—\s*/g, ', ');
  const genuine = reply.intent === 'genuine';
  if (!genuine) {
    // keep it short and don't court someone who's abusing or messing with the agent
    Object.assign(reply, { offer_contact: false, followups: [], fit: { strong: [], discuss: [] }, visitor: {} });
  }
  // a fit report only makes sense against a pasted job description
  if (question.length < JD_MIN_CHARS) reply.fit = { strong: [], discuss: [] };
  if (!reply.answer && !reply.fit.strong.length) reply.answer = 'Sorry, I couldn\'t answer that. Leave your email and Łukasz will reply himself.';
  // the model doesn't reliably ask on its own, so make sure the first answer does
  if (genuine && !known && !isEmail(reply.visitor?.email) && turn.visitorTurn === 1 && !/\?\s*$/.test(reply.answer) && !/email/i.test(reply.answer)) reply.ask = ASK_WHO;

  return { reply, result };
}

/**
 * respond() inside a Braintrust 'agent.chat' span: the visitor's messages in, the reply out,
 * and what's needed to slice traces (prompt version, model, intent, cost), with where it ran
 * (production, local or eval), the model and the intent as tags for one-click filtering. No IP, location or browser details; those stay in Redis.
 */
function tracedRespond({ provider, turn, known, conversationId }) {
  return traced('agent.chat', 'task', async (span) => {
    const out = await respond({ provider, turn, known });
    const { reply, result } = out;
    log(span, {
      input: { messages: turn.messages, contact_known: known, state: turn.state },
      output: reply,
      metadata: {
        source: source(),
        conversation_id: conversationId,
        prompt_version: promptVersion,
        provider,
        model: result.model,
        visitor_turn: turn.visitorTurn,
        intent: reply.intent,
        cost_usd: result.costUsd,
      },
      tags: [source(), result.model, reply.intent],
    });
    return out;
  });
}

module.exports = { prompt, respond: tracedRespond, promptProfile, promptVersion, system, schema };
