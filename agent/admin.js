const crypto = require('crypto');
const UAParser = require('ua-parser-js');
const store = require('./store');
const guard = require('./guard');
const keys = require('./keys');
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

/* ───── kill switch ───── */

// The switch is a form, and browsers resend saved basic-auth credentials even on posts from
// other sites, so it needs a token only the admin page knows, plus a same-origin check.
function switchToken() {
  return crypto.createHmac('sha256', process.env.ADMIN_PASSWORD || '').update(`killswitch:${guard.day()}`).digest('hex').slice(0, 32);
}

function sameOrigin(req) {
  const src = req.headers.origin || req.headers.referer || '';
  try { return new URL(src).host === req.headers.host; } catch { return false; }
}

async function killSwitch(req, res) {
  const body = req.body || {};
  if (!sameOrigin(req) || !safeEqual(body.token || '', switchToken())) {
    return res.status(403).send('Forbidden. Reload the admin page and try again.');
  }
  const agentOff = body.state === 'off';
  await guard.setKilled(agentOff, guard.visitorIp(req));
  console.log(`agent: kill switch flipped, agent is now ${agentOff ? 'OFF' : 'ON'}`);
  res.redirect(303, BASE);
}

async function switchPanel() {
  const killed = await guard.killState();
  const byEnv = process.env.AGENT_ENABLED === 'false';
  if (byEnv) {
    return `<div class="switch off"><div><b>Agent is OFF</b><div class="sub">Turned off with AGENT_ENABLED=false on Railway. Remove that variable to turn it back on.</div></div></div>`;
  }
  const form = (state, label, cls) => `<form method="post" action="${BASE}/killswitch"><input type="hidden" name="token" value="${switchToken()}"><input type="hidden" name="state" value="${state}"><button class="${cls}" type="submit">${label}</button></form>`;
  return killed
    ? `<div class="switch off"><div><b>Agent is OFF</b><div class="sub">No calls to Claude. Visitors are told the assistant is resting and can still leave their email. Turned off ${esc(ago(killed.at))} (${esc(localTime(killed.at))}).</div></div>${form('on', 'Turn agent on', 'on')}</div>`
    : `<div class="switch"><div><b><span class="live"></span>Agent is ON</b><div class="sub">Claude is answering visitors. Turn it off instantly if anything looks wrong.</div></div>${form('off', 'Turn agent off', 'kill')}</div>`;
}

/**
 * HTTP basic auth against ADMIN_PASSWORD (any username). Without the variable the admin is off.
 */
async function requireAdmin(req, res, next) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return res.status(404).end();
  const failKey = keys.perVisitor('admin-fail', guard.visitorIp(req));
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
  // helmet's no-referrer makes browsers send "Origin: null" on form posts, which the switch's
  // same-origin check needs; same-origin still never leaks admin URLs to other sites
  res.set('Referrer-Policy', 'same-origin');
  next();
}

/* ───── what a conversation is, in a few words ───── */

const questions = (c) => c.messages.filter((m) => m.role === 'user');
const statusCount = (c, ...kinds) => c.messages.filter((m) => m.role === 'assistant' && kinds.includes(m.status)).length;
const flagged = (c) => statusCount(c, 'abusive', 'off_topic') > 0;

// Throwaway or made-up addresses (1@1.com, a@b.co, test@example.com) don't make someone a lead.
const FAKE_MAIL = /@(example|test|mailinator|guerrillamail|10minutemail|tempmail|yopmail|asdf|qwerty)\.|^(test|asdf|qwerty|aaa+|xxx+)@/i;
function emailLooksReal(email) {
  if (!email || FAKE_MAIL.test(email)) return false;
  const [local, domain = ''] = email.split('@');
  const name = domain.split('.')[0] || '';
  return !(local.length <= 2 && name.length <= 2);
}
const isLead = (c) => Boolean(c.visitor && emailLooksReal(c.visitor.email));
const fakeEmail = (c) => Boolean(c.visitor && c.visitor.email && !emailLooksReal(c.visitor.email));
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

/* ───── priority: how much a conversation is worth Łukasz's time ───── */

const FREE_MAIL = /@(gmail|googlemail|outlook|hotmail|live|yahoo|icloud|me|proton|protonmail|aol|gmx|wp|o2|onet|interia)\./i;
const WANTS_CONTACT = /\b(follow ?-?up|foll?up|get in touch|contact (me|him)|reach (me|out)|call (me|him)|talk to him|speak (to|with) him|meet)/i;
const ROLE_TALK = /\b(hiring|hire|role|position|recruit|vacanc|contract|freelance|project|budget|rate|salary|start date|interview|opportunit)/i;

function priority(c) {
  const v = c.visitor || {};
  const asked = questions(c);
  const genuine = statusCount(c, 'ok');
  const offTopic = statusCount(c, 'off_topic');
  const abusive = statusCount(c, 'abusive');
  // Noise only when the conversation is mostly junk; a bad start that turns serious still counts
  if ((abusive && !genuine) || (offTopic + abusive > genuine && !isLead(c))) {
    return { level: 'Noise', score: 0, reasons: [abusive ? 'abusive, no real questions' : 'mostly off-topic'] };
  }
  const reasons = [];
  let score = 0;
  if (isLead(c) && !FREE_MAIL.test(v.email)) { score += 40; reasons.push('left a work email'); }
  else if (isLead(c)) { score += 25; reasons.push('left contact details'); }
  else if (fakeEmail(c)) reasons.push('email looks made up');
  if (c.messages.some((m) => m.fit && (m.fit.strong.length || m.fit.discuss.length))) { score += 30; reasons.push('pasted a job description'); }
  if (asked.some((m) => WANTS_CONTACT.test(m.content))) { score += 25; reasons.push('asked to be contacted'); }
  if (asked.some((m) => ROLE_TALK.test(m.content))) { score += 15; reasons.push('talked about a role or project'); }
  if (v.company) { score += 10; reasons.push(`named a company (${v.company})`); }
  if (asked.length >= 3) { score += 10; reasons.push(`${asked.length} questions`); }
  if (/linkedin\./i.test(c.referrer || '')) { score += 5; reasons.push('came from LinkedIn'); }
  if (offTopic + abusive) { score -= 10 * (offTopic + abusive); reasons.push(`${offTopic + abusive} off-topic or abusive ${offTopic + abusive === 1 ? 'message' : 'messages'}`); }
  const level = score >= 50 ? 'High' : score >= 20 ? 'Medium' : 'Low';
  return { level, score, reasons: reasons.length ? reasons : ['a quick look, nothing more yet'] };
}

const cost = (c) => `$${(c.costUsd || 0).toFixed(3)}`;

function badges(c) {
  const p = priority(c);
  const out = [`<span class="badge p-${p.level.toLowerCase()}">${p.level}</span>`];
  if (isLead(c)) out.push('<span class="badge lead">Lead</span>');
  else if (fakeEmail(c)) out.push('<span class="badge p-low">Fake email?</span>');
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
.stats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin:20px 0}
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
.badge.p-high{background:#1F6B5C;color:#fff}
.badge.p-medium{background:#FBEBD7;color:#9A4A00}
.badge.p-low{background:#ECEAE4;color:#5B6372}
.badge.p-noise{background:#F3E1DF;color:#9B2C22}
.why{font-size:13px;color:var(--teal-deep);margin-top:4px}
.reasons{margin:8px 0;padding-left:18px;font-size:14px}
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
.switch{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;margin:20px 0 0;padding:16px 18px;border-radius:14px;background:var(--card);border:1px solid var(--line)}
.switch.off{background:var(--warn-soft);border-color:#E9C9A0}
.switch b{font-size:16px}
.switch .live{display:inline-block;width:9px;height:9px;border-radius:50%;background:#2E9E6A;margin-right:8px}
.switch form{margin:0}
.switch button{font:inherit;font-weight:600;padding:10px 16px;border-radius:10px;border:0;cursor:pointer}
.switch button.kill{background:#B42318;color:#fff}
.switch button.on{background:var(--teal-deep);color:#fff}
@media (max-width:900px){.detail{grid-template-columns:minmax(0,1fr)}aside{order:-1}}
@media (max-width:1000px){.stats{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:760px){.stats{grid-template-columns:repeat(2,minmax(0,1fr))}.row{grid-template-columns:minmax(0,1fr);gap:6px}.row .when{text-align:left}.msg{max-width:100%}}
</style></head><body>
<header class="top"><div class="in"><a href="${BASE}"><span class="dot"></span>bondarewicz.com · visitor conversations</a><span class="tz">times in ${esc(TZ)}</span></div></header>
<main><!--email_off-->${body}<!--/email_off--></main></body></html>`; // email_off stops Cloudflare masking addresses

/* ───── list ───── */

function costPerLead(convs) {
  const leads = convs.filter(isLead).length;
  const spent = convs.reduce((n, c) => n + (c.costUsd || 0), 0);
  return leads ? `$${(spent / leads).toFixed(2)}` : '–';
}

async function stats(convs) {
  const now = Date.now();
  const since = (ms) => convs.filter((c) => now - Date.parse(c.startedAt) < ms).length;
  const spent = parseFloat((await redis.get(keys.spend())) || '0');
  const budget = parseFloat(process.env.AGENT_DAILY_BUDGET_USD || '0.5');
  return `<div class="stats">
<div class="stat"><b>${since(86400000)}</b><span>conversations, last 24 h</span></div>
<div class="stat"><b>${since(7 * 86400000)}</b><span>conversations, last 7 days</span></div>
<div class="stat"><b>${convs.filter(isLead).length}</b><span>leads (left contact details)</span></div>
<div class="stat"><b>${costPerLead(convs)}</b><span>Claude cost per lead, all time</span></div>
<div class="stat"><b>$${spent.toFixed(2)}</b><span>spent today of $${budget.toFixed(2)} budget</span></div>
</div>`;
}

async function list(req, res) {
  const all = await store.list(500);
  const filter = ['top', 'leads', 'flagged'].includes(req.query.filter) ? req.query.filter : 'all';
  const shown = filter === 'top'
    ? all.filter((c) => priority(c).score >= 20).sort((a, b) => priority(b).score - priority(a).score)
    : filter === 'leads' ? all.filter(isLead) : filter === 'flagged' ? all.filter(flagged) : all;
  const tab = (key, label, n) => `<a class="${filter === key ? 'on' : ''}" href="${BASE}${key === 'all' ? '' : `?filter=${key}`}">${label} · ${n}</a>`;

  const rows = shown.map((c) => {
    const qs = questions(c);
    const v = c.visitor || {};
    const who = v.name || v.email || 'Anonymous visitor';
    const contact = [v.email && v.name ? v.email : '', v.company].filter(Boolean).join(' · ');
    return `<a class="row" href="${BASE}/c/${esc(c.id)}">
<div><strong>${esc(who)}</strong> ${badges(c)}<div class="sub">${esc(contact)}</div><div class="why">${esc(priority(c).reasons.join(', '))}</div></div>
<div class="q">“${esc(qs[0] ? qs[0].content.slice(0, 160) : '')}”<div class="sub">${plural(qs.length, 'question')}</div></div>
<div>${esc(place(c))}<div class="sub">${esc([c.geo && c.geo.org, `via ${source(c)}`].filter(Boolean).join(' · '))}</div></div>
<div class="when">${esc(ago(c.updatedAt))}<div class="sub">${esc(localTime(c.updatedAt))}</div><div class="sub">cost ${cost(c)}</div></div>
</a>`;
  }).join('');

  res.send(page('Visitor conversations', `<h1>Visitor conversations</h1>
<div class="sub">Everything visitors asked the site agent, newest first. Kept ${esc(process.env.AGENT_RETENTION_DAYS || '180')} days.</div>
${await switchPanel()}
${await stats(all)}
<nav class="tabs">${tab('top', 'Top leads', all.filter((c) => priority(c).score >= 20).length)}${tab('all', 'All', all.length)}${tab('leads', 'Leads', all.filter(isLead).length)}${tab('flagged', 'Flagged', all.filter(flagged).length)}</nav>
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
    const status = m.status && m.status !== 'ok' ? `<div class="status">${esc(STATUS[m.status] || m.status)}</div>` : '';
    return `<div class="who-label">Agent</div><div class="msg assistant">${status}${esc(m.content)}${fitHtml(m.fit)}</div>`;
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
<div class="card"><h2>Priority</h2><div class="person">${badges(c)}</div><ul class="reasons">${priority(c).reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul><div class="sub">Claude cost for this conversation: ${cost(c)}</div></div>
<div class="card"><h2>Where</h2>${dl([['Location', [g.city, g.region, g.countryName || g.country].filter(Boolean).join(', ')], ['Network', g.org], ['IP', c.ip], ['Timezone', c.timezone], ['Language', c.language]])}</div>
<div class="card"><h2>How they arrived</h2>${dl([['Source', source(c)], ['Referrer', c.referrer], ['Landing page', c.landing], ['First asked', firstQ ? localTime(firstQ.at) : '']])}</div>
<div class="card"><h2>Device</h2>${dl([['Browser', device(c.userAgent)], ['Screen', c.screen]])}</div>
<div class="card"><h2>Cost</h2>${dl([['Model', c.model], ['Spent', `$${(c.costUsd || 0).toFixed(4)}`]])}</div>
</aside>
</div>`));
}

module.exports = { requireAdmin, list, detail, killSwitch, priority, emailLooksReal };
