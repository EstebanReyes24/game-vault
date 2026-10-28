/**
 * Sirve /u/:usuario (perfil) y /a/:id (artículo) con sus propias etiquetas
 * de vista previa (Open Graph), para que WhatsApp, Discord o X muestren
 * título, descripción e imagen del perfil o del artículo.
 * El resto de la página es el mismo app.html / index.html de siempre.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { supa, perfilPublico } from "./_supabase.js";

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

export default async function handler(req, res) {
  const origen = `https://${req.headers["x-forwarded-host"] || req.headers.host}`;
  const { tipo, u, id } = req.query;
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
