// GET /api/search?q=calm+down
// Song search over YouTube Music's catalog: clean titles, artists, durations and cover art.
import { musicSearch } from '@/lib/youtube';

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get('q') || '').trim().slice(0, 120);
  if (!q) return Response.json({ error: 'missing q' }, { status: 400 });
  try {
    const seen = new Set<string>();
    const results = (await musicSearch(q))
      .filter((s) => s.id && s.seconds && s.seconds < 900 && !seen.has(s.id) && seen.add(s.id))
      .slice(0, 15);
    return Response.json({ results }, { headers: { 'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400' } });
  } catch (e) {
    return Response.json({ error: String((e as Error).message || e) }, { status: 502 });
  }
}
