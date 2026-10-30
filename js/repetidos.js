/**
 * Unir repetidos: detecta el mismo juego añadido varias veces (Steam, Xbox, a mano) con claveTitulo()
 * y los une en una sola tarjeta. Se queda con la tarjeta que más editaste (nota, apuntes, favorito)
 * y le suma plataformas, etiquetas, vínculos, horas y fechas de las demás.
 */
(function () {
  const btn = document.getElementById("dupesBtn");
  const modal = document.getElementById("dupesModal");
  if (!btn || !modal || typeof claveTitulo !== "function" || isSpectatorMode) return;
  const lista = document.getElementById("dupesLista");
  const esc = (s) => escapeHTML(String(s ?? ""));
  const NIVEL = { backlog: 0, onhold: 1, playing: 1, completed: 2, extras: 3, platinum: 4 };
  let grupos = [];

  function buscarGrupos() {
    const porClave = new Map();
    StorageManager.getGames().forEach(g => {
      const k = claveTitulo(g.title);
      if (!k) return;
      if (!porClave.has(k)) porClave.set(k, []);
      porClave.get(k).push(g);
    });
    return [...porClave.values()].filter(gr => gr.length > 1);
  }

  // La tarjeta que se queda: la que más tocaste tú
  const peso = (g) => (g.rating !== null && g.rating !== undefined ? 8 : 0) + (g.notes ? 4 : 0) + (g.favorite ? 2 : 0) + (NIVEL[g.status] || 0) * 0.1;
  const elegirBase = (gr) => [...gr].sort((a, b) => peso(b) - peso(a) || Number(a.id) - Number(b.id))[0];

  function unir(gr) {
    const base = elegirBase(gr);
    const r = { ...base };
    gr.filter(o => o.id !== base.id).forEach(o => {
      r.platforms = [...new Set([...(r.platforms || []), ...(o.platforms || [])])];
      r.tags = [...new Set([...(r.tags || []), ...(o.tags || [])])].slice(0, 15);
      r.steamAppId = r.steamAppId || o.steamAppId || null;
      r.xboxTitleId = r.xboxTitleId || o.xboxTitleId || null;
      if (!r.psnNpId && o.psnNpId) { r.psnNpId = o.psnNpId; r.psnService = o.psnService || "trophy"; }
      r.hours = Math.max(Number(r.hours) || 0, Number(o.hours) || 0);
      r.targetHours = Math.max(Number(r.targetHours) || 0, Number(o.targetHours) || 0);
      if (o.lastPlayed && (!r.lastPlayed || o.lastPlayed > r.lastPlayed)) r.lastPlayed = o.lastPlayed;
      if (o.firstPlayed && (!r.firstPlayed || o.firstPlayed < r.firstPlayed)) r.firstPlayed = o.firstPlayed;
      if (!r.achUnlocked && o.achUnlocked) { r.achUnlocked = o.achUnlocked; r.achTotal = o.achTotal || null; }
      if ((NIVEL[o.status] || 0) > (NIVEL[r.status] || 0)) r.status = o.status;
      if ((r.rating === null || r.rating === undefined) && o.rating !== null && o.rating !== undefined) r.rating = o.rating;
      if (o.notes && o.notes !== r.notes) r.notes = r.notes ? `${r.notes}\n\n${o.notes}` : o.notes;
      r.favorite = Boolean(r.favorite || o.favorite);
      r.completedYear = r.completedYear || o.completedYear || null;
      r.coverUrl = r.coverUrl || o.coverUrl || "";
      r.releaseYear = r.releaseYear || o.releaseYear || null;
      r.developer = r.developer || o.developer || null;
    });
    return { unido: r, borrar: gr.filter(o => o.id !== base.id).map(o => o.id) };
  }

  function actualizarBoton() {
    grupos = buscarGrupos();
    const extra = grupos.reduce((n, gr) => n + gr.length - 1, 0);
    btn.classList.toggle("hidden", !extra);
    document.getElementById("dupesBtnTexto").textContent = `UNIR REPETIDOS (${extra})`;
  }

  const origen = (g) => [g.steamAppId ? "Steam" : "", g.xboxTitleId ? "Xbox" : "", g.psnNpId ? "PlayStation" : "", !g.steamAppId && !g.xboxTitleId && !g.psnNpId ? "a mano" : ""].filter(Boolean).join(" + ");

  function abrir() {
    grupos = buscarGrupos();
    if (!grupos.length) { showToast("No tienes juegos repetidos."); return; }
    lista.innerHTML = grupos.map((gr, i) => {
      const base = elegirBase(gr);
      const tapa = unir(gr).unido.coverUrl;
      return `<li><label>
        <input type="checkbox" data-i="${i}" checked>
        ${/^https:\/\//.test(tapa || "") ? `<img src="${esc(tapa)}" alt="" loading="lazy">` : `<span class="lista-sin-tapa"></span>`}
        <span class="dupes-grupo">
          <b>${esc(base.title)}</b>
          ${gr.map(g => `<small class="${g.id === base.id ? "queda" : ""}">${g.id === base.id ? "Se queda" : "Se une"}: «${esc(g.title)}» · ${esc(origen(g))}${g.rating !== null && g.rating !== undefined ? ` · nota ${g.rating}` : ""}${g.hours ? ` · ${g.hours} h` : ""}</small>`).join("")}
        </span>
      </label></li>`;
    }).join("");
    document.getElementById("dupesSub").textContent = `${grupos.length} juegos aparecen más de una vez. Cada grupo queda en una sola tarjeta con todas sus plataformas; tu nota y tus apuntes se conservan.`;
    modal.classList.remove("hidden");
  }

  async function unirMarcados() {
    const elegidos = [...lista.querySelectorAll("input:checked")].map(c => grupos[Number(c.dataset.i)]).filter(Boolean);
    if (!elegidos.length) { showToast("Marca al menos un grupo.", true); return; }
    const resultados = elegidos.map(unir);
    const porId = new Map(resultados.map(r => [r.unido.id, r.unido]));
    const borrar = new Set(resultados.flatMap(r => r.borrar));
    StorageManager.saveGames(StorageManager.getGames().filter(g => !borrar.has(g.id)).map(g => porId.get(g.id) || g));
    const unidos = [...porId.values()];
    await cloudRun(() => DB.upsertGames(unidos), "No se pudieron guardar los juegos unidos en la nube.");
    for (const id of borrar) await cloudRun(() => DB.deleteGame(id), "No se pudo borrar una copia repetida de la nube.");
    modal.classList.add("hidden");
    renderLibrary();
    showToast(`Listo: ${elegidos.length} juegos unidos, ${borrar.size} copias quitadas.`);
    if (window.Autodatos) window.Autodatos.analizar(unidos, false);
  }

  btn.addEventListener("click", abrir);
  document.getElementById("dupesCerrar").addEventListener("click", () => modal.classList.add("hidden"));
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.add("hidden"); });
  document.getElementById("dupesUnir").addEventListener("click", unirMarcados);

  // El botón aparece solo cuando hay repetidos, y se revisa cada vez que cambia el estante
  if (typeof renderLibrary === "function") {
    const pintarAnterior = renderLibrary;
    // eslint-disable-next-line no-global-assign
    renderLibrary = function () { pintarAnterior.apply(this, arguments); actualizarBoton(); };
  }
  actualizarBoton();
})();
