// Utilidades para leer PlayStation Network (API no oficial, la misma que usa la app de PlayStation).
// La web inicia sesión con la cuenta secundaria de Paindex: su código NPSSO va en la variable
// de entorno PSN_NPSSO de Vercel (nunca en el código). Con esa sesión se leen perfiles públicos.
const AUTH = "https://ca.account.sony.com/api/authz/v3/oauth";
const API = "https://m.np.playstation.com/api";
const CLIENTE = "09515159-7237-4370-9b40-3806e67c0891";
const REDIRECCION = "com.scee.psxandroid.scecompcall://redirect";
const ALCANCE = "psn:mobile.v2.core psn:clientapp";
const BASICA = "Basic MDk1MTUxNTktNzIzNy00MzcwLTliNDAtMzgwNmU2N2MwODkxOnVjUGprYTV0bnRCMktxc1A=";

const fallo = (mensaje, status) => Object.assign(new Error(mensaje), { status });

// Se guardan mientras la función siga "caliente" para no iniciar sesión en cada consulta
let sesion = null; // { acceso, caduca, refresco, caducaRefresco }

async function pedirTokens(cuerpo) {
  const r = await fetch(`${AUTH}/token`, {
    method: "POST",
    headers: { Authorization: BASICA, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...cuerpo, scope: ALCANCE, token_format: "jwt" }).toString()
  });
  const d = await r.json().catch(() => null);
  if (!r.ok || !d?.access_token) throw fallo("PlayStation no aceptó la sesión de Paindex.", 503);
  const ahora = Date.now();
  sesion = {
    acceso: d.access_token,
    caduca: ahora + (Number(d.expires_in) || 3600) * 1000 - 60000,
    refresco: d.refresh_token,
    caducaRefresco: ahora + (Number(d.refresh_token_expires_in) || 0) * 1000 - 60000
  };
  return sesion.acceso;
}

export async function tokenPSN() {
  if (sesion && Date.now() < sesion.caduca) return sesion.acceso;
  if (sesion?.refresco && Date.now() < sesion.caducaRefresco) {
    try { return await pedirTokens({ grant_type: "refresh_token", refresh_token: sesion.refresco }); } catch (e) { sesion = null; }
  }
  const npsso = process.env.PSN_NPSSO;
  if (!npsso) throw fallo("La importación de PlayStation todavía no está configurada en el servidor.", 503);
  const params = new URLSearchParams({ access_type: "offline", client_id: CLIENTE, redirect_uri: REDIRECCION, response_type: "code", scope: ALCANCE });
  const r = await fetch(`${AUTH}/authorize?${params}`, { headers: { Cookie: `npsso=${npsso}` }, redirect: "manual" });
  const destino = r.headers.get("location") || "";
  const codigo = destino.includes("?code=") ? new URL(destino.replace(REDIRECCION, "https://x/")).searchParams.get("code") : null;
  if (!codigo) throw fallo("La conexión de Paindex con PlayStation venció: hay que renovar el código NPSSO en Vercel.", 503);
  return pedirTokens({ code: codigo, redirect_uri: REDIRECCION, grant_type: "authorization_code" });
}

export async function psn(ruta, opciones = {}) {
  const token = await tokenPSN();
  const r = await fetch(ruta.startsWith("http") ? ruta : `${API}${ruta}`, {
    ...opciones,
    headers: { Authorization: `Bearer ${token}`, "Accept-Language": "es-ES", "Content-Type": "application/json", ...(opciones.headers || {}) }
  });
  const d = await r.json().catch(() => null);
  if (r.status === 429) throw fallo("PlayStation pide una pausa. Prueba en unos minutos.", 429);
  if (r.status === 403 || d?.error?.code === 2240526 || /private|privacy/i.test(d?.error?.message || "")) throw fallo("Ese perfil de PlayStation es privado.", 403);
  if (r.status === 404) throw fallo("No encontrado.", 404);
  if (!r.ok) throw fallo(`PlayStation respondió ${r.status}.`, 502);
  return d;
}

/** Busca un ID en línea de PSN y devuelve { onlineId, accountId } exactos. */
export async function buscarIdPSN(id) {
  try {
    const d = await psn(`https://us-prof.np.community.playstation.net/userProfile/v1/users/${encodeURIComponent(id)}/profile2?fields=accountId,onlineId`);
    if (d?.profile?.accountId) return { onlineId: d.profile.onlineId, accountId: String(d.profile.accountId) };
  } catch (e) {
    if (e.status === 503 || e.status === 429) throw e;
  }
  // Respaldo: buscador universal
  const d = await psn("/search/v1/universalSearch", {
    method: "POST",
    body: JSON.stringify({ searchTerm: id, domainRequests: [{ domain: "SocialAllAccounts" }] })
  });
  const resultados = (d?.domainResponses || []).flatMap(x => x.results || []).map(x => x.socialMetadata).filter(Boolean);
  const exacto = resultados.find(x => String(x.onlineId).toLowerCase() === id.toLowerCase());
  return exacto ? { onlineId: exacto.onlineId, accountId: String(exacto.accountId) } : null;
}

// "PT228H56M33S" → 229 horas
function horasISO(d) {
  const m = String(d || "").match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return 0;
  return Math.round((Number(m[1] || 0) * 24) + Number(m[2] || 0) + Number(m[3] || 0) / 60);
}

const plataformaCorta = (p) => String(p || "").split(",")[0].replace("PSPC", "PC").trim();

/** Juegos con trofeos de una cuenta + horas de PS4/PS5 si su historial es visible. */
export async function juegosPSN(accountId) {
  const titulos = [];
  for (let offset = 0; offset < 2400; offset += 800) {
    const d = await psn(`/trophy/v1/users/${accountId}/trophyTitles?limit=800&offset=${offset}`);
    titulos.push(...(d?.trophyTitles || []));
    if (!d?.nextOffset) break;
  }
  // Horas y última vez jugado (solo PS4/PS5 y si "Juegos" es visible); si falla, se sigue sin horas
  let jugados = [];
  try {
    for (let offset = 0; offset < 1000; offset += 200) {
      const d = await psn(`/gamelist/v2/users/${accountId}/titles?categories=ps4_game,ps5_native_game&limit=200&offset=${offset}`);
      jugados.push(...(d?.titles || []));
      if (!d?.nextOffset) break;
    }
  } catch (e) { jugados = []; }

  const clave = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[™®©]/g, "").replace(/[^a-z0-9]+/g, "");
  const porNombre = new Map(jugados.map(j => [clave(j.name), j]));
  const usados = new Set();
  const juegos = titulos.map(t => {
    const j = porNombre.get(clave(t.trophyTitleName));
    if (j) usados.add(j);
    const e = t.earnedTrophies || {};
    const def = t.definedTrophies || {};
    const ganados = (e.bronze || 0) + (e.silver || 0) + (e.gold || 0) + (e.platinum || 0);
    const total = (def.bronze || 0) + (def.silver || 0) + (def.gold || 0) + (def.platinum || 0);
    return {
      npId: t.npCommunicationId,
      servicio: t.npServiceName === "trophy2" ? "trophy2" : "trophy",
      titulo: t.trophyTitleName,
      // El icono de trofeos de PS4 (psnobj) es pequeño y no carga en todos lados: sin imagen buena,
      // se deja vacío y la portada sale de RAWG al completar datos
      portada: j?.imageUrl || (/image\.api\.playstation\.com/.test(t.trophyTitleIconUrl || "") ? t.trophyTitleIconUrl : ""),
      plataforma: plataformaCorta(t.trophyTitlePlatform),
      progreso: Number(t.progress) || 0,
      logros: ganados,
      logrosTotal: total,
      platino: (e.platinum || 0) > 0 || (total > 0 && ganados >= total),
      horas: j ? horasISO(j.playDuration) : 0,
      ultimaVez: j?.lastPlayedDateTime || t.lastUpdatedDateTime || null
    };
  });
  // Juegos jugados que no tienen trofeos (o aún no los sincronizan)
  jugados.filter(j => !usados.has(j)).forEach(j => juegos.push({
    npId: null, servicio: null, titulo: j.name, portada: j.imageUrl || "",
    plataforma: j.category === "ps5_native_game" ? "PS5" : "PS4",
    progreso: 0, logros: 0, logrosTotal: 0, platino: false,
    horas: horasISO(j.playDuration), ultimaVez: j.lastPlayedDateTime || null
  }));
  return { juegos, conHoras: jugados.length > 0 };
}

/** Trofeos de un juego con fecha y rareza, en el formato de /api/logros. */
export async function trofeosPSN(accountId, npId, servicio) {
  const q = `npServiceName=${servicio === "trophy2" ? "trophy2" : "trophy"}`;
  const [lista, ganados] = await Promise.all([
    psn(`/trophy/v1/npCommunicationIds/${npId}/trophyGroups/all/trophies?${q}`),
    psn(`/trophy/v1/users/${accountId}/npCommunicationIds/${npId}/trophyGroups/all/trophies?${q}`)
  ]);
  const estado = new Map((ganados?.trophies || []).map(t => [t.trophyId, t]));
  const TIPO = { platinum: "Platino", gold: "Oro", silver: "Plata", bronze: "Bronce" };
  return (lista?.trophies || []).map(t => {
    const g = estado.get(t.trophyId) || {};
    const rareza = Number(g.trophyEarnedRate);
    return {
      id: String(t.trophyId),
      nombre: t.trophyName || "Trofeo oculto",
      desc: `${TIPO[t.trophyType] ? TIPO[t.trophyType] + " · " : ""}${t.trophyDetail || (t.trophyHidden ? "Trofeo oculto" : "")}`,
      icono: t.trophyIconUrl || null,
      logrado: Boolean(g.earned),
      fecha: g.earned && g.earnedDateTime ? new Date(g.earnedDateTime).toISOString() : null,
      rareza: Number.isFinite(rareza) ? rareza : null,
      tipo: t.trophyType || null
    };
  });
}
