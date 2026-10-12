// GET /api/yt?title=Last+Last&artist=Burna+Boy&dur=172
// Finds a playable YouTube video for a song (official album tracks first, then regular uploads). No API key.
import { findVideosFor } from '@/lib/youtube';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const title = (url.searchParams.get('title') || '').slice(0, 150);
  const artist = (url.searchParams.get('artist') || '').slice(0, 150);
  const dur = Number(url.searchParams.get('dur')) || 0;
  if (!title) return Response.json({ error: 'missing title' }, { status: 400 });
  const results = await findVideosFor(title, artist, dur);
  if (!results.length) return Response.json({ error: 'no results' }, { status: 502 });
  return Response.json({ results }, { headers: { 'cache-control': 'public, s-maxage=86400, stale-while-revalidate=604800' } });
}
