const crypto = require('crypto');
const { client: redis } = require('../redis');

const keys = require('./keys');

// Every conversation lives in one hash: field = conversation id, value = the conversation as
// readable JSON. One collection to browse (Railway's data view shows it), and the admin reads it.
const HASH = keys.conversations;
const ID_RE = /^[a-zA-Z0-9-]{8,64}$/;
const MAX_MESSAGES = 200;
const clip = (s, n) => String(s || '').trim().slice(0, n);

function retentionSeconds() {
  return parseInt(process.env.AGENT_RETENTION_DAYS || '180', 10) * 24 * 60 * 60;
}

// Location comes from Cloudflare's headers only: the country always, city and region when
// visitor location headers are on. No third-party lookup, so the IP never leaves our servers.
function lookupGeo(req) {
  return {
    country: req.headers['cf-ipcountry'] || '',
    city: req.headers['cf-ipcity'] || '',
    region: req.headers['cf-region'] || '',
  };
}

/* ───── storage ───── */

async function get(id) {
  const raw = await redis.hGet(HASH, id);
  return raw ? JSON.parse(raw) : null;
}

/**
 * A conversation belongs to the IP that started it. Anyone else sending the same id gets their
 * own conversation (the id plus a hash of their IP), so they can't append to or rewrite it.
 */
async function resolveOwned(id, ip) {
  const conv = await get(id);
  if (!conv || conv.ip === ip) return { id, conv };
  const own = `${id.slice(0, 48)}-${crypto.createHash('sha256').update(ip).digest('hex').slice(0, 8)}`;
  return { id: own, conv: await get(own) };
}

// each conversation expires on its own, AGENT_RETENTION_DAYS after its last message (hash field expiry)
async function expireIn(id, ms) {
  await redis.sendCommand(['HPEXPIRE', HASH, String(ms), 'FIELDS', '1', id]);
}

async function save(conv) {
  conv.messages = conv.messages.slice(-MAX_MESSAGES);
  await redis.hSet(HASH, conv.id, JSON.stringify(conv, null, 2));
  await expireIn(conv.id, retentionSeconds() * 1000);
}

/**
 * Appends one visitor question and the agent's reply to the conversation,
 * creating it (with visitor metadata) on the first turn. Returns { conv, isNew }.
 */
async function recordTurn({ id, req, ip, meta, question, reply, model, costUsd, lang }) {
  if (!ID_RE.test(id || '')) return { conv: null, isNew: false };
  const now = new Date().toISOString();
  let conv;
  ({ id, conv } = await resolveOwned(id, ip));
  const isNew = !conv;
  if (!conv) {
    const m = meta || {};
    conv = {
      id,
      startedAt: now,
      ip,
      geo: lookupGeo(req),
      userAgent: clip(req.headers['user-agent'], 300),
      referrer: clip(m.referrer, 500),
      landing: clip(m.landing, 500),
      language: clip(m.language, 40),
      timezone: clip(m.timezone, 60),
      screen: clip(m.screen, 20),
      visitor: {},
      messages: [],
      costUsd: 0,
    };
  }
  conv.updatedAt = now;
  conv.model = model || conv.model;
  conv.costUsd = (conv.costUsd || 0) + (costUsd || 0);
  conv.messages.push({ role: 'user', content: question, at: now });
  // the id lets the site ask for this answer spoken
  const messageId = crypto.randomBytes(6).toString('hex');
  conv.messages.push({ id: messageId, role: 'assistant', content: reply.ask ? `${reply.answer}\n\n${reply.ask}` : reply.answer, fit: reply.fit, status: reply.status, lang, at: now });
  await save(conv);
  return { conv, isNew, messageId };
}

/**
 * One of the agent's answers in a conversation this IP owns, or null.
 */
async function findAnswer(id, messageId, ip) {
  if (!ID_RE.test(id || '') || !/^[0-9a-f]{12}$/.test(messageId || '')) return null;
  const { conv } = await resolveOwned(id, ip);
  return conv?.messages.find((m) => m.role === 'assistant' && m.id === messageId) || null;
}

// Counts characters spoken aloud, so voice cost shows next to the model cost.
async function addSpeech(id, chars, ip) {
  if (!ID_RE.test(id || '')) return;
  const { conv } = await resolveOwned(id, ip);
  if (!conv) return;
  conv.speechChars = (conv.speechChars || 0) + chars;
  await save(conv);
}

/**
 * Merges contact details into the conversation. Returns true when an email is newly known.
 */
async function setVisitor(id, details, ip) {
  if (!ID_RE.test(id || '')) return false;
  const { conv } = await resolveOwned(id, ip);
  if (!conv) return false;
  const had = Boolean(conv.visitor.email);
  for (const [k, v] of Object.entries(details)) {
    if (v && String(v).trim()) conv.visitor[k] = clip(v, 600);
  }
  await save(conv);
  return !had && Boolean(conv.visitor.email);
}

// Newest first.
async function list(limit = 500) {
  const all = Object.values(await redis.hGetAll(HASH)).map((raw) => JSON.parse(raw));
  return all.sort((x, y) => (y.updatedAt || '').localeCompare(x.updatedAt || '')).slice(0, limit);
}

async function visitorKnown(id, ip) {
  if (!ID_RE.test(id || '')) return false;
  const { conv } = await resolveOwned(id, ip);
  return Boolean(conv && conv.visitor.email);
}

/**
 * Deletes a conversation and any leads that came from it. For visitors asking for their data to go.
 */
async function remove(id) {
  if (!ID_RE.test(id || '')) return false;
  const existed = await redis.hDel(HASH, id);
  await removeLeads((lead) => lead.conversationId === id);
  return existed > 0;
}

/**
 * Deletes leads matching `match`. Returns how many went.
 */
async function removeLeads(match) {
  let removed = 0;
  for (const raw of await redis.lRange(keys.leads, 0, -1)) {
    let lead;
    try { lead = JSON.parse(raw); } catch { continue; }
    if (match(lead)) removed += await redis.lRem(keys.leads, 0, raw);
  }
  return removed;
}

/**
 * Ids of every stored conversation where the visitor gave this email.
 */
async function idsByEmail(email) {
  const want = String(email || '').trim().toLowerCase();
  if (!want) return [];
  return (await list(Infinity)).filter((c) => String(c.visitor?.email || '').toLowerCase() === want).map((c) => c.id);
}

/* ───── finding conversations ───── */

const words = (q) => String(q || '').split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')).filter((w) => w.length > 1);

/**
 * Conversations matching every filter given: country, region, city, ip (exact, case-insensitive),
 * contact ('yes' or 'no') and text (all words, anywhere in what was said). Newest first.
 */
async function search(filters = {}, limit = 500) {
  const lower = (v) => String(v || '').trim().toLowerCase();
  const field = { country: (c) => c.geo?.country, region: (c) => c.geo?.region, city: (c) => c.geo?.city, ip: (c) => c.ip, contact: (c) => (c.visitor?.email ? 'yes' : 'no') };
  const tags = Object.keys(field).filter((f) => filters[f]);
  const text = words(filters.text).map(lower);
  return (await list(Infinity)).filter((c) => tags.every((f) => lower(field[f](c)) === lower(filters[f]))
    && text.every((w) => c.messages.some((m) => lower(m.content).includes(w)))).slice(0, limit);
}

module.exports = { recordTurn, findAnswer, addSpeech, setVisitor, visitorKnown, get, list, remove, removeLeads, idsByEmail, search, expireIn, retentionSeconds, ID_RE };
