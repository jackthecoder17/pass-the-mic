// Highlight reel: turns the turns recorded on this phone into a shareable vertical video.
// Everything happens on the device (canvas + Web Audio + MediaRecorder); nothing is uploaded.
//
// clip = { name, c, f, photo, lyric, heard, pct, pass, round, song, blob?, buffer? }

const W = 720, H = 1280, FPS = 30;
const COLORS = { 1: '#ff6b1a', 2: '#19e68c', 3: '#ff2e63', 4: '#33d6ff', 5: '#a37bff', 6: '#ffc23d' };
const CLIP_MAX = 7, CARD = 0.9, HOLD = 1.6, INTRO = 1.8, OUTRO = 2.4;

// funniest fails first, then the best pass; at most 4, played back in the order they happened
export function pickMoments(clips) {
  const usable = clips.filter((c) => c.blob || c.buffer);
  const fails = usable.filter((c) => !c.pass).sort((a, b) => a.pct - b.pct).slice(0, 3);
  const best = usable.filter((c) => c.pass).sort((a, b) => b.pct - a.pct)[0];
  const picked = [...fails, ...(best ? [best] : [])];
  if (!picked.length) picked.push(...usable.slice(-3));
  return picked.slice(0, 4).sort((a, b) => a.at - b.at);
}

export function reelSupported() {
  return !!(window.MediaRecorder && HTMLCanvasElement.prototype.captureStream && (window.AudioContext || window.webkitAudioContext));
}

function pickMime() {
  const opts = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return opts.find((m) => MediaRecorder.isTypeSupported(m)) || '';
}

// trim leading silence so each clip starts on the first sung note
function trimBuffer(ac, buf, maxSec) {
  const d = buf.getChannelData(0), thr = 0.03;
  let start = 0;
  while (start < d.length && Math.abs(d[start]) < thr) start++;
  start = Math.max(0, start - Math.round(0.15 * buf.sampleRate));
  const len = Math.min(d.length - start, Math.round(maxSec * buf.sampleRate));
  if (len <= 0) return buf;
  const out = ac.createBuffer(1, len, buf.sampleRate);
  out.getChannelData(0).set(d.subarray(start, start + len));
  return out;
}

async function loadImage(src) {
  if (!src) return null;
  return new Promise((ok) => {
    const im = new Image();
    im.crossOrigin = 'anonymous'; // keeps the canvas recordable
    im.onload = () => ok(im);
    im.onerror = () => ok(null);
    im.src = src;
  });
}

// ---------- drawing helpers ----------
function bg(g, t) {
  g.fillStyle = '#120a07'; g.fillRect(0, 0, W, H);
  const r1 = g.createRadialGradient(W / 2, -120, 40, W / 2, -120, H * 0.75);
  r1.addColorStop(0, `rgba(255,107,26,${0.42 + 0.06 * Math.sin(t * 2)})`); r1.addColorStop(1, 'rgba(255,107,26,0)');
  g.fillStyle = r1; g.fillRect(0, 0, W, H);
  const r2 = g.createRadialGradient(W, H, 20, W, H, H * 0.55);
  r2.addColorStop(0, 'rgba(255,46,99,.22)'); r2.addColorStop(1, 'rgba(255,46,99,0)');
  g.fillStyle = r2; g.fillRect(0, 0, W, H);
}
function text(g, s, x, y, { size = 40, font = 'Anton', weight = 400, color = '#fff4e6', align = 'center', maxW = W - 80, lh = 1.1 } = {}) {
  g.font = `${weight} ${size}px ${font === 'Anton' ? 'Anton, Impact, sans-serif' : '"DM Sans", system-ui, sans-serif'}`;
  g.fillStyle = color; g.textAlign = align; g.textBaseline = 'alphabetic';
  const words = String(s).split(/\s+/), lines = [];
  let line = '';
  for (const w of words) { const tryL = line ? line + ' ' + w : w; if (g.measureText(tryL).width > maxW && line) { lines.push(line); line = w; } else line = tryL; }
  if (line) lines.push(line);
  lines.forEach((l, i) => g.fillText(l, x, y + i * size * lh));
  return lines.length * size * lh;
}
function gradText(g, s, x, y, size) {
  g.font = `400 ${size}px Anton, Impact, sans-serif`; g.textAlign = 'center';
  const gr = g.createLinearGradient(0, y - size, 0, y);
  gr.addColorStop(0.2, '#fff4e6'); gr.addColorStop(1, '#ffc23d');
  g.fillStyle = gr; g.fillText(s, x, y);
}
function avatar(g, clip, img, cx, cy, r) {
  g.save();
  g.beginPath(); g.arc(cx, cy, r + 9, 0, Math.PI * 2); g.fillStyle = '#120a07'; g.fill();
  g.beginPath(); g.arc(cx, cy, r + 6, 0, Math.PI * 2); g.strokeStyle = COLORS[clip.c] || '#ff6b1a'; g.lineWidth = 6; g.stroke();
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
  if (img) g.drawImage(img, cx - r, cy - r, r * 2, r * 2);
  else {
    const gr = g.createRadialGradient(cx - r * 0.3, cy - r * 0.4, r * 0.1, cx, cy, r);
    gr.addColorStop(0, '#fff'); gr.addColorStop(0.25, COLORS[clip.c] || '#ff6b1a'); gr.addColorStop(1, COLORS[clip.c] || '#ff6b1a');
    g.fillStyle = gr; g.fillRect(cx - r, cy - r, r * 2, r * 2);
    g.font = `${r * 1.1}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(clip.f || '🎤', cx, cy + r * 0.05);
  }
  g.restore();
}
function pill(g, s, x, y, { bgc = '#fff4e6', fg = '#1a0d06', size = 26 } = {}) {
  g.font = `800 ${size}px "DM Sans", system-ui, sans-serif`;
  const w = g.measureText(s).width + size * 1.4, h = size * 1.8;
  g.fillStyle = bgc; g.beginPath(); g.roundRect(x - w / 2, y - h / 2, w, h, h / 2); g.fill();
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s, x, y + 1);
}
function stamp(g, pass, x, y, k) {
  const s = 3 - 2 * Math.min(1, k * 4); // slam in from 3x
  g.save(); g.translate(x, y); g.rotate(-0.17); g.scale(s, s); g.globalAlpha = Math.min(1, k * 5);
  const col = pass ? '#19e68c' : '#ff2e63', label = pass ? 'PASS' : 'MISS';
  g.font = '400 64px Anton, Impact, sans-serif'; const w = g.measureText(label).width + 44;
  g.fillStyle = 'rgba(10,5,4,.82)'; g.beginPath(); g.roundRect(-w / 2, -46, w, 92, 18); g.fill();
  g.strokeStyle = col; g.lineWidth = 8; g.stroke();
  g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, 0, 4);
  g.restore();
}
function dial(g, pct, x, y, r) {
  g.lineWidth = 18; g.lineCap = 'round';
  g.strokeStyle = 'rgba(255,244,230,.1)'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
  const gr = g.createLinearGradient(x - r, y, x + r, y); gr.addColorStop(0, '#ffc23d'); gr.addColorStop(1, '#19e68c');
  g.strokeStyle = gr; g.beginPath(); g.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct / 100); g.stroke();
  g.font = '400 84px Anton, Impact, sans-serif'; g.fillStyle = '#fff4e6'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(`${Math.round(pct)}%`, x, y + 4);
}
function wave(g, levels, x, y, w, h, live) {
  const n = levels.length, bw = w / n;
  for (let i = 0; i < n; i++) {
    const v = Math.max(0.06, levels[i]) * (live ? 1 : 0.35);
    const bh = Math.max(8, v * h);
    const gr = g.createLinearGradient(0, y - bh / 2, 0, y + bh / 2); gr.addColorStop(0, '#ffc23d'); gr.addColorStop(1, '#ff6b1a');
    g.fillStyle = gr; g.beginPath(); g.roundRect(x + i * bw + bw * 0.2, y - bh / 2, bw * 0.6, bh, bw * 0.3); g.fill();
  }
}

// ---------- the reel ----------
export async function makeReel(clips, { onProgress = () => {}, title = 'HIGHLIGHTS' } = {}) {
  const moments = pickMoments(clips);
  if (!moments.length) throw new Error('No recorded turns on this phone yet.');
  await Promise.all(['400 64px Anton', '800 26px "DM Sans"', '600 26px "DM Sans"'].map((f) => document.fonts.load(f).catch(() => {})));

  const AC = window.AudioContext || window.webkitAudioContext;
  const ac = new AC();
  await ac.resume?.();
  const dest = ac.createMediaStreamDestination();
  // decode + trim each clip
  for (const m of moments) {
    let buf = m.buffer;
    if (!buf && m.blob) { try { buf = await ac.decodeAudioData(await m.blob.arrayBuffer()); } catch { buf = null; } }
    m._buf = buf ? trimBuffer(ac, buf, CLIP_MAX) : null;
    m._img = await loadImage(m.photo);
    m._dur = m._buf ? m._buf.duration : 2.5;
    // precompute a loudness envelope for the waveform
    const env = [];
    if (m._buf) { const d = m._buf.getChannelData(0), step = Math.floor(m._buf.sampleRate / FPS); for (let i = 0; i < d.length; i += step) { let s = 0; for (let j = i; j < Math.min(d.length, i + step); j++) s += d[j] * d[j]; env.push(Math.min(1, Math.sqrt(s / step) * 6)); } }
    m._env = env;
  }
  // timeline
  let t = INTRO;
  const segs = moments.map((m) => { const s = { m, card: t, sing: t + CARD, judge: t + CARD + m._dur, end: t + CARD + m._dur + HOLD }; t = s.end; return s; });
  const total = t + OUTRO;

  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const vStream = cv.captureStream(FPS);
  const stream = new MediaStream([...vStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const mime = pickMime();
  const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 5_000_000, audioBitsPerSecond: 128_000 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise((ok) => (rec.onstop = ok));

  // schedule each singing clip into the recording's audio track
  const t0 = ac.currentTime + 0.25;
  for (const s of segs) if (s.m._buf) { const src = ac.createBufferSource(); src.buffer = s.m._buf; src.connect(dest); src.start(t0 + s.sing); }
  // a soft beat under the whole reel (ducked while people sing) so the audio runs the full length
  const noise = ac.createBuffer(1, ac.sampleRate * 0.2, ac.sampleRate);
  noise.getChannelData(0).forEach((_, i, a) => (a[i] = Math.random() * 2 - 1));
  const bed = ac.createGain(); bed.connect(dest);
  bed.gain.setValueAtTime(0.5, t0);
  for (const sg of segs) { bed.gain.setTargetAtTime(0.14, t0 + sg.sing - 0.1, 0.05); bed.gain.setTargetAtTime(0.5, t0 + sg.judge + 0.2, 0.1); }
  const beat = 60 / 112;
  for (let bt = 0; bt < total; bt += beat / 2) {
    const at = t0 + bt, onBeat = Math.round(bt / (beat / 2)) % 2 === 0;
    if (onBeat) { // kick
      const o = ac.createOscillator(), gn = ac.createGain();
      o.frequency.setValueAtTime(130, at); o.frequency.exponentialRampToValueAtTime(45, at + 0.12);
      gn.gain.setValueAtTime(0.55, at); gn.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
      o.connect(gn).connect(bed); o.start(at); o.stop(at + 0.32);
    }
    const n = ac.createBufferSource(), hp = ac.createBiquadFilter(), gn = ac.createGain(); // shaker
    n.buffer = noise; hp.type = 'highpass'; hp.frequency.value = 7000;
    gn.gain.setValueAtTime(onBeat ? 0.12 : 0.2, at); gn.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
    n.connect(hp).connect(gn).connect(bed); n.start(at); n.stop(at + 0.08);
  }
  // a little sting on each verdict
  for (const s of segs) {
    const o = ac.createOscillator(), gn = ac.createGain();
    o.type = s.m.pass ? 'triangle' : 'sawtooth';
    o.frequency.setValueAtTime(s.m.pass ? 660 : 220, t0 + s.judge);
    o.frequency.exponentialRampToValueAtTime(s.m.pass ? 1320 : 110, t0 + s.judge + 0.35);
    gn.gain.setValueAtTime(0.0001, t0 + s.judge); gn.gain.exponentialRampToValueAtTime(0.18, t0 + s.judge + 0.02); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + s.judge + 0.5);
    o.connect(gn).connect(dest); o.start(t0 + s.judge); o.stop(t0 + s.judge + 0.55);
  }

  const draw = (now) => {
    bg(g, now);
    if (now < INTRO) { // intro card
      const k = Math.min(1, now / 0.5);
      g.globalAlpha = k;
      gradText(g, 'PASS THE MIC', W / 2, 520, 108);
      text(g, title, W / 2, 610, { size: 46, color: '#ffc23d' });
      text(g, moments[0].song ? `🎵 ${moments[0].song}` : '', W / 2, 690, { size: 30, font: 'DM', weight: 700, color: 'rgba(255,244,230,.7)' });
      g.globalAlpha = 1;
      return;
    }
    const s = segs.find((x) => now < x.end);
    if (s) {
      const m = s.m, local = now - s.card;
      avatar(g, m, m._img, W / 2, 250, 92);
      text(g, (m.name || '').toUpperCase(), W / 2, 420, { size: 64 });
      text(g, `ROUND ${m.round || 1}`, W / 2, 465, { size: 24, font: 'DM', weight: 800, color: '#ffc23d' });
      text(g, 'THE LYRIC', W / 2, 545, { size: 22, font: 'DM', weight: 800, color: 'rgba(255,244,230,.55)' });
      text(g, `“${m.lyric}”`, W / 2, 595, { size: 38, font: 'DM', weight: 800, color: '#fff4e6', maxW: W - 110, lh: 1.25 });
      if (now >= s.sing) { // singing: live waveform from their actual voice
        const i = Math.floor((now - s.sing) * FPS), live = now < s.judge;
        const win = m._env.slice(Math.max(0, i - 24), i + 1);
        while (win.length < 25) win.unshift(0);
        wave(g, win, 120, 790, W - 240, 120, live);
        if (live) text(g, '🎤 SINGING…', W / 2, 900, { size: 26, font: 'DM', weight: 800, color: '#ff6b1a' });
      }
      if (now >= s.judge) { // verdict
        const k = Math.min(1, (now - s.judge) / 0.6);
        text(g, `AI heard: “${m.heard || '…'}”`, W / 2, 900, { size: 27, font: 'DM', weight: 600, color: 'rgba(255,244,230,.8)', maxW: W - 120, lh: 1.3 });
        dial(g, m.pct * Math.min(1, k * 1.4), W / 2 - 90, 1110, 88);
        stamp(g, m.pass, W / 2 + 150, 1110, Math.max(0, (now - s.judge - 0.35) / 0.9));
      }
      return;
    }
    // outro
    const k = Math.min(1, (now - (total - OUTRO)) / 0.5);
    g.globalAlpha = k;
    gradText(g, 'PASS THE MIC', W / 2, 560, 108);
    text(g, 'When the music stops, you sing.', W / 2, 640, { size: 32, font: 'DM', weight: 700, color: 'rgba(255,244,230,.8)' });
    pill(g, 'pass-the-mic.vercel.app', W / 2, 740, { size: 30 });
    g.globalAlpha = 1;
  };

  draw(0);
  rec.start(250);
  const startWall = performance.now() + 250;
  await new Promise((resolve) => {
    const tick = () => {
      const now = (performance.now() - startWall) / 1000;
      draw(Math.max(0, now));
      onProgress(Math.min(1, Math.max(0, now / total)));
      if (now >= total) return resolve();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  rec.stop();
  await done;
  vStream.getTracks().forEach((tr) => tr.stop());
  ac.close?.();
  const type = (rec.mimeType || mime || 'video/webm').split(';')[0];
  return { blob: new Blob(chunks, { type }), ext: type.includes('mp4') ? 'mp4' : 'webm' };
}
