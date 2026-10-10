// POST /api/transcribe  (body: raw audio, header x-prompt: the song lines sung just before)
// GET  /api/transcribe?ping=1  -> { ok } so the app knows whether cloud transcription is set up
// Transcribes a singing turn with Whisper (large-v3-turbo on Groq). The key stays on the server
// (Vercel env var GROQ_API_KEY). Without it the app falls back to the browser's own recognizer.

const MAX_BYTES = 4 * 1024 * 1024; // ~a minute of compressed audio; turns are far shorter
const ENDPOINT = 'https://api.groq.com/openai/v1/audio/transcriptions';

async function readBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body; // Vercel may hand us the parsed body already
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BYTES) throw Object.assign(new Error('audio too large'), { status: 413 });
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

const extFor = (type) => (/mp4|m4a|aac/.test(type) ? 'm4a' : /ogg/.test(type) ? 'ogg' : /wav/.test(type) ? 'wav' : 'webm');

export default async function handler(req, res) {
  const key = process.env.GROQ_API_KEY;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  const send = (status, obj) => { res.statusCode = status; res.end(JSON.stringify(obj)); };

  if (req.method === 'GET') return send(200, { ok: !!key });
  if (req.method !== 'POST') return send(405, { error: 'method not allowed' });
  if (!key) return send(503, { error: 'transcription not configured' });

  // only our own pages may use this (keeps strangers from burning the quota)
  const origin = req.headers.origin || req.headers.referer || '';
  if (origin && !/^https?:\/\/(localhost(:\d+)?|127\.0\.0\.1(:\d+)?|pass-the-mic[\w-]*\.vercel\.app)(\/|$)/.test(origin)) return send(403, { error: 'forbidden' });

  try {
    const audio = await readBody(req);
    if (audio.length < 2000) return send(200, { text: '' }); // too short to contain a word
    const type = String(req.headers['content-type'] || 'audio/webm').split(';')[0];
    let prompt = '';
    try { prompt = decodeURIComponent(String(req.headers['x-prompt'] || '')).slice(0, 600); } catch {}

    const form = new FormData();
    form.append('file', new Blob([audio], { type }), `turn.${extFor(type)}`);
    form.append('model', 'whisper-large-v3-turbo');
    form.append('language', 'en');
    form.append('temperature', '0');
    form.append('response_format', 'verbose_json');
    if (prompt) form.append('prompt', prompt);

    const r = await fetch(ENDPOINT, { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: form });
    if (!r.ok) return send(r.status === 429 ? 429 : 502, { error: `transcriber ${r.status}` });
    const j = await r.json();
    // Whisper invents words on silence/noise ("Thank you.", "I'm a little bit more."). Keep only segments it's
    // actually confident about: real singing scores around -0.4 avg log-prob, made-up text around -1.9.
    const segs = Array.isArray(j.segments) ? j.segments : null;
    const text = segs
      ? segs.filter((g) => g.avg_logprob > -1.0 && g.no_speech_prob < 0.6 && (g.compression_ratio ?? 1) < 2.4).map((g) => g.text).join(' ')
      : j.text;
    send(200, { text: String(text || '').replace(/\s+/g, ' ').trim() });
  } catch (e) {
    send(e.status || 500, { error: String(e.message || e) });
  }
}
