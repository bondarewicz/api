const Anthropic = require('@anthropic-ai/sdk');
const { wrapAnthropic } = require('../agent/trace');
const { INTRO, GROUNDED, ANSWERED, PROFILE } = require('./rubric');

/**
 * LLM judge for what code can't check: is every claim backed by the profile, and does the
 * answer deal with what the visitor asked. Runs on Claude whichever model is being tested,
 * so scores stay comparable across providers.
 */
const MODEL = process.env.EVAL_JUDGE_MODEL || 'claude-sonnet-5-5';

const RUBRIC = `${INTRO}

Judge two things:
1. grounded: ${GROUNDED} List every unsupported claim.
2. answered: ${ANSWERED}

${PROFILE}`;

const SCHEMA = {
  type: 'object',
  properties: {
    unsupported_claims: { type: 'array', items: { type: 'string' } },
    grounded: { type: 'boolean' },
    answered: { type: 'string', enum: ['yes', 'partly', 'no', 'n/a'] },
    reason: { type: 'string' },
  },
  required: ['unsupported_claims', 'grounded', 'answered', 'reason'],
  additionalProperties: false,
};

let client;
const getClient = () => client || (client = wrapAnthropic(new Anthropic()));

async function judge({ input, output }) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const conversation = input.messages.map((m) => `${m.role === 'user' ? 'Visitor' : 'Assistant'}: ${m.content}`).join('\n\n');
  const fit = output.fit && (output.fit.strong.length || output.fit.discuss.length)
    ? `\n\nFit report:\n${JSON.stringify(output.fit, null, 2)}`
    : '';
  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: [{ type: 'text', text: RUBRIC, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `Conversation:\n${conversation}\n\nAnswer to grade:\n${output.answer}${fit}` }],
    output_config: { format: { type: 'json_schema', schema: SCHEMA }, effort: 'medium' },
  });
  if (res.stop_reason === 'refusal') return null;
  return JSON.parse(res.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
}

/**
 * Braintrust scorer: one judge call per answer, reported as two scores.
 */
async function judged(args) {
  const verdict = await judge(args);
  if (!verdict) return [];
  const answered = { yes: 1, partly: 0.5, no: 0 }[verdict.answered];
  return [
    { name: 'grounded', score: verdict.grounded && !verdict.unsupported_claims.length ? 1 : 0, metadata: { unsupported_claims: verdict.unsupported_claims, reason: verdict.reason } },
    ...(answered === undefined ? [] : [{ name: 'answered', score: answered, metadata: { reason: verdict.reason } }]),
  ];
}

module.exports = { judged, JUDGE_MODEL: MODEL };
