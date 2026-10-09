// GET /api/yt?q=artist+title&dur=172
// Finds YouTube uploads of a song and ranks them by how closely their length matches
// the synced lyrics (so the timestamps line up). No API key needed.

const BAD = /\b(live|cover|remix|sped|slowed|8d|nightcore|karaoke|instrumental|reaction|loop|hour|reverb|bass ?boost|mashup|dance|tutorial|shorts|acoustic|piano|guitar|edit)\b/i;

function seconds(t) {
  if (!t) return null;
  return t.split(':').reduce((a, b) => a * 60 + Number(b), 0);
}

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const q = (url.searchParams.get('q') || '').slice(0, 200);
  const dur = Number(url.searchParams.get('dur')) || 0;
  res.setHeader('content-type', 'application/json');
  if (!q) { res.statusCode = 400; return res.end(JSON.stringify({ error: 'missing q' })); }

  try {
    const r = await fetch('https://www.youtube.com/results?hl=en&gl=US&search_query=' + encodeURIComponent(q), {
      headers: {
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
        'accept-language': 'en-US,en;q=0.9',
      },
    });
    const html = await r.text();
    const m = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
    if (!m) throw new Error('no results data');
    const found = [];
    (function walk(o) {
      if (!o || typeof o !== 'object') return;
      if (o.videoRenderer) {
        const v = o.videoRenderer;
        found.push({ id: v.videoId, title: v.title?.runs?.[0]?.text || '', channel: v.ownerText?.runs?.[0]?.text || '', seconds: seconds(v.lengthText?.simpleText) });
        return;
      }
      for (const k in o) walk(o[k]);
    })(JSON.parse(m[1]));

    const ranked = found
      .filter((v) => v.id && v.seconds && v.seconds < 900)
      .map((v) => {
        let cost = dur ? Math.abs(v.seconds - dur) : 0;
        if (BAD.test(v.title)) cost += 40;
        if (/ - topic$/i.test(v.channel) || /\baudio\b/i.test(v.title)) cost -= 3;
        if (/music video/i.test(v.title)) cost += 4; // videos often add intros/skits
        return { ...v, cost };
      })
      .sort((a, b) => a.cost - b.cost)
      .slice(0, 6);

    res.setHeader('cache-control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    res.end(JSON.stringify({ results: ranked }));
  } catch (e) {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: String(e.message || e) }));
  }
}
