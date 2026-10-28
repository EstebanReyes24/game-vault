/**
 * Latido: Supabase (plan gratis) pausa los proyectos que pasan 7 días sin
 * actividad. Vercel llama a esta función dos veces por semana (ver "crons"
 * en vercel.json) y hace una consulta mínima para que el proyecto siga activo.
 */
import { supa } from "./_supabase.js";

export default async function handler(req, res) {
  // Si CRON_SECRET está configurado en Vercel, solo el cron puede llamarla
  const secreto = process.env.CRON_SECRET;
  if (secreto && req.headers.authorization !== `Bearer ${secreto}`) {
    return res.status(401).json({ ok: false });
  }
  try {
    await supa("hall_of_fame?select=id&limit=1");
    return res.status(200).json({ ok: true, hora: new Date().toISOString() });
  } catch (e) {
    console.error("latido:", e.message);
    return res.status(502).json({ ok: false, error: e.message });
  }
}
