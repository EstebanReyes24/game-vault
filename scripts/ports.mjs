/**
 * Genera data/ports.json: los ports nativos para PC de juegos de consola.
 * Fuente: la lista "awesome-unofficial-pc-ports" (licencia MIT) de Sebastrion,
 * enriquecida con la API de GitHub (estrellas, última versión, sistemas de cada descarga).
 * Lo ejecuta cada semana .github/workflows/ports.yml (con GITHUB_TOKEN).
 *   node scripts/ports.mjs
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";

const LISTA = "Sebastrion/awesome-unofficial-pc-ports";
const TOKEN = process.env.GITHUB_TOKEN || "";
const gh = async (ruta) => {
  const r = await fetch(`https://api.github.com/${ruta}`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "paindex-vault", ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) }
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub ${r.status} en ${ruta}`);
  return r.json();
};

const SECCIONES = { nintendo: "Nintendo", playstation: "PlayStation", xbox: "Xbox", sega: "SEGA", indie: "Indie", j2me: "Móviles (J2ME)" };
const limpiarMd = (t) => String(t)
  .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
  .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
  .replace(/[*_`]/g, "")
  .replace(/📺\s*YouTube Tutorial/gi, "")
  .replace(/\s+/g, " ").trim();
const slug = (t) => String(t).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/['’`´]/g, "")
  .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);

function analizar(md) {
  const juegos = [];
  let seccion = null, juego = null, actual = null, enVerTambien = false;
  const cerrarProyecto = () => { if (actual) { actual.descripcion = limpiarMd(actual._texto.join(" ")).slice(0, 280); delete actual._texto; actual = null; } };
  for (const linea of md.split("\n")) {
    const h2 = linea.match(/^##\s+(.+)$/);
    if (h2) {
      cerrarProyecto();
      const clave = h2[1].toLowerCase().replace(/[^a-z0-9]/g, "");
      seccion = Object.keys(SECCIONES).find(k => clave.includes(k)) || null;
      juego = null;
      continue;
    }
    if (!seccion) continue;
    const resumen = linea.match(/<summary>(?:<strong>)?([^<]+)/);
    if (resumen) {
      cerrarProyecto();
      juego = { juego: limpiarMd(resumen[1]), slug: slug(limpiarMd(resumen[1])), plataforma: SECCIONES[seccion], proyectos: [] };
      juegos.push(juego);
      enVerTambien = false;
      continue;
    }
    if (!juego) continue;
    if (/^<\/details>/.test(linea)) { cerrarProyecto(); juego = null; continue; }
    const h3 = linea.match(/^###\s+(⭐\s*)?\[([^\]]+)\]\(([^)\s]+)\)/);
    if (h3) {
      cerrarProyecto();
      actual = { nombre: limpiarMd(h3[2]), url: h3[3], destacado: !!h3[1], _texto: [] };
      juego.proyectos.push(actual);
      enVerTambien = false;
      continue;
    }
    if (/^####\s+/.test(linea)) { cerrarProyecto(); enVerTambien = /also see|see also/i.test(linea); continue; }
    const vineta = linea.match(/^\s*[-*]\s+\[([^\]]+)\]\(([^)\s]+)\)\s*[–—-]?\s*(.*)$/);
    if (vineta && (enVerTambien || !actual)) {
      cerrarProyecto();
      juego.proyectos.push({ nombre: limpiarMd(vineta[1]), url: vineta[2], destacado: false, descripcion: limpiarMd(vineta[3]).slice(0, 280) });
      continue;
    }
    if (actual && linea.trim() && !/^---/.test(linea)) actual._texto.push(linea);
  }
  cerrarProyecto();
  return juegos.filter(j => j.proyectos.length);
}

const SISTEMAS = [
  ["windows", /win(dows|64|32)?|\.exe$|\.msi$/i],
  ["linux", /linux|appimage|\.deb$|\.rpm$|flatpak|steamdeck|steam-deck/i],
  ["mac", /mac|osx|darwin|\.dmg$|apple|arm64.*\.zip/i],
  ["android", /android|\.apk$/i],
  ["switch", /switch|\.nro$|\.nsp$/i]
];

async function enriquecer(p) {
  const m = String(p.url).match(/^https:\/\/github\.com\/([^/\s]+)\/([^/\s#?]+)/i);
  if (!m) return p;
  const repo = `${m[1]}/${m[2].replace(/\.git$/, "")}`;
  try {
    const info = await gh(`repos/${repo}`);
    if (!info) return { ...p, roto: true };
    const ultima = await gh(`repos/${info.full_name}/releases/latest`).catch(() => null);
    const sistemas = ultima ? SISTEMAS.filter(([, re]) => (ultima.assets || []).some(a => re.test(a.name))).map(([s]) => s) : [];
    return {
      ...p,
      repo: info.full_name,
      estrellas: info.stargazers_count,
      archivado: info.archived || undefined,
      actividad: (info.pushed_at || "").slice(0, 10),
      version: ultima ? { nombre: ultima.tag_name, fecha: (ultima.published_at || "").slice(0, 10), url: ultima.html_url } : undefined,
      sistemas: sistemas.length ? sistemas : undefined
    };
  } catch (e) {
    console.warn("sin datos de", repo, e.message);
    return p;
  }
}

const md = await fetch(`https://raw.githubusercontent.com/${LISTA}/HEAD/README.md`).then(r => {
  if (!r.ok) throw new Error(`No se pudo leer la lista (${r.status})`);
  return r.text();
});
const juegos = analizar(md);
for (const j of juegos) j.proyectos = await Promise.all(j.proyectos.map(enriquecer));

const salida = {
  actualizado: new Date().toISOString().slice(0, 10),
  fuente: { nombre: "awesome-unofficial-pc-ports", autor: "Sebastrion", url: `https://github.com/${LISTA}`, licencia: "MIT" },
  total: juegos.length,
  juegos
};
const destino = "data/ports.json";
const antes = existsSync(destino) ? JSON.parse(readFileSync(destino, "utf8")) : null;
// Si solo cambia la fecha, no se reescribe (así no hay commits vacíos cada semana)
if (antes && JSON.stringify({ ...antes, actualizado: "" }) === JSON.stringify({ ...salida, actualizado: "" })) {
  console.log("Sin cambios.");
} else {
  writeFileSync(destino, JSON.stringify(salida, null, 1) + "\n");
  console.log(`${juegos.length} juegos, ${juegos.reduce((n, j) => n + j.proyectos.length, 0)} proyectos.`);
}
