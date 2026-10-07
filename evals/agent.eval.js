/**
 * Experiment: runs the site agent over a dataset and scores every reply.
 *
 *   npm run eval                                                    # local Ollama, free
 *   AGENT_PROVIDER=anthropic npm run eval                           # Claude Haiku, as in production
 *   AGENT_PROVIDER=anthropic ANTHROPIC_MODEL=claude-opus-5-5 npm run eval
 *   EVAL_TRIALS=1 npm run eval                                      # one run per case instead of three
 *   EVAL_BASELINE="<experiment name>" npm run eval                  # compare against a specific run
 *
 * Claude runs are billed and don't count towards the agent's daily budget.
 *
 * With BRAINTRUST_API_KEY, cases come from the Braintrust dataset "agent-cases" (seed it from
 * evals/cases.json with `npm run eval:upload`), each run is an experiment named and tagged after
 * the model and prompt version, and the run ends with a verdict against the default baseline set
 * in Braintrust (see report.js). Without the key it reads evals/cases.json and only prints scores.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { Eval, initDataset, flush } = require('braintrust');
const { prompt, respond, promptVersion } = require('../agent/respond');
const { modelConfig } = require('../agent/providers/anthropic');
const spec = require('../agent/agent.json');
const { judged, JUDGE_MODEL } = require('./judge');
const { report } = require('./report');
const { scorers } = require('./scorers');

const project = process.env.BRAINTRUST_PROJECT || 'bondarewicz';
const provider = process.env.AGENT_PROVIDER === 'anthropic' ? 'anthropic' : 'ollama';
const seed = path.join(__dirname, 'cases.json');

const model = provider === 'anthropic'
  ? modelConfig(spec.providers.anthropic).model
  : `ollama/${process.env.OLLAMA_MODEL || spec.providers.ollama.model}`;
const dataset = process.env.BRAINTRUST_API_KEY ? (process.env.BRAINTRUST_DATASET || 'agent-cases') : null;
const data = dataset ? initDataset({ project, dataset }) : JSON.parse(fs.readFileSync(seed, 'utf8'));
// models don't answer the same way twice, so each case runs several times and scores are averaged
const trials = parseInt(process.env.EVAL_TRIALS || '3', 10);

const scores = [...Object.values(scorers), judged];

Eval(project, {
  experimentName: `${model} ${promptVersion}`,
  data,
  task: async (input, hooks) => {
    const known = !!input.contact_known;
    const started = Date.now();
    const { reply, result } = await respond({ provider, turn: prompt(input.messages, known), known });
    Object.assign(hooks.metadata, { cost_usd: result.costUsd, latency_ms: Date.now() - started });
    return reply;
  },
  scores,
  trialCount: trials,
  tags: [model, `prompt-${promptVersion}`],
  metadata: { provider, model, prompt_version: promptVersion, judge: JUDGE_MODEL, dataset: dataset || 'evals/cases.json', trials },
  maxConcurrency: provider === 'anthropic' ? 4 : 1,
  ...(process.env.EVAL_BASELINE && { baseExperimentName: process.env.EVAL_BASELINE }),
}, { noSendLogs: !process.env.BRAINTRUST_API_KEY })
  // the verdict against EVAL_BASELINE or the project's default baseline; exits 1 when worse
  .then(async ({ summary }) => {
    if (!process.env.BRAINTRUST_API_KEY) return;
    await flush();
    const verdict = await report(summary.experimentName, process.env.EVAL_BASELINE);
    process.exitCode = verdict === 'worse' ? 1 : 0;
  });
