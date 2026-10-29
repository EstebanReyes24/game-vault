/**
 * Proxy de iconos de logros de Xbox.
 * images-eds-ssl.xboxlive.com no carga en muchos navegadores, así que el icono se pide desde el servidor
 * y se sirve con caché larga (la CDN de Vercel lo guarda; cada icono se descarga una sola vez).
 *   GET /api/icono?u=<url de images-eds(-ssl).xboxlive.com o *.xboxlive.com>
 */
const PERMITIDOS = /^(images-eds-ssl|images-eds|images)\.xboxlive\.com$|\.xboxlive\.com$|\.s-microsoft\.com$/;

function variantes(url) {
  const lista = [url.href];
  if (url.hostname === "images-eds-ssl.xboxlive.com") {
    lista.push(url.href.replace("https://images-eds-ssl.xboxlive.com", "http://images-eds.xboxlive.com"));
  }
  return lista;
}

export default async function handler(req, res) {
  let url;
  try { url = new URL(String(req.query.u || "")); } catch (e) { return res.status(400).json({ error: "URL no válida." }); }
  if (!/^https?:$/.test(url.protocol) || !PERMITIDOS.test(url.hostname)) return res.status(400).json({ error: "Origen no permitido." });

  for (const intento of variantes(url)) {
    try {
      const r = await fetch(intento, { headers: { "User-Agent": "Mozilla/5.0 PaindexVault", Accept: "image/*" }, signal: AbortSignal.timeout(8000) });
      const tipo = r.headers.get("content-type") || "";
      if (!r.ok || !tipo.startsWith("image/")) continue;
      const datos = Buffer.from(await r.arrayBuffer());
      if (datos.length > 2_000_000) continue;
      res.setHeader("Content-Type", tipo);
      res.setHeader("Cache-Control", "public, max-age=604800, s-maxage=2592000, immutable");
      return res.status(200).send(datos);
    } catch (e) { /* se prueba la siguiente variante */ }
  }
  res.setHeader("Cache-Control", "public, s-maxage=3600");
  return res.status(404).json({ error: "No se pudo traer el icono." });
}
