const Anthropic = require('@anthropic-ai/sdk');
const { wrapAnthropic } = require('../trace');

let client;
const getClient = () => client || (client = wrapAnthropic(new Anthropic()));

function cost(usage, price) {
  return (
    usage.input * price.input +
    usage.output * price.output +
    usage.cacheWrite * price.cacheWrite +
    usage.cacheRead * price.cacheRead
  ) / 1e6;
}

/**
 * The model in use (ANTHROPIC_MODEL or agent.json) and its settings: price, and for models
 * that always think, the effort level and room for thinking on top of the answer.
 */
function modelConfig(config) {
  const model = process.env.ANTHROPIC_MODEL || config.model;
  const settings = config.models[model];
  if (!settings) throw new Error(`no settings for ${model} in agent.json`);
  return { model, ...settings };
}

/**
 * Runs the agent on Claude with structured output.
 */
async function run({ system, cacheable, state, messages, schema, limits, config }) {
  const { model, priceUsdPerMTok, effort, maxOutputTokens, fallbacks } = modelConfig(config);
  const params = {
    model,
    max_tokens: maxOutputTokens || limits.maxOutputTokens,
    // cache only what's the same for every visitor, so answers reuse it; the state line changes
    // every answer and follows uncached
    system: cacheable
      ? [{ type: 'text', text: cacheable, cache_control: { type: 'ephemeral' } }, { type: 'text', text: state }]
      : [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages,
    output_config: { format: { type: 'json_schema', schema }, ...(effort && { effort }) },
  };
  // on a safety decline, the API retries on a fallback model instead of returning nothing
  const res = fallbacks
    ? await getClient().beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
    : await getClient().messages.create(params);
  const usage = {
    input: res.usage.input_tokens || 0,
    output: res.usage.output_tokens || 0,
    cacheWrite: res.usage.cache_creation_input_tokens || 0,
    cacheRead: res.usage.cache_read_input_tokens || 0,
  };
  const raw = res.stop_reason === 'refusal' ? '' : res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return { raw, usage, costUsd: cost(usage, priceUsdPerMTok), model };
}

module.exports = { run, modelConfig };
