/**
 * The agent's scorers, published to Braintrust with `npm run braintrust:push` so they can be
 * picked in "Create experiments" and the playground: the code checks from scorers.js, and a
 * "grounded" judge with the same rubric as `npm run eval`.
 */
const braintrust = require('braintrust');
const { z } = require('zod');
const { codeScorers } = require('./scorers');
const { INTRO, GROUNDED, PROFILE } = require('./rubric');

const project = braintrust.projects.create({ name: process.env.BRAINTRUST_PROJECT || 'bondarewicz' });
const parameters = z.object({ input: z.any(), output: z.any(), expected: z.any() });

for (const scorer of codeScorers) {
  project.scorers.create({
    name: scorer.name,
    slug: scorer.name.replace(/_/g, '-'),
    description: 'Site agent check, from evals/scorers.js',
    parameters,
    handler: scorer,
  });
}

project.scorers.create({
  name: 'grounded',
  slug: 'grounded',
  description: 'LLM judge: every claim about Łukasz is backed by the profile (rubric in evals/rubric.js)',
  messages: [{
    role: 'user',
    content: `${INTRO}

Is the answer grounded? That is: ${GROUNDED}

Conversation (JSON):
{{input.messages}}

Answer to grade (the "answer" field, plus the fit report if any):
{{output}}

${PROFILE}

Reply with one letter:
A: grounded, every claim is supported
B: at least one claim is unsupported`,
  }],
  model: 'claude-sonnet-5-5',
  useCot: true,
  choiceScores: { A: 1, B: 0 },
});
