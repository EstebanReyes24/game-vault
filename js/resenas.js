/**
 * Reseñas de usuarios (migración 008).
 * - En tu estante: botón "Reseña" en la ficha de cada juego para escribirla o editarla.
 * - En un perfil público: "Sus reseñas", con spoilers ocultos, reportar y, para el admin, destacar.
 */
(function () {
  if (typeof DB === "undefined") return;
  const esc = (s) => escapeHTML(String(s ?? ""));
  const nombre = isSpectatorMode ? String(publicProfileTarget).toLowerCase() : null;

  // ---------- editor ----------
  const modal = document.getElementById("resenaModal");
  const texto = document.getElementById("resenaTexto");
  const contador = document.getElementById("resenaContador");
  const spoilers = document.getElementById("resenaSpoilers");
  const estado = document.getElementById("resenaEstado");
  const btnGuardar = document.getElementById("resenaGuardar");
  const btnBorrar = document.getElementById("resenaBorrar");
  const btnFicha = document.getElementById("modalReviewBtn");
  let juego = null, actual = null;

  const contar = () => {
    const n = texto.value.trim().length;
    contador.textContent = `${n} / 5000${n < 50 ? ` · faltan ${50 - n}` : ""}`;
  };
  texto && texto.addEventListener("input", contar);
  const cerrar = () => modal.classList.add("hidden");
  document.getElementById("resenaCerrar")?.addEventListener("click", cerrar);
  modal && modal.addEventListener("click", (e) => { if (e.target === modal) cerrar(); });

  async function abrirEditor(g) {
    juego = g;
    actual = await DB.getMiResena(g.title);
    document.getElementById("resenaTitulo").textContent = actual ? "Editar reseña" : "Escribir reseña";
    document.getElementById("resenaJuego").textContent = `${g.title}${Number(g.rating) > 0 ? ` · tu nota: ${Number(g.rating).toFixed(1)}` : " · sin nota en tu estante"}`;
    texto.value = actual ? actual.body : "";
    spoilers.checked = actual ? actual.spoilers : false;
    estado.textContent = "";
    btnGuardar.textContent = actual ? "Guardar cambios" : "Publicar reseña";
    btnBorrar.classList.toggle("hidden", !actual);
    contar();
    modal.classList.remove("hidden");
    texto.focus();
  }

  btnGuardar && btnGuardar.addEventListener("click", async () => {
    btnGuardar.disabled = true;
    try {
      const cover = typeof safeUrl === "function" ? safeUrl(juego.coverUrl) : juego.coverUrl;
      await DB.guardarResena({ id: actual?.id, game_title: juego.title, cover_url: cover, rating: juego.rating, body: texto.value, spoilers: spoilers.checked });
      cerrar();
      showToast(actual ? "Reseña actualizada." : "Reseña publicada en tu perfil.");
      if (btnFicha) btnFicha.querySelector("span").textContent = "Editar reseña";
    } catch (err) {
      estado.textContent = err.message;
    } finally {
      btnGuardar.disabled = false;
    }
  });

  btnBorrar && btnBorrar.addEventListener("click", async () => {
    if (!actual || !confirm("¿Borrar tu reseña de este juego?")) return;
    try {
      await DB.borrarResena(actual.id);
      cerrar();
      showToast("Reseña borrada.");
      if (btnFicha) btnFicha.querySelector("span").textContent = "Escribir reseña";
    } catch (err) { estado.textContent = err.message; }
  });

  // El botón aparece en la ficha de tus juegos cuando tienes sesión
  if (btnFicha && !isSpectatorMode && typeof openDetailModal === "function") {
    const abrirFichaOriginal = openDetailModal;
    // eslint-disable-next-line no-global-assign
    openDetailModal = function (game) {
      abrirFichaOriginal(game);
      if (!cloudUserId) { btnFicha.classList.add("hidden"); return; }
      btnFicha.classList.remove("hidden");
      btnFicha.querySelector("span").textContent = "Reseña";
      DB.getMiResena(game.title).then(r => { btnFicha.querySelector("span").textContent = r ? "Editar reseña" : "Escribir reseña"; }).catch(() => {});
    };
    btnFicha.addEventListener("click", () => {
      const g = getCurrentDataset().find(x => x.id === activeModalGameId);
      if (g) abrirEditor(g);
    });
  }

  // ---------- reseñas en el perfil ----------
  function fecha(f) {
    return new Date(f).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
  }

  function tarjeta(r, opciones) {
    const parrafos = esc(r.body).split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
    return `
      <article class="resena${r.spoilers ? " con-spoilers" : ""}" id="resena-${r.id}" data-id="${r.id}">
        <header class="resena-cabecera">
          ${r.cover_url ? `<img src="${esc(r.cover_url)}" alt="" loading="lazy">` : ""}
          <div>
            <h3>${esc(r.game_title)}</h3>
            <p>${fecha(r.created_at)}${r.updated_at && r.updated_at !== r.created_at ? " · editada" : ""}${r.featured ? " · <b>destacada</b>" : ""}</p>
          </div>
          ${r.rating ? `<b class="actividad-nota">${Number(r.rating).toFixed(1)}</b>` : ""}
        </header>
        <div class="resena-cuerpo plegada">${parrafos}
          ${r.spoilers ? `<button type="button" class="resena-velo" data-spoilers>Contiene spoilers · tocar para leer</button>` : ""}
        </div>
        <div class="resena-pie">
          <button type="button" class="resena-mas" data-expandir>Leer completa</button>
          ${opciones.admin ? `<button type="button" class="resena-mas" data-destacar>${r.featured ? "Quitar de la portada" : "Destacar en la portada"}</button>` : ""}
          ${opciones.reportar ? `<button type="button" class="resena-reportar" data-reportar title="Reportar reseña" aria-label="Reportar reseña"><i class="fa-solid fa-flag"></i></button>` : ""}
          <button type="button" class="resena-mas" data-enlace>Copiar enlace</button>
        </div>
      </article>`;
  }

  if (isSpectatorMode) {
    (async () => {
      const [resenas, user, admin] = await Promise.all([DB.getResenasDe(nombre), DB.getUser(), DB.isAdmin().catch(() => false)]);
      const caja = document.getElementById("perfilResenas");
      const lista = document.getElementById("perfilResenasLista");
      if (!resenas.length || !caja || !lista) return;
      lista.innerHTML = resenas.map(r => tarjeta(r, { admin, reportar: user && user.id !== r.user_id })).join("");
      caja.hidden = false;
      // las cortas no necesitan "Leer completa"
      lista.querySelectorAll(".resena-cuerpo").forEach(c => {
        if (c.scrollHeight <= c.clientHeight + 4) { c.classList.remove("plegada"); c.parentElement.querySelector("[data-expandir]").hidden = true; }
      });

      lista.addEventListener("click", async (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        const art = b.closest(".resena");
        const r = resenas.find(x => String(x.id) === art.dataset.id);
        if ("spoilers" in b.dataset) art.classList.remove("con-spoilers");
        else if ("expandir" in b.dataset) { art.querySelector(".resena-cuerpo").classList.remove("plegada"); b.hidden = true; }
        else if ("enlace" in b.dataset) {
          const url = `${location.origin}/u/${nombre}?resena=${r.id}`;
          try { await navigator.clipboard.writeText(url); b.textContent = "Copiado"; } catch (err) { prompt("Copia el enlace:", url); }
        }
        else if ("reportar" in b.dataset) {
          const motivo = prompt("¿Por qué reportas esta reseña? (insulto, spam, spoiler sin avisar, otro)\nLo revisará Paindex.", "");
          if (motivo === null) return;
          try { await DB.reportarResena(r.id, motivo.trim().slice(0, 200)); b.innerHTML = '<i class="fa-solid fa-check"></i>'; b.disabled = true; }
          catch (err) { showToast(err.message, true); }
        }
        else if ("destacar" in b.dataset) {
          try {
            r.featured = !r.featured;
            await DB.marcarResena(r.id, { featured: r.featured });
            b.textContent = r.featured ? "Quitar de la portada" : "Destacar en la portada";
            showToast(r.featured ? "Destacada en la portada." : "Quitada de la portada.");
          } catch (err) { showToast(err.message, true); }
        }
      });

      const pedida = new URLSearchParams(location.search).get("resena");
      const el = pedida && document.getElementById(`resena-${pedida}`);
      if (el) {
        el.querySelector(".resena-cuerpo").classList.remove("plegada");
        el.classList.add("resena-enfocada");
        setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
      }
    })();
  }
})();
