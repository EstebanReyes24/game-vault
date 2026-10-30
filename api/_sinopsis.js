/**
 * Sinopsis de un juego sacada de Wikipedia (primero en español, si no en inglés).
 * Prefiere el comienzo de la sección de argumento (la premisa, sin destripar el final);
 * si el artículo no la tiene, usa la introducción. El texto es CC BY-SA: se muestra con enlace al artículo.
 */
const UA = { "User-Agent": "PaindexVault/1.0 (https://game-vault-beige.vercel.app)" };
const limpio = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "");
const SECCIONES = {
  es: /^(argumento|sinopsis|trama|historia|premisa|argumento y personajes|historia y ambientacion)$/,
  en: /^(plot|synopsis|story|premise|setting and plot|plot and setting|story and setting)$/
};
const PALABRA = { es: /videojuego|juego de/i, en: /video game/i };

// Corta en el último punto antes del máximo
function recortar(texto, max) {
  const t = texto.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const corte = t.slice(0, max);
  const punto = corte.lastIndexOf(". ");
  return punto > max * 0.4 ? corte.slice(0, punto + 1) : corte.replace(/\s\S*$/, "") + "…";
}

async function wiki(idioma, params) {
  const url = `https://${idioma}.wikipedia.org/w/api.php?format=json&formatversion=2&origin=*&${params}`;
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(`Wikipedia ${r.status}`);
  return r.json();
}

async function buscarEn(idioma, titulo) {
  const objetivo = limpio(titulo);
  const q = encodeURIComponent(`${titulo} ${idioma === "es" ? "videojuego" : "video game"}`);
  const d = await wiki(idioma, `action=query&generator=search&gsrsearch=${q}&gsrlimit=6&prop=extracts|info&exintro=1&explaintext=1&exlimit=6&inprop=url`);
  const paginas = (d.query?.pages || []).sort((a, b) => a.index - b.index);
  const base = (p) => limpio(p.title.replace(/\s*\([^)]*\)\s*$/, ""));
  const esJuego = (p) => PALABRA[idioma].test(p.extract || "");
  const elegida = paginas.find(p => base(p) === objetivo && esJuego(p))
    || paginas.find(p => (base(p).startsWith(objetivo) || objetivo.startsWith(base(p))) && base(p).length >= 3 && esJuego(p));
  if (!elegida) return null;

  // Artículo entero en texto plano para encontrar la sección de argumento
  let premisa = "";
  try {
    const t = await wiki(idioma, `action=query&prop=extracts&explaintext=1&exsectionformat=wiki&pageids=${elegida.pageid}`);
    const lineas = String(t.query?.pages?.[0]?.extract || "").split("\n");
    let dentro = false, nivel = 0;
    const parrafos = [];
    for (const linea of lineas) {
      const h = linea.match(/^(=+)\s*(.+?)\s*=+\s*$/);
      if (h) {
        if (dentro && h[1].length <= nivel) break; // terminó la sección
        if (!dentro && SECCIONES[idioma].test(limpioTitulo(h[2]))) { dentro = true; nivel = h[1].length; }
        continue;
      }
      if (dentro && linea.trim().length > 60) parrafos.push(linea.trim());
      if (parrafos.join(" ").length > 500) break;
    }
    premisa = parrafos.join(" ");
  } catch (e) { /* solo la introducción */ }

  const texto = recortar(premisa || elegida.extract || "", 620);
  if (texto.length < 60) return null;
  return { texto, idioma, fuente: "Wikipedia", url: elegida.fullurl, articulo: elegida.title, de: premisa ? "argumento" : "introduccion" };
}
const limpioTitulo = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

export async function sinopsis(titulo) {
  for (const idioma of ["es", "en"]) {
    try { const r = await buscarEn(idioma, titulo); if (r) return r; } catch (e) { /* probar el siguiente */ }
  }
  return null;
}
