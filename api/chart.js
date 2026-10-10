// GET /api/chart?country=ng
// Live "Top Songs" chart for a country (Apple Music's public feed; it has no CORS, hence this proxy).

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const country = (url.searchParams.get('country') || 'ng').toLowerCase().replace(/[^a-z]/g, '').slice(0, 2) || 'ng';
  res.setHeader('content-type', 'application/json');
  try {
    const r = await fetch(`https://rss.marketingtools.apple.com/api/v2/${country}/music/most-played/50/songs.json`);
    if (!r.ok) throw new Error('chart unavailable');
    const feed = (await r.json()).feed;
    const songs = (feed.results || []).map((s) => ({ title: s.name, artist: s.artistName }));
    res.setHeader('cache-control', 'public, s-maxage=21600, stale-while-revalidate=86400');
    res.end(JSON.stringify({ songs }));
  } catch (e) {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: String(e.message || e) }));
  }
}
