/**
 * Every Redis key the agent uses, in three groups:
 *   agent:data:*   what matters if lost (conversations, leads, kill switch)
 *   agent:stats:*  daily totals (spend, chats, leads, notifications), kept 2 days
 *   agent:limit:*  per-visitor protections, kept an hour or less
 *   agent:cache:*  things we can make again (spoken answers), kept a week
 */
const day = () => new Date().toISOString().slice(0, 10); // 2026-10-05
const hour = () => new Date().toISOString().slice(0, 13); // 2026-10-05T19

module.exports = {
  day,
  hour,

  // one hash: field = conversation id, value = the conversation as JSON
  conversations: 'agent:data:conversations',
  // where each conversation used to live on its own (kept for the migration)
  legacyConversation: (id) => `agent:data:conversation:${id}`,
  leads: 'agent:data:leads',
  killswitch: 'agent:data:killswitch',

  spend: (d = day()) => `agent:stats:spend:${d}`,
  // what: chats, leads, pushes, emails
  daily: (what, d = day()) => `agent:stats:${what}:${d}`,
  // characters sent to ElevenLabs this month (the plan's allowance is monthly)
  speechChars: (m = day().slice(0, 7)) => `agent:stats:speech-chars:${m}`,

  // what: chat, lead, speech, notified, admin-fail
  perVisitor: (what, ip, h = hour()) => `agent:limit:${what}:${ip}:${h}`,
  strike: (kind, ip) => `agent:limit:strike:${kind}:${ip}`,
  paused: (ip) => `agent:limit:paused:${ip}`,
  inflight: 'agent:limit:inflight',

  speechCache: (hash) => `agent:cache:speech:${hash}`,
};
