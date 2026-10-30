/**
 * Latido y vigía (Vercel lo llama una vez al día, ver "crons" en vercel.json).
 * 1. Hace una consulta mínima a Supabase: el plan gratis pausa los proyectos con 7 días sin actividad.
 * 2. Revisa que todo lo que usa la web responda (Steam, RAWG, Xbox, PlayStation y las noticias).
 *    Lo que falle queda anotado en Moderación → "Errores de la web" con el prefijo [Vigía].
 */
import { supa, SUPABASE_URL, SUPABASE_ANON_KEY } from "./_supabase.js";
import { OPENXBL } from "./_xbox.js";
import { tokenPSN } from "./_psn.js";

const conTiempo = (url, opciones = {}) => fetch(url, { ...opciones, signal: AbortSignal.timeout(10000) });

async function revisar(origen) {
  const pruebas = {
    Supabase: async () => { await supa("hall_of_fame?select=id&limit=1"); },
    Steam: async () => {
      if (!process.env.STEAM_API_KEY) throw new Error("falta STEAM_API_KEY en Vercel");
      const r = await conTiempo(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${process.env.STEAM_API_KEY}&steamids=76561197960435530`);
      if (!r.ok) throw new Error(`Steam respondió ${r.status} (¿clave vencida?)`);
    },
    RAWG: async () => {
      if (!process.env.RAWG_API_KEY) throw new Error("falta RAWG_API_KEY en Vercel");
      const r = await conTiempo(`https://api.rawg.io/api/games?key=${process.env.RAWG_API_KEY}&page_size=1`);
      if (!r.ok) throw new Error(`RAWG respondió ${r.status} (¿se acabó la cuota del mes?)`);
    },
    Xbox: async () => {
      if (!process.env.OPENXBL_API_KEY) throw new Error("falta OPENXBL_API_KEY en Vercel");
      const r = await conTiempo(`${OPENXBL}/v2/search/MajorNelson`, { headers: { "X-Authorization": process.env.OPENXBL_API_KEY, Accept: "application/json" } });
      if (r.status === 401 || r.status === 403) throw new Error("OpenXBL rechazó la clave: revisa OPENXBL_API_KEY");
      if (!r.ok && r.status !== 429) throw new Error(`OpenXBL respondió ${r.status}`);
    },
    PlayStation: async () => {
      if (!process.env.PSN_NPSSO) return; // aún sin configurar: no es un fallo
      await tokenPSN();
    },
    Noticias: async () => {
      const r = await conTiempo(`${origen}/borradores/noticias.json`, { cache: "no-store" });
      const d = await r.json();
      const horas = (Date.now() - Date.parse(d.actualizado)) / 3600000;
      if (!Number.isFinite(horas) || horas > 30) throw new Error(`la tarea de noticias no deja borradores desde hace ${Number.isFinite(horas) ? Math.round(horas) + " h" : "mucho"}`);
    }
  };
  const resultados = {};
  await Promise.all(Object.entries(pruebas).map(async ([nombre, prueba]) => {
    try { await prueba(); resultados[nombre] = "ok"; }
    catch (e) { resultados[nombre] = String(e.message || e).slice(0, 300); }
  }));
  return resultados;
}

async function anotar(nombre, motivo) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/registrar_error`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ mensaje: `[Vigía] ${nombre}: ${motivo}`, fuente: "api/latido", pagina: "/vigia", linea: null, navegador: "Vercel cron" })
    });
  } catch (e) { /* si no se puede anotar, al menos queda en los registros de Vercel */ }
}

let ultimaRevision = null; // { hora, resultados }: una revisión manual cada 10 min como mucho

export default async function handler(req, res) {
  // Si CRON_SECRET está configurado en Vercel, solo el cron puede llamarla
  const secreto = process.env.CRON_SECRET;
  if (secreto && req.headers.authorization !== `Bearer ${secreto}`) {
    return res.status(401).json({ ok: false });
  }
  // Sin CRON_SECRET, solo el cron de Vercel dispara las pruebas; ?revisar=1 sirve para mirar a mano (máx. cada 10 min)
  const esCron = /vercel-cron/i.test(String(req.headers["user-agent"] || ""));
  if (!secreto && !esCron && req.query.revisar !== "1") {
    await supa("hall_of_fame?select=id&limit=1").catch(() => {});
    return res.status(200).json({ ok: true, hora: new Date().toISOString() });
  }
  if (!esCron && ultimaRevision && Date.now() - ultimaRevision.hora < 10 * 60 * 1000) {
    return res.status(200).json({ ok: null, desde_cache: true, ...ultimaRevision });
  }
  const origen = `https://${req.headers["x-forwarded-host"] || req.headers.host}`;
  const resultados = await revisar(origen);
  ultimaRevision = { hora: Date.now(), resultados };
  const fallos = Object.entries(resultados).filter(([, v]) => v !== "ok");
  for (const [nombre, motivo] of fallos) {
    console.error("vigía:", nombre, motivo);
    await anotar(nombre, motivo);
  }
  res.setHeader("Cache-Control", "no-store");
  return res.status(fallos.length ? 207 : 200).json({ ok: !fallos.length, hora: new Date().toISOString(), resultados });
}
