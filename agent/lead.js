const { client: redis } = require('../redis');
const store = require('./store');
const { notify, adminLink, where } = require('./notify');

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const clip = (s, n) => String(s || '').trim().slice(0, n);

const isEmail = (s) => EMAIL_RE.test(String(s || '').trim());

/**
 * Saves a lead (from the contact form or captured in chat) and pushes a notification.
 */
async function saveLead({ name, email, company, note, conversationId, ip, source }) {
  const lead = {
    name: clip(name, 120),
    email: clip(email, 254),
    company: clip(company, 120),
    note: clip(note, 1000),
    conversationId: store.ID_RE.test(conversationId || '') ? conversationId : null,
    source,
    ip,
    at: new Date().toISOString(),
  };
  await redis.lPush('agent:leads', JSON.stringify(lead));
  const conv = lead.conversationId ? await store.get(lead.conversationId) : null;
  const lastQuestion = conv ? [...conv.messages].reverse().find((m) => m.role === 'user') : null;
  const notified = await notify({
    title: `New lead: ${lead.name || lead.email}`,
    tags: 'briefcase',
    link: adminLink(lead.conversationId),
    text: [
      `${lead.name || '(no name)'} <${lead.email}>${lead.company ? ` · ${lead.company}` : ''}`,
      lead.note,
      conv ? `From ${where(conv)} · ${conv.messages.length / 2} questions` : `From ${ip}`,
      lastQuestion ? `Last asked: ${lastQuestion.content.slice(0, 300)}` : '',
    ].filter(Boolean).join('\n'),
  });
  console.log(`agent: lead saved via ${source} notified=${notified}`);
  return notified;
}

function makeLeadHandler({ visitorIp, admit, limits }) {
  return async function agentLead(req, res) {
    const body = req.body || {};
    if (!isEmail(body.email)) return res.status(400).json({ error: 'Please check the email address.' });

    const ip = visitorIp(req);
    try {
      const admitted = await admit('lead', ip, { perIpPerHour: limits.leadsPerIpPerHour, globalPerDay: limits.leadsPerDay });
      if (!admitted.ok) return res.status(429).json({ error: 'Too many requests, please email directly.' });

      if (body.conversationId) await store.setVisitor(body.conversationId, { name: body.name, email: body.email, note: body.note }, ip);
      const notified = await saveLead({ ...body, ip, source: 'form' });
      res.json({ ok: true, notified });
    } catch (err) {
      console.error('lead error', err);
      res.status(500).json({ error: 'Could not save, please email directly.' });
    }
  };
}

module.exports = { makeLeadHandler, saveLead, isEmail };
