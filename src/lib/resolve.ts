// Turn "title + artist" into something playable: synced lyrics from LRCLIB plus YouTube video ids,
// with the lyric version chosen to match the official track's exact length (so timings line up).
// Shared by the browser (live charts, searched songs) and scripts/build-packs.ts (curated packs).

export interface Video { id: string; seconds: number | null; official?: boolean; title?: string; channel?: string }
export type FindVideos = (title: string, artist: string, dur: number) => Promise<Video[]>;
export interface Resolved {
  t: string; a: string; l: number; d: number; v: string[];
  official: boolean; delta: number; lyrics: string;
}
interface LrcLibHit { id: number; trackName: string; artistName: string; albumName?: string; duration: number; instrumental?: boolean; syncedLyrics?: string | null }

const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/\b(feat|ft|with)\b.*$/, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
const squash = (s: string) => norm(s).replace(/ /g, '');
// "drake one dance" / "billie jean michael jackson" -> the bare title
function stripArtist(t: string, names: string[]) {
  for (const n of names) {
    if (!n || n === t) continue;
    if (t.startsWith(n + ' ')) t = t.slice(n.length + 1);
    else if (t.endsWith(' ' + n)) t = t.slice(0, -n.length - 1);
  }
  return t;
}
const BAD = /\b(sped|slowed|nightcore|8d|remix|live|acoustic|instrumental|karaoke|cover|reverb)\b/i;

export async function resolveSong(title: string, artist: string, findVideos: FindVideos): Promise<Resolved | null> {
  const core = norm(title), who = squash(artist);
  let r: Response | undefined;
  for (let attempt = 0; attempt < 4; attempt++) { // LRCLIB answers 503/429 when busy
    r = await fetch('https://lrclib.net/api/search?q=' + encodeURIComponent(`${artist} ${title}`));
    if (r.status !== 503 && r.status !== 429) break;
    await new Promise((ok) => setTimeout(ok, 1500 * (attempt + 1)));
  }
  if (!r || !r.ok) throw new Error('lyrics search failed');
  const cands = ((await r.json()) as LrcLibHit[]).filter((x) => {
    if (!x.syncedLyrics || x.instrumental || BAD.test(x.trackName) || BAD.test(x.albumName || '')) return false;
    const t = stripArtist(norm(x.trackName), [norm(x.artistName), norm(artist)]), a = squash(x.artistName);
    const titleOk = t === core || t.startsWith(core + ' ') || t.endsWith(' ' + core) || core.startsWith(t + ' ');
    const artistOk = a.includes(who) || who.includes(a) || a.includes(who.slice(0, 6));
    return titleOk && artistOk;
  });
  if (!cands.length) return null;

  const videos = await findVideos(title, artist, Math.round(cands[0].duration));
  if (!videos.length) return null;
  const target = videos[0].seconds as number;
  cands.sort((a, b) => Math.abs(a.duration - target) - Math.abs(b.duration - target));
  const lyr = cands[0];
  return {
    t: title, a: artist,
    l: lyr.id, d: Math.round(lyr.duration),
    v: videos.slice(0, 4).map((v) => v.id),
    official: !!videos[0].official,
    delta: Math.round(Math.abs(lyr.duration - target) * 10) / 10,
    lyrics: lyr.syncedLyrics as string,
  };
}
