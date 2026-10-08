/**
 * Every Redis key the agent uses, in three groups:
 *   agent:data:*   what matters if lost (conversations, leads, kill switch)
 *   agent:stats:*  daily totals (spend, chats, leads, notifications), kept 2 days
 *   agent:limit:*  per-visitor protections, kept an hour or less
 */
const day = () => new Date().toISOString().slice(0, 10); // 2026-10-05
const hour = () => new Date().toISOString().slice(0, 13); // 2026-10-05T19

module.exports = {
  day,
  hour,

  conversation: (id) => `agent:data:conversation:${id}`,
  conversations: 'agent:data:conversations',
  // the search index over conversation documents (not a key; queried with FT.SEARCH)
  conversationIndex: 'agent-conversations',
  leads: 'agent:data:leads',
  killswitch: 'agent:data:killswitch',

  spend: (d = day()) => `agent:stats:spend:${d}`,
  // what: chats, leads, pushes, emails
  daily: (what, d = day()) => `agent:stats:${what}:${d}`,

  // what: chat, lead, notified, admin-fail
  perVisitor: (what, ip, h = hour()) => `agent:limit:${what}:${ip}:${h}`,
  strike: (kind, ip) => `agent:limit:strike:${kind}:${ip}`,
  paused: (ip) => `agent:limit:paused:${ip}`,
  inflight: 'agent:limit:inflight',
};
