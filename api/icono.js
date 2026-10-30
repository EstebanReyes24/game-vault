/**
 * Iconos de trofeos de PlayStation servidos desde la web.
 * psnobj.prod.dl.playstation.net no carga en algunos navegadores, así que se pide desde el servidor
 * y el CDN de Vercel lo guarda un mes (cada icono se descarga una sola vez).
 *   GET /api/icono?u=https://psnobj.prod.dl.playstation.net/psnobj/NPWR…/….png
 */
const PERMITIDOS = new Set(["psnobj.prod.dl.playstation.net"]);

export default async function handler(req, res) {
  let url;
  try { url = new URL(String(req.query.u || "")); } catch (e) { return res.status(400).json({ error: "URL no válida." }); }
  if (!/^https?:$/.test(url.protocol) || !PERMITIDOS.has(url.hostname)) return res.status(400).json({ error: "Origen no permitido." });
  for (const intento of [url.href.replace(/^http:/, "https:"), url.href.replace(/^https:/, "http:")]) {
    try {
      const r = await fetch(intento, { headers: { "User-Agent": "Mozilla/5.0 PaindexVault" }, signal: AbortSignal.timeout(8000) });
      const tipo = r.headers.get("content-type") || "";
      if (!r.ok || !tipo.startsWith("image/")) continue;
      const datos = Buffer.from(await r.arrayBuffer());
      if (datos.length > 1_500_000) continue;
      res.setHeader("Content-Type", tipo);
      res.setHeader("Cache-Control", "public, max-age=604800, s-maxage=2592000, immutable");
      return res.status(200).send(datos);
    } catch (e) { /* siguiente intento */ }
  }
  res.setHeader("Cache-Control", "public, s-maxage=3600");
  return res.status(404).json({ error: "No se pudo traer el icono." });
}
