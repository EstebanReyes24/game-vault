/**
 * Importar desde Xbox (beta) a través de OpenXBL (https://xbl.io).
 * Cada persona usa SU propia clave de OpenXBL: la manda en el cuerpo de la
 * petición, esta función la usa una sola vez para leer su historial de juegos
 * y no la guarda en ningún sitio.
 *   POST /api/xbox   { "clave": "..." }
 */
const BASE = "https://xbl.io/api/v2";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

  let cuerpo = req.body;
  if (typeof cuerpo === "string") { try { cuerpo = JSON.parse(cuerpo); } catch (e) { cuerpo = {}; } }
  const clave = String(cuerpo?.clave || "").trim();
  if (!/^[A-Za-z0-9-]{20,80}$/.test(clave)) {
    return res.status(400).json({ error: "Pega tu clave de OpenXBL (la encuentras en xbl.io → Profile → API Keys)." });
  }

  try {
    const r = await fetch(`${BASE}/titles`, {
      headers: { "X-Authorization": clave, Accept: "application/json", "Accept-Language": "es-ES" }
    });
    if (r.status === 401 || r.status === 403) return res.status(401).json({ error: "OpenXBL rechazó la clave. Revisa que la copiaste completa." });
    if (r.status === 429) return res.status(429).json({ error: "OpenXBL tiene un límite de consultas por hora. Prueba más tarde." });
    if (!r.ok) return res.status(502).json({ error: `OpenXBL respondió ${r.status}.` });
    const data = await r.json();
    // OpenXBL a veces envuelve la respuesta en "content"
    const titulos = (data?.titles || data?.content?.titles || []);
    const juegos = titulos
      .filter(t => !t.type || t.type === "Game")
      .map(t => ({
        titulo: t.name,
        portada: /^https:\/\//.test(t.displayImage || "") ? t.displayImage : (t.displayImage || "").replace(/^http:/, "https:"),
        progreso: Number(t.achievement?.progressPercentage) || 0,
        logros: Number(t.achievement?.currentAchievements) || 0,
        logrosTotal: Number(t.achievement?.totalAchievements) || 0,
        ultimaVez: t.titleHistory?.lastTimePlayed || null,
        dispositivos: t.devices || []
      }))
      .filter(t => t.titulo);
    return res.status(200).json({ juegos });
  } catch (e) {
    return res.status(502).json({ error: "No se pudo conectar con OpenXBL." });
  }
}
