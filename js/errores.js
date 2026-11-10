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

  // Hay redes que bloquean los servidores de imágenes de juegos (Steam, RAWG, PlayStation, Xbox).
  // Si una portada falla, se vuelve a pedir a través de la web (/api/icono). Si por ahí sí carga,
  // ese servidor queda anotado como bloqueado y el resto de sus imágenes va directo por la web.
  const POR_LA_WEB = /^https:\/\/(cdn\.(cloudflare|akamai)\.steamstatic\.com|shared\.(akamai|fastly|cloudflare)\.steamstatic\.com|steamcdn-a\.akamaihd\.net|media\.rawg\.io|image\.api\.playstation\.com|images-eds-ssl\.xboxlive\.com|store-images\.s-microsoft\.com|psnobj\.prod\.dl\.playstation\.net)\//;
  const viaWeb = (u) => `/api/icono?u=${encodeURIComponent(u)}`;
  const host = (u) => { try { return new URL(u).host; } catch (e) { return ""; } };
  let bloqueados = new Set();
  try { bloqueados = new Set(JSON.parse(sessionStorage.getItem("gv_img_bloqueados") || "[]")); } catch (e) { /* nada */ }
  const anotarBloqueado = (h) => {
    if (!h || bloqueados.has(h)) return;
    bloqueados.add(h);
    try { sessionStorage.setItem("gv_img_bloqueados", JSON.stringify([...bloqueados])); } catch (e) { /* nada */ }
  };
  // Cambia la imagen y avisa a app.js de que espere a este intento antes de poner el póster
  const reintentar = (img, src) => { img.dataset.reintentando = "1"; img.src = src; };
  const pedir = (img, directa) => { // por la web si ese servidor está bloqueado aquí; si no, directo
    img.dataset.directa = directa;
    if (bloqueados.has(host(directa))) { img.dataset.proxy = "1"; reintentar(img, viaWeb(directa)); }
    else { delete img.dataset.proxy; reintentar(img, directa); }
  };

  window.addEventListener("load", (e) => {
    const img = e.target;
    // Cargó por la web lo que no cargaba directo: ese servidor está bloqueado en esta red
    if (img && img.tagName === "IMG" && img.dataset.proxy === "1" && img.dataset.directa && img.naturalWidth > 0) anotarBloqueado(host(img.dataset.directa));
  }, true);

  window.addEventListener("error", (e) => {
    const img = e.target;
    if (!img || img.tagName !== "IMG") return;
    const actual = img.getAttribute("src") || "";
    const directa = img.dataset.directa || actual;
    // 1. Falló directo: el mismo archivo, pero pedido a través de la web
    if (POR_LA_WEB.test(actual) && !img.dataset.proxy) { img.dataset.proxy = "1"; img.dataset.directa = actual; reintentar(img, viaWeb(actual)); return; }
    // 2. Miniatura de RAWG que no existe: se vuelve a la imagen original
    if (img.dataset.original && directa !== img.dataset.original) { const o = img.dataset.original; delete img.dataset.original; img.setAttribute("data-tal-cual", ""); pedir(img, o); return; }
    // 3. Steam no tiene carátula vertical de todos los juegos: se usa la horizontal
    if (/\/steam\/apps\/\d+\/library_600x900(_2x)?\.jpg/.test(directa) && !img.dataset.steamAncha) {
      img.dataset.steamAncha = "1";
      pedir(img, directa.replace(/library_600x900(_2x)?\.jpg.*/, "header.jpg"));
      return;
    }
    // 4. Imagen de respaldo declarada en el HTML (data-respaldo), en vez de onerror en línea
    if (img.dataset.respaldo && actual !== img.dataset.respaldo && img.src !== img.dataset.respaldo) { img.src = img.dataset.respaldo; }
  }, true);

  // Las portadas de RAWG pesan 300–800 KB cada una: en listas y tarjetas se pide la versión reducida
  // (media.rawg.io/media/resize/<ancho>/-/…). Vale para cualquier <img> que aparezca en la página.
  const ANCHO = window.innerWidth <= 640 ? 420 : 640;
  const RAWG = /^https:\/\/media\.rawg\.io\/media\/(games|screenshots)\//;
  function reducir(img) {
    let src = img.getAttribute("src") || "";
    if (RAWG.test(src) && !img.dataset.original && !img.hasAttribute("data-tal-cual")) {
      img.dataset.original = src;
      src = src.replace("/media/", `/media/resize/${ANCHO}/-/`);
      img.setAttribute("src", src);
    }
    // Servidor bloqueado en esta red: la imagen se pide por la web desde el principio
    if (bloqueados.size && !img.dataset.proxy && POR_LA_WEB.test(src) && bloqueados.has(host(src))) {
      img.dataset.proxy = "1"; img.dataset.directa = src;
      img.setAttribute("src", viaWeb(src));
    }
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
