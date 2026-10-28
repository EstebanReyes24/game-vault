/**
 * Bandeja de moderación (solo admin): comentarios reportados u ocultos.
 * Acciones: mostrar/ocultar, borrar, descartar reportes y bloquear al autor.
 */
(function () {
  const btn = document.getElementById("openModBtn");
  const badge = document.getElementById("modCount");
  const modal = document.getElementById("modModal");
  const list = document.getElementById("modList");
  const closeBtn = document.getElementById("closeModBtn");
  if (!btn || !modal || !list || typeof DB === "undefined") return;

  const esc = (s) => (typeof escapeHTML === "function" ? escapeHTML(String(s ?? "")) : String(s ?? ""));
  let filas = [];

  async function cargar() {
    try { filas = await DB.getModeracion(); }
    catch (e) { console.warn("Moderación: falta la migración 005.", e); filas = []; }
    const pendientes = filas.filter(f => Number(f.reportes) > 0).length;
    badge.textContent = pendientes;
    badge.hidden = pendientes === 0;
    btn.classList.remove("hidden");
  }

  function fila(f) {
    const fecha = f.created_at ? new Date(f.created_at).toLocaleDateString("es-ES", { day: "numeric", month: "short" }) : "";
    const motivos = (f.motivos || []).filter(Boolean);
    return `
      <article class="mod-fila" data-id="${f.comment_id}">
        <p class="mod-meta">
          <b>@${esc(f.autor)}</b>${f.autor_bloqueado ? ' <span class="mod-etiqueta">bloqueado</span>' : ""}
          · en <a href="/a/${f.post_id}" target="_blank" rel="noopener">${esc(f.post_titulo)}</a> · ${esc(fecha)}
        </p>
        <blockquote>${esc(f.comment)}</blockquote>
        <p class="mod-meta">
          ${f.hidden ? '<span class="mod-etiqueta">oculto</span> ' : ""}
          ${Number(f.reportes)} reporte(s)${motivos.length ? `: ${motivos.map(esc).join(" · ")}` : ""}
        </p>
        <p class="borrador-estado" role="status"></p>
        <div class="borrador-acciones">
          <button type="button" class="boton boton-linea" data-accion="visible">${f.hidden ? "Mostrar" : "Ocultar"}</button>
          <button type="button" class="boton boton-linea" data-accion="descartar" ${Number(f.reportes) ? "" : "hidden"}>Descartar reportes</button>
          <button type="button" class="boton boton-linea" data-accion="borrar">Borrar</button>
          <button type="button" class="boton ${f.autor_bloqueado ? "boton-linea" : "boton-senal"}" data-accion="bloqueo">${f.autor_bloqueado ? "Desbloquear autor" : "Bloquear autor"}</button>
        </div>
      </article>`;
  }

  function pintar() {
    list.innerHTML = filas.length
      ? filas.map(fila).join("")
      : `<p class="borrador-vacio">No hay nada que revisar. Cuando alguien reporte un comentario aparecerá aquí.</p>`;
  }

  list.addEventListener("click", async (e) => {
    const b = e.target.closest("button[data-accion]");
    if (!b) return;
    const el = b.closest(".mod-fila");
    const f = filas.find(x => String(x.comment_id) === el.dataset.id);
    if (!f) return;
    const estado = el.querySelector(".borrador-estado");
    const accion = b.dataset.accion;
    try {
      if (accion === "visible") {
        await DB.setCommentHidden(f.comment_id, !f.hidden);
        if (f.hidden) await DB.dismissReports(f.comment_id); // al mostrarlo se da por revisado
      } else if (accion === "descartar") {
        await DB.dismissReports(f.comment_id);
      } else if (accion === "borrar") {
        if (!confirm("¿Borrar este comentario para siempre?")) return;
        await DB.deleteComment(f.comment_id);
      } else if (accion === "bloqueo") {
        if (f.autor_bloqueado) {
          await DB.unbanUser(f.autor_id);
        } else {
          const motivo = prompt(`¿Bloquear a @${f.autor}? No podrá volver a comentar.\nMotivo (opcional):`, "");
          if (motivo === null) return;
          await DB.banUser(f.autor_id, motivo.trim());
          await DB.setCommentHidden(f.comment_id, true);
        }
      }
      await cargar();
      pintar();
    } catch (err) {
      estado.textContent = err.message || "No se pudo completar la acción.";
    }
  });

  btn.addEventListener("click", () => { pintar(); modal.classList.remove("hidden"); });
  const cerrar = () => modal.classList.add("hidden");
  closeBtn && closeBtn.addEventListener("click", cerrar);
  modal.addEventListener("click", (e) => { if (e.target === modal) cerrar(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.classList.contains("hidden")) cerrar(); });

  (async () => {
    try { if (await DB.isAdmin()) cargar(); } catch (e) { /* no admin */ }
  })();
})();
