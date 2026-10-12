// Lyric matching: strict about *which* words were sung, forgiving about how speech-to-text spelled them.
// A word only counts if it was really there: an exact match, a near-identical spelling ("bo" for "bow",
// "brekfast"), a known Pidgin sound-alike ("dey"/"they", "na"/"now") or the same long word spelled differently.

export interface Token { d: string; n: string }
export interface Alignment { score: number; sims: number[] }

const MAP: Record<string, string> = {
  cause: 'because', cos: 'because', coz: 'because', cuz: 'because', bc: 'because',
  bout: 'about', em: 'them', gonna: 'going', wanna: 'want', gotta: 'got',
  yea: 'yeah', yeh: 'yeah', yah: 'yeah', ye: 'yeah', ya: 'you', u: 'you', ur: 'your',
  o: 'oh', oo: 'oh', ooh: 'oh', ohh: 'oh', ohhh: 'oh', oooh: 'oh', woah: 'whoa', wo: 'whoa',
  till: 'til', until: 'til', tho: 'though', thru: 'through', lil: 'little', ok: 'okay',
  da: 'the', dem: 'them', dat: 'that', dis: 'this', wetin: 'what', abeg: 'abeg',
  // Pidgin spellings and how speech-to-text usually writes them
  sey: 'say', wan: 'want', una: 'you', yan: 'yarn', pikin: 'picking', shey: 'shay', sef: 'self', oya: 'oyah', no: 'no',
};
const NUM: Record<string, string> = { 0: 'zero', 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten' };
// only true filler sounds count half; every real word counts fully
const STOP = new Set(['oh', 'yeah', 'eh', 'ah', 'uh', 'hey', 'whoa', 'la', 'ooh', 'mm', 'mmm', 'hmm', 'ay', 'ayy', 'ehn']);

export function normWord(raw: string) {
  let w = raw.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  w = w.replace(/in['’]$/, 'ing').replace(/['’]/g, '').replace(/[^a-z0-9]/g, '');
  if (NUM[w]) w = NUM[w];
  return MAP[w] || w;
}

// -> [{ d: display word, n: normalized token }]; ad-libs in (parens)/[brackets] are dropped
export function tokenize(text: string | null | undefined): Token[] {
  const clean = (text || '').replace(/\([^)]*\)|\[[^\]]*\]/g, ' ');
  const out: Token[] = [];
  for (const raw of clean.split(/[\s\-–—_/]+/)) {
    const d = raw.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, '');
    const n = normWord(d);
    if (n) out.push({ d, n });
  }
  return out;
}

// crude sound-alike key: merges spellings like dey/they/day, chop/shop, cause/kauz
export function phon(w: string) {
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

function lev(a: string, b: string) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i), cur = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

const strict = (a: string, b: string) => 1 - lev(a, b) / Math.max(a.length, b.length);

// how speech-to-text commonly writes Pidgin/Naija words that it doesn't know
const EQUIV = new Set(['dey|they', 'dey|day', 'dey|the', 'na|now', 'na|nah', 'wey|way', 'wey|where', 'say|said', 'you|your', 'go|gon', 'oh|o', 'una|unna', 'abi|abby', 'ehn|eh', 'sabi|savvy', 'sabi|sabe', 'oyah|oya', 'comot|come']);
const equiv = (a: string, b: string) => EQUIV.has(`${a}|${b}`) || EQUIV.has(`${b}|${a}`);

const cache = new Map<string, number>();
// similarity of one lyric word to one heard word: 1 = same, ~0.8 = same word spelled differently, 0 = different word
export function sim(a: string, b: string) {
  if (a === b) return 1;
  const key = a + '|' + b;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let s = 0;
  const d = lev(a, b), L = Math.max(a.length, b.length), r = 1 - d / L;
  if (equiv(a, b)) s = 0.9;
  else if (L <= 3) s = d <= 1 && a[0] === b[0] && Math.min(a.length, b.length) >= 2 ? 0.8 : 0; // bo/bow, oh/ho stays out
  else if (r >= 0.8) s = r;                                                      // brekfast, defualt
  else if (Math.min(a.length, b.length) >= 4 && r >= 0.6 && phon(a) === phon(b)) s = 0.8; // shayo/shyo, igbo/egbo
  if (cache.size > 20000) cache.clear();
  cache.set(key, s);
  return s;
}

// run-together words ("omotodara" for "omo to dara", "every body" for "everybody"): spelling must be near-identical
function groupSim(a: string, b: string) {
  const r = strict(a, b);
  if (r >= 0.8) return r;
  if (Math.min(a.length, b.length) >= 6 && r >= 0.7 && phon(a) === phon(b)) return 0.75;
  return 0;
}

// Order-aware weighted alignment of expected vs heard tokens (filler words count half).
// Up to 4 lyric words may be merged into up to 3 heard words (and vice versa) when spelled near-identically.
// -> { score 0..1, sims: per-expected-word similarity (0 = missed) }
export function align(exp: string[], heard: string[], weights?: number[]): Alignment {
  const n = exp.length, m = heard.length;
  const W = weights || exp.map((w) => (STOP.has(w) ? 0.5 : 1));
  const total = W.reduce((a, b) => a + b, 0) || 1;
  const dp = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const mv: ([number, number, number] | null)[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(null));
  for (let j = 1; j <= m; j++) mv[0][j] = [0, 1, 0];
  for (let i = 1; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      let best = dp[i - 1][j], move: [number, number, number] = [1, 0, 0];
      if (j > 0 && dp[i][j - 1] > best) { best = dp[i][j - 1]; move = [0, 1, 0]; }
      for (let k = 1; k <= 4 && k <= i; k++) {
        for (let q = 1; q <= 3 && q <= j; q++) {
          if (k === q && k > 1) continue; // only real merges/splits; never let a pair hide a wrong word
          const s = k === 1 && q === 1 ? sim(exp[i - 1], heard[j - 1]) : groupSim(exp.slice(i - k, i).join(''), heard.slice(j - q, j).join(''));
          if (!s) continue;
          let w = 0;
          for (let t = i - k; t < i; t++) w += W[t];
          const v = dp[i - k][j - q] + w * s;
          if (v > best + 1e-9) { best = v; move = [k, q, s]; }
        }
      }
      dp[i][j] = best; mv[i][j] = move;
    }
  }
  const sims = new Array<number>(n).fill(0);
  let i = n, j = m;
  while (i > 0 || j > 0) {
    const mvv = mv[i][j];
    if (!mvv) break;
    const [k, q, s] = mvv;
    if (s) for (let t = i - k; t < i; t++) sims[t] = s;
    i -= k; j -= q;
  }
  return { score: dp[n][m] / total, sims };
}

// The grade for a turn. `hint` = how many leading words were shown on screen (they don't count).
// Singing a stream of extra words to fish for matches is penalised.
export function score(exp: string[], heard: string[], { hint = 0 }: { hint?: number } = {}): Alignment {
  const W = exp.map((w, i) => (i < hint ? 0 : STOP.has(w) ? 0.5 : 1));
  const r = align(exp, heard, W);
  const room = exp.length * 1.6 + 3;
  if (heard.length > room) r.score *= room / heard.length;
  return r;
}
