/**
 * Registro de errores: si algo falla en el navegador de un visitante, se anota
 * en Supabase (migración 010) para que el admin lo vea en Moderación → Errores.
 * Como máximo 5 por visita y sin repetir el mismo mensaje.
 */
(function () {
  const URL_RPC = "https://epouactrnuhdbzzvzxor.supabase.co/rest/v1/rpc/registrar_error";
  const CLAVE = "sb_publishable_i2sc-SaHk8H6e3c-Dwf0IQ_hhdBlx_I";
  const vistos = new Set();
  let enviados = 0;

  function enviar(mensaje, fuente, linea) {
    const m = String(mensaje || "").slice(0, 500);
    // ruido de extensiones del navegador y scripts de terceros que no podemos arreglar
    if (!m || vistos.has(m) || enviados >= 5 || /^Script error\.?$/i.test(m) || /extension:\/\//.test(fuente || "")) return;
    vistos.add(m);
    enviados++;
    try {
      fetch(URL_RPC, {
        method: "POST",
        keepalive: true,
        headers: { apikey: CLAVE, Authorization: `Bearer ${CLAVE}`, "Content-Type": "application/json" },
        body: JSON.stringify({ mensaje: m, fuente: String(fuente || "").slice(0, 300), pagina: location.pathname + location.search, linea: Number(linea) || null, navegador: navigator.userAgent })
      }).catch(() => {});
    } catch (e) { /* nunca romper la página por registrar un error */ }
  }

  // Portadas e iconos de PlayStation (psnobj) no cargan directo en muchos navegadores:
  // si una falla, se vuelve a pedir a través de la web (/api/icono). Vale para toda la página.
  window.addEventListener("error", (e) => {
    const img = e.target;
    if (!img || img.tagName !== "IMG" || img.dataset.reintento) return;
    try {
      const u = new URL(img.currentSrc || img.src);
      if (u.hostname !== "psnobj.prod.dl.playstation.net") return;
      img.dataset.reintento = "1";
      img.src = `/api/icono?u=${encodeURIComponent(u.href)}`;
    } catch (err) { /* nada */ }
  }, true);

  window.addEventListener("error", (e) => {
    if (e.target && e.target !== window) return; // imágenes rotas, etc.
    enviar(e.message, e.filename, e.lineno);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    enviar(r && r.message ? r.message : String(r), r && r.stack ? String(r.stack).split("\n")[1] : "", null);
  });
})();
