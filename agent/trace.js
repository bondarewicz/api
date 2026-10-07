const braintrust = require('braintrust');

/**
 * Braintrust tracing for every model call. Off unless BRAINTRUST_API_KEY is set, and
 * best-effort: a tracing failure is logged and never fails a visitor's request.
 */
let logger = null;
if (process.env.BRAINTRUST_API_KEY) {
  try {
    logger = braintrust.initLogger({ projectName: process.env.BRAINTRUST_PROJECT || 'bondarewicz' });
  } catch (err) {
    console.error('braintrust init failed', err);
  }
}

// Inside `braintrust eval` the experiment owns the trace, so spans nest under it even without a logger.
const active = () => !!logger || !!braintrust.currentExperiment();

/**
 * Where a trace comes from, so production and a local server are easy to tell apart in Braintrust:
 * "production" on Railway (its environment name), "eval" inside an experiment, "local" otherwise.
 * AGENT_ENV overrides it.
 */
const source = () => process.env.AGENT_ENV
  || (braintrust.currentExperiment() ? 'eval' : process.env.RAILWAY_ENVIRONMENT_NAME || 'local');

/**
 * Runs fn(span) inside a Braintrust span (type 'task' or 'llm'); with tracing off, span is a no-op.
 */
function traced(name, type, fn) {
  if (!active()) return fn(braintrust.NOOP_SPAN);
  return braintrust.traced(fn, { name, type });
}

function log(span, event) {
  try {
    span.log(event);
  } catch (err) {
    console.error('braintrust log failed', err);
  }
}

// Claude calls become 'llm' spans with tokens, latency and the full request and response.
const wrapAnthropic = (client) => (active() ? braintrust.wrapAnthropic(client) : client);

/**
 * Deletes every Braintrust trace of a conversation, for a visitor who asks for their data to be
 * removed. Braintrust applies deletions within seconds. Returns how many spans were deleted.
 */
async function deleteConversation(conversationId) {
  // the site's ids are letters, digits and dashes, which also keeps them safe inside the query
  if (!process.env.BRAINTRUST_API_KEY || !/^[a-zA-Z0-9-]{8,64}$/.test(conversationId || '')) return 0;
  const { apiUrl } = await braintrust.login();
  const call = async (path, body) => {
    const res = await fetch(`${apiUrl}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${process.env.BRAINTRUST_API_KEY}`, 'Content-Type': 'application/json' },
      body: body && JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`braintrust ${path}: ${res.status}`);
    return res.json();
  };
  const name = process.env.BRAINTRUST_PROJECT || 'bondarewicz';
  const { objects: [project] } = await call(`/v1/project?project_name=${encodeURIComponent(name)}`);
  if (!project) return 0;
  const q = (query) => call('/btql', { query, fmt: 'json' }).then((r) => r.data || []);
  const roots = await q(`select: root_span_id | from: project_logs('${project.id}') | filter: metadata.conversation_id = '${conversationId}'`);
  if (!roots.length) return 0;
  const list = [...new Set(roots.map((r) => `'${r.root_span_id}'`))].join(', ');
  const spans = await q(`select: id | from: project_logs('${project.id}') | filter: root_span_id IN [${list}]`);
  if (spans.length) await call(`/v1/project_logs/${project.id}/insert`, { events: spans.map((s) => ({ id: s.id, _object_delete: true })) });
  return spans.length;
}

module.exports = { traced, log, wrapAnthropic, source, deleteConversation };
