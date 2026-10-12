// npm run packs
// Checks every curated song (synced lyrics + official track whose length matches) and writes public/packs.json.
import { writeFile } from 'node:fs/promises';
import { PACKS, LIVE } from './songs.mjs';
import { resolveSong, type Resolved } from '../src/lib/resolve';
import { findVideosFor } from '../src/lib/youtube';

type Song = [string, string];
type Outcome = Resolved | { t: string; a: string; why: string };

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>) {
  const out = new Array<R>(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

const report: string[] = [];
const packs = [];
for (const pack of PACKS as { id: string; name: string; emoji: string; blurb: string; songs: Song[] }[]) {
  const res = await pool<Song, Outcome>(pack.songs, 3, async ([t, a]) => {
    try {
      const s = await resolveSong(t, a, findVideosFor);
      if (!s) return { t, a, why: 'no synced lyrics' };
      if (!s.official) return { t, a, why: 'no official track' };
      if (s.delta > 2) return { t, a, why: `lyrics ${s.delta}s off` };
      return s;
    } catch (e) { return { t, a, why: (e as Error).message }; }
  });
  const ok = res.filter((s): s is Resolved => !('why' in s)).map(({ t, a, l, d, v }) => ({ t, a, l, d, v }));
  const seen = new Set<number>();
  const songs = ok.filter((s) => !seen.has(s.l) && seen.add(s.l));
  for (const s of res) if ('why' in s) report.push(`  ✗ [${pack.id}] ${s.t} – ${s.a}: ${s.why}`);
  console.log(`${pack.emoji} ${pack.name}: ${songs.length}/${pack.songs.length}`);
  packs.push({ id: pack.id, name: pack.name, emoji: pack.emoji, blurb: pack.blurb, songs });
}
console.log(report.join('\n'));
await writeFile(new URL('../public/packs.json', import.meta.url), JSON.stringify({ live: LIVE, packs }));
console.log('wrote public/packs.json');
