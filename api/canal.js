/**
 * Últimos videos del canal de YouTube de Paindex (feed público, sin claves).
 *   GET /api/canal → { canal, videos: [{ id, titulo, fecha, miniatura, vistas }] }
 * El CDN guarda la respuesta 30 minutos.
 */
const CANAL = process.env.YOUTUBE_CHANNEL_ID || "UCsDfOHBHLo0xr4Fhg9yDbsA"; // @PaindexHQ

const desescapar = (s) => String(s || "")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  try {
    const r = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${CANAL}`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`YouTube respondió ${r.status}`);
    const xml = await r.text();
    const videos = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].slice(0, 8).map(([, e]) => {
      const id = (e.match(/<yt:videoId>([\w-]{11})<\/yt:videoId>/) || [])[1];
      return {
        id,
        titulo: desescapar((e.match(/<title>([\s\S]*?)<\/title>/) || [])[1]),
        fecha: (e.match(/<published>([^<]+)<\/published>/) || [])[1] || null,
        miniatura: id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null,
        vistas: Number((e.match(/<media:statistics views="(\d+)"/) || [])[1]) || null,
        corto: /\/shorts\//.test(e) // YouTube marca los Shorts con un enlace /shorts/
      };
    }).filter(v => v.id);
    res.setHeader("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=86400");
    return res.status(200).json({ canal: "https://www.youtube.com/@PaindexHQ", videos });
  } catch (e) {
    res.setHeader("Cache-Control", "public, s-maxage=300");
    return res.status(200).json({ canal: "https://www.youtube.com/@PaindexHQ", videos: [], error: e.message });
  }
}
