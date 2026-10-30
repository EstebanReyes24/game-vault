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

// Sesiones ya comprobadas (mientras la función siga caliente), para no preguntar a Supabase en cada consulta
const sesionesValidas = new Map();

/**
 * Devuelve el id del usuario si la petición trae una sesión válida de Paindex Vault
 * (cabecera "Authorization: Bearer <token de Supabase>"), o null si no.
 * Protege las importaciones que gastan cuota o usan la cuenta de Paindex (Xbox y PlayStation).
 */
export async function usuarioConSesion(req) {
  const m = String(req.headers?.authorization || "").match(/^Bearer\s+([A-Za-z0-9._-]{20,4000})$/);
  if (!m) return null;
  const token = m[1];
  const guardada = sesionesValidas.get(token);
  if (guardada && guardada.hasta > Date.now()) return guardada.id;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    const u = await r.json();
    if (!u?.id) return null;
    if (sesionesValidas.size > 500) sesionesValidas.clear();
    sesionesValidas.set(token, { id: u.id, hasta: Date.now() + 5 * 60 * 1000 });
    return u.id;
  } catch (e) {
    return null;
  }
}

export const SIN_SESION = { error: "Inicia sesión en Paindex Vault para importar desde Xbox o PlayStation." };

/**
 * Cuenta un uso de `ruta` para la cuenta de esta sesión (migración 017) y dice si sigue dentro
 * del máximo por hora. Si la migración aún no está, deja pasar (no rompe la web).
 */
export async function permitirUso(req, ruta, maximo) {
  const m = String(req.headers?.authorization || "").match(/^Bearer\s+([A-Za-z0-9._-]{20,4000})$/);
  if (!m) return false;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/usar_api`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${m[1]}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_ruta: ruta, p_maximo: maximo })
    });
    if (r.status === 404) return true; // sin migración 017
    if (!r.ok) return true;            // ante un fallo de Supabase no se bloquea a nadie
    return (await r.json()) === true;
  } catch (e) {
    return true;
  }
}

export const DEMASIADO = { error: "Has hecho muchas consultas en poco tiempo. Espera un rato y vuelve a intentarlo." };

// Límite por dirección IP para las rutas abiertas (best effort: vale por cada instancia del servidor)
const visitas = new Map();
export function limitePorIp(req, ruta, maximo, segundos) {
  const ip = String(req.headers?.["x-real-ip"] || req.headers?.["x-forwarded-for"] || "?").split(",")[0].trim();
  const clave = `${ruta}|${ip}`;
  const ahora = Date.now();
  const v = visitas.get(clave);
  if (!v || ahora - v.desde > segundos * 1000) { visitas.set(clave, { desde: ahora, n: 1 }); }
  else if (++v.n > maximo) return false;
  if (visitas.size > 5000) visitas.clear();
  return true;
}

/** true si la sesión de la petición es del admin (es_admin() en Supabase con el token del usuario). */
export async function esAdminConSesion(req) {
  const m = String(req.headers?.authorization || "").match(/^Bearer\s+([A-Za-z0-9._-]{20,4000})$/);
  if (!m) return false;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/es_admin`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${m[1]}`, "Content-Type": "application/json" },
      body: "{}"
    });
    return r.ok && (await r.json()) === true;
  } catch (e) {
    return false;
  }
}
