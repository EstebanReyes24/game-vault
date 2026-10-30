/**
 * Sirve /u/:usuario (perfil) y /a/:id (artículo) con sus propias etiquetas
 * de vista previa (Open Graph), para que WhatsApp, Discord o X muestren
 * título, descripción e imagen del perfil o del artículo.
 * El resto de la página es el mismo app.html / index.html de siempre.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { supa, perfilPublico, usuarioValido, SUPABASE_URL, SUPABASE_ANON_KEY } from "./_supabase.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const plantillas = {};
const leer = (archivo) => (plantillas[archivo] ||= readFileSync(join(process.cwd(), archivo), "utf8"));

function inyectar(html, meta) {
  const limpio = html
    .replace(/<title>[\s\S]*?<\/title>/i, "")
    .replace(/\s*<meta (?:property|name)="(?:og:[^"]+|twitter:[^"]+|description)"[^>]*>/gi, "");
  const etiquetas = `
  <title>${esc(meta.titulo)}</title>
  <meta name="description" content="${esc(meta.descripcion)}">
  <meta property="og:type" content="${meta.tipo || "website"}">
  <meta property="og:site_name" content="Paindex Vault">
  <meta property="og:url" content="${esc(meta.url)}">
  <meta property="og:title" content="${esc(meta.titulo)}">
  <meta property="og:description" content="${esc(meta.descripcion)}">
  <meta property="og:image" content="${esc(meta.imagen)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(meta.titulo)}">
  <meta name="twitter:description" content="${esc(meta.descripcion)}">
  <meta name="twitter:image" content="${esc(meta.imagen)}">
`;
  return limpio.replace(/<\/head>/i, etiquetas + "</head>");
}

// ---------- Sitemap dinámico (/sitemap.xml → ?tipo=sitemap): páginas fijas + cada /j/<juego> ----------
const FIJAS = [["/", "daily", "1.0"], ["/juegos", "daily", "0.9"], ["/noticias", "daily", "0.8"], ["/articulos", "weekly", "0.8"], ["/comparar", "monthly", "0.4"], ["/legal", "yearly", "0.2"]];
const slug = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

async function sitemap(req, res) {
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

export default async function handler(req, res) {
  if (req.query.tipo === "sitemap") return sitemap(req, res);
  const origen = `https://${req.headers["x-forwarded-host"] || req.headers.host}`;
  const { tipo, u, id, lista, resena, j, a, b } = req.query;
  let archivo = "index.html";
  let meta = {
    titulo: "Paindex Vault · Tu estante de juegos",
    descripcion: "Registra los juegos que juegas, ponles nota y comparte tu estante.",
    imagen: `${origen}/img/og.png`,
    url: origen
  };

  try {
    if (tipo === "perfil") {
      archivo = "app.html";
      const p = await perfilPublico(u);
      if (p) {
        const partes = [`${p.juegos} juegos`, `${p.horas.toLocaleString("es")} horas`];
        if (p.platinos) partes.push(`${p.platinos} platinos`);
        if (p.media !== null) partes.push(`nota media ${p.media.toFixed(1)}`);
        meta = {
          titulo: `@${p.usuario} en Paindex Vault`,
          descripcion: partes.join(" · ") + (p.top[0] ? `. Su mejor puntuado: ${p.top[0].titulo}.` : "."),
          imagen: `${origen}/api/og?u=${encodeURIComponent(p.usuario)}`,
          url: `${origen}/u/${p.usuario}`,
          tipo: "profile"
        };
        // Enlace a una reseña: /u/nombre?resena=ID
        if (/^\d{1,12}$/.test(String(resena || ""))) {
          const [r] = await supa(`reviews?select=id,game_title,cover_url,rating,body,spoilers&id=eq.${resena}&limit=1`);
          if (r) {
            const texto = r.spoilers ? "Contiene spoilers. Ábrela para leerla." : String(r.body).replace(/\s+/g, " ").trim();
            meta = {
              titulo: `Reseña de ${r.game_title} por @${p.usuario}${r.rating ? ` · ${Number(r.rating).toFixed(1)}` : ""}`,
              descripcion: texto.length > 180 ? texto.slice(0, 177).replace(/\s\S*$/, "") + "…" : texto,
              imagen: /^https:\/\//.test(r.cover_url || "") ? r.cover_url : meta.imagen,
              url: `${origen}/u/${p.usuario}?resena=${r.id}`,
              tipo: "article"
            };
          }
        }
        // Enlace a una lista: /u/nombre?lista=ID
        if (/^\d{1,12}$/.test(String(lista || ""))) {
          const [l] = await supa(`lists?select=id,title,description,list_items(game_title,cover_url,position)&id=eq.${lista}&limit=1`);
          if (l) {
            const items = (l.list_items || []).sort((a, b) => a.position - b.position);
            const portada = items.find(i => /^https:\/\//.test(i.cover_url || ""));
            meta = {
              titulo: `${l.title} · lista de @${p.usuario}`,
              descripcion: l.description || `${items.length} juegos: ${items.slice(0, 4).map(i => i.game_title).join(", ")}${items.length > 4 ? "…" : "."}`,
              imagen: portada ? portada.cover_url : meta.imagen,
              url: `${origen}/u/${p.usuario}?lista=${l.id}`,
              tipo: "article"
            };
          }
        }
      }
    } else if (tipo === "comparar" && usuarioValido(a) && usuarioValido(b)) {
      archivo = "comparar.html";
      const [pa, pb] = await Promise.all([perfilPublico(a), perfilPublico(b)]);
      if (pa && pb) {
        meta = {
          titulo: `@${pa.usuario} vs @${pb.usuario} · ¿qué tan compatibles son?`,
          descripcion: `${pa.juegos} juegos contra ${pb.juegos}. Juegos en común, dónde chocan sus notas y qué se recomiendan en Paindex Vault.`,
          imagen: `${origen}/api/og?a=${encodeURIComponent(pa.usuario)}&b=${encodeURIComponent(pb.usuario)}`,
          url: `${origen}/u/${pa.usuario}/vs/${pb.usuario}`
        };
      }
    } else if (tipo === "juego" && /^[a-z0-9-]{1,120}$/.test(String(j || ""))) {
      archivo = "juego.html";
      const d = await supa(`rpc/juego_comunidad?p_clave=${encodeURIComponent(String(j).replace(/-/g, ""))}`).catch(() => null);
      if (d && d.titulo) {
        const partes = [];
        if (d.jugadores) partes.push(`${d.jugadores} ${d.jugadores === 1 ? "jugador lo tiene" : "jugadores lo tienen"}`);
        if (d.nota_media) partes.push(`nota media ${Number(d.nota_media).toFixed(1)}`);
        if (d.platinos) partes.push(`${d.platinos} platinos`);
        if ((d.resenas || []).length) partes.push(`${d.resenas.length} reseñas`);
        meta = {
          titulo: `${d.titulo} · Paindex Vault`,
          descripcion: partes.length ? `${partes.join(" · ")}. Lo que opina la comunidad de Paindex.` : "Lo que opina la comunidad de Paindex.",
          imagen: /^https:\/\//.test(d.portada || "") ? d.portada : meta.imagen,
          url: `${origen}/j/${j}`,
          tipo: "article"
        };
      } else {
        meta = { ...meta, titulo: "Juego · Paindex Vault", url: `${origen}/j/${j}` };
      }
    } else if (tipo === "articulo" && /^\d{1,12}$/.test(String(id || ""))) {
      const [post] = await supa(`posts?select=id,title,category,content,cover_url&id=eq.${id}&limit=1`);
      if (post) {
        const texto = String(post.content || "").replace(/\s+/g, " ").trim();
        meta = {
          titulo: post.title,
          descripcion: (texto.length > 180 ? texto.slice(0, 177).replace(/\s\S*$/, "") + "…" : texto) || `${post.category} en Paindex`,
          imagen: /^https:\/\//.test(post.cover_url || "") ? post.cover_url : `${origen}/img/og.png`,
          url: `${origen}/a/${post.id}`,
          tipo: "article"
        };
      }
    }
  } catch (e) {
    console.error("pagina:", e.message);
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=86400");
  res.status(200).send(inyectar(leer(archivo), meta));
}
