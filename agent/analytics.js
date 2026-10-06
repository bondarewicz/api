const crypto = require('crypto');
const fetch = require('node-fetch');

/**
 * Conversation events for Matomo (self-hosted, stats.bondarewicz.com), sent with the Tracking HTTP API.
 * Only counts and labels go out: never the text of a message, a name, an email address or an IP.
 * Each conversation shows up as its own visit under a one-way hash of its id.
 * Fire and forget: analytics never slows down or fails a request.
 */
const BASE = (process.env.MATOMO_URL || '').replace(/\/$/, '');
const SITE = process.env.MATOMO_SITE_ID || '1';

const visitorId = (conversationId) => crypto.createHash('sha256').update(`bondarewicz:${conversationId}`).digest('hex').slice(0, 16);

// where the visitor came from, as a host only (no paths or query strings)
function source(meta) {
  try {
    const host = new URL(meta && meta.referrer).hostname.replace(/^www\./, '');
    return host && host !== 'bondarewicz.com' ? host : 'direct';
  } catch {
    return 'direct';
  }
}

function track(req, conversationId, action, name, value) {
  if (!BASE || !conversationId) return;
  const params = new URLSearchParams({
    idsite: SITE,
    rec: '1',
    apiv: '1',
    send_image: '0',
    _id: visitorId(conversationId),
    url: 'https://bondarewicz.com/#assistant',
    e_c: 'Assistant',
    e_a: action,
    rand: crypto.randomBytes(4).toString('hex'),
  });
  if (name) params.set('e_n', String(name).slice(0, 100));
  if (Number.isFinite(value)) params.set('e_v', String(value));
  const ua = req && req.get && req.get('user-agent');
  const lang = req && req.get && req.get('accept-language');
  if (ua) params.set('ua', ua.slice(0, 300));
  if (lang) params.set('lang', lang.slice(0, 100));
  fetch(`${BASE}/matomo.php`, { method: 'POST', body: params, timeout: 3000 })
    .then((r) => { if (!r.ok) console.error(`matomo: HTTP ${r.status}`); })
    .catch((err) => console.error('matomo:', err.message));
}

module.exports = { track, source };
