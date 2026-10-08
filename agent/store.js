const crypto = require('crypto');
const { client: redis } = require('../redis');

const keys = require('./keys');

const INDEX = keys.conversations;
const key = keys.conversation;
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

/* ───── storage: JSON documents with a search index where Redis has the modules ───── */

// Search and JSON come with Redis 8 and Redis Stack (production); a plain local Redis has neither,
// so conversations are stored as strings there and searched in code.
let jsonMode;
async function hasJson() {
  if (jsonMode === undefined) {
    try {
      await redis.sendCommand(['JSON.TYPE', 'agent:probe']);
      jsonMode = true;
    } catch {
      jsonMode = false;
    }
  }
  return jsonMode;
}

// Fields the index can sort and filter on, derived from the conversation each time it's saved.
function withIndexFields(conv) {
  return {
    ...conv,
    startedTs: Math.floor(Date.parse(conv.startedAt) / 1000),
    updatedTs: Math.floor(Date.parse(conv.updatedAt || conv.startedAt) / 1000),
    hasContact: conv.visitor && conv.visitor.email ? 'yes' : 'no',
  };
}

/**
 * The search index over every conversation document. Redis keeps it current as conversations
 * are written, changed or expire. Query it with FT.SEARCH, e.g. FT.SEARCH agent-conversations "@country:{PL}".
 */
async function ensureIndex() {
  if (!(await hasJson())) return false;
  try {
    await redis.sendCommand(['FT.CREATE', keys.conversationIndex, 'ON', 'JSON', 'PREFIX', '1', key(''), 'SCHEMA',
      '$.geo.city', 'AS', 'city', 'TAG',
      '$.geo.region', 'AS', 'region', 'TAG',
      '$.geo.country', 'AS', 'country', 'TAG',
      '$.ip', 'AS', 'ip', 'TAG',
      '$.startedTs', 'AS', 'started', 'NUMERIC', 'SORTABLE',
      '$.updatedTs', 'AS', 'updated', 'NUMERIC', 'SORTABLE',
      '$.model', 'AS', 'model', 'TAG',
      '$.costUsd', 'AS', 'cost', 'NUMERIC',
      '$.visitor.email', 'AS', 'email', 'TAG',
      '$.hasContact', 'AS', 'contact', 'TAG',
      '$.messages[*].content', 'AS', 'text', 'TEXT']);
  } catch (err) {
    if (!/already exists/i.test(err.message)) throw err;
  }
  return true;
}

async function get(id) {
  const k = key(id);
  const type = await redis.type(k);
  if (type === 'none') return null;
  // older conversations may still be strings until the startup migration converts them
  if (type === 'string') return JSON.parse(await redis.get(k));
  return redis.json.get(k);
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

async function save(conv) {
  conv.messages = conv.messages.slice(-MAX_MESSAGES);
  const k = key(conv.id);
  if (await hasJson()) {
    // a conversation still stored as a string has to go before it can become a document
    if ((await redis.type(k)) === 'string') await redis.del(k);
    await redis.json.set(k, '$', withIndexFields(conv));
    await redis.expire(k, retentionSeconds());
  } else {
    await redis.set(k, JSON.stringify(conv), { EX: retentionSeconds() });
  }
  await redis.zAdd(INDEX, { score: Date.parse(conv.updatedAt), value: conv.id });
}

/**
 * Appends one visitor question and the agent's reply to the conversation,
 * creating it (with visitor metadata) on the first turn. Returns { conv, isNew }.
 */
async function recordTurn({ id, req, ip, meta, question, reply, model, costUsd }) {
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
  conv.messages.push({ role: 'assistant', content: reply.ask ? `${reply.answer}\n\n${reply.ask}` : reply.answer, fit: reply.fit, status: reply.status, at: now });
  await save(conv);
  return { conv, isNew };
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

async function list(limit = 100) {
  const ids = await redis.zRange(INDEX, 0, limit - 1, { REV: true });
  const convs = [];
  for (const id of ids) {
    const c = await get(id);
    if (c) convs.push(c);
    else await redis.zRem(INDEX, id); // expired
  }
  return convs;
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
  const existed = await redis.del(key(id));
  await redis.zRem(INDEX, id);
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
  const ids = [];
  for (const id of await redis.zRange(INDEX, 0, -1)) {
    const c = await get(id);
    if (c && String(c.visitor?.email || '').toLowerCase() === want) ids.push(id);
  }
  return ids;
}

/* ───── finding conversations ───── */

// TAG values need their punctuation and spaces escaped in a query; letters (including Polish) don't.
const tag = (v) => String(v).trim().replace(/[,.<>{}[\]"':;!@#$%^&*()\-+=~|/\\ ?]/g, '\\$&');
const words = (q) => String(q || '').split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')).filter((w) => w.length > 1);

/**
 * Conversations matching every filter given: country, region, city, ip (exact, case-insensitive),
 * contact ('yes' or 'no') and text (all words, anywhere in what was said). Newest first.
 */
async function search(filters = {}, limit = 500) {
  const tags = ['country', 'region', 'city', 'ip', 'contact'].filter((f) => filters[f]);
  const text = words(filters.text);
  if (await ensureIndex()) {
    const parts = tags.map((f) => `@${f}:{${tag(filters[f])}}`);
    if (text.length) parts.push(`@text:(${text.join(' ')})`);
    const res = await redis.ft.search(keys.conversationIndex, parts.join(' ') || '*', { SORTBY: { BY: 'updated', DIRECTION: 'DESC' }, LIMIT: { from: 0, size: limit } });
    return res.documents.map((d) => (typeof d.value.$ === 'string' ? JSON.parse(d.value.$) : d.value));
  }
  const lower = (v) => String(v || '').trim().toLowerCase();
  const field = { country: (c) => c.geo?.country, region: (c) => c.geo?.region, city: (c) => c.geo?.city, ip: (c) => c.ip, contact: (c) => (c.visitor?.email ? 'yes' : 'no') };
  return (await list(limit)).filter((c) => tags.every((f) => lower(field[f](c)) === lower(filters[f]))
    && text.every((w) => c.messages.some((m) => lower(m.content).includes(lower(w)))));
}

module.exports = { recordTurn, setVisitor, visitorKnown, get, list, remove, removeLeads, idsByEmail, search, ensureIndex, hasJson, withIndexFields, retentionSeconds, ID_RE };
