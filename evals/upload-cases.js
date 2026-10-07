/**
 * Copies evals/cases.json into the Braintrust dataset experiments read from ("agent-cases").
 * Each case gets the conversation-state line production appends, and keeps a stable id, so
 * running it again updates cases instead of duplicating them; rows added in Braintrust (e.g. from
 * logged traces) are left alone.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const crypto = require('crypto');
const { initDataset } = require('braintrust');
const cases = require('./cases.json');
const { prompt } = require('../agent/respond');

const project = process.env.BRAINTRUST_PROJECT || 'bondarewicz';
const name = process.env.BRAINTRUST_DATASET || 'agent-cases';

(async () => {
  const dataset = initDataset({ project, dataset: name });
  for (const c of cases) {
    const id = crypto.createHash('sha256').update(JSON.stringify(c.input)).digest('hex').slice(0, 16);
    // the same conversation-state line production appends, for prompts run inside Braintrust
    const { state } = prompt(c.input.messages, !!c.input.contact_known);
    dataset.insert({ id, input: { ...c.input, state }, expected: c.expected, metadata: c.metadata });
  }
  console.log(await dataset.summarize());
})();
