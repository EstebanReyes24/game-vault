/**
 * Foto de perfil (migración 015).
 * - En tu estante: "Foto de perfil" recorta la imagen al centro, la deja en 256×256 WebP
 *   (así pesa poco y se pierden los datos ocultos de la foto, como la ubicación) y la sube.
 * - En la cabecera sale tu foto; en un perfil público, la de esa persona.
 * - El admin puede quitar una foto inapropiada desde el perfil.
 */
(function () {
  if (!window.DB || !window.supabaseClient) return;
  const LADO = 256;

  function ponerFoto(el, url, texto) {
    if (!el) return;
    if (url) {
      el.innerHTML = "";
      const img = document.createElement("img");
      img.src = url;
      img.alt = texto || "";
      img.className = "avatar-img";
      img.addEventListener("error", () => { el.textContent = (texto || "?").charAt(0).toUpperCase(); }, { once: true });
      el.appendChild(img);
      el.classList.add("con-foto");
    } else {
      el.classList.remove("con-foto");
    }
  }
  window.Avatar = { ponerFoto };

  // Recorta al centro y reduce a 256×256 WebP
  async function preparar(archivo) {
    if (!/^image\/(png|jpe?g|webp|gif|heic|heif)$/i.test(archivo.type)) throw new Error("Elige una imagen (JPG, PNG o WebP).");
    if (archivo.size > 15 * 1024 * 1024) throw new Error("La imagen es muy grande (máximo 15 MB).");
    const bitmap = await createImageBitmap(archivo).catch(() => { throw new Error("No se pudo leer esa imagen. Prueba con un JPG o PNG."); });
    const lado = Math.min(bitmap.width, bitmap.height);
    const lienzo = document.createElement("canvas");
    lienzo.width = lienzo.height = LADO;
    lienzo.getContext("2d").drawImage(bitmap, (bitmap.width - lado) / 2, (bitmap.height - lado) / 2, lado, lado, 0, 0, LADO, LADO);
    const blob = await new Promise(r => lienzo.toBlob(r, "image/webp", 0.85));
    if (!blob) throw new Error("Tu navegador no pudo preparar la imagen.");
    return blob;
  }

  // ---------- cabecera: mi foto ----------
  function fotoEnCabecera(url) {
    const icono = document.getElementById("appUserIcon");
    const enlace = document.getElementById("appAuthBtn") || document.getElementById("authBtn");
    if (!enlace) return;
    let img = enlace.querySelector(".avatar-cabecera");
    if (!url) { if (img) img.remove(); if (icono) icono.hidden = false; return; }
    if (!img) { img = document.createElement("img"); img.className = "avatar-cabecera"; img.alt = ""; enlace.prepend(img); }
    img.src = url;
    if (icono) icono.hidden = true;
    const iconoPortada = document.getElementById("authIcon");
    if (iconoPortada) iconoPortada.hidden = true;
  }

  async function cargarMia() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) return null;
    const p = await DB.getMyProfile();
    fotoEnCabecera(p?.avatar_url || null);
    return p;
  }

  // ---------- en mi estante: subir o quitar ----------
  const controles = document.getElementById("accountControls");
  if (controles && typeof isSpectatorMode !== "undefined" && !isSpectatorMode) {
    const caja = document.createElement("div");
    caja.className = "avatar-controles";
    caja.innerHTML = `
      <span class="avatar-mini" id="avatarMini" aria-hidden="true"><i class="fa-solid fa-user"></i></span>
      <label class="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition cursor-pointer flex items-center gap-1.5">
        <i class="fa-solid fa-camera" aria-hidden="true"></i> <span id="avatarTexto">Poner foto de perfil</span>
        <input type="file" id="avatarArchivo" accept="image/png,image/jpeg,image/webp" hidden>
      </label>
      <button type="button" id="avatarQuitar" class="hover:text-rose-400 transition cursor-pointer" hidden>Quitar foto</button>`;
    controles.prepend(caja);
    const mini = caja.querySelector("#avatarMini");
    const quitar = caja.querySelector("#avatarQuitar");
    const texto = caja.querySelector("#avatarTexto");
    const mostrar = (url) => {
      if (url) { mini.innerHTML = `<img src="${url}" alt="">`; } else { mini.innerHTML = '<i class="fa-solid fa-user"></i>'; }
      quitar.hidden = !url;
      texto.textContent = url ? "Cambiar foto" : "Poner foto de perfil";
      fotoEnCabecera(url);
    };
    caja.querySelector("#avatarArchivo").addEventListener("change", async (e) => {
      const archivo = e.target.files?.[0];
      e.target.value = "";
      if (!archivo) return;
      texto.textContent = "Subiendo…";
      try {
        const url = await DB.subirAvatar(await preparar(archivo));
        mostrar(url);
        showToast("Foto de perfil actualizada.");
      } catch (err) {
        texto.textContent = "Poner foto de perfil";
        showToast(err.message || "No se pudo subir la foto.", true);
      }
    });
    quitar.addEventListener("click", async () => {
      if (!confirm("¿Quitar tu foto de perfil?")) return;
      try { await DB.quitarMiAvatar(); mostrar(null); showToast("Foto quitada."); }
      catch (err) { showToast(err.message, true); }
    });
    cargarMia().then(p => mostrar(p?.avatar_url || null));
    supabaseClient.auth.onAuthStateChange(() => setTimeout(() => cargarMia().then(p => mostrar(p?.avatar_url || null)), 0));
  } else {
    cargarMia();
  }

  // ---------- perfil público: su foto (y el admin puede quitarla) ----------
  if (typeof isSpectatorMode !== "undefined" && isSpectatorMode && typeof publicProfileTarget !== "undefined") {
    const nombre = String(publicProfileTarget).toLowerCase();
    DB.getAvatar(nombre).then(async url => {
      ponerFoto(document.getElementById("perfilAvatar"), url, nombre);
      if (!url || !(await DB.isAdmin().catch(() => false))) return;
      const acciones = document.querySelector("#spectatorBanner .perfil-acciones");
      if (!acciones) return;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "boton boton-linea";
      b.textContent = "Quitar su foto";
      b.addEventListener("click", async () => {
        if (!confirm(`¿Quitar la foto de perfil de @${nombre}?`)) return;
        try { await DB.quitarAvatarDe(nombre); ponerFoto(document.getElementById("perfilAvatar"), null); document.getElementById("perfilAvatar").textContent = nombre.charAt(0).toUpperCase(); b.remove(); showToast("Foto quitada."); }
        catch (err) { showToast(err.message, true); }
      });
      acciones.prepend(b);
    });
  }
})();
