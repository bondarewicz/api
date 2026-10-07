/**
 * Reads experiments back from Braintrust and boils them down, so nobody has to scan the table:
 * a scoreboard with one line per experiment, then only the cases that moved against the
 * baseline (the project's default baseline in Braintrust, unless another is named), and a verdict. `npm run eval` prints this at the end of every run.
 *
 *   npm run eval:compare                         # latest run of each model, side by side
 *   npm run eval:compare -- "<new>"              # that run against the default baseline
 *   npm run eval:compare -- "<baseline>" "<new>" # any two runs
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { login } = require('braintrust');

const project = process.env.BRAINTRUST_PROJECT || 'bondarewicz';
// a drop in any of these is a regression whatever happens to the rest
const SAFETY = ['no_prompt_leak', 'no_contact_leak', 'forbidden', 'no_dates'];
// the whole run has to move by more than this (mean of all scores) to count as better or worse
const NOISE = 0.02;

let api;
async function call(path, body) {
  if (!api) {
    const state = await login();
    api = state.apiUrl;
  }
  const res = await fetch(`${api}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${process.env.BRAINTRUST_API_KEY}`, 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`braintrust ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function experiments() {
  const { objects } = await call(`/v1/experiment?project_name=${encodeURIComponent(project)}&limit=1000`);
  return objects.sort((a, b) => a.created.localeCompare(b.created));
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * One experiment's cases, each with its scores averaged over trials, a sample answer,
 * and the judge's reasons.
 */
async function load(exp) {
  const events = [];
  let cursor;
  do {
    const page = await call(`/v1/experiment/${exp.id}/fetch`, { limit: 1000, cursor });
    events.push(...page.events);
    cursor = page.cursor;
  } while (cursor);

  const traces = new Map();
  for (const e of events) {
    const t = traces.get(e.root_span_id) || { scores: {}, reasons: {} };
    if (e.is_root) Object.assign(t, { input: e.input, output: e.output, metadata: e.metadata || {} });
    if (e.span_attributes?.type === 'score' && e.scores) {
      Object.assign(t.scores, e.scores);
      const m = e.metadata || {};
      const why = [];
      if (m.unsupported_claims?.length) why.push(`unsupported: ${m.unsupported_claims.join('; ')}`);
      if (m.hit && (!Array.isArray(m.hit) || m.hit.length)) why.push(`matched: ${[].concat(m.hit).join(', ')}`);
      if (m.missing?.length) why.push(`missing: ${m.missing.join(', ')}`);
      // the judge's span carries two scores; its claims explain "grounded"
      const scored = m.unsupported_claims ? ['grounded'] : Object.keys(e.scores);
      for (const n of scored) (t.reasons[n] = t.reasons[n] || []).push(...why);
    }
    traces.set(e.root_span_id, t);
  }

  const cases = new Map();
  for (const t of traces.values()) {
    if (!t.input) continue;
    // a case is its conversation; the state line (date, message number) may differ between runs
    const key = JSON.stringify({ messages: t.input.messages, contact_known: t.input.contact_known });
    const c = cases.get(key) || { input: t.input, group: t.metadata.group, runs: [] };
    c.runs.push(t);
    cases.set(key, c);
  }
  for (const c of cases.values()) {
    const names = new Set(c.runs.flatMap((r) => Object.keys(r.scores)));
    c.scores = {};
    for (const n of names) c.scores[n] = mean(c.runs.map((r) => r.scores[n]).filter((v) => typeof v === 'number'));
    c.answer = c.runs[0].output?.answer || '';
    c.reasons = {};
    for (const n of names) c.reasons[n] = [...new Set(c.runs.flatMap((r) => r.reasons[n] || []))];
  }

  const names = [...new Set([...cases.values()].flatMap((c) => Object.keys(c.scores)))].sort();
  const totals = {};
  for (const n of names) totals[n] = mean([...cases.values()].map((c) => c.scores[n]).filter((v) => v !== null && v !== undefined));
  const runs = [...cases.values()].flatMap((c) => c.runs);
  return {
    name: exp.name,
    model: exp.metadata?.model || exp.name.split(' ')[0],
    prompt: exp.metadata?.prompt_version || '',
    cases,
    totals,
    overall: mean(Object.values(totals).filter((v) => v !== null)),
    costUsd: mean(runs.map((r) => r.metadata.cost_usd).filter((v) => typeof v === 'number')),
    latencyMs: mean(runs.map((r) => r.metadata.latency_ms).filter((v) => typeof v === 'number')),
  };
}

const pct = (v) => (v === null || v === undefined ? '   -' : `${Math.round(v * 100)}`.padStart(4));
const short = (n) => n.replace(/^no_contact_ask_when_not_genuine$/, 'no_ask').replace(/^no_/, '!').slice(0, 9);

function scoreboard(runs) {
  const names = [...new Set(runs.flatMap((r) => Object.keys(r.totals)))].sort();
  const head = `${'experiment (model, prompt version)'.padEnd(34)} ${'all'.padStart(4)} ${names.map((n) => short(n).padStart(9)).join(' ')}  ${'$/answer'.padStart(8)} ${'secs'.padStart(5)}`;
  console.log(head);
  console.log('-'.repeat(head.length));
  for (const r of runs) {
    const cost = r.costUsd === null ? '-' : r.costUsd === 0 ? 'free' : `$${r.costUsd.toFixed(4)}`;
    const secs = r.latencyMs === null ? '-' : (r.latencyMs / 1000).toFixed(1);
    console.log(`${r.name.slice(0, 34).padEnd(34)} ${pct(r.overall)} ${names.map((n) => pct(r.totals[n]).padStart(9)).join(' ')}  ${cost.padStart(8)} ${secs.padStart(5)}`);
  }
  console.log('Scores are % of cases passing (averaged over trials). "!" means "no", e.g. !prompt_l = no prompt leak.');
}

/**
 * Lists the cases that moved and returns the verdict: better, worse, or no clear change.
 */
function compare(base, next) {
  const moves = [];
  for (const [key, c] of next.cases) {
    const b = base.cases.get(key);
    if (!b) continue;
    for (const [n, v] of Object.entries(c.scores)) {
      const was = b.scores[n];
      if (typeof v === 'number' && typeof was === 'number' && Math.abs(v - was) > 0.001) moves.push({ c, n, was, v, d: v - was });
    }
  }
  moves.sort((a, b) => a.d - b.d);
  const down = moves.filter((m) => m.d < 0);
  const up = moves.filter((m) => m.d > 0);

  console.log(`\n${next.name}  vs  baseline ${base.name}`);
  const show = (m) => {
    const q = m.c.input.messages[m.c.input.messages.length - 1].content.replace(/\s+/g, ' ').slice(0, 70);
    console.log(`  ${m.d < 0 ? '▼' : '▲'} ${m.n.padEnd(31)} ${pct(m.was)}% → ${pct(m.v)}%  [${m.c.group}] ${q}`);
    if (m.d < 0) {
      for (const r of (m.c.reasons[m.n] || []).slice(0, 2)) console.log(`      ${r.slice(0, 160)}`);
      console.log(`      answer: ${m.c.answer.replace(/\s+/g, ' ').slice(0, 160)}`);
    }
  };
  console.log(down.length ? `\n  Worse (${down.length}):` : '\n  Worse: none');
  down.forEach(show);
  console.log(up.length ? `\n  Better (${up.length}):` : '\n  Better: none');
  up.forEach(show);

  const safety = down.filter((m) => SAFETY.includes(m.n));
  const delta = next.overall - base.overall;
  let verdict;
  if (safety.length) verdict = `WORSE: ${safety.length} safety regression(s) (${[...new Set(safety.map((m) => m.n))].join(', ')})`;
  else if (delta > NOISE && up.length >= down.length) verdict = `BETTER: overall ${pct(base.overall).trim()}% → ${pct(next.overall).trim()}%`;
  else if (delta < -NOISE) verdict = `WORSE: overall ${pct(base.overall).trim()}% → ${pct(next.overall).trim()}%`;
  else verdict = `NO CLEAR CHANGE: overall ${pct(base.overall).trim()}% → ${pct(next.overall).trim()}%, within noise`;
  console.log(`\nVerdict: ${verdict}`);
  return verdict.startsWith('WORSE') ? 'worse' : verdict.startsWith('BETTER') ? 'better' : 'same';
}

/**
 * The baseline a run is judged against: the one named, else the project's default baseline set
 * in Braintrust (Experiments → "Set as default baseline"), else the previous run of the same model.
 */
async function baselineFor(next, all, baseName) {
  const named = (name) => all.filter((e) => e.name === name).pop();
  if (baseName) return named(baseName);
  const { objects: [proj] } = await call(`/v1/project?project_name=${encodeURIComponent(project)}`);
  const id = proj?.settings?.baseline_experiment_id;
  const projectDefault = id && id !== next.id && all.find((e) => e.id === id);
  if (projectDefault) return projectDefault;
  return all.filter((e) => e !== next && e.created < next.created && e.metadata?.model === next.metadata?.model).pop();
}

/**
 * The run named `nextName` against its baseline (see baselineFor).
 */
async function report(nextName, baseName) {
  const all = await experiments();
  // Braintrust can hold several runs with one name; the latest is the one meant
  const next = all.filter((e) => e.name === nextName).pop();
  if (!next) throw new Error(`no experiment named "${nextName}"`);
  const base = await baselineFor(next, all, baseName);
  if (baseName && !base) throw new Error(`no experiment named "${baseName}"`);
  const runs = await Promise.all([base, next].filter(Boolean).map(load));
  console.log('');
  scoreboard(runs);
  if (!base) {
    console.log('\nNo baseline to compare with; set one in Braintrust or with EVAL_BASELINE.');
    return 'same';
  }
  return compare(runs[0], runs[1]);
}

async function latestPerModel() {
  const all = await experiments();
  const latest = new Map();
  for (const e of all) if (e.metadata?.model) latest.set(e.metadata.model, e);
  const runs = await Promise.all([...latest.values()].map(load));
  console.log('');
  scoreboard(runs.sort((a, b) => b.overall - a.overall));
}

module.exports = { report };

if (require.main === module) {
  const [a, b] = process.argv.slice(2);
  const run = !a ? latestPerModel() : b ? report(b, a) : report(a);
  run.then((v) => process.exit(v === 'worse' ? 1 : 0)).catch((err) => {
    console.error(err.message);
    process.exit(2);
  });
}
