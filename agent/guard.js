const { client: redis } = require('../redis');

const day = () => new Date().toISOString().slice(0, 10);
const TWO_DAYS = 2 * 24 * 60 * 60;

// Cloudflare overwrites cf-connecting-ip, so a client can't spoof it the way it can x-forwarded-for.
function visitorIp(req) {
  return req.headers['cf-connecting-ip'] || req.socket.remoteAddress || 'unknown';
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
  const hour = Math.floor(Date.now() / 3600000);
  const perIp = await countWithExpiry(`agent:${scope}:ip:${ip}:${hour}`, 3600);
  if (perIp > perIpPerHour) return { ok: false, status: 429, reason: 'visitor', remaining: 0 };

  const global = await countWithExpiry(`agent:${scope}:day:${day()}`, TWO_DAYS);
  if (global > globalPerDay) return { ok: false, status: 503, reason: 'global', remaining: 0 };

  return { ok: true, remaining: perIpPerHour - perIp };
}

async function spentToday() {
  return parseFloat((await redis.get(`agent:spend:${day()}`)) || '0');
}

async function addSpend(usd) {
  if (!usd) return;
  const key = `agent:spend:${day()}`;
  await redis.incrByFloat(key, usd);
  await redis.expire(key, TWO_DAYS);
}

module.exports = { visitorIp, admit, spentToday, addSpend };
