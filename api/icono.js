/**
 * Imágenes de juegos servidas desde la web, como respaldo.
 * - psnobj.prod.dl.playstation.net no carga directo en algunos navegadores.
 * - Hay redes (universidades, trabajos, filtros de DNS) que bloquean los servidores de Steam, RAWG,
 *   PlayStation o Xbox: allí las portadas no cargan, así que la página las vuelve a pedir por aquí.
 * Solo se aceptan esos orígenes y solo imágenes; el CDN de Vercel guarda cada una un mes.
 *   GET /api/icono?u=https://cdn.cloudflare.steamstatic.com/steam/apps/730/library_600x900.jpg
 */
import { limitePorIp, DEMASIADO } from "./_supabase.js";

const PERMITIDOS = new Set([
  "psnobj.prod.dl.playstation.net", "image.api.playstation.com",
  "cdn.cloudflare.steamstatic.com", "cdn.akamai.steamstatic.com", "shared.akamai.steamstatic.com", "shared.fastly.steamstatic.com",
  "shared.cloudflare.steamstatic.com", "steamcdn-a.akamaihd.net",
  "media.rawg.io", "images-eds-ssl.xboxlive.com", "store-images.s-microsoft.com"
]);

export default async function handler(req, res) {
  if (!limitePorIp(req, "icono", 900, 60)) return res.status(429).json(DEMASIADO);
  let url;
  try { url = new URL(String(req.query.u || "")); } catch (e) { return res.status(400).json({ error: "URL no válida." }); }
  if (!/^https?:$/.test(url.protocol) || !PERMITIDOS.has(url.hostname)) return res.status(400).json({ error: "Origen no permitido." });
  for (const intento of [url.href.replace(/^http:/, "https:"), url.href.replace(/^https:/, "http:")]) {
    try {
      const r = await fetch(intento, { headers: { "User-Agent": "Mozilla/5.0 PaindexVault" }, redirect: "error", signal: AbortSignal.timeout(8000) });
      const tipo = r.headers.get("content-type") || "";
      if (!r.ok || !tipo.startsWith("image/")) continue;
      const datos = Buffer.from(await r.arrayBuffer());
      if (datos.length > 3_000_000) continue;
      res.setHeader("Content-Type", tipo);
      res.setHeader("Cache-Control", "public, max-age=604800, s-maxage=2592000, immutable");
      return res.status(200).send(datos);
    } catch (e) { /* siguiente intento */ }
  }
  res.setHeader("Cache-Control", "public, s-maxage=3600");
  return res.status(404).json({ error: "No se pudo traer el icono." });
}
