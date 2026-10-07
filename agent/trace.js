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

module.exports = { traced, log, wrapAnthropic };
