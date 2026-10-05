const crypto = require('crypto');
const UAParser = require('ua-parser-js');
const store = require('./store');
const guard = require('./guard');
const { client: redis } = require('../redis');

const MAX_FAILURES_PER_HOUR = 10;
const BASE = '/v1/agent/admin';
const TZ = process.env.ADMIN_TZ || 'Europe/Warsaw';

// Visitor text is untrusted: everything rendered goes through esc().
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function localTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-GB', { timeZone: TZ, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function ago(iso) {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return localTime(iso);
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * HTTP basic auth against ADMIN_PASSWORD (any username). Without the variable the admin is off.
 */
async function requireAdmin(req, res, next) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return res.status(404).end();
  const failKey = `agent:adminfail:${guard.visitorIp(req)}:${guard.hour()}`;
  try {
    if (parseInt((await redis.get(failKey)) || '0', 10) >= MAX_FAILURES_PER_HOUR) {
      return res.status(429).send('Too many attempts, try again later');
    }
  } catch (err) { return res.status(503).end(); }
  const [scheme, encoded] = (req.headers.authorization || '').split(' ');
  const given = scheme === 'Basic' && encoded ? Buffer.from(encoded, 'base64').toString().split(':').slice(1).join(':') : '';
  if (!safeEqual(given, password)) {
    // a bare request (no credentials yet) is the browser asking for the prompt, not a failed guess
    if (encoded) await guard.countWithExpiry(failKey, 3600);
    res.set('WWW-Authenticate', 'Basic realm="bondarewicz agent"');
    return res.status(401).send('Authentication required');
  }
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex');
  next();
}

/* ───── what a conversation is, in a few words ───── */

const questions = (c) => c.messages.filter((m) => m.role === 'user');
const flagged = (c) => c.messages.some((m) => m.status === 'abusive' || m.status === 'off_topic');
const isLead = (c) => Boolean(c.visitor && c.visitor.email);
const place = (c) => { const g = c.geo || {}; return [g.city, g.countryName || g.country].filter(Boolean).join(', ') || 'Unknown location'; };

function source(c) {
  try {
    const utm = new URL(c.landing).searchParams.get('utm_source');
    if (utm) return utm;
  } catch { /* no landing url */ }
  if (!c.referrer) return 'Direct';
  const h = host(c.referrer);
  return h === 'bondarewicz.com' ? 'Direct' : h;
}

function device(ua) {
  if (!ua) return '';
  const r = UAParser(ua);
  const browser = [r.browser.name, r.browser.major].filter(Boolean).join(' ');
  const os = r.os.name ? `${r.os.name}${r.device.type === 'mobile' ? ' (mobile)' : ''}` : '';
  return [browser, os].filter(Boolean).join(' on ') || ua.slice(0, 60);
}

function badges(c) {
  const out = [];
  if (isLead(c)) out.push('<span class="badge lead">Lead</span>');
  if (flagged(c)) out.push('<span class="badge flag">Flagged</span>');
  return out.join(' ');
}

/* ───── layout ───── */

const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="robots" content="noindex">
<style>
:root{--bg:#F5F3EE;--ink:#141A24;--muted:#5B6372;--line:#DDDAD2;--card:#fff;--night:#0E1420;--teal:#7FC8B6;--teal-deep:#1F6B5C;--teal-soft:#E3F0EC;--amber:#E8A33D;--warn:#9A4A00;--warn-soft:#FBEBD7}
*{box-sizing:border-box}
body{margin:0;font:15px/1.5 system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--ink)}
a{color:inherit}
header.top{background:var(--night);color:#E9EDF3}
header.top .in{max-width:1180px;margin:0 auto;padding:18px 16px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px}
header.top a{text-decoration:none;font-weight:600}
header.top .dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--teal);margin-right:8px}
header.top .tz{color:#9AA6B8;font-size:13px}
main{max-width:1180px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:24px;margin:0}
.muted{color:var(--muted)}
.sub{color:var(--muted);font-size:13px;margin-top:2px}
.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:20px 0}
.stat{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px}
.stat b{display:block;font-size:24px;line-height:1.2}
.stat span{color:var(--muted);font-size:13px}
.tabs{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 12px}
.tabs a{padding:8px 14px;border-radius:999px;border:1px solid var(--line);text-decoration:none;font-size:14px;background:var(--card)}
.tabs a.on{background:var(--ink);border-color:var(--ink);color:#fff}
.list{display:flex;flex-direction:column;gap:8px}
.row{display:grid;grid-template-columns:1.2fr 1.6fr 1fr 0.7fr;gap:16px;align-items:start;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 18px;text-decoration:none;transition:border-color .15s}
.row:hover{border-color:var(--teal-deep)}
.row .q{overflow-wrap:anywhere}
.row .when{text-align:right}
.badge{display:inline-block;font-size:12px;font-weight:600;padding:2px 8px;border-radius:6px;vertical-align:1px}
.badge.lead{background:var(--teal-soft);color:var(--teal-deep)}
.badge.flag{background:var(--warn-soft);color:var(--warn)}
.empty{background:var(--card);border:1px dashed var(--line);border-radius:14px;padding:32px;text-align:center;color:var(--muted)}
.back{display:inline-block;margin-bottom:16px;text-decoration:none;color:var(--muted)}
.back:hover{color:var(--ink)}
.detail{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:24px;align-items:start}
.thread{display:flex;flex-direction:column;gap:12px}
.msg{max-width:85%;padding:12px 16px;border-radius:16px;white-space:pre-wrap;overflow-wrap:anywhere}
.msg.user{align-self:flex-end;background:var(--night);color:#E9EDF3;border-bottom-right-radius:4px}
.msg.assistant{align-self:flex-start;background:var(--card);border:1px solid var(--line);border-bottom-left-radius:4px}
.msg .meta{font-size:12px;color:var(--muted);margin-top:8px;white-space:normal}
.who-label{font-size:12px;color:var(--muted);margin:4px 2px -6px}
.who-label.user{align-self:flex-end}
.chip{display:inline-block;font-size:12px;padding:2px 8px;border-radius:6px;background:var(--teal-soft);color:var(--teal-deep);margin:4px 4px 0 0}
.fit{margin-top:10px;padding:10px 12px;border-radius:10px;background:var(--bg);white-space:normal}
.fit div{display:flex;gap:8px;margin-top:4px}
.fit i{flex:0 0 8px;height:8px;border-radius:50%;margin-top:7px}
.status{font-size:12px;font-weight:600;color:var(--warn);white-space:normal}
aside .card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;margin-bottom:12px}
aside h2{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:0 0 10px}
aside dl{display:grid;grid-template-columns:max-content 1fr;gap:6px 12px;margin:0;font-size:14px}
aside dt{color:var(--muted)}aside dd{margin:0;overflow-wrap:anywhere}
.person{font-size:18px;font-weight:600}
.btn{display:inline-block;margin-top:12px;padding:10px 16px;border-radius:10px;background:var(--amber);color:var(--night);text-decoration:none;font-weight:600}
@media (max-width:900px){.detail{grid-template-columns:minmax(0,1fr)}aside{order:-1}}
@media (max-width:760px){.stats{grid-template-columns:repeat(2,minmax(0,1fr))}.row{grid-template-columns:minmax(0,1fr);gap:6px}.row .when{text-align:left}.msg{max-width:100%}}
</style></head><body>
<header class="top"><div class="in"><a href="${BASE}"><span class="dot"></span>bondarewicz.com · visitor conversations</a><span class="tz">times in ${esc(TZ)}</span></div></header>
<main><!--email_off-->${body}<!--/email_off--></main></body></html>`; // email_off stops Cloudflare masking addresses

/* ───── list ───── */

async function stats(convs) {
  const now = Date.now();
  const since = (ms) => convs.filter((c) => now - Date.parse(c.startedAt) < ms).length;
  const spent = parseFloat((await redis.get(`agent:spend:${guard.day()}`)) || '0');
  const budget = parseFloat(process.env.AGENT_DAILY_BUDGET_USD || '0.5');
  return `<div class="stats">
<div class="stat"><b>${since(86400000)}</b><span>conversations, last 24 h</span></div>
<div class="stat"><b>${since(7 * 86400000)}</b><span>conversations, last 7 days</span></div>
<div class="stat"><b>${convs.filter(isLead).length}</b><span>leads (left contact details)</span></div>
<div class="stat"><b>$${spent.toFixed(2)}</b><span>spent today of $${budget.toFixed(2)} budget</span></div>
</div>`;
}

async function list(req, res) {
  const all = await store.list(500);
  const filter = ['leads', 'flagged'].includes(req.query.filter) ? req.query.filter : 'all';
  const shown = filter === 'leads' ? all.filter(isLead) : filter === 'flagged' ? all.filter(flagged) : all;
  const tab = (key, label, n) => `<a class="${filter === key ? 'on' : ''}" href="${BASE}${key === 'all' ? '' : `?filter=${key}`}">${label} · ${n}</a>`;

  const rows = shown.map((c) => {
    const qs = questions(c);
    const v = c.visitor || {};
    const who = v.name || v.email || 'Anonymous visitor';
    const contact = [v.email && v.name ? v.email : '', v.company].filter(Boolean).join(' · ');
    return `<a class="row" href="${BASE}/c/${esc(c.id)}">
<div><strong>${esc(who)}</strong> ${badges(c)}<div class="sub">${esc(contact)}</div></div>
<div class="q">“${esc(qs[0] ? qs[0].content.slice(0, 160) : '')}”<div class="sub">${plural(qs.length, 'question')}</div></div>
<div>${esc(place(c))}<div class="sub">${esc([c.geo && c.geo.org, `via ${source(c)}`].filter(Boolean).join(' · '))}</div></div>
<div class="when">${esc(ago(c.updatedAt))}<div class="sub">${esc(localTime(c.updatedAt))}</div></div>
</a>`;
  }).join('');

  res.send(page('Visitor conversations', `<h1>Visitor conversations</h1>
<div class="sub">Everything visitors asked the site agent, newest first. Kept ${esc(process.env.AGENT_RETENTION_DAYS || '180')} days.</div>
${await stats(all)}
<nav class="tabs">${tab('all', 'All', all.length)}${tab('leads', 'Leads', all.filter(isLead).length)}${tab('flagged', 'Flagged', all.filter(flagged).length)}</nav>
<div class="list">${rows || `<div class="empty">${filter === 'all' ? 'No conversations yet.' : 'Nothing here yet.'}</div>`}</div>`));
}

/* ───── one conversation ───── */

function fitHtml(fit) {
  if (!fit || !(fit.strong.length || fit.discuss.length)) return '';
  const line = (color, text) => `<div><i style="background:${color}"></i><span>${esc(text)}</span></div>`;
  return `<div class="fit"><strong>Fit report</strong>${fit.strong.map((t) => line('#1F6B5C', t)).join('')}${fit.discuss.map((t) => line('#E8A33D', t)).join('')}</div>`;
}

const STATUS = { off_topic: 'Off-topic', abusive: 'Abusive', resting: 'Agent was resting', error: 'Agent error', 'over daily limit': 'Over daily limit' };

async function detail(req, res) {
  const c = store.ID_RE.test(req.params.id) ? await store.get(req.params.id) : null;
  if (!c) return res.status(404).send(page('Not found', `<a class="back" href="${BASE}">← All conversations</a><h1>Not found</h1><p class="muted">It may have expired.</p>`));
  const g = c.geo || {};
  const v = c.visitor || {};
  const who = v.name || v.email || 'Anonymous visitor';
  const firstQ = questions(c)[0];
  const replySubject = encodeURIComponent('Re: your message on bondarewicz.com');
  const dl = (rows) => `<dl>${rows.filter(([, val]) => val).map(([k, val]) => `<dt>${esc(k)}</dt><dd>${esc(val)}</dd>`).join('')}</dl>`;

  const thread = c.messages.map((m) => {
    if (m.role === 'user') {
      return `<div class="who-label user">Visitor · ${esc(localTime(m.at))}</div><div class="msg user">${esc(m.content)}</div>`;
    }
    const sources = (m.sources || []).map((s) => `<span class="chip">${esc(s)}</span>`).join('');
    const status = m.status && m.status !== 'ok' ? `<div class="status">${esc(STATUS[m.status] || m.status)}</div>` : '';
    return `<div class="who-label">Agent</div><div class="msg assistant">${status}${esc(m.content)}${fitHtml(m.fit)}${sources ? `<div class="meta">${sources}</div>` : ''}</div>`;
  }).join('');

  res.send(page(`${who} · conversation`, `<a class="back" href="${BASE}">← All conversations</a>
<div class="detail">
<section>
<h1>${esc(who)} ${badges(c)}</h1>
<div class="sub" style="margin-bottom:16px">${plural(questions(c).length, 'question')} · started ${esc(localTime(c.startedAt))} · last active ${esc(ago(c.updatedAt))}</div>
<div class="thread">${thread}</div>
</section>
<aside>
<div class="card"><h2>Visitor</h2>
${v.email ? `<div class="person">${esc(v.name || v.email)}</div><div class="sub">${esc([v.name ? v.email : '', v.company, v.role].filter(Boolean).join(' · '))}</div>
${v.note ? `<p style="margin:10px 0 0">${esc(v.note)}</p>` : ''}
<a class="btn" href="mailto:${esc(v.email)}?subject=${replySubject}">Reply by email</a>` : '<div class="muted">Didn\'t leave contact details.</div>'}
</div>
<div class="card"><h2>Where</h2>${dl([['Location', [g.city, g.region, g.countryName || g.country].filter(Boolean).join(', ')], ['Network', g.org], ['IP', c.ip], ['Timezone', c.timezone], ['Language', c.language]])}</div>
<div class="card"><h2>How they arrived</h2>${dl([['Source', source(c)], ['Referrer', c.referrer], ['Landing page', c.landing], ['First asked', firstQ ? localTime(firstQ.at) : '']])}</div>
<div class="card"><h2>Device</h2>${dl([['Browser', device(c.userAgent)], ['Screen', c.screen]])}</div>
<div class="card"><h2>Cost</h2>${dl([['Model', c.model], ['Spent', `$${(c.costUsd || 0).toFixed(4)}`]])}</div>
</aside>
</div>`));
}

module.exports = { requireAdmin, list, detail };
