// Soundtrack #2: Afro-house groove with highlife-style plucked guitar, and an original sung-style melody
// hook as "the song" that gets cut off by the record scratch. All synthesized; nothing copyrighted.
// Usage: node audio2.mjs <dir>   (reads marks.json, writes soundtrack2.wav)
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = process.argv[2];
const { duration, marks } = JSON.parse(readFileSync(join(DIR, 'marks.json'), 'utf8'));
const at = (name, n = 0) => marks.filter((m) => m[0] === name)[n]?.[1];
const all = (name) => marks.filter((m) => m[0] === name).map((m) => m[1]);

const SR = 44100, N = Math.ceil((duration + 0.3) * SR);
const L = new Float32Array(N), R = new Float32Array(N);
const TAU = Math.PI * 2;
let seed = 11;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const note = (n) => 440 * Math.pow(2, (n - 69) / 12);

function add(t0, len, fn, { gain = 1, pan = 0 } = {}) {
  const s = Math.round(t0 * SR), n = Math.round(len * SR);
  const gl = gain * (pan > 0 ? 1 - pan : 1), gr = gain * (pan < 0 ? 1 + pan : 1);
  for (let i = 0; i < n; i++) { const k = s + i; if (k < 0 || k >= N) continue; const v = fn(i / SR, i); L[k] += v * gl; R[k] += v * gr; }
}
function svf() {
  let low = 0, band = 0;
  return (x, fc, q = 0.7, mode = 'band') => {
    const f = 2 * Math.sin(Math.PI * Math.min(fc, SR / 6) / SR);
    low += f * band; const high = x - low - q * band; band += f * high;
    return mode === 'low' ? low : mode === 'high' ? high : band;
  };
}

// ---------- instruments ----------
const kick = (t0, g = 1) => add(t0, 0.35, (t) => Math.sin(TAU * (50 * t + (70 / 30) * (1 - Math.exp(-30 * t)))) * Math.exp(-8 * t) * Math.min(1, t * 900), { gain: 0.9 * g });
const hat = (t0, open = false, g = 1, pan = 0.25) => { const f = svf(); add(t0, open ? 0.22 : 0.06, (t) => f(rnd(), 9500, 0.5, 'high') * Math.exp((open ? -14 : -60) * t), { gain: (open ? 0.13 : 0.1) * g, pan }); };
const shaker = (t0, g = 1, pan = -0.3) => { const f = svf(); add(t0, 0.08, (t) => f(rnd(), 7000, 0.6, 'band') * Math.min(1, t * 250) * Math.exp(-45 * t), { gain: 0.12 * g, pan }); };
// congas: pitched skin with a slap
const conga = (t0, hz, g = 1, pan = 0) => add(t0, 0.3, (t) => (Math.sin(TAU * hz * (1 + 0.25 * Math.exp(-40 * t)) * t) * Math.exp(-11 * t) + rnd() * Math.exp(-120 * t) * 0.25), { gain: 0.32 * g, pan });
const clap = (t0, g = 1) => { const f = svf(); add(t0, 0.2, (t) => f(rnd(), 1400, 0.45) * (Math.exp(-55 * t) + 0.5 * (t > 0.011) * Math.exp(-55 * (t - 0.011)) + 0.4 * (t > 0.022) * Math.exp(-16 * (t - 0.022))), { gain: 0.42 * g }); };
// Karplus-Strong plucked string: the highlife guitar
function guitar(t0, midi, g = 1, pan = 0.2, damp = 0.996) {
  const p = Math.max(2, Math.round(SR / note(midi)));
  const buf = new Float32Array(p).map(() => rnd() * 0.8);
  let idx = 0, prev = 0;
  const f = svf();
  add(t0, 1.1, () => {
    const cur = buf[idx];
    const nxt = buf[(idx + 1) % p];
    const v = damp * 0.5 * (cur + nxt);
    buf[idx] = v; idx = (idx + 1) % p;
    prev = f(cur, 3200, 0.8, 'low');
    return prev;
  }, { gain: 0.42 * g, pan });
}
const bass = (t0, midi, len = 0.3, g = 1) => add(t0, len, (t) => {
  const f = note(midi);
  return Math.tanh(1.4 * (Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * 2 * f * t))) * Math.min(1, t * 300) * Math.exp(-3.5 * t) * Math.min(1, (len - t) * 40);
}, { gain: 0.38 * g });
// sung-style lead for "the song": vibrato + soft formant filter ("ooh/ah" voice)
function voice(t0, midi, len, g = 1) {
  const f1 = svf(), f2 = svf();
  let ph = 0;
  add(t0, len, (t) => {
    const vib = 1 + 0.012 * Math.sin(TAU * 5.5 * t) * Math.min(1, t * 3);
    ph += note(midi) * vib / SR;
    let x = 0; for (let h = 1; h <= 8; h++) x += Math.sin(TAU * ph * h) / h;
    const y = f1(x, 750, 0.35) * 1.0 + f2(x, 1150, 0.4) * 0.6; // "ah" formants
    return y * Math.min(1, t * 18) * Math.min(1, (len - t) * 14);
  }, { gain: 0.22 * g });
}
const horns = (t0, midis, len = 0.35, g = 1) => { const f = svf(); add(t0, len, (t) => { let x = 0; for (const m of midis) { const fr = note(m); for (let h = 1; h <= 6; h++) x += Math.sin(TAU * fr * h * t) / h; } return f(x, 1800 + 1500 * Math.exp(-6 * t), 0.6, 'low') * Math.min(1, t * 40) * Math.exp(-3 * t); }, { gain: 0.09 * g }); };

// ---------- sound effects ----------
const woodblock = (t0, hz = 1100, g = 1) => add(t0, 0.09, (t) => Math.sin(TAU * hz * t) * Math.exp(-50 * t), { gain: 0.4 * g });
const whoosh = (t0, len = 0.4, up = true, g = 1) => { const f = svf(); add(t0, len, (t) => f(rnd(), up ? 300 + 5000 * (t / len) ** 2 : 5000 - 4500 * (t / len), 0.35) * Math.sin(Math.PI * t / len) ** 2, { gain: 0.45 * g }); };
const scratch = (t0) => {
  const f = svf();
  add(t0, 0.36, (t) => f(rnd(), t < 0.15 ? 700 + 22000 * t : 4000 - 9000 * (t - 0.15), 2.2) * (t < 0.15 ? 1 : Math.exp(-(t - 0.15) * 6)), { gain: 1.1 });
  add(t0, 0.55, (t) => Math.tanh(2 * Math.sin(TAU * (200 * t - 160 * t * t))) * Math.exp(-t * 4), { gain: 0.14 });
};
const thud = (t0, g = 1) => { add(t0, 0.3, (t) => Math.sin(TAU * (60 * t + 40 * (1 - Math.exp(-30 * t)) / 30)) * Math.exp(-9 * t), { gain: 0.9 * g }); clap(t0, 0.4 * g); };
const riser = (t0, len) => { const f = svf(); add(t0, len, (t) => f(rnd(), 400 + 7000 * (t / len) ** 2, 0.5) * (t / len) ** 1.5, { gain: 0.4 }); };
const congaRoll = (t0, len) => { let t = 0, gap = 0.09, k = 0; while (t < len) { conga(t0 + t, k++ % 2 ? 260 : 200, 0.5 + 0.8 * (t / len), k % 2 ? 0.3 : -0.3); t += gap; gap = Math.max(0.03, gap * 0.93); } };
const crash = (t0, g = 1) => { const f = svf(); add(t0, 1.8, (t) => f(rnd(), 7000, 0.3, 'high') * Math.exp(-2.4 * t), { gain: 0.25 * g }); };
const cheer = (t0) => {
  for (let k = 0; k < 24; k++) clap(t0 + 0.05 + Math.random() * 1.4, 0.3 + Math.random() * 0.4);
  const f = svf();
  add(t0, 1.8, (t) => f(rnd(), 1200 + 300 * Math.sin(t * 9), 0.25) * Math.min(1, t * 4) * Math.exp(-1.6 * t), { gain: 0.3 });
  horns(t0 + 0.05, [67, 71, 74], 0.25, 1.4); horns(t0 + 0.3, [69, 72, 76], 0.25, 1.4); horns(t0 + 0.55, [71, 74, 79], 0.6, 1.6);
};
const sadHorn = (t0) => [[63, 0, 0.32], [62, 0.35, 0.32], [61, 0.7, 0.32], [60, 1.05, 0.95]].forEach(([m, d, len]) => horns(t0 + d, [m, m - 12], len, 1.6));

// ---------- the groove: Afro-house, 120 BPM, G major (G D Em C) ----------
const BPM = 120, STEP = 60 / BPM / 4;
const PROG = [[43, [67, 71, 74, 79]], [38, [66, 69, 74, 78]], [40, [64, 67, 71, 76]], [36, [64, 67, 72, 76]]];
const RIFF = [0, 2, 1, 3, 2, 1, 3, 2]; // guitar arpeggio pattern (chord tone index) on 8th notes, highlife style
function groove(from, to, { intensity = 1, guitarOn = true, bassOn = true } = {}) {
  for (let s = 0, t = from; t < to - 0.01; s++, t = from + s * STEP) {
    const bar = Math.floor(s / 16), st = s % 16, [root, chord] = PROG[bar % 4];
    const swing = st % 2 ? STEP * 0.12 : 0;
    if (st % 4 === 0) kick(t, 0.9 * intensity);
    if (st % 4 === 2) hat(t, true, intensity);
    shaker(t + swing, (st % 2 ? 0.7 : 1) * intensity);
    if (st === 4 || st === 12) clap(t, 0.5 * intensity);
    if ([3, 6, 11, 14].includes(st)) conga(t, st % 2 ? 220 : 300, 0.7 * intensity, st < 8 ? -0.4 : 0.4);
    if (bassOn && [0, 3, 6, 10, 14].includes(st)) bass(t, root + (st === 10 ? 7 : 0), 0.28, intensity);
    if (guitarOn && st % 2 === 0) guitar(t + swing, chord[RIFF[(st / 2) % 8]] + 12 * (st % 8 === 6 ? 0 : 0), 0.9 * intensity, st % 4 ? 0.35 : 0.1);
  }
}
// "the song": an original hook, 2 phrases to match the two karaoke lines before the cut
function hook(from, to) {
  const beat = 60 / BPM;
  // [beat offset, midi, length in beats]
  const phrase = [[0, 74, 0.5], [0.5, 76, 0.5], [1, 79, 1], [2, 76, 0.5], [2.5, 74, 0.8]];
  const phrase2 = [[0, 74, 0.5], [0.5, 76, 0.5], [1, 79, 0.75], [1.75, 81, 0.5], [2.25, 79, 2]]; // last note gets cut off
  [[phrase, 0], [phrase2, 3.4]].forEach(([p, off]) => p.forEach(([b, m, len]) => {
    const t = from + (off + b) * beat;
    const dur = Math.min(len * beat * 0.95, to - t);
    if (dur > 0.03) voice(t, m, dur, 1);
  }));
}

// ---------- the score ----------
const listen = at('listen'), cut = at('cut'), sing = at('sing'), reveal = at('reveal'), pass = at('pass');
const miss = at('miss'), missStamp = at('missStamp'), leaders = at('leaders'), endcard = at('endcard');

groove(0, listen, { intensity: 0.85 });                  // intro: home + lobby
all('pop').forEach((t, i) => woodblock(t + 0.04, 900 + i * 180, 0.8));
whoosh(at('lobby') - 0.18, 0.35, true, 0.5);
whoosh(listen - 0.2, 0.4, true, 0.6); crash(listen, 0.5);
groove(listen, cut, { intensity: 1 });                    // the song is playing...
hook(listen + 0.05, cut);                                 // ...with its sung hook
scratch(cut);                                             // CUT
all('tick').forEach((t, i) => woodblock(t, 1300 - i * 120, 1.1));
kick(sing, 1); crash(sing, 0.6); horns(sing, [67, 71, 74, 79], 0.4, 1.2);
for (let t = sing; t < at('scoring') - 0.05; t += STEP * 2) conga(t, (Math.round((t - sing) / (STEP * 2)) % 2) ? 230 : 300, 0.45, 0.2);
[67, 69, 71, 74, 76, 79].forEach((m, i) => { const t = all('word')[i]; if (t != null) guitar(t, m + 12, 1.1, -0.1, 0.997); });
riser(at('scoring') - 0.1, reveal - at('scoring') + 0.1);
congaRoll(reveal, pass - reveal - 0.05);
thud(pass); cheer(pass); crash(pass, 0.8);
whoosh(miss - 0.2, 0.35, false, 0.5);
thud(missStamp); sadHorn(missStamp + 0.05);
whoosh(leaders - 0.2, 0.4, true, 0.6);
groove(leaders, endcard, { intensity: 0.8 });
kick(endcard, 1.1); crash(endcard, 1); horns(endcard, [55, 67, 71, 74], 1.2, 1.4);
groove(endcard + STEP * 4, duration + 0.3, { intensity: 0.9 });

// ---------- master ----------
const fadeStart = duration - 1.1;
const pcm = Buffer.alloc(N * 4);
for (let i = 0; i < N; i++) {
  const t = i / SR, fade = t > fadeStart ? Math.max(0, 1 - (t - fadeStart) / 1.1) : 1;
  pcm.writeInt16LE(Math.round(Math.tanh(L[i] * 1.1) * 0.9 * fade * 32767), i * 4);
  pcm.writeInt16LE(Math.round(Math.tanh(R[i] * 1.1) * 0.9 * fade * 32767), i * 4 + 2);
}
const hdr = Buffer.alloc(44);
hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + pcm.length, 4); hdr.write('WAVE', 8);
hdr.write('fmt ', 12); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22);
hdr.writeUInt32LE(SR, 24); hdr.writeUInt32LE(SR * 4, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34);
hdr.write('data', 36); hdr.writeUInt32LE(pcm.length, 40);
writeFileSync(join(DIR, 'soundtrack2.wav'), Buffer.concat([hdr, pcm]));
console.log(`soundtrack2 ${duration.toFixed(2)}s written`);
