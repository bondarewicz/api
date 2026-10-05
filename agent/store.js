const crypto = require('crypto');
const fetch = require('node-fetch');
const { client: redis } = require('../redis');

const INDEX = 'agent:convs';
const key = (id) => `agent:conv:${id}`;
const ID_RE = /^[a-zA-Z0-9-]{8,64}$/;
const MAX_MESSAGES = 200;
const clip = (s, n) => String(s || '').trim().slice(0, n);

function retentionSeconds() {
  return parseInt(process.env.AGENT_RETENTION_DAYS || '180', 10) * 24 * 60 * 60;
}

// Cloudflare sends the country always and city/region when visitor location headers are on;
// otherwise fall back to ip-api (the same lookup the /ip endpoint uses).
async function lookupGeo(req, ip) {
  const geo = {
    country: req.headers['cf-ipcountry'] || '',
    city: req.headers['cf-ipcity'] || '',
    region: req.headers['cf-region'] || '',
    org: '',
  };
  if (geo.city && geo.org) return geo;
  try {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 2000);
    const r = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,regionName,city,isp,org`, { signal: abort.signal });
    clearTimeout(timer);
    const d = await r.json();
    if (d.status === 'success') {
      geo.country = geo.country || d.countryCode;
      geo.countryName = d.country;
      geo.city = geo.city || d.city;
      geo.region = geo.region || d.regionName;
      geo.org = d.org || d.isp || '';
    }
  } catch (err) { /* geo is best effort */ }
  return geo;
}

async function get(id) {
  const raw = await redis.get(key(id));
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

async function save(conv) {
  conv.messages = conv.messages.slice(-MAX_MESSAGES);
  await redis.set(key(conv.id), JSON.stringify(conv), { EX: retentionSeconds() });
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
      geo: await lookupGeo(req, ip),
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
  conv.messages.push({ role: 'assistant', content: reply.ask ? `${reply.answer}\n\n${reply.ask}` : reply.answer, fit: reply.fit, sources: reply.sources, status: reply.status, at: now });
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

module.exports = { recordTurn, setVisitor, visitorKnown, get, list, ID_RE };
