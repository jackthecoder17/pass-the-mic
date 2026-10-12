// Sound effects, all synthesized with Web Audio (no files to load).

let ac: AudioContext | null = null;
export const audioCtx = () => ac;
export function unlockAudio() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ac ??= new AC();
    ac.resume?.();
  } catch {}
}
function beep(freq: number, dur = 0.12, type: OscillatorType = 'sine', vol = 0.18, when = 0) {
  if (!ac) return;
  const t = ac.currentTime + when, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (type === 'sawtooth') o.frequency.exponentialRampToValueAtTime(freq / 2.5, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur);
}
// filtered noise burst (scratches, drums, crowd)
function noise(dur: number, { when = 0, vol = 0.3, from = 2000, to = 400, q = 1.2, type = 'bandpass' as BiquadFilterType } = {}) {
  if (!ac) return;
  const t = ac.currentTime + when, len = Math.ceil(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  src.buffer = buf; f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(ac.destination); src.start(t); src.stop(t + dur);
}
export const sfx = {
  tick: () => beep(660, 0.1),
  go: () => beep(1320, 0.18),
  // record scratch: two fast filter sweeps
  scratch: () => { noise(0.16, { from: 900, to: 3800, vol: 0.5, q: 3 }); noise(0.22, { when: 0.15, from: 3600, to: 500, vol: 0.45, q: 3 }); beep(140, 0.25, 'sawtooth', 0.08, 0.02); },
  drumroll: (dur = 0.9) => { for (let t = 0; t < dur; t += 0.045) noise(0.05, { when: t, from: 1800, to: 900, vol: 0.12 + 0.12 * (t / dur), q: 0.8 }); },
  pass: () => {
    noise(0.12, { from: 200, to: 60, vol: 0.5, type: 'lowpass', q: 0.7 }); // the stamp thud
    [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.22, 'triangle', 0.18, 0.08 + i * 0.09));
    noise(1.4, { when: 0.2, from: 2500, to: 1200, vol: 0.09, q: 0.4 }); // crowd
  },
  fail: () => { // sad trombone: wah wah wah waaah
    noise(0.12, { from: 200, to: 60, vol: 0.5, type: 'lowpass', q: 0.7 });
    ([[311, 0.1], [294, 0.45], [277, 0.8]] as const).forEach(([f, w]) => beep(f, 0.32, 'sawtooth', 0.09, w));
    beep(262, 0.9, 'sawtooth', 0.09, 1.15);
  },
};
export const buzz = (ms: number | number[]) => { try { navigator.vibrate?.(ms); } catch {} };
