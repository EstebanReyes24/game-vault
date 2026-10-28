/**
 * Proxy hacia la API de RAWG (portadas y datos de juegos).
 * La clave vive en la variable de entorno RAWG_API_KEY de Vercel, no en el código.
 *   /api/rawg?search=elden%20ring&n=6&precise=1
 * Devuelve solo lo que usa la web: nombre, imagen y fecha de lanzamiento.
 */
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  // Sin Access-Control-Allow-Origin: solo lo usa esta misma web.
  if (req.method !== "GET") return res.status(405).json({ error: "Método no permitido" });

  const clave = process.env.RAWG_API_KEY;
  if (!clave) return res.status(503).json({ error: "Falta RAWG_API_KEY en Vercel." });

  const busqueda = String(req.query.search || "").trim().slice(0, 100);
  if (busqueda.length < 2) return res.status(400).json({ error: "Búsqueda demasiado corta." });
  const n = Math.min(Math.max(parseInt(req.query.n, 10) || 6, 1), 8);
  const preciso = req.query.precise === "1" ? "&search_precise=true" : "";

  try {
    const r = await fetch(`https://api.rawg.io/api/games?key=${clave}&search=${encodeURIComponent(busqueda)}&page_size=${n}${preciso}`);
    if (!r.ok) return res.status(502).json({ error: `RAWG respondió ${r.status}` });
    const data = await r.json();
    const results = (data.results || []).map(g => ({ name: g.name, background_image: g.background_image, released: g.released }));
    // Las búsquedas se repiten mucho: el CDN de Vercel las guarda un día
    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
    return res.status(200).json({ results });
  } catch (e) {
    return res.status(502).json({ error: "No se pudo consultar RAWG." });
  }
}
