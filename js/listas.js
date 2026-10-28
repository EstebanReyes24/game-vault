/**
 * Listas de juegos (migración 007).
 * - En tu estante: crear, editar, ordenar y borrar listas con juegos de tu estante.
 * - En un perfil público: ver sus listas; ?lista=ID abre una directamente.
 */
(function () {
  const modal = document.getElementById("listsModal");
  const body = document.getElementById("listsBody");
  const titulo = document.getElementById("listsTitle");
  const sub = document.getElementById("listsSub");
  const btnAbrir = document.getElementById("openListsBtn");
  if (!modal || !body || typeof DB === "undefined") return;

  const esc = (s) => escapeHTML(String(s ?? ""));
  const nombre = isSpectatorMode ? String(publicProfileTarget).toLowerCase() : null;
  let listas = [];
  let editando = null; // { id, title, description, items: [] }

  const abrir = () => modal.classList.remove("hidden");
  const cerrar = () => {
    modal.classList.add("hidden");
    const url = new URL(window.location.href);
    if (url.searchParams.has("lista")) { url.searchParams.delete("lista"); history.replaceState(null, "", url.pathname + url.search); }
  };
  document.getElementById("closeListsBtn").addEventListener("click", cerrar);
  modal.addEventListener("click", (e) => { if (e.target === modal) cerrar(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.classList.contains("hidden")) cerrar(); });

  // ---------- piezas ----------
  function mosaico(items) {
    const tapas = items.filter(i => i.cover_url).slice(0, 4);
    const celdas = tapas.map(i => `<img src="${esc(i.cover_url)}" alt="" loading="lazy">`);
    while (celdas.length < 4) celdas.push(`<span></span>`);
    return `<div class="lista-mosaico" aria-hidden="true">${celdas.join("")}</div>`;
  }

  function tarjeta(l, propia) {
    return `
      <article class="lista-tarjeta" data-id="${l.id}">
        <button type="button" class="lista-abrir" data-ver="${l.id}">
          ${mosaico(l.items)}
          <span class="lista-nombre">${esc(l.title)}</span>
          <span class="lista-cuenta">${l.items.length} ${l.items.length === 1 ? "juego" : "juegos"}</span>
        </button>
        ${propia ? `<div class="lista-acciones">
          <button type="button" class="boton boton-linea" data-editar="${l.id}">Editar</button>
          <button type="button" class="boton boton-linea" data-borrar="${l.id}">Borrar</button>
        </div>` : ""}
      </article>`;
  }

  function enlaceLista(id) {
    const usuario = nombre || (CanvasPoster && CanvasPoster.usuario);
    return usuario ? `${location.origin}/u/${usuario}?lista=${id}` : null;
  }

  function verLista(l, propia) {
    titulo.textContent = l.title;
    sub.textContent = l.description || `${l.items.length} ${l.items.length === 1 ? "juego" : "juegos"}`;
    const enlace = enlaceLista(l.id);
    body.innerHTML = `
      <ol class="lista-juegos">
        ${l.items.map((g, i) => `
          <li>
            <span class="lista-pos">${i + 1}</span>
            ${g.cover_url ? `<img src="${esc(g.cover_url)}" alt="" loading="lazy">` : `<span class="lista-sin-tapa"></span>`}
            <span class="lista-juego"><b>${esc(g.game_title)}</b>${g.note ? `<small>${esc(g.note)}</small>` : ""}</span>
            ${g.rating ? `<b class="actividad-nota">${Number(g.rating).toFixed(1)}</b>` : ""}
          </li>`).join("") || `<li class="borrador-vacio">Esta lista todavía no tiene juegos.</li>`}
      </ol>
      <div class="borrador-acciones" style="margin-top:1rem">
        <button type="button" class="boton boton-linea" data-volver>Todas las listas</button>
        ${enlace ? `<button type="button" class="boton boton-linea" data-copiar="${esc(enlace)}"><i class="fa-solid fa-link"></i> Copiar enlace</button>` : ""}
        ${propia ? `<button type="button" class="boton boton-senal" data-editar="${l.id}">Editar</button>` : ""}
      </div>`;
    abrir();
  }

  function verTodas() {
    const propia = !isSpectatorMode;
    titulo.textContent = propia ? "Mis listas" : `Listas de @${nombre}`;
    sub.textContent = propia ? "Agrupa juegos de tu estante y compártelos." : "";
    body.innerHTML = `
      ${propia ? `<button type="button" class="boton boton-senal" data-nueva><i class="fa-solid fa-plus"></i> Nueva lista</button>` : ""}
      <div class="listas-rejilla" style="margin-top:1rem">
        ${listas.map(l => tarjeta(l, propia)).join("") || `<p class="borrador-vacio">${propia ? "Todavía no tienes listas. Crea la primera: por ejemplo, tus juegos de terror favoritos." : "No tiene listas todavía."}</p>`}
      </div>`;
    abrir();
  }

  // ---------- editor ----------
  function editor() {
    const l = editando;
    titulo.textContent = l.id ? "Editar lista" : "Nueva lista";
    sub.textContent = "Hasta 50 juegos, en el orden que quieras.";
    body.innerHTML = `
      <label class="borrador-campo">Nombre
        <input type="text" id="listaNombre" class="console-input" maxlength="80" value="${esc(l.title)}" placeholder="Ej.: Terror que sí da miedo">
      </label>
      <label class="borrador-campo" style="margin-top:.75rem">Descripción (opcional)
        <textarea id="listaDesc" class="console-input" rows="2" maxlength="400" placeholder="¿De qué va esta lista?">${esc(l.description || "")}</textarea>
      </label>
      <h3 class="lista-subtitulo">En la lista (${l.items.length})</h3>
      <ol class="lista-juegos editable">
        ${l.items.map((g, i) => `
          <li>
            <span class="lista-pos">${i + 1}</span>
            ${g.cover_url ? `<img src="${esc(g.cover_url)}" alt="" loading="lazy">` : `<span class="lista-sin-tapa"></span>`}
            <span class="lista-juego"><b>${esc(g.game_title)}</b></span>
            <span class="lista-mover">
              <button type="button" data-subir="${i}" aria-label="Subir" ${i === 0 ? "disabled" : ""}><i class="fa-solid fa-arrow-up"></i></button>
              <button type="button" data-bajar="${i}" aria-label="Bajar" ${i === l.items.length - 1 ? "disabled" : ""}><i class="fa-solid fa-arrow-down"></i></button>
              <button type="button" data-quitar="${i}" aria-label="Quitar"><i class="fa-solid fa-xmark"></i></button>
            </span>
          </li>`).join("") || `<li class="borrador-vacio">Añade juegos desde tu estante, abajo.</li>`}
      </ol>
      <h3 class="lista-subtitulo">Añadir de tu estante</h3>
      <input type="search" id="listaBuscar" class="console-input lista-buscar" placeholder="Busca un juego de tu estante…">
      <ul class="lista-candidatos" id="listaCandidatos"></ul>
      <p class="borrador-estado" role="status" id="listaEstado"></p>
      <div class="borrador-acciones">
        <button type="button" class="boton boton-senal" data-guardar>Guardar lista</button>
        <button type="button" class="boton boton-linea" data-volver>Cancelar</button>
      </div>`;
    pintarCandidatos("");
    document.getElementById("listaBuscar").addEventListener("input", (e) => pintarCandidatos(e.target.value));
    // los textos se guardan al vuelo para no perderlos al reordenar
    document.getElementById("listaNombre").addEventListener("input", (e) => { l.title = e.target.value; });
    document.getElementById("listaDesc").addEventListener("input", (e) => { l.description = e.target.value; });
  }

  function pintarCandidatos(q) {
    const ul = document.getElementById("listaCandidatos");
    const ya = new Set(editando.items.map(i => i.game_title.toLowerCase()));
    const texto = q.trim().toLowerCase();
    const juegos = getCurrentDataset()
      .filter(g => !ya.has(String(g.title).toLowerCase()))
      .filter(g => !texto || String(g.title).toLowerCase().includes(texto))
      .sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0))
      .slice(0, 8);
    ul.innerHTML = juegos.map(g => `
      <li><button type="button" data-anadir="${esc(g.id)}">
        <i class="fa-solid fa-plus" aria-hidden="true"></i> ${esc(g.title)}
        ${Number(g.rating) > 0 ? `<small>${Number(g.rating).toFixed(1)}</small>` : ""}
      </button></li>`).join("") || `<li class="borrador-vacio">${texto ? "No hay más juegos con ese nombre." : "Ya añadiste todos tus juegos."}</li>`;
  }

  // ---------- acciones ----------
  body.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const d = b.dataset;
    if ("nueva" in d) { editando = { id: null, title: "", description: "", items: [] }; editor(); }
    else if ("editar" in d) {
      const l = listas.find(x => String(x.id) === d.editar);
      editando = { id: l.id, title: l.title, description: l.description, items: l.items.map(i => ({ ...i })) };
      editor();
    }
    else if ("ver" in d) verLista(listas.find(x => String(x.id) === d.ver), !isSpectatorMode);
    else if ("volver" in d) verTodas();
    else if ("copiar" in d) {
      try { await navigator.clipboard.writeText(d.copiar); b.innerHTML = '<i class="fa-solid fa-check"></i> Copiado'; }
      catch (err) { prompt("Copia el enlace:", d.copiar); }
    }
    else if ("borrar" in d) {
      const l = listas.find(x => String(x.id) === d.borrar);
      if (!confirm(`¿Borrar la lista "${l.title}"?`)) return;
      try { await DB.borrarLista(l.id); listas = listas.filter(x => x !== l); verTodas(); }
      catch (err) { showToast(err.message, true); }
    }
    else if ("anadir" in d) {
      if (editando.items.length >= 50) { showToast("Una lista admite hasta 50 juegos.", true); return; }
      const g = getCurrentDataset().find(x => String(x.id) === d.anadir);
      if (!g) return;
      const cover = typeof safeUrl === "function" ? safeUrl(g.coverUrl) : g.coverUrl;
      editando.items.push({ game_title: g.title, cover_url: /^https:\/\//.test(cover || "") ? cover : null, rating: g.rating });
      editor();
      document.getElementById("listaBuscar").focus();
    }
    else if ("quitar" in d) { editando.items.splice(Number(d.quitar), 1); editor(); }
    else if ("subir" in d || "bajar" in d) {
      const i = Number(d.subir ?? d.bajar), j = "subir" in d ? i - 1 : i + 1;
      [editando.items[i], editando.items[j]] = [editando.items[j], editando.items[i]];
      editor();
    }
    else if ("guardar" in d) {
      const estado = document.getElementById("listaEstado");
      b.disabled = true;
      try {
        await DB.guardarLista(editando);
        listas = await DB.getMisListas();
        verTodas();
        showToast("Lista guardada.");
      } catch (err) {
        estado.textContent = err.message;
        b.disabled = false;
      }
    }
  });

  // ---------- arranque ----------
  if (btnAbrir) btnAbrir.addEventListener("click", async () => {
    if (!isSpectatorMode && !cloudUserId) {
      showToast("Inicia sesión para crear listas y compartirlas.", true);
      return;
    }
    listas = isSpectatorMode ? await DB.getListasDe(nombre) : await DB.getMisListas();
    verTodas();
  });

  if (isSpectatorMode) {
    (async () => {
      listas = await DB.getListasDe(nombre);
      const caja = document.getElementById("perfilListas");
      const rejilla = document.getElementById("perfilListasRejilla");
      if (listas.length && caja && rejilla) {
        rejilla.innerHTML = listas.slice(0, 6).map(l => tarjeta(l, false)).join("");
        caja.hidden = false;
        rejilla.addEventListener("click", (e) => {
          const b = e.target.closest("[data-ver]");
          if (b) verLista(listas.find(x => String(x.id) === b.dataset.ver), false);
        });
      }
      const pedida = new URLSearchParams(location.search).get("lista");
      const l = pedida && listas.find(x => String(x.id) === pedida);
      if (l) verLista(l, false);
    })();
  }
})();
