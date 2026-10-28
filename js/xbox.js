/**
 * Importar desde Xbox (beta) con la clave personal de OpenXBL de cada usuario.
 * Los juegos entran como "Pendiente" sin nota, o "Platinado" si tienen el 100% de logros.
 */
(function () {
  const modal = document.getElementById("xboxModal");
  const btn = document.getElementById("openXboxBtn");
  if (!modal || !btn) return;
  const esc = (s) => escapeHTML(String(s ?? ""));
  const estado = document.getElementById("xboxEstado");
  const lista = document.getElementById("xboxLista");
  let juegos = [];

  btn.addEventListener("click", () => {
    if (isSpectatorMode) { showToast("Entra a tu propio estante para importar.", true); return; }
    modal.classList.remove("hidden");
    document.getElementById("xboxClave").focus();
  });
  const cerrar = () => modal.classList.add("hidden");
  document.getElementById("xboxCerrar").addEventListener("click", cerrar);
  modal.addEventListener("click", (e) => { if (e.target === modal) cerrar(); });

  document.getElementById("xboxConsultar").addEventListener("click", async (e) => {
    const b = e.currentTarget;
    const clave = document.getElementById("xboxClave").value.trim();
    estado.textContent = "Consultando tu historial de Xbox…";
    b.disabled = true;
    try {
      const r = await fetch("/api/xbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clave }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
      const ya = new Set(StorageManager.getGames().map(g => String(g.title).toLowerCase().trim()));
      juegos = (data.juegos || []).filter(j => !ya.has(String(j.titulo).toLowerCase().trim()));
      if (!juegos.length) {
        estado.textContent = (data.juegos || []).length ? "Todos tus juegos de Xbox ya están en tu estante." : "OpenXBL no devolvió juegos para esta cuenta.";
        return;
      }
      estado.textContent = "";
      document.getElementById("xboxCuenta").textContent = `${juegos.length} juegos nuevos para importar`;
      lista.innerHTML = juegos.map((j, i) => `
        <li><label>
          <input type="checkbox" data-i="${i}" checked>
          ${j.portada ? `<img src="${esc(j.portada)}" alt="" loading="lazy">` : `<span class="lista-sin-tapa"></span>`}
          <span class="lista-juego"><b>${esc(j.titulo)}</b><small>${j.logrosTotal ? `${j.logros}/${j.logrosTotal} logros · ${Math.round(j.progreso)}%` : "sin logros"}</small></span>
        </label></li>`).join("");
      document.getElementById("xboxResultado").hidden = false;
    } catch (err) {
      estado.textContent = err.message;
    } finally {
      b.disabled = false;
    }
  });

  document.getElementById("xboxTodos").addEventListener("click", (e) => {
    const cajas = [...lista.querySelectorAll("input[type=checkbox]")];
    const marcar = cajas.some(c => !c.checked);
    cajas.forEach(c => { c.checked = marcar; });
    e.currentTarget.textContent = marcar ? "Desmarcar todos" : "Marcar todos";
  });

  document.getElementById("xboxImportar").addEventListener("click", async () => {
    const elegidos = [...lista.querySelectorAll("input[type=checkbox]:checked")].map(c => juegos[Number(c.dataset.i)]).filter(Boolean);
    if (!elegidos.length) { estado.textContent = "Marca al menos un juego."; return; }
    const nuevos = elegidos.map(j => ({
      id: newGameId(),
      title: j.titulo,
      coverUrl: /^https:\/\//.test(j.portada || "") ? j.portada : "",
      status: j.progreso >= 100 && j.logrosTotal > 0 ? "platinum" : "backlog",
      platforms: ["Xbox"],
      rating: null,
      hours: 0,
      targetHours: 0,
      completedYear: null,
      favorite: false,
      tags: ["#Xbox"],
      notes: ""
    }));
    StorageManager.saveGames([...StorageManager.getGames(), ...nuevos]);
    await cloudRun(() => DB.upsertGames(nuevos), "No se pudieron subir los juegos importados a la nube.");
    renderLibrary();
    cerrar();
    document.getElementById("xboxClave").value = "";
    showToast(`Se añadieron ${nuevos.length} juegos de Xbox. Ponles estado y nota cuando quieras.`);
  });
})();
