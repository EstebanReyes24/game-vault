/**
 * Importar desde Xbox.
 *   GET  /api/xbox?gt=MiGamertag   → con la clave de Paindex Vault (OPENXBL_API_KEY).
 *        Requiere que el historial de juegos del usuario sea público en Xbox.
 *   POST /api/xbox { "clave": "..." } → con la clave personal de OpenXBL del usuario (respaldo).
 */
import { titulosXbox, buscarGamertag } from "./_xbox.js";
import { usuarioConSesion, SIN_SESION, permitirUso, DEMASIADO, limitePorIp } from "./_supabase.js";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");

  if (req.method === "GET") {
    // La búsqueda por gamertag gasta la cuota de Paindex: solo con sesión iniciada
    if (!(await usuarioConSesion(req))) { res.setHeader("Cache-Control", "no-store"); return res.status(401).json(SIN_SESION); }
    if (!(await permitirUso(req, "xbox", 30))) { res.setHeader("Cache-Control", "no-store"); return res.status(429).json(DEMASIADO); }
    const clave = process.env.OPENXBL_API_KEY;
    if (!clave) return res.status(503).json({ error: "La importación de Xbox todavía no está configurada en el servidor." });
    const gt = String(req.query.gt || "").trim();
    if (!/^[A-Za-z0-9 #]{1,20}$/.test(gt)) return res.status(400).json({ error: "Escribe tu gamertag de Xbox tal como aparece en tu perfil." });
    try {
      const perfil = await buscarGamertag(clave, gt);
      if (!perfil || !perfil.xuid) return res.status(404).json({ error: "No encontramos ese gamertag en Xbox." });
      const juegos = await titulosXbox(clave, false, perfil.xuid);
      res.setHeader("Cache-Control", "private, max-age=300");
      if (!juegos.length) return res.status(200).json({ gamertag: perfil.gamertag, xuid: perfil.xuid, juegos: [], privado: true });
      return res.status(200).json({ gamertag: perfil.gamertag, xuid: perfil.xuid, juegos });
    } catch (e) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(e.status || 502).json({ error: e.status === 401 ? "No se pudo leer el historial: puede que sea privado." : e.message });
    }
  }

  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  let cuerpo = req.body;
  if (typeof cuerpo === "string") { try { cuerpo = JSON.parse(cuerpo); } catch (e) { cuerpo = {}; } }
  const clave = String(cuerpo?.clave || "").trim();
  if (!/^[A-Za-z0-9-]{20,80}$/.test(clave)) {
    return res.status(400).json({ error: "Pega tu clave de OpenXBL (la encuentras en xbl.io → API Keys)." });
  }
  try {
    return res.status(200).json({ juegos: await titulosXbox(clave, false) });
  } catch (e) {
    return res.status(e.status || 502).json({ error: e.status === 401 ? "OpenXBL rechazó la clave. Revisa que la copiaste completa." : e.message });
  }
}
