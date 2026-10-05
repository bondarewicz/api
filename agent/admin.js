const crypto = require('crypto');
const store = require('./store');

// Visitor text is untrusted: everything rendered goes through esc().
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BASE = '/v1/agent/admin';
const host = (url) => { try { return new URL(url).hostname; } catch { return url; } };
const when = (iso) => (iso ? new Date(iso).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '');

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * HTTP basic auth against ADMIN_PASSWORD (any username). Without the variable the admin is off.
 */
function requireAdmin(req, res, next) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return res.status(404).end();
  const [scheme, encoded] = (req.headers.authorization || '').split(' ');
  const given = scheme === 'Basic' && encoded ? Buffer.from(encoded, 'base64').toString().split(':').slice(1).join(':') : '';
  if (!safeEqual(given, password)) {
    res.set('WWW-Authenticate', 'Basic realm="bondarewicz agent"');
    return res.status(401).send('Authentication required');
  }
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex');
  next();
}

const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>
body{margin:0;font:15px/1.5 system-ui,sans-serif;background:#F5F3EE;color:#141A24}
main{max-width:1100px;margin:0 auto;padding:24px 16px}
h1{font-size:22px;margin:0 0 4px}a{color:#1F6B5C}
.muted{color:#5B6372;font-size:13px}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #DDDAD2;border-radius:10px;overflow:hidden;margin-top:16px}
th,td{text-align:left;padding:10px 12px;border-bottom:1px solid #EEECE6;vertical-align:top}
th{font-size:12px;text-transform:uppercase;color:#5B6372;background:#FAF9F6}
.lead{background:#E3F0EC;color:#1F6B5C;padding:2px 8px;border-radius:6px;font-size:12px;white-space:nowrap}
.wrap{overflow-x:auto}
.card{background:#fff;border:1px solid #DDDAD2;border-radius:10px;padding:16px;margin-top:16px}
dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 16px;margin:0}dt{color:#5B6372}dd{margin:0;overflow-wrap:anywhere}
.msg{padding:12px 14px;border-radius:10px;margin-top:10px;white-space:pre-wrap;overflow-wrap:anywhere}
.user{background:#141A24;color:#E9EDF3}.assistant{background:#fff;border:1px solid #DDDAD2}
.meta{font-size:12px;color:#5B6372;margin-top:6px}
</style></head><body><main>${body}</main></body></html>`;

async function list(req, res) {
  const convs = await store.list(200);
  const rows = convs.map((c) => {
    const first = c.messages.find((m) => m.role === 'user');
    const g = c.geo || {};
    return `<tr>
<td><a href="${BASE}/c/${esc(c.id)}">${esc(when(c.updatedAt))}</a></td>
<td>${c.visitor.email ? `<span class="lead">lead</span> ${esc(c.visitor.name || '')}<br><span class="muted">${esc(c.visitor.email)}${c.visitor.company ? ` · ${esc(c.visitor.company)}` : ''}</span>` : '<span class="muted">anonymous</span>'}</td>
<td>${esc([g.city, g.countryName || g.country].filter(Boolean).join(', '))}<br><span class="muted">${esc(c.ip)}${g.org ? ` · ${esc(g.org)}` : ''}</span></td>
<td>${esc(first ? first.content.slice(0, 140) : '')}</td>
<td>${c.messages.length / 2}</td>
<td class="muted">${esc(c.referrer ? host(c.referrer) : 'direct')}</td>
</tr>`;
  }).join('');
  res.send(page('Agent conversations', `<h1>Agent conversations</h1>
<div class="muted">${convs.length} conversations, newest first · kept ${esc(process.env.AGENT_RETENTION_DAYS || '180')} days</div>
<div class="wrap"><table><thead><tr><th>Last active</th><th>Visitor</th><th>Where</th><th>First question</th><th>Qs</th><th>Came from</th></tr></thead><tbody>${rows || '<tr><td colspan="6">No conversations yet.</td></tr>'}</tbody></table></div>`));
}

async function detail(req, res) {
  const c = store.ID_RE.test(req.params.id) ? await store.get(req.params.id) : null;
  if (!c) return res.status(404).send(page('Not found', `<a href="${BASE}">← All conversations</a><h1>Not found</h1><p>It may have expired.</p>`));
  const g = c.geo || {};
  const v = c.visitor || {};
  const facts = [
    ['Name', v.name], ['Email', v.email && `<a href="mailto:${esc(v.email)}">${esc(v.email)}</a>`], ['Company', v.company], ['Note', v.note],
    ['Location', [g.city, g.region, g.countryName || g.country].filter(Boolean).join(', ')], ['IP', c.ip], ['Network', g.org],
    ['Came from', c.referrer || 'direct'], ['Landing page', c.landing], ['Language / timezone', [c.language, c.timezone].filter(Boolean).join(' · ')],
    ['Screen', c.screen], ['Browser', c.userAgent], ['Started', when(c.startedAt)], ['Last active', when(c.updatedAt)],
    ['Model / cost', `${c.model || ''} · $${(c.costUsd || 0).toFixed(4)}`],
  ].filter(([, val]) => val);
  const html = (k, val) => (k === 'Email' ? val : esc(val));
  const msgs = c.messages.map((m) => {
    const fit = m.fit && (m.fit.strong.length || m.fit.discuss.length)
      ? `<div class="meta">Strong: ${esc(m.fit.strong.join(' | '))}<br>Discuss: ${esc(m.fit.discuss.join(' | '))}</div>` : '';
    const extra = m.role === 'assistant' && m.sources && m.sources.length ? `<div class="meta">sources: ${esc(m.sources.join(', '))}</div>` : '';
    return `<div class="msg ${m.role === 'user' ? 'user' : 'assistant'}">${esc(m.content)}${fit}${extra}<div class="meta">${esc(when(m.at))}${m.status && m.status !== 'ok' ? ` · ${esc(m.status)}` : ''}</div></div>`;
  }).join('');
  res.send(page('Conversation', `<a href="${BASE}">← All conversations</a>
<div class="card"><dl>${facts.map(([k, val]) => `<dt>${esc(k)}</dt><dd>${html(k, val)}</dd>`).join('')}</dl></div>
${msgs}`));
}

module.exports = { requireAdmin, list, detail };
