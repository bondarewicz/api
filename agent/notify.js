const fetch = require('node-fetch');

/**
 * Pushes a notification to LEAD_WEBHOOK_URL if set.
 * ntfy.sh topics take plain text (with an optional click-through link); Slack and Discord webhooks take JSON.
 */
async function notify({ title, text, link, tags, sendEmail = true }) {
  const url = process.env.LEAD_WEBHOOK_URL;
  if (!url) return false;
  try {
    const isNtfy = new URL(url).hostname.endsWith('ntfy.sh');
    // ntfy can also forward the message by email (NOTIFY_EMAIL); the public server rate-limits this
    const email = sendEmail ? process.env.NOTIFY_EMAIL : null;
    const headers = isNtfy
      ? { Title: title, Tags: tags || 'speech_balloon', ...(link ? { Click: link } : {}), ...(email ? { Email: email } : {}) }
      : { 'Content-Type': 'application/json' };
    const body = isNtfy ? text.slice(0, 3500) : JSON.stringify({ text: `${title}\n${text}`, content: `${title}\n${text}` });
    const r = await fetch(url, { method: 'POST', headers, body });
    if (!r.ok) throw new Error(`webhook http ${r.status}`);
    return true;
  } catch (err) {
    console.error('notify failed', err.message);
    return false;
  }
}

const adminLink = (id) => {
  const base = process.env.PUBLIC_API_URL || 'https://api.bondarewicz.com/v1';
  return id ? `${base}/agent/admin/c/${id}` : `${base}/agent/admin`;
};

function where(conv) {
  const g = conv.geo || {};
  return [g.city, g.countryName || g.country].filter(Boolean).join(', ') || conv.ip;
}

module.exports = { notify, adminLink, where };
