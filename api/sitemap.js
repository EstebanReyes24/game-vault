/**
 * Sitemap dinámico: páginas fijas + la página de cada juego que está en algún estante público.
 * /sitemap.xml → aquí (ver "rewrites" en vercel.json). Así Google encuentra cada /j/<juego>.
 */
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./_supabase.js";

const FIJAS = [["/", "daily", "1.0"], ["/juegos", "daily", "0.9"], ["/noticias", "daily", "0.8"], ["/articulos", "weekly", "0.8"], ["/comparar", "monthly", "0.4"], ["/legal", "yearly", "0.2"]];
const slug = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

export default async function handler(req, res) {
  const origen = `https://${req.headers["x-forwarded-host"] || req.headers.host}`;
  let juegos = [];
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/juegos_ranking`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_orden: "jugadores", p_limite: 200 })
    });
    if (r.ok) juegos = await r.json();
  } catch (e) { /* sin juegos: solo las fijas */ }
  const urls = [
    ...FIJAS.map(([ruta, cambio, prioridad]) => `<url><loc>${origen}${ruta}</loc><changefreq>${cambio}</changefreq><priority>${prioridad}</priority></url>`),
    ...juegos.filter(j => slug(j.titulo)).map(j => `<url><loc>${esc(`${origen}/j/${slug(j.titulo)}`)}</loc><changefreq>weekly</changefreq><priority>0.6</priority></url>`)
  ];
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=21600, stale-while-revalidate=86400");
  res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`);
}
