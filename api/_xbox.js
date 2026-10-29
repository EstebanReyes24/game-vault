// Utilidades compartidas para leer el historial de juegos de Xbox vía OpenXBL.
export const OPENXBL = "https://api.xbl.io";

/** Pide los títulos de la cuenta dueña de `clave` y los deja en el formato de la web. */
export async function titulosXbox(clave, esApp) {
  const headers = { "X-Authorization": clave, Accept: "application/json", "Accept-Language": "es-ES" };
  if (esApp) headers["X-Contract"] = "100"; // claves obtenidas con "Iniciar sesión con Xbox"
  const r = await fetch(`${OPENXBL}/v2/titles`, { headers });
  if (r.status === 401 || r.status === 403) { const e = new Error("OpenXBL rechazó el acceso."); e.status = 401; throw e; }
  if (r.status === 429) { const e = new Error("OpenXBL tiene un límite de consultas por hora. Prueba más tarde."); e.status = 429; throw e; }
  if (!r.ok) { const e = new Error(`OpenXBL respondió ${r.status}.`); e.status = 502; throw e; }
  const data = await r.json();
  const titulos = data?.titles || data?.content?.titles || [];
  return titulos
    .filter(t => !t.type || t.type === "Game")
    .map(t => ({
      titulo: t.name,
      portada: String(t.displayImage || "").replace(/^http:/, "https:"),
      progreso: Number(t.achievement?.progressPercentage) || 0,
      logros: Number(t.achievement?.currentAchievements) || 0,
      logrosTotal: Number(t.achievement?.totalAchievements) || 0,
      ultimaVez: t.titleHistory?.lastTimePlayed || null
    }))
    .filter(t => t.titulo);
}
