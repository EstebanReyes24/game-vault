/**
 * "Presumir": imágenes de tu estante para redes (las genera /api/og en el servidor).
 * - Mi 3×3: 1080×1350, para publicaciones.
 * - Historia: 1080×1920, para historias de Instagram, TikTok o WhatsApp.
 * Necesitan que el estante sea público (la imagen lleva tu enlace).
 */
(function () {
  const modal = document.getElementById("presumirModal");
  const btn = document.getElementById("presumirBtn");
  if (!modal || !btn || isSpectatorMode) return;
  const $ = (id) => document.getElementById(id);
  let formato = "3x3";
  let usuario = null;
  let blob = null;

  const url = () => `/api/og?tipo=${formato}&u=${encodeURIComponent(usuario)}&v=${Math.floor(Date.now() / 300000)}`;

  async function cargar() {
    blob = null;
    $("presumirEstado").textContent = "Creando tu imagen…";
    $("presumirImagen").removeAttribute("src");
    $("presumirVista").className = `presumir-vista es-${formato}`;
    try {
      const r = await fetch(url());
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "No se pudo crear la imagen.");
      blob = await r.blob();
      $("presumirImagen").src = URL.createObjectURL(blob);
      $("presumirEstado").textContent = "";
    } catch (e) {
      $("presumirEstado").textContent = e.message;
    }
  }

  async function abrir() {
    const p = await DB.getMyProfile().catch(() => null);
    if (!p) { showToast("Inicia sesión para crear tus imágenes.", true); return; }
    usuario = p.username;
    modal.classList.remove("hidden");
    if (!p.is_public) {
      $("presumirEstado").innerHTML = 'Tu estante es privado. Hazlo público en <b>Mi perfil</b> para crear imágenes con tu enlace.';
      $("presumirImagen").removeAttribute("src");
      return;
    }
    cargar();
  }

  btn.addEventListener("click", abrir);
  $("presumirCerrar").addEventListener("click", () => modal.classList.add("hidden"));
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.add("hidden"); });
  modal.querySelectorAll("[data-formato]").forEach(b => b.addEventListener("click", () => {
    modal.querySelectorAll("[data-formato]").forEach(x => x.classList.toggle("active", x === b));
    formato = b.dataset.formato;
    if (usuario) cargar();
  }));

  const nombreArchivo = () => `paindex-${usuario}-${formato}.png`;
  $("presumirDescargar").addEventListener("click", () => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = nombreArchivo();
    document.body.appendChild(a);
    a.click();
    a.remove();
  });
  $("presumirCompartir").addEventListener("click", async () => {
    if (!blob) return;
    const archivo = new File([blob], nombreArchivo(), { type: "image/png" });
    const enlace = `${location.origin}/u/${usuario}`;
    if (navigator.canShare?.({ files: [archivo] })) {
      try { await navigator.share({ files: [archivo], text: `Mi estante en Paindex Vault: ${enlace}` }); } catch (e) { /* cancelado */ }
    } else {
      $("presumirDescargar").click();
      try { await navigator.clipboard.writeText(enlace); } catch (e) { /* nada */ }
      showToast("Imagen descargada y enlace copiado: súbela donde quieras.");
    }
  });
})();
