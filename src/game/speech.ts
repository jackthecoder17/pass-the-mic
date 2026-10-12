// Listening. Two "ears": the browser's own speech recognizer (instant, where available) and
// Whisper via /api/transcribe (much better on singing, accents and Pidgin; works in every browser).
import { S } from './store';
import { audioCtx, unlockAudio } from './audio';
import { dbg, getSR, toast, type SpeechRecognitionLike } from './helpers';

// ---------- the browser recognizer ----------
let rec: SpeechRecognitionLike | null = null;
let recOn = false;
export const stopLiveRec = () => { recOn = false; try { rec?.stop(); } catch {} };
export function startRec(_expected: string[] | null, onText: (t: string) => void, { quiet = false, onFail = null as null | (() => void) } = {}) {
  const SR = getSR();
  if (!SR) return;
  recOn = false; try { rec?.stop(); } catch {}
  recOn = true;
  if (!quiet) S.micBlocked = false;
  let prior = '';
  const begin = () => {
    if (!recOn) return;
    let session = '';
    const r = new SR();
    rec = r;
    r.lang = S.lang; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
    r.onresult = (e) => {
      const parts: string[] = [];
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        parts.push(res[0].transcript); // its top guess only: picking the guess that fits the lyric best inflated scores
      }
      session = parts.join(' ');
      onText(`${prior} ${session}`.replace(/\s+/g, ' ').trim());
    };
    r.onerror = (e) => {
      const why = ({
        'not-allowed': 'Microphone blocked. Click the 🔒 by the address bar → allow Microphone, then reload.',
        'service-not-allowed': "This browser won't run speech recognition. Use Google Chrome or Safari.",
        'audio-capture': 'No microphone found. Check one is connected and allowed in System Settings → Privacy → Microphone.',
        'network': "This browser can't reach its speech service (common in Brave/Arc). Use Google Chrome or Safari.",
        'language-not-supported': 'That accent setting is not supported here. Try the US accent.',
      } as Record<string, string>)[e.error];
      if (!why) return;
      recOn = false;
      if (quiet) return onFail?.(); // helper only: Whisper keeps listening
      S.micBlocked = true; toast(why);
    };
    r.onend = () => {
      prior = `${prior} ${session}`.trim();
      if (recOn && rec === r) setTimeout(begin, 120); // recognizers stop on pauses; keep listening
    };
    try { r.start(); } catch {}
  };
  begin();
}
export function stopRec() {
  recOn = false;
  try { rec?.stop(); } catch {}
  if (cRec) stopCloudRec(true);
}

// ---------- cloud ears: Whisper via /api/transcribe ----------
// Records the turn and re-transcribes the growing clip every ~1.5s for live feedback, then once more
// in full when the turn ends. Off (falls back to the browser recognizer) until GROQ_API_KEY is set.
interface CloudRec {
  stream: MediaStream; mr: MediaRecorder; chunks: Blob[]; mime: string; inflight: boolean; sent: number; text: string; ok: number;
  onText: (t: string) => void; prompt: string; partials: boolean; lang: string;
  src?: MediaStreamAudioSourceNode; an?: AnalyserNode; timer?: ReturnType<typeof setInterval>; vad?: ReturnType<typeof setInterval>; voiced: number;
}
let cRec: CloudRec | null = null;
export const cloudRec = () => cRec;

export function checkCloud(onReady: () => void) {
  fetch('/api/transcribe?ping=1').then((r) => (r.ok ? r.json() : null)).then((j) => {
    S.cloud = !!j?.ok && !!window.MediaRecorder && !!navigator.mediaDevices?.getUserMedia;
    if (S.cloud) onReady();
  }).catch(() => {});
}

const recMime = () => ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || '';

async function transcribe(blob: Blob, prompt: string, lang = 'en', final = false) {
  const r = await fetch('/api/transcribe', { method: 'POST', headers: { 'content-type': blob.type || 'audio/webm', 'x-prompt': encodeURIComponent(prompt || ''), 'x-lang': lang, 'x-final': final ? '1' : '0' }, body: blob });
  if (!r.ok) throw new Error(`transcribe ${r.status}`);
  return ((await r.json()).text as string) || '';
}
export async function startCloudRec(prompt: string, onText: (t: string) => void, { partials = true, lang = 'en' } = {}) {
  if (cRec) stopCloudRec(true);
  S.micBlocked = false; S.cloudFailed = false;
  let stream: MediaStream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true, channelCount: 1 } }); }
  catch { S.micBlocked = true; toast('Microphone blocked. Allow mic access for this site in your browser settings, then reload.'); return; }
  const mime = recMime();
  const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const st: CloudRec = { stream, mr, chunks: [], mime: mr.mimeType || mime || 'audio/webm', inflight: false, sent: 0, text: '', ok: 0, onText, prompt, partials, lang, voiced: 0 };
  cRec = st;
  try { unlockAudio(); const ac = audioCtx()!; st.src = ac.createMediaStreamSource(stream); st.an = ac.createAnalyser(); st.an.fftSize = 512; st.src.connect(st.an); } catch {}
  mr.ondataavailable = (e) => { if (e.data.size) st.chunks.push(e.data); };
  mr.start(400);
  st.timer = setInterval(() => { if (st.partials) pump(st); }, 1500);
  // voice activity: count how long the mic actually hears something (silence never reaches Whisper)
  st.voiced = 0;
  st.vad = setInterval(() => { const l = levelOf(st); if (l === null || l > 0.025) st.voiced += 100; }, 100);
}
async function pump(st: CloudRec, final = false) {
  if (st.inflight && !final) return;
  const size = st.chunks.reduce((n, c) => n + c.size, 0);
  if (!final && size - st.sent < 5000) return; // nothing new worth sending yet
  if (!final && st.voiced < 300) return; // nobody has sung anything yet
  if (final && st.voiced < 400) { dbg(`whisper skipped: only ${st.voiced}ms of voice`); st.text = ''; st.ok++; return; } // silence: don't let Whisper imagine words
  st.inflight = true; st.sent = size;
  try {
    const t0 = performance.now();
    const text = await transcribe(new Blob(st.chunks, { type: st.mime }), st.prompt, st.lang, final);
    dbg(`whisper ${final ? 'FINAL' : 'partial'} ${Math.round(performance.now() - t0)}ms ${(size / 1024).toFixed(0)}KB voiced=${st.voiced}ms:`, JSON.stringify(text));
    st.ok++;
    if (text || final) { st.text = text || st.text; if (cRec === st || final) st.onText(st.text); }
  } catch (e) { console.warn(e); }
  finally { st.inflight = false; }
}
// stop recording; resolves with the transcript of the whole clip (abort: just stop)
export function stopCloudRec(abort = false): Promise<string> {
  const st = cRec;
  if (!st) return Promise.resolve('');
  cRec = null; clearInterval(st.timer); clearInterval(st.vad);
  return new Promise((resolve) => {
    const finish = async () => {
      st.stream.getTracks().forEach((t) => t.stop());
      try { st.src?.disconnect(); } catch {}
      if (abort) return resolve('');
      const work = (async () => { while (st.inflight) await new Promise((r) => setTimeout(r, 80)); await pump(st, true); })();
      await Promise.race([work, new Promise((r) => setTimeout(r, 7000))]);
      S.cloudFailed = st.ok === 0;
      // keep this turn's singing for the highlight reel (never uploaded unless the player shares the reel)
      S.lastAudio = st.voiced >= 400 && st.chunks.length ? new Blob(st.chunks, { type: st.mime }) : null;
      resolve(st.text);
    };
    if (st.mr.state !== 'inactive') { st.mr.onstop = finish; st.mr.stop(); } else finish();
  });
}
export const micLevel = () => (cRec ? levelOf(cRec) : null);
function levelOf(st: CloudRec) {
  const an = st?.an;
  if (!an) return null; // no analyser (audio context blocked): don't gate on volume
  const d = new Uint8Array(an.fftSize);
  an.getByteTimeDomainData(d);
  let sum = 0;
  for (const v of d) { const x = (v - 128) / 128; sum += x * x; }
  return Math.sqrt(sum / d.length);
}
