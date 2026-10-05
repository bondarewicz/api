const fetch = require('node-fetch');

/**
 * Push to LEAD_WEBHOOK_URL: ntfy.sh topics take plain text (with an optional click-through link);
 * Slack and Discord webhooks take JSON.
 */
async function push({ title, text, link, tags }) {
  const url = process.env.LEAD_WEBHOOK_URL;
  if (!url) return false;
  try {
    const isNtfy = new URL(url).hostname.endsWith('ntfy.sh');
    const r = await fetch(url, isNtfy
      ? { method: 'POST', headers: { Title: title, Tags: tags || 'speech_balloon', ...(link ? { Click: link } : {}) }, body: text.slice(0, 3500) }
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: `${title}\n${text}`, content: `${title}\n${text}` }) });
    if (!r.ok) throw new Error(`webhook http ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return true;
  } catch (err) {
    console.error('push failed', err.message);
    return false;
  }
}

/**
 * Email via Resend (RESEND_API_KEY) to NOTIFY_EMAIL. Without a verified domain Resend only
 * delivers from onboarding@resend.dev to the account owner's own address, which is all we need.
 */
async function email({ title, text, link }) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_EMAIL;
  if (!key || !to) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.NOTIFY_FROM || 'bondarewicz.com <onboarding@resend.dev>',
        to: [to],
        subject: title,
        text: link ? `${text}\n\nFull conversation: ${link}` : text,
      }),
    });
    if (!r.ok) throw new Error(`resend http ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return true;
  } catch (err) {
    console.error('email failed', err.message);
    return false;
  }
}

/**
 * Sends the push and (unless sendEmail is false) the email independently, so one failing
 * never blocks the other. Returns true if at least one went out.
 */
async function notify({ sendEmail = true, ...message }) {
  const [pushed, emailed] = await Promise.all([push(message), sendEmail ? email(message) : false]);
  return pushed || emailed;
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
