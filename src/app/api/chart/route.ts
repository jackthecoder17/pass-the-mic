// GET /api/chart?country=ng
// Live "Top Songs" chart for a country (Apple Music's public feed; it has no CORS, hence this proxy).

export async function GET(req: Request) {
  const url = new URL(req.url);
  const country = (url.searchParams.get('country') || 'ng').toLowerCase().replace(/[^a-z]/g, '').slice(0, 2) || 'ng';
  try {
    const r = await fetch(`https://rss.marketingtools.apple.com/api/v2/${country}/music/most-played/50/songs.json`);
    if (!r.ok) throw new Error('chart unavailable');
    const feed = (await r.json()).feed;
    const songs = (feed.results || []).map((s: { name: string; artistName: string }) => ({ title: s.name, artist: s.artistName }));
    return Response.json({ songs }, { headers: { 'cache-control': 'public, s-maxage=21600, stale-while-revalidate=86400' } });
  } catch (e) {
    return Response.json({ error: String((e as Error).message || e) }, { status: 502 });
  }
}
