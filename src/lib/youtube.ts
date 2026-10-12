// Server-side YouTube lookups (no API key): YouTube Music's catalog search and the regular results page.
// Used by /api/search, /api/yt and scripts/build-packs.ts.
import type { Video } from './resolve';

export interface MusicResult extends Video { id: string; title: string; channel: string; album: string; art: string; official: true }
export interface Ranked extends Video { cost: number }

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const BAD = /\b(live|cover|remix|sped|slowed|8d|nightcore|karaoke|instrumental|reaction|loop|hour|reverb|bass ?boost|mashup|dance|tutorial|shorts|acoustic|piano|guitar|edit|version|mix)\b/i;

const seconds = (t?: string | null) => (t ? t.split(':').reduce((a, b) => a * 60 + Number(b), 0) : null);
const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\(.*?\)|\[.*?\]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
function walk(o: Json, key: string, out: Json[]): Json[] {
  if (!o || typeof o !== 'object') return out;
  if (o[key]) { out.push(o[key]); return out; }
  for (const k in o) walk(o[k], key, out);
  return out;
}

// official songs from YouTube Music's search ("Songs" filter)
export async function musicSearch(query: string): Promise<MusicResult[]> {
  const r = await fetch('https://music.youtube.com/youtubei/v1/search?prettyPrint=false', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': UA, origin: 'https://music.youtube.com', referer: 'https://music.youtube.com/' },
    body: JSON.stringify({
      context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20241002.01.00', hl: 'en', gl: 'US' } },
      query,
      params: 'EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D',
    }),
  });
  const data = await r.json();
  return walk(data, 'musicResponsiveListItemRenderer', []).map((m: Json) => {
    const cols: string[] = (m.flexColumns || []).map((c: Json) => (c.musicResponsiveListItemFlexColumnRenderer?.text?.runs || []).map((x: Json) => x.text).join(''));
    const meta = (cols[1] || '').split(' • ');
    const thumbs = m.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
    return {
      id: m.playlistItemData?.videoId, title: cols[0] || '', channel: meta[0] || '', album: meta.length > 2 ? meta[1] : '',
      seconds: seconds(meta[meta.length - 1]), art: thumbs[thumbs.length - 1]?.url || '', official: true as const,
    };
  });
}

// regular YouTube search results page
async function webSearch(query: string): Promise<Video[]> {
  const r = await fetch('https://www.youtube.com/results?hl=en&gl=US&search_query=' + encodeURIComponent(query), {
    headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' },
  });
  const m = (await r.text()).match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/);
  if (!m) return [];
  return walk(JSON.parse(m[1]), 'videoRenderer', []).map((v: Json) => ({
    id: v.videoId, title: v.title?.runs?.[0]?.text || '', channel: v.ownerText?.runs?.[0]?.text || '', seconds: seconds(v.lengthText?.simpleText), official: false,
  }));
}

// Finds playable YouTube videos for a song. Official album tracks from YouTube Music come first: they're the
// same master the synced lyrics were timed against, so they line up. Regular uploads are kept as fallbacks.
export async function findVideosFor(title: string, artist: string, dur: number): Promise<Ranked[]> {
  const nt = norm(title), na = norm(artist).split(' ')[0] || '';
  const [music, web] = await Promise.all([
    musicSearch(`${artist} ${title}`).catch(() => [] as MusicResult[]),
    webSearch(`${artist} ${title} audio`).catch(() => [] as Video[]),
  ]);

  const official = music
    .filter((v) => v.id && v.seconds && norm(v.title).includes(nt) && (!na || norm(v.channel).includes(na)) && !BAD.test(v.title))
    .map((v) => ({ ...v, cost: dur ? Math.abs((v.seconds as number) - dur) : 0 }))
    .sort((a, b) => a.cost - b.cost);

  const fallback = web
    .filter((v) => v.id && v.seconds && v.seconds < 900)
    .map((v) => {
      let cost = 100 + (dur ? Math.abs((v.seconds as number) - dur) : 0);
      if (BAD.test(v.title || '')) cost += 40;
      if (/\baudio\b/i.test(v.title || '')) cost -= 3;
      if (/music video/i.test(v.title || '')) cost += 4; // videos often add intros/skits
      return { ...v, cost };
    })
    .sort((a, b) => a.cost - b.cost);

  const seen = new Set<string>();
  return [...official.slice(0, 3), ...fallback]
    .filter((v) => !seen.has(v.id) && seen.add(v.id))
    .slice(0, 8);
}
