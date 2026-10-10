// Lenient lyric matching: speech-to-text on singing is noisy, so we score how
// close the singer got rather than demanding an exact transcript.

const MAP = {
  cause: 'because', cos: 'because', coz: 'because', cuz: 'because', bc: 'because',
  bout: 'about', em: 'them', gonna: 'going', wanna: 'want', gotta: 'got',
  yea: 'yeah', yeh: 'yeah', yah: 'yeah', ye: 'yeah', ya: 'you', u: 'you', ur: 'your',
  o: 'oh', oo: 'oh', ooh: 'oh', ohh: 'oh', ohhh: 'oh', oooh: 'oh', woah: 'whoa', wo: 'whoa',
  till: 'til', until: 'til', tho: 'though', thru: 'through', lil: 'little', ok: 'okay',
  da: 'the', dem: 'them', dat: 'that', dis: 'this', wetin: 'what', abeg: 'abeg',
  // Pidgin spellings and how speech-to-text usually writes them
  sey: 'say', wan: 'want', una: 'you', yan: 'yarn', pikin: 'picking', shey: 'shay', sef: 'self', sha: 'shah', oya: 'oyah', no: 'no',
};
const NUM = { 0: 'zero', 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten' };
const STOP = new Set(['a', 'an', 'the', 'to', 'and', 'i', 'you', 'oh', 'yeah', 'na', 'of', 'in', 'on', 'my', 'me', 'it', 'is', 'be', 'for', 'so', 'we', 'eh', 'ah', 'uh', 'hey', 'whoa', 'la', 'no']);

export function normWord(raw) {
  let w = raw.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  w = w.replace(/in['’]$/, 'ing').replace(/['’]/g, '').replace(/[^a-z0-9]/g, '');
  if (NUM[w]) w = NUM[w];
  return MAP[w] || w;
}

// -> [{ d: display word, n: normalized token }]; ad-libs in (parens)/[brackets] are dropped
export function tokenize(text) {
  const clean = (text || '').replace(/\([^)]*\)|\[[^\]]*\]/g, ' ');
  const out = [];
  for (const raw of clean.split(/[\s\-–—_/]+/)) {
    const d = raw.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '');
    const n = normWord(d);
    if (n) out.push({ d, n });
  }
  return out;
}

// crude sound-alike key: merges spellings like dey/they/day, chop/shop, cause/kauz
export function phon(w) {
  let s = w.replace(/[^a-z]/g, '');
  if (!s) return '';
  s = s.replace(/^(kn|gn|pn|wr)/, (m) => m[1])
    .replace(/ph/g, 'f').replace(/th/g, 't').replace(/dh/g, 'd').replace(/ck/g, 'k')
    .replace(/sh|ch/g, 's').replace(/c(?=[eiy])/g, 's').replace(/[cq]/g, 'k')
    .replace(/x/g, 'ks').replace(/z/g, 's').replace(/gh/g, 'g').replace(/d/g, 't').replace(/v/g, 'f');
  let first = s[0];
  if ('aeiouy'.includes(first)) first = 'a';
  return (first + s.slice(1).replace(/[aeiouyhw]/g, '')).replace(/(.)\1+/g, '$1');
}

function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i), cur = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

const strict = (a, b) => 1 - lev(a, b) / Math.max(a.length, b.length);

const cache = new Map();
export function sim(a, b) {
  if (a === b) return 1;
  const key = a + '|' + b;
  if (cache.has(key)) return cache.get(key);
  let s = 0;
  const r = 1 - lev(a, b) / Math.max(a.length, b.length);
  if (r >= 0.75) s = r;
  const pa = phon(a), pb = phon(b);
  if (pa && pa === pb) s = Math.max(s, a.length <= 2 || b.length <= 2 ? 0.75 : 0.9);
  else if (pa.length >= 2 && pb.length >= 2 && Math.max(pa.length, pb.length) >= 3 && 1 - lev(pa, pb) / Math.max(pa.length, pb.length) >= 0.66) s = Math.max(s, 0.7);
  if (cache.size > 20000) cache.clear();
  cache.set(key, s);
  return s;
}

// how alike two run-together chunks sound ("omotodara" vs "omo to dara"), strict so random words can't sneak in
function groupSim(a, b) {
  const r = strict(a, b);
  if (r >= 0.7) return r;
  const pa = phon(a), pb = phon(b);
  if (pa.length >= 3 && pa === pb) return 0.8;
  if (Math.min(pa.length, pb.length) >= 4 && 1 - lev(pa, pb) / Math.max(pa.length, pb.length) >= 0.75) return 0.7;
  return 0;
}

// Order-aware weighted alignment of expected vs heard tokens (filler words count half).
// Besides word-for-word matches, up to 4 expected (3 heard) words may be merged: speech-to-text often runs
// Yoruba/Pidgin words together ("Omotodara" for "omo to dara") or splits them ("every body").
// -> { score 0..1, sims: per-expected-word similarity (0 = missed) }
export function align(exp, heard) {
  const n = exp.length, m = heard.length;
  const W = exp.map((w) => (STOP.has(w) ? 0.5 : 1));
  const total = W.reduce((a, b) => a + b, 0) || 1;
  const dp = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const mv = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(null));
  for (let j = 1; j <= m; j++) mv[0][j] = [0, 1, 0];
  for (let i = 1; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      let best = dp[i - 1][j], move = [1, 0, 0];
      if (j > 0 && dp[i][j - 1] > best) { best = dp[i][j - 1]; move = [0, 1, 0]; }
      for (let k = 1; k <= 4 && k <= i; k++) {
        for (let q = 1; q <= 3 && q <= j; q++) {
          let s;
          if (k === 1 && q === 1) s = sim(exp[i - 1], heard[j - 1]);
          else s = groupSim(exp.slice(i - k, i).join(''), heard.slice(j - q, j).join(''));
          if (!s) continue;
          let w = 0;
          for (let t = i - k; t < i; t++) w += W[t];
          const v = dp[i - k][j - q] + w * s;
          if (v > best) { best = v; move = [k, q, s]; }
        }
      }
      dp[i][j] = best; mv[i][j] = move;
    }
  }
  const sims = new Array(n).fill(0);
  let i = n, j = m;
  while (i > 0 || j > 0) {
    const mvv = mv[i][j];
    if (!mvv) break;
    const [k, q, s] = mvv;
    if (s) for (let t = i - k; t < i; t++) sims[t] = s;
    i -= k; j -= q;
    if (k === 0 && q === 0) break;
  }
  return { score: dp[n][m] / total, sims };
}
