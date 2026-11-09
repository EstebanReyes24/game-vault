/**
 * Respaldo de /api/rawg cuando RAWG no responde: primero la tienda de Steam y, si el juego
 * no está allí (exclusivos de consola), Wikipedia. Devuelve los mismos campos que RAWG.
 */
const UA = { "User-Agent": "PaindexVault/1.0 (https://game-vault-beige.vercel.app)", Accept: "application/json" };
const limpio = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[™®©]/g, "").replace(/[^a-z0-9]+/g, "");
const json = (url, ms = 6000) => fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) }).then(r => (r.ok ? r.json() : null));

// Géneros de Steam (en español) → las mismas etiquetas que usa la web
const GENEROS_STEAM = {
  "accion": "Acción", "aventura": "Aventura", "rol": "RPG", "estrategia": "Estrategia", "simuladores": "Simulación", "simulacion": "Simulación",
  "indie": "Indie", "casual": "Casual", "carreras": "Carreras", "deportes": "Deportes", "multijugador masivo": "MMO"
};
const CATEGORIAS_STEAM = { 1: "Multijugador", 9: "Cooperativo", 38: "Cooperativo", 39: "Cooperativo local", 24: "Pantalla dividida", 49: "PvP" };

// La carátula ancha vive en la misma carpeta que la miniatura que da el buscador
const caratulaSteam = (item) => String(item.tiny_image || "").replace(/capsule_[^/?]+\.jpg/, "header.jpg").replace(/^http:/, "https:")
  || `https://cdn.cloudflare.steamstatic.com/steam/apps/${item.id}/header.jpg`;

async function buscarSteam(q) {
  const d = await json(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q)}&l=english&cc=US`);
  return (d?.items || []).filter(i => i.type === "app");
}

async function buscarWikipedia(q, n) {
  for (const idioma of ["es", "en"]) {
    const palabra = idioma === "es" ? "videojuego" : "video game";
    const d = await json(`https://${idioma}.wikipedia.org/w/api.php?format=json&formatversion=2&action=query&generator=search&gsrsearch=${encodeURIComponent(`${q} ${palabra}`)}&gsrlimit=${Math.max(n, 6)}&prop=pageimages|extracts&piprop=thumbnail&pithumbsize=640&pilicense=any&exintro=1&explaintext=1&exlimit=${Math.max(n, 6)}`).catch(() => null);
    const paginas = (d?.query?.pages || []).sort((a, b) => a.index - b.index)
      .filter(p => new RegExp(palabra, "i").test(p.extract || ""))
      .map(p => ({
        name: p.title.replace(/\s*\([^)]*\)\s*$/, ""),
        background_image: /^https:/.test(p.thumbnail?.source || "") ? p.thumbnail.source : null,
        released: ((p.extract || "").match(/\b(19[7-9]\d|20[0-4]\d)\b/) || [])[1] ? `${(p.extract.match(/\b(19[7-9]\d|20[0-4]\d)\b/))[1]}-01-01` : null
      }));
    if (paginas.length) return paginas;
  }
  return [];
}

/** Resultados para el buscador de portadas: [{ name, background_image, released }] */
export async function buscarRespaldo(q, n) {
  const steam = await buscarSteam(q).catch(() => []);
  const salida = steam.slice(0, n).map(i => ({ name: i.name, background_image: caratulaSteam(i), released: null }));
  if (salida.length < n) {
    const wiki = await buscarWikipedia(q, n).catch(() => []);
    const ya = new Set(salida.map(s => limpio(s.name)));
    wiki.filter(w => w.background_image && !ya.has(limpio(w.name))).slice(0, n - salida.length).forEach(w => salida.push(w));
  }
  return salida;
}

/** El juego que mejor coincide, con los campos de ?detalle=1 */
export async function detalleRespaldo(q) {
  const objetivo = limpio(q);
  const coincide = (nombre) => { const x = limpio(nombre); return x === objetivo || (x.startsWith(objetivo) && /^(19|20)\d\d$/.test(x.slice(objetivo.length))); };

  const steam = await buscarSteam(q).catch(() => []);
  const item = steam.find(i => coincide(i.name));
  if (item) {
    const base = { encontrado: true, nombre: item.name, etiquetas: [], anio: null, desarrollador: null, duracion: null, portada: caratulaSteam(item), fuente: "steam" };
    try {
      const d = (await json(`https://store.steampowered.com/api/appdetails?appids=${item.id}&l=spanish&cc=US`))?.[item.id]?.data;
      if (d) {
        const etiquetas = [];
        const sumar = (t) => { if (t && !etiquetas.includes(t)) etiquetas.push(t); };
        (d.genres || []).forEach(g => sumar(GENEROS_STEAM[String(g.description || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")]));
        (d.categories || []).forEach(c => sumar(CATEGORIAS_STEAM[c.id]));
        base.etiquetas = etiquetas.slice(0, 6);
        base.anio = Number((String(d.release_date?.date || "").match(/\b(19|20)\d\d\b/) || [])[0]) || null;
        base.desarrollador = (d.developers || []).slice(0, 2).join(", ") || null;
        if (/^https:/.test(d.header_image || "")) base.portada = d.header_image;
      }
    } catch (e) { /* con lo básico basta */ }
    return base;
  }

  const wiki = await buscarWikipedia(q, 6).catch(() => []);
  const w = wiki.find(x => coincide(x.name));
  if (w) return { encontrado: true, nombre: w.name, etiquetas: [], anio: w.released ? Number(w.released.slice(0, 4)) : null, desarrollador: null, duracion: null, portada: w.background_image, fuente: "wikipedia" };
  return { encontrado: false };
}
