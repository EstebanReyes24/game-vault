/**
 * Notificaciones en este dispositivo (migración 021 + api/push.js + sw.js).
 * window.Push.pintar(caja) dibuja el estado y los botones: Activar / Probar / Desactivar.
 */
(function () {
  if (!window.supabaseClient) return;
  const soporta = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const instalada = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  let clavePublica;

  const aBytes = (b64) => {
    const s = atob(b64.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (b64.length % 4)) % 4));
    return Uint8Array.from(s, c => c.charCodeAt(0));
  };

  async function clave() {
    if (clavePublica !== undefined) return clavePublica;
    try { clavePublica = (await fetch("/api/push?clave=1").then(r => r.json())).publica || null; } catch (e) { clavePublica = null; }
    return clavePublica;
  }

  async function suscripcion() {
    if (!soporta) return null;
    const reg = await navigator.serviceWorker.getRegistration("/");
    return reg ? reg.pushManager.getSubscription() : null;
  }

  async function estado() {
    if (!soporta) return esIOS && !instalada ? "instalar" : "no";
    if (!(await clave())) return "sin-configurar";
    if (Notification.permission === "denied") return "bloqueado";
    return (await suscripcion()) && Notification.permission === "granted" ? "activo" : "inactivo";
  }

  async function activar() {
    const pub = await clave();
    if (!pub) throw new Error("Las notificaciones aún no están configuradas en la web.");
    const permiso = await Notification.requestPermission();
    if (permiso !== "granted") throw new Error("No diste permiso. Puedes cambiarlo en los ajustes del navegador para esta web.");
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(pub) });
    const j = sub.toJSON();
    const { error } = await supabaseClient.rpc("registrar_push", { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth });
    if (error) throw new Error(/registrar_push/.test(error.message) ? "Falta ejecutar la migración 021 en Supabase." : error.message);
  }

  async function desactivar() {
    const sub = await suscripcion();
    if (!sub) return;
    await supabaseClient.from("push_subs").delete().eq("endpoint", sub.endpoint);
    await sub.unsubscribe().catch(() => {});
  }

  async function probar() {
    const { error } = await supabaseClient.rpc("probar_push");
    if (error) throw new Error(error.message);
  }

  const TEXTOS = {
    activo: ["fa-bell", "Activadas en este dispositivo."],
    inactivo: ["fa-bell-slash", "Recibe en este dispositivo los avisos de seguidores, amigos, precios y lanzamientos."],
    bloqueado: ["fa-ban", "Las bloqueaste para esta web. Actívalas en los ajustes del navegador (el candado junto a la dirección) y vuelve aquí."],
    instalar: ["fa-mobile-screen", "En iPhone, primero instala la app: Compartir → «Añadir a pantalla de inicio». Luego ábrela desde el icono y actívalas aquí."],
    no: ["fa-circle-info", "Este navegador no admite notificaciones. Prueba con Chrome, Edge, Brave, Firefox o Safari."],
    "sin-configurar": ["fa-wrench", "Pronto: las notificaciones en el teléfono se están terminando de configurar."]
  };

  async function pintar(caja) {
    if (!caja) return;
    const { data } = await supabaseClient.auth.getSession();
    if (!data?.session) { caja.hidden = true; return; }
    const e = await estado();
    const [icono, texto] = TEXTOS[e];
    caja.hidden = false;
    caja.innerHTML = `
      <p class="push-texto"><i class="fa-solid ${icono}" aria-hidden="true"></i> ${texto}</p>
      <div class="push-botones">
        ${e === "inactivo" ? `<button type="button" class="boton boton-senal" data-push="activar">Activar en este dispositivo</button>` : ""}
        ${e === "activo" ? `<button type="button" class="boton boton-linea" data-push="probar">Probar</button><button type="button" class="resena-mas" data-push="desactivar">Desactivar</button>` : ""}
      </div>
      <p class="push-estado" role="status"></p>`;
    caja.onclick = async (ev) => {
      const b = ev.target.closest("[data-push]");
      if (!b) return;
      ev.stopPropagation();
      const aviso = caja.querySelector(".push-estado");
      b.disabled = true;
      try {
        if (b.dataset.push === "activar") { await activar(); await pintar(caja); caja.querySelector(".push-estado").textContent = "¡Listo! Pulsa Probar para comprobarlo."; return; }
        if (b.dataset.push === "probar") { await probar(); aviso.textContent = "Enviada: debería llegarte en unos segundos."; }
        if (b.dataset.push === "desactivar") { await desactivar(); await pintar(caja); return; }
      } catch (err) { aviso.textContent = err.message || "No se pudo completar."; }
      b.disabled = false;
    };
  }

  window.Push = { soporta, estado, activar, desactivar, probar, pintar };
})();
