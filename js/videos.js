/**
 * "Para mis videos" (migración 011): banco de ideas privado del admin.
 * Columnas Idea → Guion → Grabando → Publicado, con enlace y notas por juego,
 * y sugerencias sacadas de los juegos mejor puntuados que aún no tienen video.
 */
(function () {
  const btn = document.getElementById("openVideosBtn");
  const modal = document.getElementById("videosModal");
  const cuerpo = document.getElementById("videosCuerpo");
  if (!btn || !modal || typeof DB === "undefined" || isSpectatorMode) return;
  const esc = (s) => escapeHTML(String(s ?? ""));
  const ESTADOS = [["idea", "Idea"], ["guion", "Guion"], ["grabando", "Grabando"], ["publicado", "Publicado"]];
  let planes = [];
  let editando = null; // título del juego que se está editando

  const juego = (titulo) => getCurrentDataset().find(g => String(g.title) === titulo);
  const portada = (titulo) => {
    const g = juego(titulo);
    const u = g ? (typeof safeUrl === "function" ? safeUrl(g.coverUrl) : g.coverUrl) : "";
    return /^https:\/\//.test(u || "") ? `<img src="${esc(u)}" alt="" loading="lazy">` : `<span class="lista-sin-tapa"></span>`;
  };

  function tarjeta(p) {
    if (editando === p.game_title) {
      return `
        <article class="video-tarjeta editando" data-titulo="${esc(p.game_title)}">
          <b>${esc(p.game_title)}</b>
          <select class="console-input" data-campo="estado">${ESTADOS.map(([v, l]) => `<option value="${v}" ${v === p.estado ? "selected" : ""}>${l}</option>`).join("")}</select>
          <input type="url" class="console-input" data-campo="url" placeholder="Enlace del video (https://…)" value="${esc(p.url || "")}">
          <textarea class="console-input" data-campo="notas" rows="3" maxlength="1000" placeholder="Ideas, ángulo, gancho…">${esc(p.notas || "")}</textarea>
          <div class="borrador-acciones">
            <button type="button" class="boton boton-senal" data-guardar>Guardar</button>
            <button type="button" class="boton boton-linea" data-cancelar>Cancelar</button>
            <button type="button" class="boton boton-linea" data-quitar>Quitar</button>
          </div>
        </article>`;
    }
    return `
      <article class="video-tarjeta" data-titulo="${esc(p.game_title)}">
        <button type="button" class="video-abrir" data-editar>
          ${portada(p.game_title)}
          <span><b>${esc(p.game_title)}</b>${p.notas ? `<small>${esc(p.notas.slice(0, 90))}${p.notas.length > 90 ? "…" : ""}</small>` : ""}</span>
        </button>
        ${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer" class="resena-mas">Ver video</a>` : ""}
      </article>`;
  }

  function sugerencias() {
    const ya = new Set(planes.map(p => p.game_title));
    return getCurrentDataset()
      .filter(g => !ya.has(g.title) && Number(g.rating) >= 8.5 && ["completed", "extras", "platinum"].includes(g.status))
      .sort((a, b) => Number(b.rating) - Number(a.rating) || (Number(b.hours) || 0) - (Number(a.hours) || 0))
      .slice(0, 6);
  }

  function pintar() {
    const sug = sugerencias();
    cuerpo.innerHTML = `
      <div class="videos-columnas">
        ${ESTADOS.map(([v, l]) => {
          const de = planes.filter(p => p.estado === v);
          return `<section class="videos-columna"><h3>${l} <span>${de.length}</span></h3>${de.map(tarjeta).join("") || `<p class="borrador-vacio">—</p>`}</section>`;
        }).join("")}
      </div>
      <h3 class="lista-subtitulo">Añadir un juego de tu estante</h3>
      <input type="search" id="videosBuscar" class="console-input lista-buscar" placeholder="Busca un juego…">
      <ul class="lista-candidatos" id="videosCandidatos"></ul>
      ${sug.length ? `<h3 class="lista-subtitulo">Sugerencias: tus mejor puntuados que aún no tienen video</h3>
        <ul class="lista-candidatos">${sug.map(g => `<li><button type="button" data-anadir="${esc(g.title)}"><i class="fa-solid fa-plus" aria-hidden="true"></i> ${esc(g.title)} <small>${Number(g.rating).toFixed(1)}</small></button></li>`).join("")}</ul>` : ""}`;
    const buscar = document.getElementById("videosBuscar");
    buscar.addEventListener("input", () => candidatos(buscar.value));
  }

  function candidatos(q) {
    const ul = document.getElementById("videosCandidatos");
    const t = q.trim().toLowerCase();
    if (!t) { ul.innerHTML = ""; return; }
    const ya = new Set(planes.map(p => p.game_title));
    ul.innerHTML = getCurrentDataset().filter(g => !ya.has(g.title) && String(g.title).toLowerCase().includes(t)).slice(0, 6)
      .map(g => `<li><button type="button" data-anadir="${esc(g.title)}"><i class="fa-solid fa-plus" aria-hidden="true"></i> ${esc(g.title)}</button></li>`).join("")
      || `<li class="borrador-vacio">No hay juegos con ese nombre.</li>`;
  }

  cuerpo.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const art = b.closest(".video-tarjeta");
    const titulo = art ? art.dataset.titulo : null;
    try {
      if ("anadir" in b.dataset) {
        await DB.guardarPlanVideo({ game_title: b.dataset.anadir, estado: "idea" });
        planes = await DB.getPlanesVideo();
        editando = b.dataset.anadir;
        pintar();
      } else if ("editar" in b.dataset) { editando = titulo; pintar(); }
      else if ("cancelar" in b.dataset) { editando = null; pintar(); }
      else if ("guardar" in b.dataset) {
        const valor = (c) => art.querySelector(`[data-campo=${c}]`).value.trim();
        const url = valor("url");
        if (url && !/^https:\/\//.test(url)) { showToast("El enlace debe empezar por https://", true); return; }
        await DB.guardarPlanVideo({ game_title: titulo, estado: valor("estado"), url, notas: valor("notas") });
        planes = await DB.getPlanesVideo();
        editando = null;
        pintar();
      } else if ("quitar" in b.dataset) {
        await DB.borrarPlanVideo(titulo);
        planes = planes.filter(p => p.game_title !== titulo);
        editando = null;
        pintar();
      }
    } catch (err) {
      showToast(err.message, true);
    }
  });

  btn.addEventListener("click", async () => {
    planes = await DB.getPlanesVideo();
    editando = null;
    pintar();
    modal.classList.remove("hidden");
  });
  const cerrar = () => modal.classList.add("hidden");
  document.getElementById("videosCerrar").addEventListener("click", cerrar);
  modal.addEventListener("click", (e) => { if (e.target === modal) cerrar(); });

  (async () => {
    try { if (await DB.isAdmin()) btn.classList.remove("hidden"); } catch (e) { /* no admin */ }
  })();
})();
