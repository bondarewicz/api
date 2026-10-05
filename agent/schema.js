/**
 * The structured reply every provider must return, so the site can render
 * fit reports, source chips and follow-up suggestions instead of parsing prose.
 */
function answerSchema(sourceIds) {
  return {
    type: 'object',
    properties: {
      answer: { type: 'string' },
      fit: {
        type: 'object',
        properties: {
          strong: { type: 'array', items: { type: 'string' } },
          discuss: { type: 'array', items: { type: 'string' } },
        },
        required: ['strong', 'discuss'],
        additionalProperties: false,
      },
      sources: { type: 'array', items: { type: 'string', enum: sourceIds } },
      followups: { type: 'array', items: { type: 'string' } },
      offer_contact: { type: 'boolean' },
    },
    required: ['answer', 'fit', 'sources', 'followups', 'offer_contact'],
    additionalProperties: false,
  };
}

const clip = (s, n) => String(s || '').trim().slice(0, n);
const list = (xs, max, len) => (Array.isArray(xs) ? xs : []).map((x) => clip(x, len)).filter(Boolean).slice(0, max);

// Small local models don't always honour the schema, so normalise whatever came back.
function normalise(raw, sourceIds) {
  let data = raw;
  if (typeof raw === 'string') {
    try { data = JSON.parse(raw); } catch { data = { answer: raw }; }
  }
  data = data || {};
  return {
    answer: clip(data.answer, 2000),
    fit: {
      strong: list(data.fit && data.fit.strong, 8, 240),
      discuss: list(data.fit && data.fit.discuss, 8, 240),
    },
    sources: [...new Set(list(data.sources, 6, 40).filter((id) => sourceIds.includes(id)))],
    followups: list(data.followups, 2, 120),
    offer_contact: data.offer_contact === true,
  };
}

module.exports = { answerSchema, normalise };
