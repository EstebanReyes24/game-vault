/**
 * Proxy hacia la API de RAWG (la clave vive en RAWG_API_KEY de Vercel).
 *   /api/rawg?search=elden%20ring&n=6&precise=1   → resultados para el buscador de portadas
 *   /api/rawg?search=elden%20ring&detalle=1       → el juego que mejor coincide, con etiquetas
 *                                                    en español, año de lanzamiento y desarrollador
 */
const GENEROS = {
  action: "Acción", indie: "Indie", adventure: "Aventura", "role-playing-games-rpg": "RPG", strategy: "Estrategia",
  shooter: "Shooter", casual: "Casual", simulation: "Simulación", puzzle: "Puzle", arcade: "Arcade",
  platformer: "Plataformas", racing: "Carreras", "massively-multiplayer": "MMO", sports: "Deportes",
  fighting: "Pelea", family: "Familiar", "board-games": "Juego de mesa", educational: "Educativo", card: "Cartas"
};
// Solo etiquetas útiles y reconocibles (RAWG tiene miles)
const ETIQUETAS = {
  "open-world": "Mundo abierto", horror: "Terror", "survival-horror": "Survival horror", "psychological-horror": "Terror psicológico",
  "co-op": "Cooperativo", "online-co-op": "Cooperativo", "local-co-op": "Cooperativo local", "split-screen": "Pantalla dividida",
  multiplayer: "Multijugador", "souls-like": "Soulslike", soulslike: "Soulslike", "story-rich": "Buena historia",
  sandbox: "Sandbox", roguelike: "Roguelike", roguelite: "Roguelite", metroidvania: "Metroidvania", fps: "FPS",
  "first-person": "Primera persona", "third-person": "Tercera persona", stealth: "Sigilo", survival: "Supervivencia",
  zombies: "Zombis", "sci-fi": "Ciencia ficción", "science-fiction": "Ciencia ficción", fantasy: "Fantasía",
  "dark-fantasy": "Fantasía oscura", "post-apocalyptic": "Postapocalíptico", "hack-and-slash": "Hack and slash",
  competitive: "Competitivo", pvp: "PvP", crafting: "Crafteo", exploration: "Exploración", difficult: "Difícil",
  anime: "Anime", jrpg: "JRPG", "turn-based": "Por turnos", "turn-based-strategy": "Por turnos", tactical: "Táctico",
  "battle-royale": "Battle royale", "pixel-graphics": "Pixel art", cyberpunk: "Cyberpunk", medieval: "Medieval",
  western: "Western", space: "Espacio", superhero: "Superhéroes", "great-soundtrack": "Gran banda sonora",
  "choices-matter": "Decisiones", "base-building": "Construcción", "building": "Construcción", "loot": "Botín",
  "mmorpg": "MMORPG", "moba": "MOBA", "visual-novel": "Novela visual", "rhythm": "Ritmo", "parkour": "Parkour"
};
const limpio = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "");

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "GET") return res.status(405).json({ error: "Método no permitido" });
  const clave = process.env.RAWG_API_KEY;
  if (!clave) return res.status(503).json({ error: "Falta RAWG_API_KEY en Vercel." });

  const busqueda = String(req.query.search || "").trim().slice(0, 100);
  if (busqueda.length < 2) return res.status(400).json({ error: "Búsqueda demasiado corta." });
  const detalle = req.query.detalle === "1";
  const n = detalle ? 5 : Math.min(Math.max(parseInt(req.query.n, 10) || 6, 1), 8);
  const preciso = req.query.precise === "1" ? "&search_precise=true" : "";

  try {
    const r = await fetch(`https://api.rawg.io/api/games?key=${clave}&search=${encodeURIComponent(busqueda)}&page_size=${n}${preciso}`);
    if (!r.ok) return res.status(502).json({ error: `RAWG respondió ${r.status}` });
    const data = await r.json();
    const resultados = data.results || [];
    // Las búsquedas se repiten mucho: el CDN de Vercel las guarda un día
    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");

    if (!detalle) {
      return res.status(200).json({ results: resultados.map(g => ({ name: g.name, background_image: g.background_image, released: g.released })) });
    }

    const objetivo = limpio(busqueda);
    const juego = resultados.find(g => limpio(g.name) === objetivo)
      || resultados.find(g => limpio(g.name).startsWith(objetivo) || objetivo.startsWith(limpio(g.name)))
      || null;
    if (!juego) return res.status(200).json({ encontrado: false });

    const etiquetas = [];
    const sumar = (t) => { if (t && !etiquetas.includes(t)) etiquetas.push(t); };
    (juego.genres || []).forEach(g => sumar(GENEROS[g.slug]));
    (juego.tags || []).filter(t => !t.language || t.language === "eng").forEach(t => sumar(ETIQUETAS[t.slug]));

    // El desarrollador solo viene en la ficha completa del juego
    let desarrollador = null;
    try {
      const f = await fetch(`https://api.rawg.io/api/games/${juego.id}?key=${clave}`);
      if (f.ok) desarrollador = ((await f.json()).developers || []).map(d => d.name).slice(0, 2).join(", ") || null;
    } catch (e) { /* sin desarrollador */ }

    return res.status(200).json({
      encontrado: true,
      nombre: juego.name,
      etiquetas: etiquetas.slice(0, 6),
      anio: juego.released ? Number(juego.released.slice(0, 4)) : null,
      desarrollador,
      duracion: Number(juego.playtime) > 0 ? Number(juego.playtime) : null, // horas promedio según RAWG
      portada: juego.background_image || null
    });
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({ error: "No se pudo consultar RAWG." });
  }
}
