// GET /api/search?q=calm+down
// Song search over YouTube Music's catalog: clean titles, artists, durations and cover art.
import { musicSearch } from './yt.js';

export default async function handler(req, res) {
  const q = (new URL(req.url, 'http://localhost').searchParams.get('q') || '').trim().slice(0, 120);
  res.setHeader('content-type', 'application/json');
  if (!q) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'missing q' })); }
  try {
    const seen = new Set();
    const results = (await musicSearch(q))
      .filter((s) => s.id && s.seconds && s.seconds < 900 && !seen.has(s.id) && seen.add(s.id))
      .slice(0, 15);
    res.setHeader('cache-control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.end(JSON.stringify({ results }));
  } catch (e) {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: String(e.message || e) }));
  }
}
