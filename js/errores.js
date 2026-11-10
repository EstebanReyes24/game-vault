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
    if (!img || img.tagName !== "IMG") return;
    // Miniatura de RAWG que no existe: se vuelve a la imagen original
    if (img.dataset.original && img.src !== img.dataset.original) { const o = img.dataset.original; delete img.dataset.original; img.dataset.reintentando = "1"; img.src = o; return; }
    // Steam no tiene carátula vertical de todos los juegos: se usa la horizontal
    if (/\/steam\/apps\/\d+\/library_600x900(_2x)?\.jpg/.test(img.src) && !img.dataset.steamAncha) {
      img.dataset.steamAncha = "1";
      img.dataset.reintentando = "1"; // app.js espera a este segundo intento antes de poner el póster
      img.src = img.src.replace(/library_600x900(_2x)?\.jpg.*/, "header.jpg");
      return;
    }
    // Imagen de respaldo declarada en el HTML (data-respaldo), en vez de onerror en línea
    if (img.dataset.respaldo && img.src !== img.dataset.respaldo && !/\/api\/icono/.test(img.src) && !img.dataset.reintento) {
      if (!/psnobj\.prod\.dl\.playstation\.net/.test(img.src)) { img.src = img.dataset.respaldo; return; }
    }
    if (img.dataset.reintento) { if (img.dataset.respaldo && img.src !== img.dataset.respaldo) img.src = img.dataset.respaldo; return; }
    try {
      const u = new URL(img.currentSrc || img.src);
      if (u.hostname !== "psnobj.prod.dl.playstation.net") return;
      img.dataset.reintento = "1";
      img.src = `/api/icono?u=${encodeURIComponent(u.href)}`;
    } catch (err) { /* nada */ }
  }, true);

  // Las portadas de RAWG pesan 300–800 KB cada una: en listas y tarjetas se pide la versión reducida
  // (media.rawg.io/media/resize/<ancho>/-/…). Vale para cualquier <img> que aparezca en la página.
  const ANCHO = window.innerWidth <= 640 ? 420 : 640;
  const RAWG = /^https:\/\/media\.rawg\.io\/media\/(games|screenshots)\//;
  function reducir(img) {
    const src = img.getAttribute("src") || "";
    if (!RAWG.test(src) || img.dataset.original || img.hasAttribute("data-tal-cual")) return;
    img.dataset.original = src;
    img.setAttribute("src", src.replace("/media/", `/media/resize/${ANCHO}/-/`));
  }
  window.miniatura = (url) => (RAWG.test(String(url || "")) ? String(url).replace("/media/", `/media/resize/${ANCHO}/-/`) : url);
  if ("MutationObserver" in window) {
    new MutationObserver((cambios) => {
      for (const c of cambios) {
        if (c.type === "attributes") { if (c.target.tagName === "IMG") reducir(c.target); continue; }
        c.addedNodes.forEach(n => {
          if (n.nodeType !== 1) return;
          if (n.tagName === "IMG") reducir(n);
          else n.querySelectorAll?.("img").forEach(reducir);
        });
      }
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] });
  }

  window.addEventListener("error", (e) => {
    if (e.target && e.target !== window) return; // imágenes rotas, etc.
    enviar(e.message, e.filename, e.lineno);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    enviar(r && r.message ? r.message : String(r), r && r.stack ? String(r.stack).split("\n")[1] : "", null);
  });
})();
