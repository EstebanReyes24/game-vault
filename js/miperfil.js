/**
 * "Mi perfil": se abre al tocar tu usuario arriba (o con /estante?perfil=1).
 * Foto, descripción, estante público/privado, enlace a tu perfil, cuentas vinculadas,
 * cerrar sesión y eliminar la cuenta, todo en un mismo sitio.
 */
(function () {
  const modal = document.getElementById("perfilModal");
  if (!modal || !window.DB || isSpectatorMode) return;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => escapeHTML(String(s ?? ""));
  let perfil = null;
  let correo = "";

  function pintarFoto(url) {
    const caja = $("miPerfilFoto");
    caja.innerHTML = url ? `<img src="${esc(url)}" alt="">` : '<i class="fa-solid fa-user"></i>';
    $("miPerfilQuitarFoto").hidden = !url;
    $("miPerfilFotoTexto").textContent = url ? "Cambiar foto" : "Poner foto";
    window.Avatar?.fotoEnCabecera(url);
  }

  async function pintarCuentas() {
    const lista = $("miPerfilCuentas");
    const c = await DB.getCuentas().catch(() => null);
    const filas = [
      ["Steam", "fa-steam", c?.steam_id, ["steam_id"]],
      ["Xbox", "fa-xbox", c?.xbox_gamertag, ["xbox_gamertag", "xbox_xuid"]],
      ["PlayStation", "fa-playstation", c?.psn_online_id, ["psn_online_id", "psn_account_id"]]
    ];
    lista.innerHTML = filas.map(([nombre, icono, valor, campos]) => `
      <li>
        <i class="fa-brands ${icono}" aria-hidden="true"></i>
        <span><b>${nombre}</b><small>${valor ? esc(valor) : "Sin vincular: se vincula al importar"}</small></span>
        ${valor ? `<button type="button" class="resena-mas" data-desvincular="${campos.join(",")}" data-nombre="${nombre}">Desvincular</button>` : ""}
      </li>`).join("");
  }

  async function abrir() {
    perfil = await DB.getMyProfile();
    if (!perfil) { location.href = "/login"; return; }
    const { data: { session } } = await supabaseClient.auth.getSession();
    correo = session?.user?.email || "";
    $("miPerfilUsuario").textContent = `@${perfil.username}`;
    $("miPerfilCorreo").textContent = correo;
    $("miPerfilVer").href = `/u/${encodeURIComponent(perfil.username)}`;
    $("miPerfilBio").value = perfil.bio || "";
    $("miPerfilBioCuenta").textContent = `${($("miPerfilBio").value || "").length}/160`;
    pintarFoto(perfil.avatar_url || null);
    modal.classList.remove("hidden");
    pintarCuentas();
  }
  const cerrar = () => modal.classList.add("hidden");

  // Los botones de privacidad y de borrar la cuenta (con su lógica de siempre) viven aquí, no al pie
  $("miPerfilVisibilidad").appendChild($("profileVisibilityBtn") || document.createTextNode(""));
  $("miPerfilBorrar").appendChild($("deleteAccountBtn") || document.createTextNode(""));
  // Al pie queda un acceso directo
  const pie = $("accountControls");
  if (pie) {
    const acceso = document.createElement("button");
    acceso.type = "button";
    acceso.className = "px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition cursor-pointer flex items-center gap-1.5";
    acceso.innerHTML = '<i class="fa-solid fa-user-gear" aria-hidden="true"></i> Mi perfil';
    acceso.addEventListener("click", () => abrir());
    pie.prepend(acceso);
  }

  $("miPerfilCerrar").addEventListener("click", cerrar);
  modal.addEventListener("click", (e) => { if (e.target === modal) cerrar(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.classList.contains("hidden")) cerrar(); });

  $("miPerfilArchivo").addEventListener("change", async (e) => {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    $("miPerfilFotoTexto").textContent = "Subiendo…";
    try {
      const url = await DB.subirAvatar(await window.Avatar.preparar(archivo));
      pintarFoto(url);
      showToast("Foto de perfil actualizada.");
    } catch (err) {
      pintarFoto(perfil?.avatar_url || null);
      showToast(err.message || "No se pudo subir la foto.", true);
    }
  });
  $("miPerfilQuitarFoto").addEventListener("click", async () => {
    if (!confirm("¿Quitar tu foto de perfil?")) return;
    try { await DB.quitarMiAvatar(); if (perfil) perfil.avatar_url = null; pintarFoto(null); showToast("Foto quitada."); }
    catch (err) { showToast(err.message, true); }
  });

  $("miPerfilBio").addEventListener("input", (e) => { $("miPerfilBioCuenta").textContent = `${e.target.value.length}/160`; });
  $("miPerfilGuardarBio").addEventListener("click", async () => {
    try { const bio = await DB.guardarBio($("miPerfilBio").value); if (perfil) perfil.bio = bio; showToast(bio ? "Descripción guardada." : "Descripción borrada."); }
    catch (err) { showToast(err.message, true); }
  });

  $("miPerfilCopiar").addEventListener("click", async () => {
    if (!perfil) return;
    const url = `${location.origin}/u/${encodeURIComponent(perfil.username)}`;
    try { await navigator.clipboard.writeText(url); showToast("Enlace copiado."); } catch (e) { prompt("Copia el enlace:", url); }
  });

  $("miPerfilCuentas").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-desvincular]");
    if (!b) return;
    if (!confirm(`¿Desvincular ${b.dataset.nombre}? Tus juegos se quedan; solo dejará de actualizarse con ese botón.`)) return;
    try { await DB.desvincularCuenta(b.dataset.desvincular.split(",")); showToast(`${b.dataset.nombre} desvinculado.`); pintarCuentas(); }
    catch (err) { showToast(err.message, true); }
  });

  $("miPerfilSalir").addEventListener("click", async () => {
    if (!confirm(`¿Cerrar la sesión de ${correo || "tu cuenta"}?`)) return;
    StorageManager.clearAll();
    if (typeof setLocalOwner === "function") setLocalOwner(null);
    await DB.signOut();
    location.reload();
  });

  // Tocar tu usuario arriba abre "Mi perfil" (lo engancha app.js en el botón de la cuenta)
  if (new URLSearchParams(location.search).get("perfil") === "1") {
    history.replaceState(null, "", location.pathname);
    setTimeout(abrir, 600);
  }
  window.MiPerfil = { abrir };
})();
