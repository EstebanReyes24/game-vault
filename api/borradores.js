/**
 * Borradores de noticias, solo para el admin.
 * El archivo borradores/noticias.json ya no se sirve en público (ver "redirects" en vercel.json):
 * se lee aquí y solo se entrega con una sesión de admin.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { esAdminConSesion } from "./_supabase.js";

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "private, no-store");
  if (!(await esAdminConSesion(req))) return res.status(403).json({ error: "Solo para el admin." });
  try {
    return res.status(200).send(readFileSync(join(process.cwd(), "borradores", "noticias.json"), "utf8"));
  } catch (e) {
    return res.status(200).json({ actualizado: null, borradores: [] });
  }
}
