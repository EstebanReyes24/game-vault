/**
 * Foto de perfil (migración 015).
 * - Desde "Mi perfil": la foto se recorta la imagen al centro, la deja en 256×256 WebP
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
      img.addEventListener("error", () => { el.classList.remove("con-foto"); el.textContent = (texto || "?").charAt(0).toUpperCase(); }, { once: true });
      el.appendChild(img);
      el.classList.add("con-foto");
    } else {
      el.classList.remove("con-foto");
    }
  }

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

  // Subir y quitar se hace desde "Mi perfil" (js/miperfil.js)
  window.Avatar = { ponerFoto, preparar, fotoEnCabecera, cargarMia };
  cargarMia();
  supabaseClient.auth.onAuthStateChange(() => setTimeout(cargarMia, 0));

  // ---------- perfil público: su foto (y el admin puede quitarla) ----------
  if (typeof isSpectatorMode !== "undefined" && isSpectatorMode && typeof publicProfileTarget !== "undefined") {
    const nombre = String(publicProfileTarget).toLowerCase();
    DB.getPerfilPublico(nombre).then(async perfil => {
      const url = perfil?.avatar_url || null;
      ponerFoto(document.getElementById("perfilAvatar"), url, nombre);
      // Su descripción, en lugar del texto genérico
      const sub = document.querySelector("#spectatorBanner .perfil-nombre > p:not(.perfil-social)");
      if (sub && perfil?.bio) { sub.textContent = perfil.bio; sub.classList.add("perfil-bio"); }
      if (!url || !(await DB.isAdmin().catch(() => false))) return;
      // En tu propio perfil se cambia desde "Mi perfil", no con el botón de moderación
      const yo = await DB.getMyProfile().catch(() => null);
      if (yo?.username === nombre) return;
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
