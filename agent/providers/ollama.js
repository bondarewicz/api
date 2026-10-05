const fetch = require('node-fetch');

/**
 * Runs the agent on a local/self-hosted Ollama model. Costs nothing per token.
 */
async function run({ system, messages, schema, limits, config }) {
  const url = process.env.OLLAMA_URL || config.url;
  const model = process.env.OLLAMA_MODEL || config.model;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 90000);
  try {
    const r = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: system }, ...messages],
        format: schema,
        stream: false,
        think: false,
        options: { num_predict: limits.maxOutputTokens, temperature: 0.3 },
      }),
      signal: abort.signal,
    });
    if (!r.ok) throw new Error(`ollama http ${r.status}: ${await r.text()}`);
    const data = await r.json();
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
