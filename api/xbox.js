/**
 * Importar desde Xbox con una clave personal de OpenXBL (respaldo).
 * La forma principal es "Iniciar sesión con Xbox" (/api/xbox-login).
 *   POST /api/xbox   { "clave": "..." }
 */
import { titulosXbox } from "./_xbox.js";

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
    return res.status(200).json({ juegos: await titulosXbox(clave, false) });
  } catch (e) {
    return res.status(e.status || 502).json({ error: e.status === 401 ? "OpenXBL rechazó la clave. Revisa que la copiaste completa." : e.message });
  }
}
