const crypto = require('crypto');
const { client: redis } = require('../redis');

const day = () => new Date().toISOString().slice(0, 10);
const hour = () => Math.floor(Date.now() / 3600000);
const TWO_DAYS = 2 * 24 * 60 * 60;
const IP_RE = /^[0-9a-fA-F:.]{2,45}$/;

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * True when the request came through our Cloudflare zone. Cloudflare adds x-origin-secret
 * (a Transform Rule) on every proxied request; a request straight to the Railway origin
 * doesn't have it. Without CF_ORIGIN_SECRET configured every request is accepted.
 */
function viaCloudflare(req) {
  const secret = process.env.CF_ORIGIN_SECRET;
  return !secret || safeEqual(req.headers['x-origin-secret'], secret);
}

function requireCloudflare(req, res, next) {
  if (viaCloudflare(req)) return next();
  res.status(403).json({ error: 'forbidden' });
}

// cf-connecting-ip is only trustworthy once we know Cloudflare set it.
function visitorIp(req) {
  const ip = (viaCloudflare(req) && req.headers['cf-connecting-ip']) || req.socket.remoteAddress || '';
  return IP_RE.test(ip) ? ip : 'unknown';
}

async function countWithExpiry(key, ttlSeconds) {
  const n = await redis.incr(key);
  if (n === 1) await redis.expire(key, ttlSeconds);
  return n;
}

/**
 * Per-visitor hourly cap and a global daily cap, counted separately per scope (chat, lead).
 * The global cap bounds total work even if someone rotates IPs.
 */
async function admit(scope, ip, { perIpPerHour, globalPerDay }) {
  const perIp = await countWithExpiry(`agent:${scope}:ip:${ip}:${hour()}`, 3600);
  if (perIp > perIpPerHour) return { ok: false, status: 429, reason: 'visitor', remaining: 0 };

  const global = await countWithExpiry(`agent:${scope}:day:${day()}`, TWO_DAYS);
  if (global > globalPerDay) return { ok: false, status: 503, reason: 'global', remaining: 0 };

  return { ok: true, remaining: perIpPerHour - perIp };
}

/**
 * Takes usd out of today's budget before a paid call. INCRBYFLOAT is atomic, so concurrent
 * requests can't all slip under the budget; a reservation that would cross it is refunded.
 */
async function reserve(usd, budget) {
  const key = `agent:spend:${day()}`;
  const total = parseFloat(await redis.incrByFloat(key, usd));
  await redis.expire(key, TWO_DAYS);
  if (total > budget) {
    await redis.incrByFloat(key, -usd);
    return false;
  }
  return true;
}

// Corrects a reservation once the real cost is known (or refunds it on failure).
async function settle(deltaUsd) {
  if (!deltaUsd) return;
  await redis.incrByFloat(`agent:spend:${day()}`, deltaUsd);
}

/**
 * Caps paid calls running at the same time. The key expires so a crash can't leak slots.
 */
async function acquireSlot(max) {
  const n = await countWithExpiry('agent:inflight', 120);
  if (n > max) {
    await redis.decr('agent:inflight');
    return false;
  }
  return true;
}

async function releaseSlot() {
  const n = await redis.decr('agent:inflight');
  if (n < 0) await redis.set('agent:inflight', 0);
}

/**
 * True the first time `key` is seen within ttlSeconds (used to de-duplicate notifications).
 */
async function firstTime(key, ttlSeconds) {
  return (await redis.set(key, '1', { NX: true, EX: ttlSeconds })) === 'OK';
}

/**
 * Counts an off-topic or abusive reply against the visitor; past the limit they're paused
 * for an hour and get a canned reply without a model call.
 */
async function strike(ip, kind, limitsByKind) {
  const n = await countWithExpiry(`agent:strike:${kind}:${ip}`, 3600);
  if (n >= limitsByKind[kind]) await redis.set(`agent:paused:${ip}`, kind, { EX: 3600 });
}

async function clearStrikes(ip, kind) {
  await redis.del(`agent:strike:${kind}:${ip}`);
}

async function isPaused(ip) {
  return Boolean(await redis.get(`agent:paused:${ip}`));
}

module.exports = { strike, clearStrikes, isPaused, visitorIp, requireCloudflare, safeEqual, admit, reserve, settle, acquireSlot, releaseSlot, firstTime, countWithExpiry, day, hour };
