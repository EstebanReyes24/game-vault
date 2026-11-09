/**
 * Revisión a fondo de la web publicada (la ejecuta .github/workflows/pruebas.yml con modo=revision,
 * a mano o cada lunes). Comprueba servicios, permisos de la base de datos sin sesión, cabeceras,
 * contenido real de cada página en celular y computadora, accesibilidad y dependencias.
 * No falla el flujo salvo por problemas graves: imprime un informe JSON entre marcas.
 *   BASE=https://… node pruebas/revision.mjs
 */
import { chromium } from "playwright";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";

const BASE = (process.env.BASE || "https://game-vault-beige.vercel.app").replace(/\/$/, "");
const SUPA = "https://epouactrnuhdbzzvzxor.supabase.co";
const ANON = "sb_publishable_i2sc-SaHk8H6e3c-Dwf0IQ_hhdBlx_I";
const H = { apikey: ANON, Authorization: `Bearer ${ANON}` };
const informe = { base: BASE, hora: new Date().toISOString(), graves: [], avisos: [] };
const grave = (t) => { informe.graves.push(t); console.log("✗ GRAVE:", t); };
const aviso = (t) => { informe.avisos.push(t); console.log("! aviso:", t); };

async function pedir(url, op = {}) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(op.ms || 25000), ...op });
    const texto = await r.text();
    let json = null;
    try { json = JSON.parse(texto); } catch (e) { /* no es JSON */ }
    return { status: r.status, ms: Date.now() - t0, h: Object.fromEntries(r.headers), texto, json };
  } catch (e) { return { status: 0, ms: Date.now() - t0, h: {}, texto: "", json: null, error: String(e.message || e) }; }
}
const SOLO = (process.env.SOLO || "").split(",").filter(Boolean); // p. ej. SOLO=respaldo,apis
const seccion = async (nombre, fn) => { if (SOLO.length && !SOLO.includes(nombre)) return; try { informe[nombre] = await fn(); } catch (e) { informe[nombre] = { error: String(e.message || e) }; aviso(`${nombre}: ${e.message}`); } };

// ---------- 1. Servicios (vigía) y APIs ----------
await seccion("vigia", async () => {
  const r = await pedir(`${BASE}/api/latido?revisar=1`, { ms: 40000 });
  const res = r.json?.resultados || {};
  Object.entries(res).forEach(([k, v]) => { if (v !== "ok") (k === "RAWG" ? aviso : grave)(`Vigía · ${k}: ${v}${k === "RAWG" ? " (la web usa Steam y Wikipedia de respaldo)" : ""}`); });
  return { status: r.status, ms: r.ms, resultados: res };
});

await seccion("apis", async () => {
  const o = {};
  const p = async (nombre, ruta, comprobar) => {
    const r = await pedir(BASE + ruta);
    let ok = false, nota = "";
    try { [ok, nota] = comprobar(r); } catch (e) { nota = e.message; }
    o[nombre] = { status: r.status, ms: r.ms, ok, nota: String(nota ?? "").slice(0, 160), cache: r.h["cache-control"] };
    if (!ok) aviso(`API ${nombre}: ${r.status} ${String(nota).slice(0, 120)}`);
  };
  await p("rawg buscar", "/api/rawg?search=hollow%20knight&n=3", r => [r.status === 200 && r.json?.results?.length > 0, `${r.json?.fuente || "rawg"} · ${(r.json?.results || []).map(x => x.name).join(" / ") || r.texto.slice(0, 100)}`]);
  await p("rawg detalle", "/api/rawg?detalle=1&search=Elden%20Ring", r => [r.json?.encontrado === true && /^https:/.test(r.json.portada || ""), `${r.json?.fuente || "rawg"} · ${r.json?.nombre} · ${r.json?.anio} · ${r.json?.desarrollador} · ${(r.json?.etiquetas || []).join(",")} · ${(r.json?.portada || "").split("/")[2]}`]);
  await p("sinopsis", "/api/rawg?sinopsis=1&search=Ghost%20of%20Tsushima", r => [r.json?.encontrado === true, `${r.json?.idioma}/${r.json?.de}: ${(r.json?.texto || "").slice(0, 70)}`]);
  await p("steam jugadores", "/api/steam?jugadores=1&titulo=Elden%20Ring", r => [r.json?.enSteam === true && r.json.jugadores > 0, `jugadores=${r.json?.jugadores}`]);
  await p("canal", "/api/canal", r => [(r.json?.videos || []).length > 0, `${r.json?.videos?.length} videos · ${r.json?.videos?.[0]?.fecha?.slice(0, 10)} · ${r.json?.videos?.[0]?.titulo}`]);
  await p("push clave", "/api/push?clave=1", r => [typeof r.json?.publica === "string" && r.json.publica.length > 80, r.json?.publica ? "configurada" : "sin configurar"]);
  await p("push preparar cerrado", "/api/push?preparar=1", r => [r.status === 409, r.status]);
  await p("og perfil", "/api/og?u=chimbala", r => [r.status === 200 && /^image\//.test(r.h["content-type"] || ""), r.h["content-type"]]);
  await p("og 3x3", "/api/og?tipo=3x3&u=chimbala", r => [r.status === 200 && /^image\//.test(r.h["content-type"] || ""), r.h["content-type"]]);
  await p("og historia", "/api/og?tipo=historia&u=chimbala", r => [r.status === 200 && /^image\//.test(r.h["content-type"] || ""), r.h["content-type"]]);
  await p("icono rechaza otros orígenes", "/api/icono?u=https://example.com/x.png", r => [r.status === 400, r.status]);
  await p("borradores sin sesión", "/api/borradores", r => [r.status === 401 || r.status === 403, r.status]);
  await p("xbox sin sesión", "/api/xbox?gt=x", r => [r.status === 401 || r.status === 403, r.status]);
  await p("psn sin sesión", "/api/psn?id=x", r => [r.status === 401 || r.status === 403, r.status]);
  await p("logros xbox sin sesión", "/api/logros?fuente=xbox&id=1", r => [r.status === 401 || r.status === 403 || r.status === 400, r.status]);
  await p("latido sin revisar", "/api/latido", r => [r.status === 200 && r.json?.ok === true && !r.json.resultados, r.status]);
  const post = await pedir(`${BASE}/api/push`, { method: "POST", headers: { "Content-Type": "application/json", "x-push-secreto": "no" }, body: "{}" });
  o["push POST sin secreto"] = { status: post.status, ok: post.status === 401 };
  if (post.status !== 401) grave(`/api/push acepta POST sin secreto (${post.status})`);
  return o;
});

// ---------- 1b. Respaldo de RAWG (Steam y Wikipedia) y miniaturas, probados directamente ----------
await seccion("respaldo", async () => {
  const { buscarRespaldo, detalleRespaldo } = await import("../api/_respaldo.js");
  const o = { buscar: {}, detalle: {} };
  for (const q of ["elden ring", "zelda breath of the wild", "hollow knight", "god of war ragnarok", "pokemon esmeralda"]) {
    const r = await buscarRespaldo(q, 4).catch(e => [{ name: "ERROR " + e.message }]);
    o.buscar[q] = r.map(x => `${x.name} | ${(x.background_image || "sin imagen").split("/")[2]}`);
    if (!r.length) aviso(`Respaldo: sin resultados para «${q}»`);
  }
  for (const q of ["Elden Ring", "Super Mario Galaxy", "The Legend of Zelda: Ocarina of Time", "Hades", "Bloodborne", "Juego Que No Existe Xyz"]) {
    const d = await detalleRespaldo(q).catch(e => ({ error: e.message }));
    o.detalle[q] = d.encontrado ? `${d.fuente} · ${d.nombre} · ${d.anio} · ${d.desarrollador} · ${(d.etiquetas || []).join(",")} · ${(d.portada || "").split("/")[2]}` : JSON.stringify(d);
  }
  // ¿Carga de verdad la carátula que se deduce de Steam?
  const st = await detalleRespaldo("Elden Ring").catch(() => ({}));
  if (st.portada) { const r = await fetch(st.portada); o.caratula_steam = `${r.status} ${r.headers.get("content-type")}`; if (!r.ok) aviso("La carátula de Steam del respaldo no carga"); }
  // Miniaturas de RAWG
  const original = "https://media.rawg.io/media/games/b29/b294fdd866dcdb643e7bab370a552855.jpg";
  o.miniaturas = {};
  for (const [n, u] of [["original", original], ["420", original.replace("/media/", "/media/resize/420/-/")], ["640", original.replace("/media/", "/media/resize/640/-/")]]) {
    const r = await fetch(u).catch(() => null);
    o.miniaturas[n] = r ? `${r.status} · ${Math.round((await r.arrayBuffer()).byteLength / 1024)} KB · ${r.headers.get("content-type")}` : "sin respuesta";
    if (n !== "original" && (!r || !r.ok)) aviso(`La miniatura ${n} de RAWG no carga`);
  }
  return o;
});

// ---------- 2. Base de datos sin sesión ----------
await seccion("supabase", async () => {
  const o = { tablas: {} };
  const privadas = ["platform_links", "notifications", "wishlist", "push_subs", "client_errors", "banned_users", "comment_reports", "review_reports", "video_plans", "api_uso", "actividad_dias", "uso_funciones", "news_drafts_done"];
  const publicas = ["games", "profiles", "posts", "hall_of_fame", "game_achievements", "activity", "follows", "lists", "list_items", "reviews", "post_comments", "post_likes", "game_videos"];
  for (const t of [...privadas, ...publicas]) {
    const r = await pedir(`${SUPA}/rest/v1/${t}?select=*&limit=1`, { headers: { ...H, Prefer: "count=exact" } });
    const total = Number((r.h["content-range"] || "").split("/")[1]);
    o.tablas[t] = `${r.status} · ${Number.isFinite(total) ? total : "?"} filas visibles`;
    if (privadas.includes(t) && total > 0) grave(`La tabla privada ${t} deja ver ${total} filas sin sesión`);
  }
  // Solo estantes públicos
  const pub = (await pedir(`${SUPA}/rest/v1/profiles?select=id,username,is_public`, { headers: H })).json || [];
  o.perfiles_visibles = pub.length;
  if (pub.some(p => p.is_public === false)) grave("Se ven perfiles privados sin sesión");
  const dueños = (await pedir(`${SUPA}/rest/v1/games?select=user_id&limit=5000`, { headers: H })).json || [];
  const ajenos = dueños.filter(g => !pub.some(p => p.id === g.user_id)).length;
  if (ajenos) grave(`Se ven ${ajenos} juegos de estantes no públicos`);
  o.usuarios_publicos = pub.map(p => p.username);
  // Columnas sensibles de profiles
  const cols = (await pedir(`${SUPA}/rest/v1/profiles?select=*&limit=1`, { headers: H })).json?.[0] || {};
  o.columnas_profiles = Object.keys(cols);
  if (Object.keys(cols).some(c => /email|correo|phone/i.test(c))) grave("profiles expone una columna de correo o teléfono");
  // Escrituras sin sesión
  const ins = await pedir(`${SUPA}/rest/v1/games`, { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({ id: 1, user_id: pub[0]?.id, title: "x", status: "backlog" }) });
  o.insertar_juego_ajeno = ins.status;
  if (ins.status < 400) grave("Se pudo insertar un juego sin sesión");
  const upd = await pedir(`${SUPA}/rest/v1/profiles?id=eq.${pub[0]?.id}`, { method: "PATCH", headers: { ...H, "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ bio: null }) });
  o.editar_perfil_ajeno = `${upd.status} ${upd.texto.slice(0, 40)}`;
  if (upd.status < 300 && upd.texto !== "[]") grave("Se pudo editar un perfil ajeno sin sesión");
  // Funciones reservadas
  for (const [fn, cuerpo] of [["metricas_admin", {}], ["diagnostico_push", {}], ["quitar_avatar", { p_usuario: "nadie" }], ["probar_push", {}]]) {
    const r = await pedir(`${SUPA}/rest/v1/rpc/${fn}`, { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
    o[`rpc ${fn}`] = r.status;
    if (r.status < 400) grave(`La función ${fn} responde sin sesión`);
  }
  const dest = await pedir(`${SUPA}/rest/v1/rpc/push_destinos`, { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({ p_secreto: "x".repeat(40), p_user: pub[0]?.id }) });
  o.push_destinos_secreto_malo = `${dest.status} ${dest.texto.slice(0, 20)}`;
  if (dest.status === 200 && dest.texto !== "[]") grave("push_destinos devuelve dispositivos con un secreto incorrecto");
  const rk = await pedir(`${SUPA}/rest/v1/rpc/juegos_ranking`, { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: "{}" });
  o.ranking = `${rk.status} · ${Array.isArray(rk.json) ? rk.json.length : "?"} juegos`;
  const au = await pedir(`${SUPA}/auth/v1/settings`, { headers: H });
  o.auth = { google: au.json?.external?.google, email: au.json?.external?.email, registro_abierto: !au.json?.disable_signup, confirmar_correo: !au.json?.mailer_autoconfirm };
  const posts = (await pedir(`${SUPA}/rest/v1/posts?select=id,title,category,created_at&order=created_at.desc&limit=3`, { headers: H })).json || [];
  o.ultimos_posts = posts.map(p => `${p.created_at?.slice(0, 10)} [${p.category}] ${p.title}`);
  informe._post = posts[0]?.id;
  informe._usuarios = o.usuarios_publicos;
  return o;
});

// ---------- 3. Cabeceras, archivos base, redirecciones ----------
await seccion("sitio", async () => {
  const o = {};
  const raiz = await pedir(BASE + "/");
  const csp = raiz.h["content-security-policy"] || "";
  o.cabeceras = {
    csp: csp ? `${csp.length} caracteres` : "FALTA", hsts: raiz.h["strict-transport-security"], xfo: raiz.h["x-frame-options"],
    nosniff: raiz.h["x-content-type-options"], referrer: raiz.h["referrer-policy"], permisos: raiz.h["permissions-policy"], cache: raiz.h["cache-control"]
  };
  ["content-security-policy", "strict-transport-security", "x-frame-options", "x-content-type-options", "referrer-policy"].forEach(c => { if (!raiz.h[c]) grave(`Falta la cabecera ${c}`); });
  if (/script-src[^;]*'unsafe-(inline|eval)'/.test(csp)) grave("La CSP permite scripts inline o eval");
  o.csp_completa = csp;
  for (const [ruta, espera] of [["/robots.txt", 200], ["/sitemap.xml", 200], ["/manifest.json", 200], ["/sw.js", 200], ["/offline", 200], ["/favicon.svg", 200], ["/icons/icon-192.png", 200], ["/icons/icon-512.png", 200], ["/icons/apple-touch-icon.png", 200], ["/data/ports.json", 200], ["/no-existe-xyz", 404], ["/app", 308], ["/app.html", 308], ["/borradores/noticias.json", 308], ["/.env", 404], ["/.git/config", 404], ["/package.json", 404], ["/supabase/migrations/001_fase0.sql", 404], ["/api/_supabase", 404], ["/reserva/LEEME.md", 404], ["/pruebas/humo.mjs", 404], ["/scripts/ports.mjs", 404]]) {
    const r = await pedir(BASE + ruta);
    o[ruta] = `${r.status}${r.h.location ? " → " + r.h.location : ""} · ${r.texto.length} b`;
    const ok = espera === 308 ? [301, 302, 307, 308].includes(r.status) : r.status === espera;
    if (!ok) (espera === 404 ? grave : aviso)(`${ruta} respondió ${r.status} (se esperaba ${espera})`);
  }
  const nf = await pedir(BASE + "/no-existe-xyz");
  o.pagina_404_propia = /Esta página no existe/.test(nf.texto);
  const sm = await pedir(BASE + "/sitemap.xml");
  const locs = [...sm.texto.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  o.sitemap = { urls: locs.length, raras: locs.filter(l => !l.startsWith(BASE + "/") && l !== BASE || /\/\/[^/]*\/.*\/\//.test(l) || /\/$/.test(l.replace(BASE, "")) && l !== BASE + "/").slice(0, 5) };
  const muestra = locs.filter((_, i) => i % Math.max(1, Math.floor(locs.length / 12)) === 0).slice(0, 12);
  o.sitemap.muestra = {};
  for (const l of muestra) { const r = await pedir(l); o.sitemap.muestra[l.replace(BASE, "")] = r.status; if (r.status !== 200) aviso(`Sitemap: ${l} responde ${r.status}`); }
  const man = (await pedir(BASE + "/manifest.json")).json || {};
  o.manifest = { nombre: man.name, inicio: man.start_url, atajos: (man.shortcuts || []).map(s => s.name), iconos: (man.icons || []).length };
  // Metadatos para compartir
  o.meta = {};
  for (const ruta of ["/", "/j/elden-ring", `/u/${informe._usuarios?.[0] || "chimbala"}`, informe._post ? `/a/${informe._post}` : "/noticias", "/ports", "/juegos"]) {
    const r = await pedir(BASE + ruta);
    const m = (re) => (r.texto.match(re) || [])[1];
    o.meta[ruta] = { status: r.status, title: m(/<title>([^<]*)/), ogTitle: m(/property="og:title" content="([^"]*)/), ogImage: (m(/property="og:image" content="([^"]*)/) || "").slice(0, 90), desc: (m(/name="description" content="([^"]*)/) || "").slice(0, 70), canonical: m(/rel="canonical" href="([^"]*)/) };
    if (!o.meta[ruta].ogTitle) aviso(`${ruta} no tiene og:title`);
    if (!o.meta[ruta].canonical) aviso(`${ruta} no tiene enlace canónico`);
  }
  return o;
});

// ---------- 4. Dependencias y datos ----------
await seccion("dependencias", async () => {
  const o = {};
  const html = (await pedir(BASE + "/estante")).texto;
  const sri = [...html.matchAll(/(?:src|href)="(https:\/\/[^"]+)"[^>]*integrity="(sha384-[^"]+)"/g)];
  o.sri = {};
  for (const [, url, esperado] of sri) {
    const r = await fetch(url);
    const real = "sha384-" + crypto.createHash("sha384").update(Buffer.from(await r.arrayBuffer())).digest("base64");
    o.sri[url.split("/").slice(3, 7).join("/")] = real === esperado ? "coincide" : "NO COINCIDE";
    if (real !== esperado) grave(`SRI no coincide para ${url}`);
  }
  o.externos_sin_sri = [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="(https:\/\/(?!fonts\.)[^"]+)"(?![^>]*integrity)[^>]*>/g)].map(m => m[1]);
  const usado = (html.match(/supabase-js@([\d.]+)/) || [])[1];
  const ultimo = (await pedir("https://registry.npmjs.org/@supabase/supabase-js/latest")).json?.version;
  o.supabase_js = { usado, ultimo };
  const fa = (html.match(/font-awesome\/([\d.]+)/) || [])[1];
  o.font_awesome = { usado: fa, ultimo: (await pedir("https://api.cdnjs.com/libraries/font-awesome?fields=version")).json?.version };
  const ports = (await pedir(BASE + "/data/ports.json", { ms: 40000 })).json || {};
  const js = ports.juegos || [];
  o.ports = { actualizado: ports.actualizado, juegos: js.length, proyectos: ports.proyectos, con_portada: js.filter(j => j.portada).length, peso_kb: Math.round(JSON.stringify(ports).length / 1024) };
  const dias = (Date.now() - Date.parse(ports.actualizado)) / 864e5;
  if (dias > 9) aviso(`La lista de ports lleva ${Math.round(dias)} días sin actualizarse`);
  // Portadas: muestra de 60
  const conP = js.filter(j => j.portada);
  const paso = Math.max(1, Math.floor(conP.length / 60));
  const rotas = [];
  const muestraP = conP.filter((_, i) => i % paso === 0).slice(0, 60);
  for (let i = 0; i < muestraP.length; i += 5) { // de 5 en 5: Wikimedia limita las ráfagas
    await Promise.all(muestraP.slice(i, i + 5).map(async j => {
      try { const r = await fetch(j.portada, { headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36" }, signal: AbortSignal.timeout(15000) }); if (r.status !== 429 && (!r.ok || !/^image\//.test(r.headers.get("content-type") || ""))) rotas.push(`${r.status} ${new URL(j.portada).host}`); } catch (e) { rotas.push(`error ${new URL(j.portada).host}`); }
    }));
    await new Promise(r => setTimeout(r, 400));
  }
  o.ports.portadas_muestra = { probadas: Math.min(60, conP.length), rotas: rotas.length, detalle: rotas.slice(0, 8) };
  if (rotas.length > 6) aviso(`${rotas.length} de 60 portadas de ports no cargan`);
  // Enlaces de descarga: muestra de 40
  const proys = js.flatMap(j => j.proyectos.slice(0, 1)).filter(p => p.version?.url || p.url);
  const pasoP = Math.max(1, Math.floor(proys.length / 40));
  const caidos = [];
  await Promise.all(proys.filter((_, i) => i % pasoP === 0).slice(0, 40).map(async p => {
    const u = p.version?.url || p.url;
    try { const r = await fetch(u, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(15000) }); if (r.status === 404 || r.status === 410) caidos.push(u); } catch (e) { /* red */ }
  }));
  o.ports.enlaces_muestra = { probados: Math.min(40, proys.length), caidos };
  if (caidos.length > 2) aviso(`${caidos.length} de 40 enlaces de ports están caídos`);
  try {
    const n = JSON.parse(readFileSync("borradores/noticias.json", "utf8"));
    o.borradores = { actualizado: n.actualizado, total: (n.borradores || []).length, horas: Math.round((Date.now() - Date.parse(n.actualizado)) / 36e5) };
  } catch (e) { o.borradores = "no se pudo leer"; }
  return o;
});

// ---------- 5. Páginas en navegador real ----------
const navegador = await chromium.launch();
await seccion("paginas", async () => {
  const u = informe._usuarios || [];
  const RUTAS = ["/", "/noticias", "/articulos", "/estante", "/juegos", "/ports", "/j/elden-ring", "/j/the-legend-of-zelda-ocarina-of-time", "/comparar", "/login", "/legal",
    u[0] ? `/u/${u[0]}` : null, u[1] ? `/u/${u[0]}/vs/${u[1]}` : null, informe._post ? `/a/${informe._post}` : null].filter(Boolean);
  const o = {};
  for (const pantalla of [{ n: "celular", width: 390, height: 844, isMobile: true }, { n: "computadora", width: 1366, height: 900, isMobile: false }]) {
    const ctx = await navegador.newContext({ viewport: { width: pantalla.width, height: pantalla.height }, isMobile: pantalla.isMobile, hasTouch: pantalla.isMobile, serviceWorkers: "block" });
    for (const ruta of RUTAS) {
      const pg = await ctx.newPage();
      const errores = [], consola = [], fallidas = [];
      let bytes = 0, peticiones = 0;
      pg.on("pageerror", e => errores.push(e.message.slice(0, 200)));
      pg.on("console", m => { if (m.type() === "error" && !/insights\/script|favicon/.test(m.text())) consola.push(m.text().slice(0, 220)); });
      pg.on("response", async r => {
        peticiones++;
        if (r.status() >= 400 && !/_vercel\/insights/.test(r.url())) fallidas.push(`${r.status()} ${r.url().replace(BASE, "").slice(0, 110)}`);
        const l = Number(r.headers()["content-length"] || 0); bytes += l;
      });
      pg.on("requestfailed", r => { if (!/_vercel\/insights|youtube|doubleclick|library_600x900/.test(r.url())) fallidas.push(`falló ${r.url().replace(BASE, "").slice(0, 110)}`); });
      const t0 = Date.now();
      let estado = 0;
      try {
        const r = await pg.goto(BASE + ruta, { waitUntil: "load", timeout: 45000 });
        estado = r?.status() || 0;
        const carga = Date.now() - t0;
        await pg.waitForTimeout(4500);
        const d = await pg.evaluate(() => {
          const q = (s) => document.querySelectorAll(s).length;
          const imgs = [...document.images];
          const nav = performance.getEntriesByType("navigation")[0] || {};
          const lcp = performance.getEntriesByType("largest-contentful-paint").pop();
          return {
            ancho: [document.documentElement.scrollWidth, window.innerWidth],
            imgs: imgs.length, rotas: imgs.filter(i => i.complete && i.naturalWidth === 0 && i.src && !i.src.startsWith("data:")).map(i => i.src.slice(0, 100)).slice(0, 4),
            sinAlt: imgs.filter(i => !i.hasAttribute("alt")).length,
            reducidas: imgs.filter(i => /\/media\/resize\//.test(i.src) && i.complete && i.naturalWidth > 0).length,
            rawgOriginal: imgs.filter(i => /media\.rawg\.io\/media\/(games|screenshots)/.test(i.src)).length,
            ttfb: Math.round(nav.responseStart || 0), dcl: Math.round(nav.domContentLoadedEventEnd || 0),
            titulo: document.title, h1: (document.querySelector("h1")?.innerText || "").slice(0, 70), h1s: q("h1"),
            cargando: [...document.querySelectorAll(".juego-cargando, .skeleton")].filter(e => e.offsetParent).length,
            // contenido
            noticias: q("#noticiasBloque a, #noticiasBloque article, #noticiasBloque [data-abrir-post]"), articulos: q("#newsFeed > *"), canal: q("#canalVideos .canal-principal, #canalVideos .canal-lista li"),
            actividad: q("#actividadLista > *"), hof: q("#hofGrid > *"), archivo: q("#archivoLista > *"),
            ranking: q("#juegosLista > li a"), portsJuegos: q(".ports-juego"), portsTapas: q(".ports-tapa img"), portsTapasOk: [...document.querySelectorAll(".ports-tapa img")].filter(i => i.complete && i.naturalWidth > 0).length,
            sinopsis: !!document.querySelector("#jSinopsis:not([hidden])"), vivo: !!document.querySelector(".juego-en-vivo"), port: !!document.querySelector("#jPort:not([hidden])"), cifras: q(".juego-cifras > div"),
            google: !!document.querySelector("#googleBloque:not([hidden])"), bienvenida: q(".bienvenida"), tarjetas: q("#gamesGrid > *"),
            perfil: (document.querySelector("#spectatorBanner")?.innerText || "").replace(/\s+/g, " ").slice(0, 90), comparar: (document.querySelector("#comparar")?.innerText || "").replace(/\s+/g, " ").slice(0, 110),
            post: (document.querySelector("#readPostTitle")?.innerText || "").slice(0, 70), postAbierto: !!document.querySelector("#readPostModal:not(.hidden)")
          };
        });
        o[`${pantalla.n} ${ruta}`] = { estado, carga_ms: carga, kb: Math.round(bytes / 1024), peticiones, ...d, errores, consola: [...new Set(consola)].slice(0, 5), fallidas: [...new Set(fallidas)].slice(0, 6) };
        if (errores.length) grave(`${pantalla.n} ${ruta}: error de JavaScript: ${errores[0]}`);
        if (d.ancho[0] > d.ancho[1] + 1) grave(`${pantalla.n} ${ruta}: se sale de la pantalla (${d.ancho[0]}px en ${d.ancho[1]}px)`);
        if (estado >= 400) grave(`${pantalla.n} ${ruta}: respondió ${estado}`);
        if (consola.length) aviso(`${pantalla.n} ${ruta}: consola: ${[...new Set(consola)][0]}`);
        if (fallidas.length) aviso(`${pantalla.n} ${ruta}: peticiones fallidas: ${[...new Set(fallidas)].slice(0, 2).join(" ; ")}`);
        if (d.rotas.length) aviso(`${pantalla.n} ${ruta}: imágenes rotas: ${d.rotas[0]}`);
        if (d.cargando) aviso(`${pantalla.n} ${ruta}: sigue mostrando «Cargando…» tras 4,5 s`);
      } catch (e) {
        o[`${pantalla.n} ${ruta}`] = { estado, error: e.message.split("\n")[0] };
        grave(`${pantalla.n} ${ruta}: ${e.message.split("\n")[0]}`);
      }
      await pg.close();
    }
    await ctx.close();
  }
  return o;
});

// ---------- 6. Interacciones sin sesión ----------
await seccion("interacciones", async () => {
  const o = {};
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  const pg = await ctx.newPage();
  const errores = [];
  pg.on("pageerror", e => errores.push(e.message.slice(0, 160)));
  // Ports: portadas al bajar por la página, buscar y filtrar
  await pg.goto(BASE + "/ports", { waitUntil: "load" }); await pg.waitForSelector(".ports-juego", { timeout: 20000 });
  for (let y = 0; y < 14; y++) { await pg.mouse.wheel(0, 1600); await pg.waitForTimeout(450); }
  await pg.waitForTimeout(2500);
  o.ports_portadas = await pg.evaluate(() => { const t = [...document.querySelectorAll(".ports-tapa")]; const i = t.map(x => x.querySelector("img")).filter(Boolean); return { tarjetas: t.length, con_imagen: i.filter(x => x.complete && x.naturalWidth > 0).length, sin_cargar: i.filter(x => !x.complete).length, rotas: i.filter(x => x.complete && x.naturalWidth === 0).length, sin_portada: t.length - i.length }; });
  await pg.evaluate(() => window.scrollTo(0, 0));
  // Añadir un juego buscándolo por nombre (portadas de RAWG o del respaldo)
  const busca = await pg.evaluate(async () => { const r = await fetch("/api/rawg?search=zelda%20breath&n=4"); const d = await r.json().catch(() => ({})); return { estado: r.status, fuente: d.fuente || "rawg", resultados: (d.results || []).map(x => `${x.name} | ${(x.background_image || "").split("/")[2]}`) }; });
  o.buscar_portadas = busca;
  o.detalle_nintendo = await pg.evaluate(async () => { const d = await fetch("/api/rawg?detalle=1&search=Super%20Mario%20Galaxy").then(r => r.json()).catch(() => ({})); return `${d.encontrado} · ${d.fuente || "rawg"} · ${d.nombre} · ${d.anio} · ${d.desarrollador} · ${(d.etiquetas || []).join(",")} · ${(d.portada || "").split("/")[2]}`; });
  await pg.fill("#portsBuscar", "zelda"); await pg.waitForTimeout(900);
  o.ports_buscar_zelda = await pg.locator("#portsCuenta").innerText();
  await pg.fill("#portsBuscar", ""); await pg.selectOption("#portsSO", "android"); await pg.check("#portsSolidos"); await pg.waitForTimeout(600);
  o.ports_android_solidos = await pg.locator("#portsCuenta").innerText();
  // Ranking de juegos: buscar
  await pg.goto(BASE + "/juegos", { waitUntil: "load" }); await pg.waitForSelector("#juegosLista a", { timeout: 20000 }).catch(() => {});
  o.juegos_en_ranking = await pg.locator("#juegosLista a").count();
  // Portada: abrir una noticia y el buscador
  await pg.goto(BASE + "/", { waitUntil: "load" }); await pg.waitForTimeout(3500);
  const noticia = pg.locator("[data-abrir-post]").first();
  if (await noticia.count()) { await noticia.click(); await pg.waitForTimeout(1500); o.noticia_abre = await pg.evaluate(() => !document.querySelector("#readPostModal")?.classList.contains("hidden") && document.querySelector("#readPostContent")?.innerText.length > 50); o.url_noticia = pg.url().replace(BASE, ""); }
  else o.noticia_abre = "no hay noticias en la portada";
  // Estante sin sesión: añadir un juego a mano como invitado
  await pg.goto(BASE + "/estante", { waitUntil: "load" }); await pg.waitForTimeout(3000);
  o.estante_invitado = await pg.evaluate(() => ({ bienvenida: !!document.querySelector(".bienvenida"), botones: [...document.querySelectorAll(".bienvenida button, .bienvenida a")].map(b => b.innerText.trim()).slice(0, 6), usuario: document.getElementById("appUserLabel")?.innerText }));
  // Login: validación con datos vacíos
  await pg.goto(BASE + "/login", { waitUntil: "load" }); await pg.waitForTimeout(2500);
  o.login = await pg.evaluate(() => ({ google: !!document.querySelector("#googleBloque:not([hidden])"), campos: [...document.querySelectorAll("form input")].map(i => `${i.type}${i.required ? "*" : ""}${i.autocomplete ? ":" + i.autocomplete : ""}`), olvide: !!document.querySelector("[id*=forgot], [id*=olvid], [id*=reset]") }));
  // Perfil ajeno privado o inexistente
  await pg.goto(BASE + "/u/usuario-que-no-existe-xyz", { waitUntil: "load" }); await pg.waitForTimeout(3500);
  o.perfil_inexistente = await pg.evaluate(() => (document.querySelector("main, body").innerText || "").replace(/\s+/g, " ").slice(0, 160));
  await pg.goto(BASE + "/j/juego-que-no-existe-xyz-123", { waitUntil: "load" }); await pg.waitForTimeout(6000);
  o.juego_inexistente = await pg.evaluate(() => (document.querySelector("#juego")?.innerText || "").replace(/\s+/g, " ").slice(0, 120));
  o.errores = errores;
  if (errores.length) grave(`Interacciones: ${errores[0]}`);
  await ctx.close();
  return o;
});

// ---------- 7. Accesibilidad (axe) ----------
await seccion("accesibilidad", async () => {
  const axe = readFileSync("node_modules/axe-core/axe.min.js", "utf8");
  const o = {};
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, bypassCSP: true, serviceWorkers: "block" });
  for (const ruta of ["/", "/estante", "/ports", "/j/elden-ring", "/juegos", "/login"]) {
    const pg = await ctx.newPage();
    try {
      await pg.goto(BASE + ruta, { waitUntil: "load", timeout: 45000 }); await pg.waitForTimeout(3500);
      await pg.addScriptTag({ content: axe });
      const r = await pg.evaluate(async () => (await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] })).violations.map(v => ({ id: v.id, impacto: v.impact, nodos: v.nodes.length, ejemplo: (v.nodes[0]?.html || "").slice(0, 130), ayuda: v.help })));
      o[ruta] = r;
    } catch (e) { o[ruta] = { error: e.message.split("\n")[0] }; }
    await pg.close();
  }
  await ctx.close();
  return o;
});
await navegador.close();

delete informe._post; delete informe._usuarios;
console.log("\n=====INFORME=====");
console.log(JSON.stringify(informe));
console.log("=====FIN=====");
console.log(`\n${informe.graves.length} graves, ${informe.avisos.length} avisos.`);
if (informe.graves.length) process.exitCode = 1;
