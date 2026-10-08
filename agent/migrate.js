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
    await move(key, keys.legacyConversation(key.slice('agent:conv:'.length)));
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
 * Moves conversations from one key each (strings, or JSON documents from the short-lived search
 * index) into the single hash agent:data:conversations, keeping each one's remaining time to
 * expiry, then drops that search index. The old keys go only after the hash has them, so an
 * interrupted run is simply redone on the next start.
 */
async function migrateConversations() {
  const type = await redis.type(keys.conversations);
  if (!['none', 'hash', 'zset'].includes(type)) {
    console.error(`agent: ${keys.conversations} is a ${type}, not migrating conversations`);
    return;
  }
  const found = [];
  for await (const k of redis.scanIterator({ MATCH: keys.legacyConversation('*'), COUNT: 200 })) {
    const t = await redis.type(k);
    let conv;
    try {
      if (t === 'string') conv = JSON.parse(await redis.get(k));
      else if (t === 'ReJSON-RL') conv = JSON.parse(await redis.sendCommand(['JSON.GET', k]));
    } catch { continue; }
    if (conv && conv.id) found.push({ k, conv, ttl: await redis.pTTL(k) });
  }
  // the old sorted-set index of ids sat under the hash's name
  if (type === 'zset') await redis.del(keys.conversations);
  for (const { conv, ttl } of found) {
    const { startedTs, updatedTs, hasContact, ...clean } = conv; // fields only the search index needed
    // a conversation already in the hash is the newer copy
    if (await redis.hSetNX(keys.conversations, clean.id, JSON.stringify(clean, null, 2))) {
      await store.expireIn(clean.id, ttl > 0 ? ttl : store.retentionSeconds() * 1000);
    }
  }
  for (const { k } of found) await redis.del(k);
  try { await redis.sendCommand(['FT.DROPINDEX', 'agent-conversations']); } catch { /* no index, or no search module */ }
  if (found.length) console.log(`agent: ${found.length} conversations moved into ${keys.conversations}`);
}

module.exports = { migrateKeys, migrateConversations };
