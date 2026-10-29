/**
 * Logros de un juego con su fecha de desbloqueo.
 *   GET /api/logros?fuente=steam&steamid=7656…&appid=1145360
 *   GET /api/logros?fuente=xbox&xuid=2533…&titleId=1144039928
 * Respuesta: { items: [{ id, nombre, desc, icono, logrado, fecha, rareza }] }
 * Requiere que el perfil (o los detalles de juego) sean públicos.
 */
import { OPENXBL } from "./_xbox.js";

const STEAM = "https://api.steampowered.com";

async function json(url, opciones) {
  const r = await fetch(url, opciones);
  const cuerpo = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, cuerpo };
}

async function logrosSteam(steamid, appid) {
  const clave = process.env.STEAM_API_KEY;
  if (!clave) throw Object.assign(new Error("Falta STEAM_API_KEY en el servidor."), { status: 503 });
  const [jugador, esquema, global] = await Promise.all([
    json(`${STEAM}/ISteamUserStats/GetPlayerAchievements/v1/?key=${clave}&steamid=${steamid}&appid=${appid}&l=spanish`),
    json(`${STEAM}/ISteamUserStats/GetSchemaForGame/v2/?key=${clave}&appid=${appid}&l=spanish`),
    json(`${STEAM}/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/?gameid=${appid}`)
  ]);
  const ps = jugador.cuerpo?.playerstats;
  if (!jugador.ok || ps?.success === false) {
    const msg = String(ps?.error || "");
    if (/no stats/i.test(msg)) return [];
    if (jugador.status === 403 || /private/i.test(msg)) throw Object.assign(new Error("Los detalles de juego de esta cuenta de Steam son privados."), { status: 403 });
    throw Object.assign(new Error("Steam no devolvió los logros."), { status: 502 });
  }
  const meta = new Map((esquema.cuerpo?.game?.availableGameStats?.achievements || []).map(a => [a.name, a]));
  const rareza = new Map((global.cuerpo?.achievementpercentages?.achievements || []).map(a => [a.name, Number(a.percent)]));
  return (ps.achievements || []).map(a => {
    const m = meta.get(a.apiname) || {};
    const logrado = a.achieved === 1;
    return {
      id: a.apiname,
      nombre: m.displayName || a.name || a.apiname,
      desc: m.description || a.description || (m.hidden ? "Logro oculto" : ""),
      icono: (logrado ? m.icon : m.icongray) || m.icon || null,
      logrado,
      fecha: logrado && a.unlocktime ? new Date(a.unlocktime * 1000).toISOString() : null,
      rareza: Number.isFinite(rareza.get(a.apiname)) ? Math.round(rareza.get(a.apiname) * 10) / 10 : null
    };
  });
}

async function logrosXbox(xuid, titleId) {
  const clave = process.env.OPENXBL_API_KEY;
  if (!clave) throw Object.assign(new Error("Falta OPENXBL_API_KEY en el servidor."), { status: 503 });
  const r = await json(`${OPENXBL}/v2/achievements/player/${xuid}/${titleId}`, {
    headers: { "X-Authorization": clave, Accept: "application/json", "Accept-Language": "es-ES" }
  });
  if (r.status === 429) throw Object.assign(new Error("Hay muchas consultas a Xbox ahora mismo. Prueba en un rato."), { status: 429 });
  if (r.status === 404) return [];
  if (!r.ok) throw Object.assign(new Error(r.status === 401 || r.status === 403 ? "El historial de logros de esta cuenta de Xbox es privado." : `OpenXBL respondió ${r.status}.`), { status: r.status === 401 || r.status === 403 ? 403 : 502 });
  const lista = r.cuerpo?.achievements || r.cuerpo?.content?.achievements || [];
  return lista.map(a => {
    // Xbox One / Series (progressState) o Xbox 360 (unlocked)
    const logrado = a.progressState ? a.progressState === "Achieved" : Boolean(a.unlocked);
    const fechaRaw = a.progression?.timeUnlocked || a.timeUnlocked || null;
    const fecha = logrado && fechaRaw && !String(fechaRaw).startsWith("0001") ? new Date(fechaRaw).toISOString() : null;
    const icono = (a.mediaAssets || []).find(m => /icon/i.test(m.type || m.name || ""))?.url || (a.mediaAssets || [])[0]?.url || null;
    const rareza = Number(a.rarity?.currentPercentage);
    return {
      id: String(a.id),
      nombre: a.name || "Logro",
      desc: (logrado ? a.description : a.lockedDescription || a.description) || (a.isSecret ? "Logro secreto" : ""),
      icono: icono ? String(icono).replace(/^http:/, "https:") : null,
      logrado,
      fecha,
      rareza: Number.isFinite(rareza) ? rareza : null
    };
  });
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "GET") return res.status(405).json({ error: "Método no permitido" });
  const { fuente, steamid, appid, xuid, titleId } = req.query;
  try {
    let items;
    if (fuente === "steam") {
      if (!/^[0-9]{17}$/.test(String(steamid)) || !/^[0-9]{1,10}$/.test(String(appid))) return res.status(400).json({ error: "Faltan datos de Steam." });
      items = await logrosSteam(steamid, appid);
    } else if (fuente === "xbox") {
      if (!/^[0-9]{1,20}$/.test(String(xuid)) || !/^[0-9]{1,12}$/.test(String(titleId))) return res.status(400).json({ error: "Faltan datos de Xbox." });
      items = await logrosXbox(xuid, titleId);
    } else {
      return res.status(400).json({ error: "Fuente no válida." });
    }
    // Los logros cambian poco: el CDN guarda la respuesta 30 minutos
    res.setHeader("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=86400");
    return res.status(200).json({ items: items.slice(0, 1500) });
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(e.status || 502).json({ error: e.message || "No se pudieron leer los logros." });
  }
}
