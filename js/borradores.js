/**
 * Borradores de noticias (solo admin).
 *
 * Una tarea programada investiga las noticias del día y deja borradores en
 * /borradores/noticias.json. Aquí el admin los revisa, escoge la imagen
 * (arte oficial del juego vía RAWG), retoca si quiere y pulsa "Publicar".
 * Lo ya publicado o descartado se recuerda en la tabla news_drafts_done.
 */
(function () {
  const btn = document.getElementById("openDraftsBtn");
  const badge = document.getElementById("draftsCount");
  const modal = document.getElementById("draftsModal");
  const list = document.getElementById("draftsList");
  const closeBtn = document.getElementById("closeDraftsBtn");
  if (!btn || !modal || !list || typeof DB === "undefined") return;

  const NOTA_IA = "Resumen preparado con ayuda de IA y revisado por Paindex.";
  let pendientes = [];

  const esc = (s) => (typeof escapeHTML === "function" ? escapeHTML(String(s ?? "")) : String(s ?? ""));
  const esHttps = (u) => /^https:\/\/[^\s"'<>]+$/i.test(String(u || ""));

  async function cargar() {
    let data;
    try {
      const res = await fetch("borradores/noticias.json", { cache: "no-store" });
      if (!res.ok) return;
      data = await res.json();
    } catch (e) { return; }

    let revisados = [];
    try { revisados = await DB.getReviewedDraftIds(); }
    catch (e) {
      console.warn("Borradores: falta la tabla news_drafts_done (migración 003).", e);
    }

    pendientes = (Array.isArray(data?.borradores) ? data.borradores : [])
      .filter(b => b && b.id && b.titulo && b.contenido && !revisados.includes(b.id));

    badge.textContent = pendientes.length;
    btn.classList.toggle("hidden", pendientes.length === 0);
  }

  async function imagenesRawg(juego) {
    if (!juego) return [];
    try {
      const res = await fetch(`/api/rawg?search=${encodeURIComponent(juego)}&n=4`);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.results || []).map(g => g.background_image).filter(esHttps);
    } catch (e) { return []; }
  }

  function tarjeta(b) {
    const fuentes = (b.fuentes || []).map(f => esc(f.nombre || f)).join(", ");
    return `
      <article class="borrador" data-id="${esc(b.id)}">
        <div class="borrador-imagen"><img alt="" hidden><span>Buscando imagen de ${esc(b.juego || "el juego")}…</span></div>
        <div class="borrador-miniaturas" role="radiogroup" aria-label="Imagen de la noticia"></div>
        <label class="borrador-campo">Imagen (enlace https)
          <input type="url" class="b-cover console-input" placeholder="https://…">
        </label>
        <label class="borrador-campo">Título
          <input type="text" class="b-titulo console-input" maxlength="140" value="${esc(b.titulo)}">
        </label>
        <label class="borrador-campo">Texto
          <textarea class="b-contenido console-input" rows="9">${esc(b.contenido)}</textarea>
        </label>
        <p class="borrador-meta">${esc(b.fecha || "")} · ${esc(b.etiqueta || "")}${fuentes ? ` · Fuentes: ${fuentes}` : ""}</p>
        <p class="borrador-estado" role="status"></p>
        <div class="borrador-acciones">
          <button type="button" class="boton boton-senal b-publicar">Publicar</button>
          <button type="button" class="boton boton-linea b-descartar">Descartar</button>
        </div>
      </article>`;
  }

  async function prepararImagen(el, b) {
    const img = el.querySelector(".borrador-imagen img");
    const aviso = el.querySelector(".borrador-imagen span");
    const input = el.querySelector(".b-cover");
    const minis = el.querySelector(".borrador-miniaturas");

    const elegir = (url) => {
      input.value = url;
      img.src = url; img.hidden = false; aviso.hidden = true;
      minis.querySelectorAll("button").forEach(m => m.setAttribute("aria-checked", String(m.dataset.url === url)));
    };

    const urls = esHttps(b.imagen) ? [b.imagen] : [];
    urls.push(...(await imagenesRawg(b.juego)));
    const unicas = [...new Set(urls)].slice(0, 4);

    if (unicas.length === 0) { aviso.textContent = "Sin imagen: pega un enlace abajo."; return; }
    minis.innerHTML = unicas.map(u => `<button type="button" role="radio" aria-checked="false" data-url="${esc(u)}"><img src="${esc(u)}" alt=""></button>`).join("");
    minis.querySelectorAll("button").forEach(m => m.addEventListener("click", () => elegir(m.dataset.url)));
    input.addEventListener("change", () => { if (esHttps(input.value)) elegir(input.value.trim()); });
    elegir(unicas[0]);
  }

  async function revisar(el, b, accion) {
    const estado = el.querySelector(".borrador-estado");
    el.querySelectorAll("button").forEach(x => (x.disabled = true));
    try {
      let postId = null;
      if (accion === "publicado") {
        const titulo = el.querySelector(".b-titulo").value.trim();
        const cover = el.querySelector(".b-cover").value.trim();
        if (!titulo) throw new Error("Falta el título.");
        if (!esHttps(cover)) throw new Error("Escoge una imagen o pega un enlace https.");
        const fuentes = (b.fuentes || []).map(f => f.nombre || f).filter(Boolean);
        const contenido = el.querySelector(".b-contenido").value.trim()
          + (fuentes.length ? `\n\nFuentes: ${fuentes.join(", ")}.` : "")
          + `\n${NOTA_IA}`;
        const post = await DB.createPost({
          title: titulo,
          category: "Noticia",
          game_tag: b.etiqueta || "",
          cover_url: cover,
          content: contenido
        });
        postId = post?.id ?? null;
      }
      await DB.markDraft(b.id, accion, postId);
      pendientes = pendientes.filter(p => p.id !== b.id);
      badge.textContent = pendientes.length;
      el.remove();
      if (pendientes.length === 0) {
        list.innerHTML = `<p class="borrador-vacio">No quedan borradores. Mañana llegan los siguientes.</p>`;
        btn.classList.add("hidden");
      }
      if (accion === "publicado" && typeof loadPublicFeed === "function") loadPublicFeed();
    } catch (e) {
      estado.textContent = e.message || "No se pudo guardar.";
      el.querySelectorAll("button").forEach(x => (x.disabled = false));
    }
  }

  function abrir() {
    list.innerHTML = pendientes.map(tarjeta).join("") ||
      `<p class="borrador-vacio">No hay borradores pendientes.</p>`;
    list.querySelectorAll(".borrador").forEach(el => {
      const b = pendientes.find(p => p.id === el.dataset.id);
      if (!b) return;
      prepararImagen(el, b);
      el.querySelector(".b-publicar").addEventListener("click", () => revisar(el, b, "publicado"));
      el.querySelector(".b-descartar").addEventListener("click", () => revisar(el, b, "descartado"));
    });
    modal.classList.remove("hidden");
  }

  const cerrar = () => modal.classList.add("hidden");
  btn.addEventListener("click", abrir);
  closeBtn && closeBtn.addEventListener("click", cerrar);
  modal.addEventListener("click", (e) => { if (e.target === modal) cerrar(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.classList.contains("hidden")) cerrar(); });

  (async () => {
    try { if (await DB.isAdmin()) cargar(); } catch (e) { /* no admin */ }
  })();
})();
