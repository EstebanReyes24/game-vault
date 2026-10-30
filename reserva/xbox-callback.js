/**
 * Vuelta del inicio de sesión con Xbox. Cambia el código por la clave del
 * usuario (POST /app/claim), lee su historial de juegos UNA vez y se lo pasa
 * a la web. La clave del usuario no se guarda en ningún sitio.
 * Necesita OPENXBL_APP_KEY (clave privada de la app) en Vercel.
 */
import { OPENXBL, titulosXbox } from "../api/_xbox.js";

function pagina(res, datos) {
  // JSON seguro dentro de <script>: sin "<" que pueda cerrar la etiqueta
  const json = JSON.stringify(datos).replace(/</g, "\\u003c").replace(/[\u2028\u2029]/g, c => (c === "\u2028" ? "\\u2028" : "\\u2029"));
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.status(200).send(`<!doctype html><meta charset="utf-8"><title>Conectando con Xbox…</title>
<body style="background:#14111a;color:#ece7ee;font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0">
<p>Conectando con Xbox…</p>
<script>
try { sessionStorage.setItem("xboxImport", JSON.stringify(${json})); } catch (e) {}
location.replace("/estante?xbox=1");
</script></body>`);
}

export default async function handler(req, res) {
  const codigo = String(req.query.code || "").trim();
  const privada = process.env.OPENXBL_APP_KEY;
  if (!codigo) return pagina(res, { error: "Xbox no devolvió el permiso. Vuelve a intentarlo." });
  if (!privada) return pagina(res, { error: "La conexión con Xbox no está configurada en el servidor." });

  try {
    const r = await fetch(`${OPENXBL}/app/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ code: codigo, app_key: privada })
    });
    if (!r.ok) return pagina(res, { error: "No se pudo completar el inicio de sesión con Xbox. Vuelve a intentarlo." });
    const cuenta = await r.json();
    const claveUsuario = cuenta.app_key || cuenta.content?.app_key;
    if (!claveUsuario) return pagina(res, { error: "Xbox no devolvió el acceso a tu cuenta." });
    const juegos = await titulosXbox(claveUsuario, true);
    return pagina(res, { gamertag: cuenta.gamertag || cuenta.content?.gamertag || "", juegos });
  } catch (e) {
    return pagina(res, { error: e.message || "No se pudo leer tu historial de Xbox." });
  }
}
