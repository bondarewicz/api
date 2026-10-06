/**
 * The structured reply every provider must return, so the site can render
 * fit reports and follow-up suggestions instead of parsing prose.
 */
function answerSchema() {
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
      followups: { type: 'array', items: { type: 'string' } },
      offer_contact: { type: 'boolean' },
      intent: { type: 'string', enum: ['genuine', 'off_topic', 'abusive'] },
      visitor: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          email: { type: 'string' },
          company: { type: 'string' },
          role: { type: 'string' },
        },
        required: ['name', 'email', 'company', 'role'],
        additionalProperties: false,
      },
    },
    required: ['answer', 'fit', 'followups', 'offer_contact', 'intent', 'visitor'],
    additionalProperties: false,
  };
}

const clip = (s, n) => String(s || '').trim().slice(0, n);
const list = (xs, max, len) => (Array.isArray(xs) ? xs : []).map((x) => clip(x, len)).filter(Boolean).slice(0, max);

// Small local models don't always honour the schema, so normalise whatever came back.
function normalise(raw) {
  let data = raw;
  if (typeof raw === 'string') {
    try { data = JSON.parse(raw); } catch { data = { answer: raw }; }
  }
  data = data || {};
  const v = data.visitor || {};
  return {
    answer: clip(data.answer, 2000),
    fit: {
      strong: list(data.fit && data.fit.strong, 8, 240),
      discuss: list(data.fit && data.fit.discuss, 8, 240),
    },
    followups: list(data.followups, 2, 120),
    offer_contact: data.offer_contact === true,
    intent: ['off_topic', 'abusive'].includes(data.intent) ? data.intent : 'genuine',
    visitor: { name: clip(v.name, 120), email: clip(v.email, 254), company: clip(v.company, 120), role: clip(v.role, 120) },
  };
}

module.exports = { answerSchema, normalise };
