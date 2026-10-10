// Original soundtrack for the promo, synthesized from scratch (no samples, nothing copyrighted).
// An amapiano/afrobeats-style groove + sound effects synced to the scene markers from record.mjs.
// Usage: node audio.mjs <dir>   (reads marks.json, writes soundtrack.wav)
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = process.argv[2];
const { duration, marks } = JSON.parse(readFileSync(join(DIR, 'marks.json'), 'utf8'));
const at = (name, n = 0) => marks.filter((m) => m[0] === name)[n]?.[1];
const all = (name) => marks.filter((m) => m[0] === name).map((m) => m[1]);

const SR = 44100, N = Math.ceil((duration + 0.2) * SR);
const L = new Float32Array(N), R = new Float32Array(N);
const TAU = Math.PI * 2;
let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;

// place a voice: fn(t, i) -> sample, for `len` seconds starting at t0
function add(t0, len, fn, { gain = 1, pan = 0 } = {}) {
  const s = Math.round(t0 * SR), n = Math.round(len * SR);
  const gl = gain * (pan > 0 ? 1 - pan : 1), gr = gain * (pan < 0 ? 1 + pan : 1);
  for (let i = 0; i < n; i++) {
    const k = s + i;
    if (k < 0 || k >= N) continue;
    const v = fn(i / SR, i);
    L[k] += v * gl; R[k] += v * gr;
  }
}
// state-variable filter (bandpass/lowpass/highpass) for noise-based sounds
function svf() {
  let low = 0, band = 0;
  return (x, fc, q = 0.7, mode = 'band') => {
    const f = 2 * Math.sin(Math.PI * Math.min(fc, SR / 6) / SR);
    low += f * band;
    const high = x - low - q * band;
    band += f * high;
    return mode === 'low' ? low : mode === 'high' ? high : band;
  };
}
const note = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI -> Hz

// ---------- instruments ----------
const kick = (t0, g = 1) => add(t0, 0.4, (t) => Math.sin(TAU * (45 * t + (85 / 32) * (1 - Math.exp(-32 * t)))) * Math.exp(-7 * t) * (1 - Math.exp(-t * 900)), { gain: 0.95 * g });
const rim = (t0, g = 1, pan = 0) => { const f = svf(); add(t0, 0.12, (t) => (Math.sin(TAU * 1750 * t) * Math.exp(-70 * t) * 0.6 + f(rnd(), 2600, 0.5) * Math.exp(-45 * t)), { gain: 0.32 * g, pan }); };
const shaker = (t0, g = 1, pan = 0) => { const f = svf(); add(t0, 0.09, (t) => f(rnd(), 9000, 0.6, 'high') * Math.min(1, t * 300) * Math.exp(-40 * t), { gain: 0.16 * g, pan }); };
const clap = (t0, g = 1) => { const f = svf(); add(t0, 0.22, (t) => f(rnd(), 1500, 0.45) * (Math.exp(-60 * t) + 0.6 * Math.exp(-60 * Math.max(0, t - 0.012)) * (t > 0.012) + 0.5 * Math.exp(-18 * Math.max(0, t - 0.025)) * (t > 0.025)), { gain: 0.5 * g }); };
// amapiano "log drum": a bouncy, slightly bending bass voice
const logdrum = (t0, midi, g = 1) => add(t0, 0.5, (t) => {
  const fr = note(midi) * (1 + 0.18 * Math.exp(-t * 22));
  const v = Math.sin(TAU * fr * t) + 0.45 * Math.sin(TAU * 2 * fr * t) + 0.18 * Math.sin(TAU * 3 * fr * t);
  return Math.tanh(1.6 * v) * Math.exp(-4.2 * t) * Math.min(1, t * 400);
}, { gain: 0.42 * g });
// warm electric-piano chord stab
const keys = (t0, midis, len = 0.55, g = 1) => add(t0, len, (t) => {
  let v = 0;
  for (const m of midis) { const f = note(m); v += Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * 2 * f * t) * Math.exp(-6 * t) + 0.12 * Math.sin(TAU * 3 * f * t) * Math.exp(-9 * t); }
  return v * Math.exp(-4.5 * t) * Math.min(1, t * 200) * (1 + 0.15 * Math.sin(TAU * 5 * t));
}, { gain: 0.085 * g });
const pad = (t0, len, midis, g = 1) => add(t0, len, (t) => {
  let v = 0;
  for (const m of midis) { const f = note(m); v += Math.sin(TAU * f * t) + 0.5 * Math.sin(TAU * f * 1.003 * t); }
  return v * Math.min(1, t * 2) * Math.min(1, (len - t) * 3);
}, { gain: 0.03 * g });

// ---------- sound effects ----------
const blip = (t0, f0, f1, len = 0.12, g = 1) => add(t0, len, (t) => Math.sin(TAU * (f0 * t + ((f1 - f0) / (2 * len)) * t * t)) * Math.exp(-t * 18) * Math.min(1, t * 500), { gain: 0.32 * g });
const pluck = (t0, midi, g = 1) => add(t0, 0.35, (t) => { const f = note(midi); return (Math.sin(TAU * f * t) + 0.35 * Math.sin(TAU * 2 * f * t) * Math.exp(-10 * t) + 0.15 * Math.sin(TAU * 3 * f * t) * Math.exp(-14 * t)) * Math.exp(-9 * t) * Math.min(1, t * 600); }, { gain: 0.3 * g });
const whoosh = (t0, len = 0.4, up = true, g = 1) => { const f = svf(); add(t0, len, (t) => f(rnd(), up ? 300 + 5000 * (t / len) ** 2 : 5000 - 4500 * (t / len), 0.35) * Math.sin(Math.PI * t / len) ** 2, { gain: 0.5 * g }); };
// record scratch + tape-stop: the music dies on the cut
const scratch = (t0) => {
  const f = svf();
  add(t0, 0.36, (t) => f(rnd(), t < 0.15 ? 700 + 22000 * t : 4000 - 9000 * (t - 0.15), 2.2) * (t < 0.15 ? 1 : Math.exp(-(t - 0.15) * 6)), { gain: 1.1 });
  add(t0, 0.5, (t) => Math.tanh(2 * Math.sin(TAU * (180 * t - 140 * t * t)) ) * Math.exp(-t * 4), { gain: 0.14 });
};
const thud = (t0, g = 1) => { add(t0, 0.3, (t) => Math.sin(TAU * (60 * t + 40 * (1 - Math.exp(-30 * t)) / 30)) * Math.exp(-9 * t), { gain: 0.9 * g }); clap(t0, 0.4 * g); };
const riser = (t0, len) => { const f = svf(); add(t0, len, (t) => f(rnd(), 400 + 7000 * (t / len) ** 2, 0.5) * (t / len) ** 1.5, { gain: 0.45 }); };
const drumroll = (t0, len) => { let t = 0, gap = 0.07; while (t < len) { rim(t0 + t, 0.35 + 0.9 * (t / len), (Math.random() - 0.5) * 0.3); t += gap; gap = Math.max(0.028, gap * 0.94); } };
const crash = (t0, g = 1) => { const f = svf(); add(t0, 1.8, (t) => f(rnd(), 7000, 0.3, 'high') * Math.exp(-2.4 * t), { gain: 0.28 * g }); };
const cheer = (t0) => {
  for (let k = 0; k < 26; k++) clap(t0 + 0.05 + Math.random() * 1.4, 0.35 + Math.random() * 0.4);
  const f = svf();
  add(t0, 1.8, (t) => f(rnd(), 1200 + 300 * Math.sin(t * 9), 0.25) * Math.min(1, t * 4) * Math.exp(-1.6 * t), { gain: 0.35 });
  [72, 76, 79, 84].forEach((m, i) => pluck(t0 + 0.06 + i * 0.09, m, 0.9));
};
const trombone = (t0) => {
  const f = svf();
  [[58, 0, 0.33], [57, 0.36, 0.33], [56, 0.72, 0.33], [55, 1.08, 1.0]].forEach(([m, d, len]) =>
    add(t0 + d, len, (t) => {
      const vib = d > 1 ? 1 + 0.025 * Math.sin(TAU * 6 * t) : 1;
      let x = 0; const fr = note(m) * vib;
      for (let h = 1; h <= 6; h++) x += Math.sin(TAU * fr * h * t) / h;
      return f(x, 1400, 0.9, 'low') * Math.min(1, t * 30) * Math.min(1, (len - t) * 12);
    }, { gain: 0.16 }));
};

// ---------- the groove ----------
const BPM = 112, STEP = 60 / BPM / 4; // 16th notes
const PROG = [[57, [69, 72, 76]], [53, [65, 69, 72]], [48, [64, 67, 72]], [55, [67, 71, 74]]]; // Am F C G
const LOG = [[2, 0], [5, 7], [10, 12], [13, 7]];        // log-drum hits: step, semitone offset from the bar's root
const CLAVE = [0, 3, 6, 10, 12];
function groove(from, to, { intensity = 1, keysOn = true } = {}) {
  for (let s = 0, t = from; t < to - 0.01; s++, t = from + s * STEP) {
    const bar = Math.floor(s / 16), st = s % 16, [root, chord] = PROG[bar % 4];
    const swing = st % 2 ? STEP * 0.18 : 0;
    if (st % 4 === 0) kick(t, 0.85 * intensity);
    shaker(t + swing, (st % 4 === 2 ? 1.2 : 0.7) * intensity, st % 2 ? 0.35 : -0.35);
    if (CLAVE.includes(st)) rim(t, 0.8 * intensity, 0.2);
    if (st === 4 || st === 12) clap(t, 0.55 * intensity);
    for (const [ls, off] of LOG) if (st === ls) logdrum(t, root - 12 + off, intensity);
    if (keysOn && (st === 0 || st === 6 || st === 11)) keys(t, chord, 0.5, intensity);
  }
}

// ---------- the score (all times from the recording) ----------
const cut = at('cut'), sing = at('sing'), reveal = at('reveal'), pass = at('pass');
const miss = at('miss'), missStamp = at('missStamp'), leaders = at('leaders'), endcard = at('endcard');

groove(0, cut);                                  // home → lobby → song playing
all('pop').forEach((t, i) => blip(t + 0.05, 500 + i * 120, 900 + i * 160, 0.14, 0.9)); // friends popping into the room
whoosh(at('lobby') - 0.18, 0.35, true, 0.5);
whoosh(at('listen') - 0.18, 0.35, true, 0.5);
scratch(cut);                                    // THE CUT: music dies
pad(cut + 0.6, sing - cut - 0.4, [57, 64], 0.9); // tension under the countdown
all('tick').forEach((t, i) => blip(t, 880, 880, 0.09, 0.9 + i * 0.1));
blip(sing, 1320, 1320, 0.25, 1.1); kick(sing, 0.9); crash(sing, 0.5);
groove(sing, at('scoring'), { intensity: 0.45, keysOn: false }); // light beat while she sings
[60, 62, 64, 67, 69, 72].forEach((m, i) => { const t = all('word')[i]; if (t != null) pluck(t, m + 12, 0.8); }); // each word caught: rising ding
riser(at('scoring') - 0.1, reveal - at('scoring') + 0.1);
drumroll(reveal, pass - reveal - 0.05);
thud(pass); cheer(pass); crash(pass, 0.8);
whoosh(miss - 0.2, 0.35, false, 0.5);
thud(missStamp); trombone(missStamp + 0.05);
whoosh(leaders - 0.2, 0.4, true, 0.6);
groove(leaders, endcard, { intensity: 0.8 });
kick(endcard, 1.1); crash(endcard, 1); keys(endcard, [57, 64, 69, 72, 76], 1.6, 1.4);
groove(endcard + STEP * 4, duration + 0.2, { intensity: 0.9 });

// ---------- master: soft clip, fade out, write 16-bit stereo WAV ----------
const fadeStart = duration - 1.0;
const pcm = Buffer.alloc(N * 4);
for (let i = 0; i < N; i++) {
  const t = i / SR, fade = t > fadeStart ? Math.max(0, 1 - (t - fadeStart) / 1.0) : 1;
  const l = Math.tanh(L[i] * 1.1) * 0.9 * fade, r = Math.tanh(R[i] * 1.1) * 0.9 * fade;
  pcm.writeInt16LE(Math.round(l * 32767), i * 4);
  pcm.writeInt16LE(Math.round(r * 32767), i * 4 + 2);
}
const hdr = Buffer.alloc(44);
hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + pcm.length, 4); hdr.write('WAVE', 8);
hdr.write('fmt ', 12); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22);
hdr.writeUInt32LE(SR, 24); hdr.writeUInt32LE(SR * 4, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34);
hdr.write('data', 36); hdr.writeUInt32LE(pcm.length, 40);
writeFileSync(join(DIR, 'soundtrack.wav'), Buffer.concat([hdr, pcm]));
console.log(`soundtrack ${duration.toFixed(2)}s written`);
