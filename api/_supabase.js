// Lectura pública de Supabase desde las funciones (misma clave pública que usa la web).
export const SUPABASE_URL = "https://epouactrnuhdbzzvzxor.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_i2sc-SaHk8H6e3c-Dwf0IQ_hhdBlx_I";

export async function supa(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
  return res.json();
}

export const usuarioValido = (u) => /^[a-z0-9_]{3,20}$/.test(String(u || "").toLowerCase());

/** Perfil público + sus juegos, o null si no existe o es privado. */
export async function perfilPublico(usuario) {
  const u = String(usuario || "").toLowerCase();
  if (!usuarioValido(u)) return null;
  const perfiles = await supa(`profiles?select=id,username,is_public&username=eq.${u}&limit=1`);
  const p = perfiles[0];
  if (!p || !p.is_public) return null;
  const juegos = await supa(`games?select=title,cover_url,rating,status,hours&user_id=eq.${p.id}`);
  const conNota = juegos.filter(g => Number(g.rating) > 0);
  return {
    usuario: p.username,
    juegos: juegos.length,
    horas: juegos.reduce((t, g) => t + (Number(g.hours) || 0), 0),
    platinos: juegos.filter(g => g.status === "platinum").length,
    media: conNota.length ? conNota.reduce((t, g) => t + Number(g.rating), 0) / conNota.length : null,
    top: conNota
      .filter(g => /^https:\/\//.test(g.cover_url || ""))
      .sort((a, b) => Number(b.rating) - Number(a.rating) || (Number(b.hours) || 0) - (Number(a.hours) || 0))
      .slice(0, 3)
      .map(g => ({ titulo: g.title, portada: g.cover_url, nota: Number(g.rating) }))
  };
}
