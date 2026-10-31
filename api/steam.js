/**
 * Proxy serverless (Vercel) hacia la Web API de Steam.
 *
 * La API key NUNCA va en el código: se lee de la variable de entorno
 * STEAM_API_KEY (Vercel → Project → Settings → Environment Variables).
 *
 * Acepta:
 *   ?steamid=76561198000000000            (SteamID64, 17 dígitos)
 *   ?steamid=https://steamcommunity.com/profiles/76561198000000000
 *   ?steamid=https://steamcommunity.com/id/mi_alias   (URL personalizada)
 *   ?steamid=mi_alias
 *   ?jugadores=1&titulo=Elden%20Ring   → cuánta gente lo está jugando ahora mismo en Steam (no usa la key)
 */

const STEAM_ID64 = /^7656119\d{10}$/;
const VANITY = /^[A-Za-z0-9_-]{2,32}$/;

function parseInput(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;

  const profileMatch = value.match(/steamcommunity\.com\/profiles\/(\d{17})/i);
  if (profileMatch) return { steamid: profileMatch[1] };

  const vanityMatch = value.match(/steamcommunity\.com\/id\/([^/?#]+)/i);
  if (vanityMatch) return VANITY.test(vanityMatch[1]) ? { vanity: vanityMatch[1] } : null;

  if (STEAM_ID64.test(value)) return { steamid: value };
  if (VANITY.test(value)) return { vanity: value };
  return null;
}

async function steamGet(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const err = new Error(`Steam respondió con estado ${res.status}.`);
    err.status = res.status;
    throw err;
  }
  try {
    return JSON.parse(await res.text());
  } catch {
    const err = new Error('Steam no devolvió un JSON válido. Puede haber saturación temporal en sus servidores.');
    err.status = 502;
    throw err;
  }
}

import { limitePorIp, DEMASIADO } from "./_supabase.js";

const limpio = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[™®©]/g, "").replace(/[^a-z0-9]+/g, "");

// Jugadores en este momento: se busca el juego en la tienda de Steam por su nombre exacto
async function jugadoresAhora(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (!limitePorIp(req, "steam-jugadores", 120, 60)) return res.status(429).json(DEMASIADO);
  const titulo = String(req.query.titulo || "").trim().slice(0, 120);
  if (titulo.length < 2) return res.status(400).json({ error: "Falta el título." });
  try {
    const conTiempo = { signal: AbortSignal.timeout(6000), headers: { Accept: 'application/json' } };
    const busqueda = await fetch(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(titulo)}&l=spanish&cc=US`, conTiempo).then(r => r.json());
    const objetivo = limpio(titulo);
    // Exacto, o la versión de PC con apellido ("Ghost of Tsushima DIRECTOR'S CUT", "… Remastered")
    const EDICION = /^(directorscut|remastered|remaster|definitiveedition|completeedition|gameoftheyearedition|goty|gotyedition|enhancededition|deluxeedition|ultimateedition|royaledition|specialedition|pcport|digitaldeluxe)$/;
    const apps = (busqueda.items || []).filter(i => i.type === "app");
    const juego = apps.find(i => limpio(i.name) === objetivo)
      || apps.find(i => { const n = limpio(i.name); return n.startsWith(objetivo) && EDICION.test(n.slice(objetivo.length)); });
    if (!juego) {
      res.setHeader('Cache-Control', 'public, s-maxage=86400');
      return res.status(200).json({ enSteam: false });
    }
    const d = await fetch(`https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${juego.id}`, conTiempo).then(r => r.json());
    const ahora = d?.response?.result === 1 ? Number(d.response.player_count) : null;
    // La cifra cambia cada pocos minutos: el CDN la guarda 5
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({ enSteam: true, appid: juego.id, nombre: juego.name, jugadores: ahora, hora: new Date().toISOString() });
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: "Steam no respondió." });
  }
}

export default async function handler(req, res) {
  if (req.query.jugadores === "1") return jugadoresAhora(req, res);
  if (!limitePorIp(req, "steam", 20, 60)) return res.status(429).json(DEMASIADO);
  res.setHeader('Content-Type', 'application/json');
  // Sin Access-Control-Allow-Origin: el endpoint solo lo usa esta misma web.
  // Así nadie puede usarlo desde otros sitios como proxy gratis de Steam.
  res.setHeader('Cache-Control', 'private, no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const STEAM_KEY = process.env.STEAM_API_KEY;
  if (!STEAM_KEY) {
    return res.status(500).json({ error: 'El servidor no tiene configurada la clave de Steam (STEAM_API_KEY).' });
  }

  const parsed = parseInput(req.query.steamid);
  if (!parsed) {
    return res.status(400).json({ error: 'Introduce tu SteamID64 (17 dígitos) o la URL de tu perfil de Steam.' });
  }

  try {
    let steamid = parsed.steamid;

    if (!steamid) {
      const vanityUrl = `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${STEAM_KEY}&vanityurl=${encodeURIComponent(parsed.vanity)}`;
      const vanityData = await steamGet(vanityUrl);
      if (vanityData?.response?.success !== 1 || !STEAM_ID64.test(vanityData.response.steamid || '')) {
        return res.status(404).json({ error: 'No encontramos un perfil de Steam con ese nombre personalizado.' });
      }
      steamid = vanityData.response.steamid;
    }

    const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${STEAM_KEY}&steamid=${steamid}&include_appinfo=true&include_played_free_games=true&format=json`;
    const data = await steamGet(url);
    return res.status(200).json({ steamid, response: { games: data?.response?.games || [] } });
  } catch (err) {
    const status = err.status && err.status >= 400 ? err.status : 502;
    return res.status(status).json({
      error: err.status === 401 || err.status === 403
        ? 'Steam rechazó la consulta. Revisa que tu perfil y tus juegos estén en público.'
        : err.message || 'No se pudo conectar con Steam.'
    });
  }
}
