// POST /api/transcribe  (body: raw audio; headers x-prompt, x-lang, x-final)
// GET  /api/transcribe?ping=1  -> { ok } so the app knows whether cloud transcription is set up
// Transcribes a singing turn with Whisper on Groq. The key stays on the server (env GROQ_API_KEY).
// Without it the app falls back to the browser's own recognizer.

const MAX_BYTES = 4 * 1024 * 1024; // ~a minute of compressed audio; turns are far shorter
const ENDPOINT = 'https://api.groq.com/openai/v1/audio/transcriptions';
const NO_STORE = { 'cache-control': 'no-store' };
const send = (status: number, obj: object) => Response.json(obj, { status, headers: NO_STORE });

// phrases Whisper famously invents on silence/noise (from its YouTube training data)
const PHANTOM = /^(thank you( (so much|very much))?( for watching| for listening)?|thanks for watching|please subscribe.*|subscribe.*|bye( bye)?|you|okay|music|applause|silence|[♪♫\s.!]*)$/;
const phantom = (s: string) => PHANTOM.test(s.toLowerCase().replace(/[^a-z♪♫ ]/g, ' ').replace(/\s+/g, ' ').trim());

const extFor = (type: string) => (/mp4|m4a|aac/.test(type) ? 'm4a' : /ogg/.test(type) ? 'ogg' : /wav/.test(type) ? 'wav' : 'webm');

interface Segment { text: string; avg_logprob: number; no_speech_prob: number; compression_ratio?: number }

export async function GET() {
  return send(200, { ok: !!process.env.GROQ_API_KEY });
}

export async function POST(req: Request) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return send(503, { error: 'transcription not configured' });

  // only our own pages may use this (keeps strangers from burning the quota)
  const origin = req.headers.get('origin') || req.headers.get('referer') || '';
  if (origin && !/^https?:\/\/(localhost(:\d+)?|127\.0\.0\.1(:\d+)?|pass-the-mic[\w-]*\.vercel\.app)(\/|$)/.test(origin)) return send(403, { error: 'forbidden' });

  try {
    if (Number(req.headers.get('content-length') || 0) > MAX_BYTES) return send(413, { error: 'audio too large' });
    const audio = await req.arrayBuffer();
    if (audio.byteLength > MAX_BYTES) return send(413, { error: 'audio too large' });
    if (audio.byteLength < 2000) return send(200, { text: '' }); // too short to contain a word
    const type = String(req.headers.get('content-type') || 'audio/webm').split(';')[0];
    let prompt = '';
    try { prompt = decodeURIComponent(String(req.headers.get('x-prompt') || '')).slice(0, 600); } catch {}

    const form = new FormData();
    form.append('file', new Blob([audio], { type }), `turn.${extFor(type)}`);
    // the final grade uses the full (more accurate) model; live updates use the fast one
    form.append('model', req.headers.get('x-final') === '1' ? 'whisper-large-v3' : 'whisper-large-v3-turbo');
    // English by default; Yoruba-heavy sections ask Whisper to detect the language itself
    const lang = String(req.headers.get('x-lang') ?? 'en');
    if (['en', 'yo'].includes(lang)) form.append('language', lang);
    form.append('temperature', '0');
    form.append('response_format', 'verbose_json');
    if (prompt) form.append('prompt', prompt);

    const r = await fetch(ENDPOINT, { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: form });
    if (!r.ok) return send(r.status === 429 ? 429 : 502, { error: `transcriber ${r.status}` });
    const j = await r.json();
    // Whisper invents words on silence/noise. Keep only segments it's actually confident about:
    // real singing scores around -0.4 avg log-prob, made-up text around -1.9.
    const segs: Segment[] | null = Array.isArray(j.segments) ? j.segments : null;
    const text = segs
      ? segs.filter((g) => g.avg_logprob > -1.0 && g.no_speech_prob < 0.6 && (g.compression_ratio ?? 1) < 2.4 && !phantom(g.text)).map((g) => g.text).join(' ')
      : j.text;
    return send(200, { text: String(text || '').replace(/\s+/g, ' ').trim() });
  } catch (e) {
    return send(500, { error: String((e as Error).message || e) });
  }
}
