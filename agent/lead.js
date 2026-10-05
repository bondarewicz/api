const fetch = require('node-fetch');
const { client: redis } = require('../redis');

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const clip = (s, n) => String(s || '').trim().slice(0, n);

/**
 * Pushes a short notification to LEAD_WEBHOOK_URL if set.
 * ntfy.sh topics take plain text; Slack and Discord webhooks take JSON.
 */
async function notify(lead) {
  const url = process.env.LEAD_WEBHOOK_URL;
  if (!url) return false;
  const text = `New lead from bondarewicz.com\n${lead.name} <${lead.email}>\n${lead.note || '(no note)'}\n\n${lead.transcript.slice(0, 1500)}`;
  const isNtfy = new URL(url).hostname.endsWith('ntfy.sh');
  const r = await fetch(url, isNtfy
    ? { method: 'POST', body: text, headers: { Title: 'New lead', Tags: 'briefcase' } }
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, content: text }) });
  if (!r.ok) throw new Error(`webhook http ${r.status}`);
  return true;
}

function makeLeadHandler({ visitorIp, admit, limits }) {
  return async function agentLead(req, res) {
    const body = req.body || {};
    const email = clip(body.email, 254);
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please check the email address.' });

    const ip = visitorIp(req);
    try {
      const admitted = await admit('lead', ip, { perIpPerHour: limits.leadsPerIpPerHour, globalPerDay: limits.leadsPerDay });
      if (!admitted.ok) return res.status(429).json({ error: 'Too many requests, please email directly.' });

      const transcript = (Array.isArray(body.transcript) ? body.transcript : [])
        .slice(-20)
        .map((m) => `${m.role === 'user' ? 'Visitor' : 'Agent'}: ${clip(m.content, 1500)}`)
        .join('\n');
      const lead = { name: clip(body.name, 120), email, note: clip(body.note, 1000), transcript, ip, at: new Date().toISOString() };
      await redis.lPush('agent:leads', JSON.stringify(lead));

      let notified = false;
      try { notified = await notify(lead); } catch (err) { console.error('lead notify failed', err.message); }
      console.log(`agent: lead saved ${email} notified=${notified}`);
      res.json({ ok: true, notified });
    } catch (err) {
      console.error('lead error', err);
      res.status(500).json({ error: 'Could not save, please email directly.' });
    }
  };
}

module.exports = { makeLeadHandler };
