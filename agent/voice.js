const crypto = require('crypto');
const fetch = require('node-fetch');
const { commandOptions } = require('redis');
const { client: redis } = require('../redis');
const spec = require('./agent.json');
const guard = require('./guard');
const keys = require('./keys');
const store = require('./store');

/**
 * Spoken answers through ElevenLabs. The site never sends text to speak: it names an answer
 * the agent already gave (conversation id + message id), so this can't be used as a free TTS proxy.
 */
const ELEVEN = 'https://api.elevenlabs.io/v1';
const limits = spec.limits.speech;
const CACHE_SECONDS = 7 * 24 * 60 * 60;

const config = () => ({
  // ELEVENLABS_API_ENABLED=false switches voice off without removing the key
  key: process.env.ELEVENLABS_API_ENABLED === 'false' ? null : process.env.ELEVENLABS_API_KEY,
  voice: process.env.ELEVENLABS_VOICE_ID,
  // Polish answers in a Polish voice; without it, the main voice reads Polish too
  voicePl: process.env.ELEVENLABS_VOICE_ID_PL,
  model: process.env.ELEVENLABS_MODEL || 'eleven_flash_v2_5',
  format: process.env.ELEVENLABS_OUTPUT_FORMAT || 'mp3_44100_64',
  monthlyChars: parseInt(process.env.ELEVENLABS_MONTHLY_CHARS || '55000', 10),
});

// what the ear needs: no links, no markdown
function speakable(text) {
  return String(text || '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_`#>]+/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/**
 * Takes chars out of this month's allowance before a paid call; refunded when it would cross the cap.
 */
async function reserveChars(n) {
  const key = keys.speechChars();
  const total = await redis.incrBy(key, n);
  await redis.expire(key, 40 * 24 * 60 * 60);
  if (total > config().monthlyChars) {
    await redis.decrBy(key, n);
    return false;
  }
  return true;
}

async function available() {
  const { key, voice, monthlyChars } = config();
  if (!key || !voice) return false;
  const used = parseInt((await redis.get(keys.speechChars())) || '0', 10);
  return used < monthlyChars;
}

/**
 * GET /agent/speech/:conversationId/:messageId: the answer as mp3, streamed. The voice comes from
 * the environment only (ELEVENLABS_VOICE_ID, ELEVENLABS_VOICE_ID_PL for Polish), so a visitor
 * can't choose another; the language is the one the answer was given in.
 * A plain GET so the site can hand the URL to an <audio> element and let the browser stream it.
 */
async function speech(req, res) {
  const cfg = config();
  if (!cfg.key || !cfg.voice) return res.status(503).json({ error: 'voice off' });
  const ip = guard.visitorIp(req);
  try {
    const message = await store.findAnswer(req.params.conversationId, req.params.messageId, ip);
    const text = message && speakable(message.content);
    if (!text) return res.status(404).json({ error: 'no such answer' });

    // answers saved before languages were stored fall back to the page's language
    const lang = (message.lang || req.query.lang) === 'pl' ? 'pl' : 'en';
    const voice = (lang === 'pl' && cfg.voicePl) || cfg.voice;
    const cacheKey = keys.speechCache(crypto.createHash('sha256').update([cfg.model, cfg.format, voice, lang, text].join('|')).digest('hex'));

    // the page is on another origin; let the <audio> element load it
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.set('Content-Type', 'audio/mpeg');
    res.set('Cache-Control', 'private, max-age=3600');

    // a replay costs nothing
    const cached = await redis.get(commandOptions({ returnBuffers: true }), cacheKey);
    if (cached) return res.end(cached);

    const admitted = await guard.admit('speech', ip, limits);
    if (!admitted.ok) return res.status(admitted.status).json({ error: admitted.reason });
    if (!(await reserveChars(text.length))) return res.status(503).json({ error: 'voice budget' });

    const r = await fetch(`${ELEVEN}/text-to-speech/${voice}/stream?output_format=${cfg.format}`, {
      method: 'POST',
      headers: { 'xi-api-key': cfg.key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: cfg.model, language_code: lang }),
    });
    if (!r.ok) {
      await redis.decrBy(keys.speechChars(), text.length);
      console.error(`agent speech: elevenlabs ${r.status} ${(await r.text()).slice(0, 300)}`);
      return res.status(502).json({ error: 'speech unavailable' });
    }
    console.log(`agent speech: ${text.length} chars, ${lang}, voice ${voice}, ${cfg.model}`);

    const chunks = [];
    r.body.on('data', (chunk) => { chunks.push(chunk); res.write(chunk); });
    r.body.on('end', async () => {
      res.end();
      try {
        await redis.set(cacheKey, Buffer.concat(chunks), { EX: CACHE_SECONDS });
        await store.addSpeech(req.params.conversationId, text.length, ip);
      } catch (err) {
        console.error('agent speech: cache failed', err);
      }
    });
    r.body.on('error', (err) => {
      console.error('agent speech stream failed', err);
      res.destroy(err);
    });
  } catch (err) {
    console.error('agent speech failed', err);
    if (!res.headersSent) res.status(502).json({ error: 'speech unavailable' });
  }
}

module.exports = { speech, available, speakable };
