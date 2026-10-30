/**
 * Importar desde PlayStation por ID en línea (PSN).
 *   GET /api/psn?id=MiIdDePSN → { onlineId, accountId, juegos, conHoras }
 * Necesita PSN_NPSSO en Vercel y que el perfil tenga "Trofeos" visible para "Cualquiera".
 */
import { buscarIdPSN, juegosPSN } from "./_psn.js";
import { usuarioConSesion, SIN_SESION } from "./_supabase.js";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  // Usa la cuenta PSN de Paindex: solo con sesión iniciada, para que nadie la gaste ni la haga bloquear
  if (!(await usuarioConSesion(req))) { res.setHeader("Cache-Control", "no-store"); return res.status(401).json(SIN_SESION); }
  const id = String(req.query.id || "").trim();
  if (!/^[A-Za-z][A-Za-z0-9_-]{2,15}$/.test(id)) {
    return res.status(400).json({ error: "Escribe tu ID en línea de PlayStation tal como aparece en tu perfil (3 a 16 letras, números, - o _)." });
  }
  try {
    const perfil = await buscarIdPSN(id);
    if (!perfil) return res.status(404).json({ error: "No encontramos ese ID en PlayStation." });
    const { juegos, conHoras } = await juegosPSN(perfil.accountId);
    res.setHeader("Cache-Control", "private, max-age=300");
    return res.status(200).json({ ...perfil, juegos, conHoras, privado: !juegos.length });
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    const msg = e.status === 403
      ? "Tus trofeos de PlayStation son privados. En la PS5 o la app: Ajustes → Usuarios y cuentas → Privacidad → «Trofeos» y «Juegos» en «Cualquiera»."
      : e.message;
    return res.status(e.status || 502).json({ error: msg });
  }
}
