/**
 * Publishes the agent's prompt from git to Braintrust as the prompt "site-agent", so experiments
 * and the playground in Braintrust start from exactly what production runs: system.md + the
 * public profile, the conversation state, Claude Haiku and the reply schema. Each push whose
 * prompt changed becomes a new version of it; git stays the source of truth.
 *
 * In the playground or "Create experiments", pick the "agent-cases" dataset and set
 * Advanced → "Appended dataset messages path" to `input.messages`, so each case's conversation
 * follows the system prompt.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { execSync } = require('child_process');
const { login } = require('braintrust');
const { system, schema, promptVersion } = require('../agent/respond');
const spec = require('../agent/agent.json');

const project = process.env.BRAINTRUST_PROJECT || 'bondarewicz';
const SLUG = 'site-agent';

(async () => {
  const { apiUrl } = await login();
  const call = async (method, path, body) => {
    const res = await fetch(`${apiUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${process.env.BRAINTRUST_API_KEY}`, 'Content-Type': 'application/json' },
      body: body && JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
    return res.json();
  };

  const { objects: [proj] } = await call('GET', `/v1/project?project_name=${encodeURIComponent(project)}`);
  const { objects: [current] } = await call('GET', `/v1/prompt?project_id=${proj.id}&slug=${SLUG}`);
  if (current?.metadata?.prompt_version === promptVersion) {
    console.log(`site-agent is already at prompt version ${promptVersion}`);
    return;
  }

  let commit = '';
  try {
    commit = execSync('git rev-parse --short HEAD', { cwd: __dirname }).toString().trim();
  } catch {}
  const dirty = (() => {
    try {
      return execSync('git status --porcelain agent', { cwd: __dirname }).toString().trim() !== '';
    } catch {
      return false;
    }
  })();

  const anthropic = spec.providers.anthropic;
  const prompt = await call('PUT', '/v1/prompt', {
    project_id: proj.id,
    name: 'Site agent',
    slug: SLUG,
    description: `The bondarewicz.com agent from git (agent/system.md + profile), prompt version ${promptVersion}${commit ? `, commit ${commit}${dirty ? ' with uncommitted changes' : ''}` : ''}.`,
    tags: [anthropic.model, `prompt-${promptVersion}`],
    metadata: { prompt_version: promptVersion, commit, uncommitted: dirty },
    prompt_data: {
      prompt: {
        type: 'chat',
        // production appends the conversation state (date, message number, whether contact details are known)
        messages: [{ role: 'system', content: `${system}\n\n{{{input.state}}}` }],
      },
      options: {
        model: anthropic.model,
        params: {
          max_tokens: spec.limits.maxOutputTokens,
          response_format: { type: 'json_schema', json_schema: { name: 'reply', schema, strict: true } },
        },
      },
    },
  });
  console.log(`site-agent now at prompt version ${promptVersion} (${prompt.id})`);
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
