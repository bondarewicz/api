const { client: redis } = require('../redis');
const keys = require('./keys');
const store = require('./store');

async function move(from, to) {
  if ((await redis.exists(from)) && !(await redis.exists(to))) await redis.rename(from, to); // keeps the TTL
}

/**
 * Moves data written under the old, ad-hoc key names to the agent:data / agent:stats scheme.
 * Safe to run on every start; short-lived counters under old names simply expire.
 */
async function migrateKeys() {
  await move('agent:convs', keys.conversations);
  await move('agent:leads', keys.leads);
  await move('agent:killswitch', keys.killswitch);
  for await (const key of redis.scanIterator({ MATCH: 'agent:conv:*', COUNT: 200 })) {
    await move(key, keys.conversation(key.slice('agent:conv:'.length)));
  }
  for await (const key of redis.scanIterator({ MATCH: 'agent:paused:*', COUNT: 200 })) {
    await move(key, keys.paused(key.slice('agent:paused:'.length)));
  }
  // old short-lived counters: nothing worth keeping, so clear them rather than wait for them to expire
  for (const pattern of ['agent:chat:ip:*', 'agent:lead:ip:*', 'agent:notified:*', 'agent:strike:*', 'agent:adminfail:*']) {
    for await (const key of redis.scanIterator({ MATCH: pattern, COUNT: 200 })) await redis.del(key);
  }
  await redis.del('agent:inflight');
  for (let back = 0; back < 2; back++) {
    const d = new Date(Date.now() - back * 86400000).toISOString().slice(0, 10);
    await move(`agent:spend:${d}`, keys.spend(d));
    await move(`agent:chat:day:${d}`, keys.daily('chats', d));
    await move(`agent:lead:day:${d}`, keys.daily('leads', d));
    await move(`agent:notify:push:${d}`, keys.daily('pushes', d));
    await move(`agent:notify:email:${d}`, keys.daily('emails', d));
  }
}

/**
 * Turns conversations stored as JSON strings into JSON documents the search index can read,
 * keeping each one's remaining time to expiry, then makes sure the index exists. Does nothing
 * where Redis has no JSON module (a plain local Redis). Safe to run on every start.
 */
async function migrateConversations() {
  if (!(await store.hasJson())) return;
  let converted = 0;
  for await (const k of redis.scanIterator({ MATCH: keys.conversation('*'), COUNT: 200 })) {
    if ((await redis.type(k)) !== 'string') continue;
    const raw = await redis.get(k);
    const ttl = await redis.pTTL(k);
    let conv;
    try { conv = JSON.parse(raw); } catch { continue; }
    await redis.multi()
      .del(k)
      .json.set(k, '$', store.withIndexFields(conv))
      .pExpire(k, ttl > 0 ? ttl : store.retentionSeconds() * 1000)
      .exec();
    converted++;
  }
  await store.ensureIndex();
  if (converted) console.log(`agent: ${converted} conversations converted to JSON documents`);
}

module.exports = { migrateKeys, migrateConversations };
