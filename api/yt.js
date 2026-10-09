// GET /api/yt?title=Last+Last&artist=Burna+Boy&dur=172
// Finds a playable YouTube video for a song. Official album tracks from YouTube Music come
// first: they're the same master the synced lyrics were timed against, so they line up.
// Regular YouTube uploads (re-uploads, lyric videos) are kept as fallbacks. No API key needed.

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const BAD = /\b(live|cover|remix|sped|slowed|8d|nightcore|karaoke|instrumental|reaction|loop|hour|reverb|bass ?boost|mashup|dance|tutorial|shorts|acoustic|piano|guitar|edit|version|mix)\b/i;

const seconds = (t) => (t ? t.split(':').reduce((a, b) => a * 60 + Number(b), 0) : null);
const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\(.*?\)|\[.*?\]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

function walk(o, key, out) {
  if (!o || typeof o !== 'object') return out;
  if (o[key]) { out.push(o[key]); return out; }
  for (const k in o) walk(o[k], key, out);
  return out;
}

// official songs from YouTube Music's search ("Songs" filter)
async function musicSearch(query) {
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
  return walk(data, 'musicResponsiveListItemRenderer', []).map((m) => {
    const cols = (m.flexColumns || []).map((c) => (c.musicResponsiveListItemFlexColumnRenderer?.text?.runs || []).map((x) => x.text).join(''));
    const meta = (cols[1] || '').split(' • ');
    return { id: m.playlistItemData?.videoId, title: cols[0] || '', channel: meta[0] || '', seconds: seconds(meta[meta.length - 1]), official: true };
  });
}

// regular YouTube search results page
async function webSearch(query) {
  const r = await fetch('https://www.youtube.com/results?hl=en&gl=US&search_query=' + encodeURIComponent(query), {
    headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' },
  });
  const m = (await r.text()).match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!m) return [];
  return walk(JSON.parse(m[1]), 'videoRenderer', []).map((v) => ({
    id: v.videoId, title: v.title?.runs?.[0]?.text || '', channel: v.ownerText?.runs?.[0]?.text || '', seconds: seconds(v.lengthText?.simpleText), official: false,
  }));
}

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const title = (url.searchParams.get('title') || '').slice(0, 150);
  const artist = (url.searchParams.get('artist') || '').slice(0, 150);
  const dur = Number(url.searchParams.get('dur')) || 0;
  res.setHeader('content-type', 'application/json');
  if (!title) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'missing title' })); }

  const nt = norm(title), na = norm(artist).split(' ')[0] || '';
  const [music, web] = await Promise.all([
    musicSearch(`${artist} ${title}`).catch(() => []),
    webSearch(`${artist} ${title} audio`).catch(() => []),
  ]);

  const official = music
    .filter((v) => v.id && v.seconds && norm(v.title).includes(nt) && (!na || norm(v.channel).includes(na)) && !BAD.test(v.title))
    .map((v) => ({ ...v, cost: dur ? Math.abs(v.seconds - dur) : 0 }))
    .sort((a, b) => a.cost - b.cost);

  const fallback = web
    .filter((v) => v.id && v.seconds && v.seconds < 900)
    .map((v) => {
      let cost = 100 + (dur ? Math.abs(v.seconds - dur) : 0);
      if (BAD.test(v.title)) cost += 40;
      if (/\baudio\b/i.test(v.title)) cost -= 3;
      if (/music video/i.test(v.title)) cost += 4; // videos often add intros/skits
      return { ...v, cost };
    })
    .sort((a, b) => a.cost - b.cost);

  const seen = new Set();
  const results = [...official.slice(0, 3), ...fallback]
    .filter((v) => !seen.has(v.id) && seen.add(v.id))
    .slice(0, 8);

  if (!results.length) { res.statusCode = 502; return res.end(JSON.stringify({ error: 'no results' })); }
  res.setHeader('cache-control', 'public, s-maxage=86400, stale-while-revalidate=604800');
  res.end(JSON.stringify({ results }));
}
