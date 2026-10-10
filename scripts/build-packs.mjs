// node scripts/build-packs.mjs
// Checks every curated song (synced lyrics + official track whose length matches) and writes packs.json.
import { writeFile } from 'node:fs/promises';
import { PACKS, LIVE } from './songs.mjs';
import { resolveSong } from '../resolve.js';
import yt from '../api/yt.js';

async function findVideos(title, artist, dur) {
  let body = '';
  const res = { statusCode: 200, setHeader() {}, end(b) { body = b; } };
  await yt({ url: `/api/yt?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}&dur=${dur}` }, res);
  return JSON.parse(body).results || [];
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

const report = [];
const packs = [];
for (const pack of PACKS) {
  const res = await pool(pack.songs, 3, async ([t, a]) => {
    try {
      const s = await resolveSong(t, a, findVideos);
      if (!s) return { t, a, why: 'no synced lyrics' };
      if (!s.official) return { t, a, why: 'no official track' };
      if (s.delta > 2) return { t, a, why: `lyrics ${s.delta}s off` };
      return s;
    } catch (e) { return { t, a, why: e.message }; }
  });
  const ok = res.filter((s) => !s.why).map(({ t, a, l, d, v }) => ({ t, a, l, d, v }));
  const seen = new Set();
  const songs = ok.filter((s) => !seen.has(s.l) && seen.add(s.l));
  for (const s of res.filter((s) => s.why)) report.push(`  ✗ [${pack.id}] ${s.t} – ${s.a}: ${s.why}`);
  console.log(`${pack.emoji} ${pack.name}: ${songs.length}/${pack.songs.length}`);
  packs.push({ id: pack.id, name: pack.name, emoji: pack.emoji, blurb: pack.blurb, songs });
}
console.log(report.join('\n'));
await writeFile(new URL('../packs.json', import.meta.url), JSON.stringify({ live: LIVE, packs }));
console.log('wrote packs.json');
