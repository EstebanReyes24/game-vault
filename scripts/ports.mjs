/**
 * Genera data/ports.json: los ports nativos (PC y Android) de juegos clásicos.
 * Fuentes:
 *  - OpenPortsGames (openportsgames.com/api/ports.json), datos CC BY 4.0. Se excluyen las fichas
 *    importadas de otros índices (GameWave, PortsDR) y las que distribuyen los archivos del juego.
 *  - awesome-unofficial-pc-ports de Sebastrion (MIT): marca los ports recomendados (⭐) y añade los que falten.
 *  - API GraphQL de GitHub: estrellas, última versión y si el proyecto está archivado.
 * Cambios respecto a las fuentes: se agrupan por juego, se resumen las descripciones y se añaden datos de GitHub.
 * Lo ejecuta cada semana .github/workflows/ports.yml (con GITHUB_TOKEN).
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";

const TOKEN = process.env.GITHUB_TOKEN || "";
const OPG = "https://openportsgames.com/api/ports.json";
const LISTA = "Sebastrion/awesome-unofficial-pc-ports";
const PLATAFORMAS = ["windows", "linux", "macos", "android"];

const slug = (t) => String(t).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/['’`´]/g, "")
  .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
const limpiarMd = (t) => String(t).replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
  .replace(/[*_`]/g, "").replace(/📺\s*YouTube Tutorial/gi, "").replace(/\s+/g, " ").trim();
const recortar = (t, n) => { const s = String(t || "").replace(/\s+/g, " ").trim(); if (s.length <= n) return s; const c = s.slice(0, n); const p = c.lastIndexOf(". "); return p > n * 0.5 ? c.slice(0, p + 1) : c.replace(/\s\S*$/, "") + "…"; };
const repoDe = (url) => { const m = String(url).match(/^(?:https?:\/\/)?github\.com\/([^/\s]+)\/([^/\s#?]+)/i); return m ? `${m[1]}/${m[2].replace(/\.git$/, "")}`.toLowerCase() : null; };
const conHttps = (u) => (/^https?:\/\//.test(u) ? u.replace(/^http:/, "https:") : `https://${u}`);

const SISTEMAS = {
  "Nintendo 64": "Nintendo 64", "PlayStation": "PlayStation", "PlayStation 2": "PlayStation 2", "PlayStation 3": "PlayStation 3",
  "PlayStation 4": "PlayStation 4", "PlayStation Portable": "PSP", "Xbox": "Xbox", "Xbox 360": "Xbox 360", "GameCube": "GameCube",
  "Nintendo GameCube": "GameCube", "Wii": "Wii", "Wii U": "Wii U", "Nintendo Switch": "Switch", "Nintendo DS": "Nintendo DS",
  "Nintendo 3DS": "Nintendo 3DS", "Game Boy": "Game Boy", "Game Boy Color": "Game Boy Color", "Game Boy Advance": "Game Boy Advance",
  "Super Nintendo": "Super Nintendo", "Nintendo Entertainment System": "NES", "Sega Mega Drive / Genesis": "Mega Drive",
  "Dreamcast": "Dreamcast", "Sega Saturn": "Saturn", "Arcade": "Arcade", "MS-DOS": "MS-DOS", "Windows": "PC (Windows)"
};

// ---------- 1. OpenPortsGames ----------
async function openPorts() {
  const d = await fetch(OPG, { headers: { "User-Agent": "paindex-vault (+https://game-vault-beige.vercel.app/ports)" } }).then(r => {
    if (!r.ok) throw new Error(`OpenPortsGames respondió ${r.status}`);
    return r.json();
  });
  return (d.ports || []).filter(p =>
    p.kind === "game"
    && (p.platforms || []).some(x => PLATAFORMAS.includes(x))
    && !p.warning                                            // distribuye los archivos del juego
    && !/gamewave|portsdr/i.test(JSON.stringify(p))          // fichas importadas sin licencia CC BY
    && !/\b(outdated|obsoleto|deprecated)\b/i.test(p.title)
    && (p.sources || []).length
  ).map(p => ({
    juego: p.game,
    sistema: SISTEMAS[(p.originalSystems || [])[0]] || ((p.originalSystems || [])[0] && (p.originalSystems || [])[0] !== "Unknown" ? p.originalSystems[0] : "Otros"),
    nombre: p.title,
    url: conHttps(p.sources[0]),
    tipo: p.portType,
    estado: p.status,
    verificado: p.verified || undefined,
    plataformas: (p.platforms || []).filter(x => PLATAFORMAS.includes(x)),
    version: p.release?.version ? { nombre: p.release.version, fecha: p.release.date || undefined } : undefined,
    descripcion: recortar(p.notesEs || p.summaryEs || p.notes || p.summary || "", 220),
    ficha: `https://openportsgames.com/es/ports/${p.id}/`,
    // Portada de la ficha (Wikipedia, Steam, libretro…); las generadas por OpenPortsGames no se usan
    _portada: /^https:\/\/(?!(www\.)?openportsgames\.com\/)[^\s"'<>]+$/.test(p.cover?.src || "") ? p.cover.src : undefined
  }));
}

// ---------- 2. awesome-unofficial-pc-ports ----------
function analizarLista(md) {
  const SECC = { nintendo: "Nintendo", playstation: "PlayStation", xbox: "Xbox", sega: "SEGA", indie: "Otros" };
  const salida = [];
  let seccion = null, juego = null, actual = null, verTambien = false;
  const cerrar = () => { if (actual) { actual.descripcion = recortar(limpiarMd(actual._t.join(" ")), 220); delete actual._t; actual = null; } };
  for (const l of md.split("\n")) {
    const h2 = l.match(/^##\s+(.+)$/);
    if (h2) { cerrar(); const k = h2[1].toLowerCase().replace(/[^a-z0-9]/g, ""); seccion = Object.keys(SECC).find(x => k.includes(x)) || null; juego = null; continue; }
    if (!seccion) continue;
    const s = l.match(/<summary>(?:<strong>)?([^<]+)/);
    if (s) { cerrar(); juego = limpiarMd(s[1]); verTambien = false; continue; }
    if (!juego) continue;
    if (/^<\/details>/.test(l)) { cerrar(); juego = null; continue; }
    const h3 = l.match(/^###\s+(⭐\s*)?\[([^\]]+)\]\(([^)\s]+)\)/);
    if (h3) { cerrar(); actual = { juego, familia: SECC[seccion], nombre: limpiarMd(h3[2]), url: h3[3], recomendado: !!h3[1], _t: [] }; salida.push(actual); verTambien = false; continue; }
    if (/^####\s+/.test(l)) { cerrar(); verTambien = /also see|see also/i.test(l); continue; }
    const v = l.match(/^\s*[-*]\s+\[([^\]]+)\]\(([^)\s]+)\)\s*[–—-]?\s*(.*)$/);
    if (v && (verTambien || !actual)) { cerrar(); salida.push({ juego, familia: SECC[seccion], nombre: limpiarMd(v[1]), url: v[2], recomendado: false, descripcion: recortar(limpiarMd(v[3]), 220) }); continue; }
    if (actual && l.trim() && !/^---/.test(l)) actual._t.push(l);
  }
  cerrar();
  return salida;
}

// ---------- 3. GitHub (100 repos por consulta) ----------
async function datosGitHub(repos) {
  const datos = {};
  if (!TOKEN) return datos;
  const lista = [...repos];
  for (let i = 0; i < lista.length; i += 80) {
    const lote = lista.slice(i, i + 80);
    const q = lote.map((r, n) => {
      const [o, nom] = r.split("/");
      return `r${n}: repository(owner: ${JSON.stringify(o)}, name: ${JSON.stringify(nom)}) { nameWithOwner stargazerCount isArchived pushedAt latestRelease { tagName publishedAt url } }`;
    }).join("\n");
    try {
      const r = await fetch("https://api.github.com/graphql", {
        method: "POST",
        headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", "User-Agent": "paindex-vault" },
        body: JSON.stringify({ query: `query { ${q} }` })
      }).then(x => x.json());
      lote.forEach((repo, n) => { const v = r.data?.[`r${n}`]; if (v) datos[repo] = v; });
    } catch (e) { console.warn("GitHub:", e.message); }
  }
  return datos;
}

// ---------- Unir todo ----------
const [opg, md] = await Promise.all([
  openPorts().catch(e => { console.warn(e.message); return []; }),
  fetch(`https://raw.githubusercontent.com/${LISTA}/HEAD/README.md`).then(r => (r.ok ? r.text() : "")).catch(() => "")
]);
if (!opg.length && !md) throw new Error("No se pudo leer ninguna fuente; se deja la lista anterior.");
const lista = analizarLista(md);
const recomendados = new Set(lista.filter(p => p.recomendado).map(p => repoDe(p.url)).filter(Boolean));

const proyectos = [...opg];
const yaEsta = new Set(opg.map(p => repoDe(p.url)).filter(Boolean));
for (const p of lista) {
  const repo = repoDe(p.url);
  if (repo && yaEsta.has(repo)) continue;
  proyectos.push({ juego: p.juego, sistema: p.familia, nombre: p.nombre, url: p.url, descripcion: p.descripcion, plataformas: [] });
  if (repo) yaEsta.add(repo);
}

const gh = await datosGitHub(new Set(proyectos.map(p => repoDe(p.url)).filter(Boolean)));
const ORDEN_ESTADO = { stable: 3, beta: 2, alpha: 1 };
const porJuego = new Map();
for (const p of proyectos) {
  const repo = repoDe(p.url);
  const g = repo ? gh[repo] : null;
  if (g?.latestRelease) p.version = { nombre: g.latestRelease.tagName, fecha: g.latestRelease.publishedAt?.slice(0, 10), url: g.latestRelease.url };
  else if (p.version && repo) p.version.url = `https://github.com/${repo}/releases`;
  if (g) { p.estrellas = g.stargazerCount; if (g.isArchived) p.archivado = true; p.actividad = g.pushedAt?.slice(0, 10); }
  if (repo && recomendados.has(repo)) p.recomendado = true;
  const clave = slug(p.juego);
  if (!clave) continue;
  if (!porJuego.has(clave)) porJuego.set(clave, { juego: p.juego, slug: clave, sistema: p.sistema, proyectos: [] });
  const j = porJuego.get(clave);
  if (j.sistema === "Otros" && p.sistema !== "Otros") j.sistema = p.sistema;
  if (!j.portada && p._portada) j.portada = p._portada;
  const { juego, sistema, _portada, ...resto } = p;
  j.proyectos.push(resto);
}
const puntos = (p) => (p.recomendado ? 1e7 : 0) + (p.verificado ? 1e6 : 0) + (ORDEN_ESTADO[p.estado] || 0) * 1e5 + Math.min(p.estrellas || 0, 99999) - (p.archivado ? 5e6 : 0);
const juegos = [...porJuego.values()];
juegos.forEach(j => j.proyectos.sort((a, b) => puntos(b) - puntos(a)));
juegos.sort((a, b) => puntos(b.proyectos[0]) - puntos(a.proyectos[0]) || a.juego.localeCompare(b.juego));

const salida = {
  actualizado: new Date().toISOString().slice(0, 10),
  fuentes: [
    { nombre: "OpenPortsGames", url: "https://openportsgames.com/", licencia: "CC BY 4.0", licenciaUrl: "https://creativecommons.org/licenses/by/4.0/" },
    { nombre: "awesome-unofficial-pc-ports", autor: "Sebastrion", url: `https://github.com/${LISTA}`, licencia: "MIT" }
  ],
  total: juegos.length,
  proyectos: proyectos.length,
  juegos
};
// Índice ligero para la página de cada juego: slug → [n.º de ports, nombre del mejor, solo Android]
const indice = {};
for (const j of juegos) {
  const soloAndroid = j.proyectos.every(p => (p.plataformas || []).length === 1 && p.plataformas[0] === "android");
  indice[j.slug.replace(/-/g, "")] = [j.proyectos.length, (j.proyectos.find(p => p.recomendado) || j.proyectos[0]).nombre, soloAndroid ? 1 : 0, j.slug];
}
writeFileSync("data/ports-indice.json", JSON.stringify(indice) + "\n");

const destino = "data/ports.json";
const antes = existsSync(destino) ? JSON.parse(readFileSync(destino, "utf8")) : null;
if (antes && JSON.stringify({ ...antes, actualizado: "" }) === JSON.stringify({ ...salida, actualizado: "" })) {
  console.log("Sin cambios.");
} else {
  writeFileSync(destino, JSON.stringify(salida) + "\n");
  console.log(`${juegos.length} juegos, ${proyectos.length} proyectos, ${Object.keys(gh).length} con datos de GitHub.`);
}
