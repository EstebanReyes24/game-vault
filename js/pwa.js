/**
 * Paindex Vault como app (PWA): registra el service worker y ofrece instalarla.
 * - Android / Chrome / Edge: usa el aviso nativo de instalación.
 * - iPhone / iPad (Safari): explica Compartir → "Añadir a pantalla de inicio".
 * - Android sin aviso nativo: pasos del menú ⋮. Dentro de otra app (Google, Instagram…): abrirla en el navegador.
 * - Un aviso discreto abajo en el móvil a los pocos segundos (si se cierra, no vuelve en 30 días),
 *   más el botón de la portada y el de "Mi perfil".
 */
(function () {
  const leer = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const poner = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } };

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
  }

  const instalada = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const ua = navigator.userAgent;
  const esIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  // Navegadores dentro de otras apps (Google, Instagram, Facebook, TikTok…): ahí no se puede instalar
  const enOtraApp = /\bGSA\/|FBAN|FBAV|Instagram|TikTok|musical_ly|Line\/|Snapchat|; wv\)/i.test(ua);
  const esAndroid = /android/i.test(ua);
  const esMovil = esIOS || esAndroid;
  let aviso = null; // el evento de instalación de Chrome

  if (instalada) {
    document.documentElement.classList.add("como-app");
    setTimeout(() => window.marcarUso?.("usa_app"), 3000);
    return;
  }

  // Cuenta de visitas (una por día) para no molestar en la primera
  const hoy = new Date().toISOString().slice(0, 10);
  if (leer("gv_visita_dia") !== hoy) { poner("gv_visita_dia", hoy); poner("gv_visitas", String(Number(leer("gv_visitas") || 0) + 1)); }

  // En el móvil siempre hay una forma: el aviso nativo, los pasos del menú o abrirla en el navegador
  const puede = () => !!aviso || esMovil;

  function mostrarBotones() {
    document.querySelectorAll("[data-instalar-app], #pwaInstallBtn").forEach(b => { b.hidden = false; b.classList.remove("hidden"); });
  }

  async function instalar() {
    if (aviso) {
      aviso.prompt();
      const { outcome } = await aviso.userChoice.catch(() => ({ outcome: "dismissed" }));
      aviso = null;
      if (outcome === "accepted") cerrarBanner(true);
      return;
    }
    if (esMovil) { mostrarPasos(); return; }
    alert("Abre esta página en Chrome o Edge para instalarla como app.");
  }

  function pasos() {
    if (enOtraApp) return {
      titulo: "Ábrela en tu navegador",
      lista: [`Toca el menú <b>⋮</b> o <b>···</b> de arriba.`, `Elige <b>Abrir en ${esIOS ? "Safari" : "Chrome"}</b> (o «Abrir en el navegador»).`, `Allí vuelve a pulsar <b>Instalar</b>.`]
    };
    if (esIOS) return {
      titulo: "Instala Paindex Vault",
      lista: [`Toca <b>Compartir</b> <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M5 11v9h14v-9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> (abajo en Safari, arriba junto a la dirección en Chrome).`, `Baja y elige <b>Añadir a pantalla de inicio</b>.`, `Pulsa <b>Añadir</b>. Listo: se abre como una app, a pantalla completa.`]
    };
    return {
      titulo: "Instala Paindex Vault",
      lista: [`Toca el menú <b>⋮</b> arriba a la derecha de Chrome.`, `Elige <b>Instalar app</b> o <b>Añadir a pantalla de inicio</b>.`, `Confirma con <b>Instalar</b>. Listo: queda con su icono.`]
    };
  }

  function mostrarPasos() {
    let caja = document.getElementById("pwaPasosIOS");
    if (!caja) {
      caja = document.createElement("div");
      caja.id = "pwaPasosIOS";
      caja.className = "pwa-ios";
      caja.setAttribute("role", "dialog");
      caja.setAttribute("aria-modal", "true");
      caja.setAttribute("aria-labelledby", "pwaIOSTitulo");
      const p = pasos();
      caja.innerHTML = `
        <div class="pwa-ios-panel">
          <h2 id="pwaIOSTitulo">${p.titulo}</h2>
          <ol>${p.lista.map(x => `<li>${x}</li>`).join("")}</ol>
          <button type="button" class="boton boton-senal" id="pwaIOSCerrar">Entendido</button>
        </div>`;
      document.body.appendChild(caja);
      caja.addEventListener("click", (e) => { if (e.target === caja || e.target.id === "pwaIOSCerrar") caja.hidden = true; });
    }
    caja.hidden = false;
  }

  // Aviso de abajo (solo en el móvil, desde la segunda visita)
  function cerrarBanner(instalo) {
    document.getElementById("pwaBanner")?.remove();
    if (!instalo) poner("gv_banner_app", String(Date.now()));
  }
  function quizaBanner() {
    if (!esMovil || !puede() || document.getElementById("pwaBanner")) return;
    if (Date.now() - Number(leer("gv_banner_app") || 0) < 30 * 86400000) return;
    const b = document.createElement("div");
    b.id = "pwaBanner";
    b.className = "pwa-banner";
    b.setAttribute("role", "region");
    b.setAttribute("aria-label", "Instalar la app");
    b.innerHTML = `
      <img src="/icons/icon-192.png" alt="" width="40" height="40">
      <span><b>Paindex Vault en tu pantalla</b><small>Ábrela como app, sin barra del navegador.</small></span>
      <button type="button" class="boton boton-senal" data-accion="instalar">Instalar</button>
      <button type="button" class="pwa-banner-x" data-accion="cerrar" aria-label="Ahora no">×</button>`;
    b.addEventListener("click", (e) => {
      const a = e.target.closest("[data-accion]")?.dataset.accion;
      if (a === "instalar") { window.marcarUso?.("instalar_app"); const nativo = !!aviso; instalar(); if (!nativo) cerrarBanner(false); }
      if (a === "cerrar") cerrarBanner(false);
    });
    document.body.appendChild(b);
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    aviso = e;
    mostrarBotones();
    setTimeout(quizaBanner, 8000);
  });
  window.addEventListener("appinstalled", () => { cerrarBanner(true); window.marcarUso?.("app_instalada"); });

  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-instalar-app], #pwaInstallBtn")) { window.marcarUso?.("instalar_app"); instalar(); }
  });

  // Si Chrome no da su aviso (o es iPhone u otra app), igual se ofrece con los pasos a mano
  const alCargar = () => { if (esMovil) { mostrarBotones(); setTimeout(quizaBanner, 15000); } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", alCargar); else alCargar();

  window.PWA = { instalar, puede, instalada };
})();
