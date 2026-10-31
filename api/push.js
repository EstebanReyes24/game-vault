/**
 * Notificaciones en el teléfono (migración 021).
 *   GET  /api/push?clave=1     → la clave pública VAPID para suscribirse
 *   GET  /api/push?preparar=1  → (solo mientras no esté configurado) claves nuevas y los pasos para guardarlas
 *   POST /api/push             → lo llama Supabase con cada aviso nuevo (cabecera x-push-secreto)
 * En Vercel: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY y PUSH_SECRETO.
 */
import crypto from "node:crypto";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./_supabase.js";
import { generarClavesVapid, enviarPush } from "./_webpush.js";

const PUBLICA = process.env.VAPID_PUBLIC_KEY || "";
const PRIVADA = process.env.VAPID_PRIVATE_KEY || "";
const SECRETO = process.env.PUSH_SECRETO || "";
const ICONOS = { seguidor: "👤", comentario: "💬", precio: "🏷️", salida: "🚀", amigo: "🎮", prueba: "🔔" };

const rpc = (nombre, datos) => fetch(`${SUPABASE_URL}/rest/v1/rpc/${nombre}`, {
  method: "POST",
  headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify(datos),
  signal: AbortSignal.timeout(6000)
});

const igualSeguro = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

function paginaPreparar(res, origen) {
  const { publica, privada } = generarClavesVapid();
  const secreto = crypto.randomBytes(32).toString("base64url");
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const sql = `insert into privado.ajustes (clave, valor) values\n  ('push_url', '${origen}/api/push'),\n  ('push_secreto', '${secreto}')\non conflict (clave) do update set valor = excluded.valor;`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  return res.status(200).send(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Configurar notificaciones</title>
<style>body{font:15px/1.5 system-ui,sans-serif;background:#14111a;color:#ece7ee;max-width:760px;margin:2rem auto;padding:0 1rem}code,pre{background:#241f2c;border-radius:6px;padding:.15rem .35rem;word-break:break-all;white-space:pre-wrap}pre{padding:.8rem}h1{font-size:1.5rem}li{margin:.7rem 0}.ojo{color:#ffb4bf}</style>
<h1>Configurar las notificaciones en el teléfono</h1>
<p class="ojo">Estas claves son nuevas y solo se muestran ahora: no las compartas ni las pegues en ningún chat. Si recargas, salen otras (usa siempre las de la misma página).</p>
<ol>
<li>En <b>Vercel → Settings → Environment Variables</b>, crea estas tres (Production) y guarda:
<p><code>VAPID_PUBLIC_KEY</code> = <code>${esc(publica)}</code></p>
<p><code>VAPID_PRIVATE_KEY</code> = <code>${esc(privada)}</code></p>
<p><code>PUSH_SECRETO</code> = <code>${esc(secreto)}</code></p></li>
<li>En <b>Supabase → SQL Editor</b>, ejecuta esto (después de la migración 021):<pre>${esc(sql)}</pre></li>
<li>En Vercel, <b>Deployments → ⋯ → Redeploy</b> del último despliegue para que tome las variables.</li>
<li>Abre tu estante, toca la campana y pulsa <b>Activar en este dispositivo</b>, y luego <b>Probar</b>.</li>
</ol></html>`);
}

export default async function handler(req, res) {
  const origen = `https://${req.headers["x-forwarded-host"] || req.headers.host}`;

  if (req.method === "GET") {
    if (req.query.preparar === "1") {
      if (PUBLICA && PRIVADA && SECRETO) return res.status(409).json({ error: "Las notificaciones ya están configuradas." });
      return paginaPreparar(res, origen);
    }
    res.setHeader("Cache-Control", "public, s-maxage=3600");
    return res.status(200).json(PUBLICA ? { publica: PUBLICA } : { publica: null });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  if (!SECRETO || !igualSeguro(req.headers["x-push-secreto"] || "", SECRETO)) return res.status(401).json({ ok: false });
  if (!PUBLICA || !PRIVADA) return res.status(503).json({ error: "Faltan las claves VAPID en Vercel." });

  const aviso = req.body || {};
  if (!/^[0-9a-f-]{36}$/i.test(String(aviso.user_id || ""))) return res.status(400).json({ error: "Aviso no válido." });

  const r = await rpc("push_destinos", { p_secreto: SECRETO, p_user: aviso.user_id });
  if (!r.ok) return res.status(502).json({ error: "No se pudieron leer los dispositivos." });
  const destinos = await r.json();

  const titulo = aviso.kind === "precio" || aviso.kind === "salida" || aviso.kind === "prueba"
    ? `${ICONOS[aviso.kind] || "🔔"} Paindex Vault`
    : `${ICONOS[aviso.kind] || "🔔"} @${String(aviso.actor || "alguien").slice(0, 30)}`;
  const mensaje = {
    titulo,
    texto: String(aviso.texto || "Tienes un aviso nuevo").slice(0, 200),
    enlace: /^\/[A-Za-z0-9/_?=&.-]*$/.test(String(aviso.enlace || "")) ? aviso.enlace : "/",
    etiqueta: `aviso-${aviso.kind || "x"}-${aviso.actor || ""}`
  };

  const claves = { publica: PUBLICA, privada: PRIVADA, contacto: origen };
  let enviados = 0;
  await Promise.all(destinos.map(async (d) => {
    try {
      const estado = await enviarPush(d, mensaje, claves);
      if (estado === 404 || estado === 410) await rpc("push_olvidar", { p_secreto: SECRETO, p_endpoint: d.endpoint });
      else if (estado >= 200 && estado < 300) enviados++;
      else console.warn("push:", estado, new URL(d.endpoint).host);
    } catch (e) { console.warn("push: fallo al enviar", e.message); }
  }));
  return res.status(200).json({ ok: true, enviados, dispositivos: destinos.length });
}
