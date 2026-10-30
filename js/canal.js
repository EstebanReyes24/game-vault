/**
 * Portada: lo último del canal de YouTube de Paindex.
 * El video grande no carga YouTube hasta que alguien le da a reproducir (más rápido y sin rastreo).
 */
(function () {
  const seccion = document.getElementById("canalPortada");
  const caja = document.getElementById("canalVideos");
  if (!seccion || !caja) return;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const hace = (f) => {
    const d = Math.round((Date.now() - Date.parse(f)) / 86400000);
    if (d < 1) return "hoy";
    if (d === 1) return "ayer";
    if (d < 30) return `hace ${d} días`;
    return new Date(f).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
  };
  const vistas = (n) => n ? `${n.toLocaleString("es")} vistas · ` : "";
  let videos = [];

  function principal(v) {
    return `
      <button type="button" class="canal-principal" data-reproducir="${esc(v.id)}" aria-label="Reproducir: ${esc(v.titulo)}">
        <img src="https://i.ytimg.com/vi/${esc(v.id)}/maxresdefault.jpg" alt="" data-respaldo="${esc(v.miniatura)}" loading="lazy">
        <span class="canal-play" aria-hidden="true"><i class="fa-solid fa-play"></i></span>
        <span class="canal-info"><small>${vistas(v.vistas)}${hace(v.fecha)}</small><strong>${esc(v.titulo)}</strong></span>
      </button>`;
  }

  function pintar(destacado) {
    const resto = videos.filter(v => v.id !== destacado.id).slice(0, 4);
    caja.innerHTML = `
      <div class="canal-reproductor" id="canalReproductor">${principal(destacado)}</div>
      <ol class="canal-lista">${resto.map(v => `
        <li><button type="button" data-elegir="${esc(v.id)}">
          <img src="${esc(v.miniatura)}" alt="" loading="lazy">
          <span><strong>${esc(v.titulo)}</strong><small>${vistas(v.vistas)}${hace(v.fecha)}</small></span>
        </button></li>`).join("")}</ol>`;
  }

  caja.addEventListener("click", (e) => {
    const play = e.target.closest("[data-reproducir]");
    if (play) {
      document.getElementById("canalReproductor").innerHTML =
        `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(play.dataset.reproducir)}?autoplay=1&rel=0" title="Video de Paindex" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
      return;
    }
    const elegir = e.target.closest("[data-elegir]");
    if (elegir) { const v = videos.find(x => x.id === elegir.dataset.elegir); if (v) pintar(v); }
  });

  fetch("/api/canal").then(r => r.json()).then(d => {
    // Primero los videos normales; los Shorts, después
    videos = [...(d.videos || []).filter(v => !v.corto), ...(d.videos || []).filter(v => v.corto)];
    if (!videos.length) return;
    pintar(videos[0]);
    seccion.hidden = false;
  }).catch(() => {});
})();
