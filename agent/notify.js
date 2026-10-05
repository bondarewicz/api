const fetch = require('node-fetch');
const { countWithExpiry, day } = require('./guard');

// Hard daily ceilings so nobody can flood the phone or inbox, whatever the request limits do.
const PUSHES_PER_DAY = parseInt(process.env.NOTIFY_PUSHES_PER_DAY || '60', 10);
const EMAILS_PER_DAY = parseInt(process.env.NOTIFY_EMAILS_PER_DAY || '25', 10);

// Visitor text ends up in notifications: drop control characters and keep it short.
const clean = (s, n) => String(s || '').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').slice(0, n);

async function underCap(kind, max) {
  return (await countWithExpiry(`agent:notify:${kind}:${day()}`, 2 * 24 * 60 * 60)) <= max;
}

/**
 * Push to LEAD_WEBHOOK_URL: an ntfy.sh topic, or a Slack/Discord webhook (JSON).
 */
async function push({ title, text, link, tags }) {
  const url = process.env.LEAD_WEBHOOK_URL;
  if (!url) return false;
  try {
    const target = new URL(url);
    // ntfy's JSON publish carries UTF-8 titles (headers can't), so names like Żaneta survive
    const r = target.hostname.endsWith('ntfy.sh')
      ? await fetch(`${target.origin}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: target.pathname.slice(1), title, message: text, tags: [tags || 'speech_balloon'], ...(link ? { click: link } : {}) }),
      })
      : await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: `${title}\n${text}`, content: `${title}\n${text}` }) });
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
async function notify({ sendEmail = true, title, text, ...rest }) {
  const message = { ...rest, title: clean(title, 120).replace(/\n/g, ' '), text: clean(text, 1500) };
  const [pushed, emailed] = await Promise.all([
    (await underCap('push', PUSHES_PER_DAY)) ? push(message) : false,
    sendEmail && (await underCap('email', EMAILS_PER_DAY)) ? email(message) : false,
  ]);
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
