const Anthropic = require('@anthropic-ai/sdk');

let client;
const getClient = () => client || (client = new Anthropic());

function cost(usage, price) {
  return (
    usage.input * price.input +
    usage.output * price.output +
    usage.cacheWrite * price.cacheWrite +
    usage.cacheRead * price.cacheRead
  ) / 1e6;
}

/**
 * Runs the agent on Claude with structured output.
 */
async function run({ system, messages, schema, limits, config }) {
  const model = process.env.ANTHROPIC_MODEL || config.model;
  const res = await getClient().messages.create({
    model,
    max_tokens: limits.maxOutputTokens,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages,
    output_config: { format: { type: 'json_schema', schema } },
  });
  const usage = {
    input: res.usage.input_tokens || 0,
    output: res.usage.output_tokens || 0,
    cacheWrite: res.usage.cache_creation_input_tokens || 0,
    cacheRead: res.usage.cache_read_input_tokens || 0,
  };
  const raw = res.stop_reason === 'refusal' ? '' : res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return { raw, usage, costUsd: cost(usage, config.priceUsdPerMTok), model };
}

module.exports = { run };
