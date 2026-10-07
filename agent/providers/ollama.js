const fetch = require('node-fetch');
const { traced, log } = require('../trace');

/**
 * Runs the agent on a local/self-hosted Ollama model. Costs nothing per token.
 */
function run({ system, messages, schema, limits, config }) {
  return traced('ollama', 'llm', (span) => call(span, { system, messages, schema, limits, config }));
}

async function call(span, { system, messages, schema, limits, config }) {
  const url = process.env.OLLAMA_URL || config.url;
  const model = process.env.OLLAMA_MODEL || config.model;
  const chat = [{ role: 'system', content: system }, ...messages];
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 90000);
  try {
    const r = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: chat,
        format: schema,
        stream: false,
        think: false,
        options: { num_predict: limits.maxOutputTokens, temperature: 0.3 },
      }),
      signal: abort.signal,
    });
    if (!r.ok) throw new Error(`ollama http ${r.status}: ${await r.text()}`);
    const data = await r.json();
    log(span, {
      input: chat,
      output: data.message.content,
      metadata: { model, provider: 'ollama' },
      metrics: { prompt_tokens: data.prompt_eval_count || 0, completion_tokens: data.eval_count || 0 },
    });
    return {
      raw: data.message.content,
      usage: { input: data.prompt_eval_count || 0, output: data.eval_count || 0 },
      costUsd: 0,
      model: `ollama/${model}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { run };
