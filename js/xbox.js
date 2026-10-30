/**
 * Importar desde Xbox por gamertag (clave de OpenXBL de la web) o, como respaldo, con la clave personal
 * de OpenXBL del usuario. El inicio de sesión con Xbox está guardado en reserva/ hasta que se configure.
 * Los juegos entran sin nota; el estado lo pone Autodatos con sus logros y la última vez jugado.
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
    document.getElementById("xboxGamertag").focus();
  });
  const cerrar = () => modal.classList.add("hidden");
  document.getElementById("xboxCerrar").addEventListener("click", cerrar);
  modal.addEventListener("click", (e) => { if (e.target === modal) cerrar(); });

  function mostrar(todos, gamertag) {
    // Los ya vinculados a Xbox no se muestran; los que tienes de Steam o a mano se unen a ese juego
    const mios = StorageManager.getGames();
    const vinculados = new Set(mios.filter(g => g.xboxTitleId).map(g => String(g.xboxTitleId)));
    const sinId = new Set(mios.filter(g => !g.xboxTitleId && (g.platforms || []).includes("Xbox")).map(g => claveTitulo(g.title)));
    juegos = (todos || [])
      .filter(j => !(j.titleId && vinculados.has(String(j.titleId))) && !sinId.has(claveTitulo(j.titulo)))
      .map(j => ({ ...j, seUneCon: mios.find(g => !g.xboxTitleId && claveTitulo(g.title) === claveTitulo(j.titulo))?.title || null }))
      // Los jugados más recientemente arriba
      .sort((a, b) => (Date.parse(b.ultimaVez) || 0) - (Date.parse(a.ultimaVez) || 0));
    if (!juegos.length) {
      estado.textContent = (todos || []).length ? "Todos tus juegos de Xbox ya están en tu estante." : "Xbox no devolvió juegos para esta cuenta.";
      document.getElementById("xboxResultado").hidden = true;
      return;
    }
    estado.textContent = "";
    // Solo se marcan los que tienen algún logro: los demás suelen ser juegos que apenas se abrieron
    const conLogros = (x) => x.logros > 0 || x.progreso > 0;
    const marcados = juegos.filter(conLogros).length;
    document.getElementById("xboxCuenta").textContent = `${gamertag ? gamertag + " · " : ""}${juegos.length} juegos nuevos · ${marcados} marcados (los que tienen logros)`;
    lista.innerHTML = juegos.map((j, i) => `
      <li><label>
        <input type="checkbox" data-i="${i}" ${conLogros(j) ? "checked" : ""}>
        ${/^https:\/\//.test(j.portada || "") ? `<img src="${esc(j.portada)}" alt="" loading="lazy">` : `<span class="lista-sin-tapa"></span>`}
        <span class="lista-juego"><b>${esc(j.titulo)}</b><small>${j.logrosTotal ? `${j.logros}/${j.logrosTotal} logros · ${Math.round(j.progreso)}%` : (j.logros ? `${j.logros} logros · ${Math.round(j.progreso)}%` : "sin logros")}${j.seUneCon ? ` · se une con «${esc(j.seUneCon)}» que ya tienes` : ""}</small></span>
      </label></li>`).join("");
    document.getElementById("xboxTodos").textContent = marcados === juegos.length ? "Desmarcar todos" : "Marcar todos";
    document.getElementById("xboxResultado").hidden = false;
  }

  async function buscarGamertag() {
    const b = document.getElementById("xboxBuscar");
    const gt = document.getElementById("xboxGamertag").value.trim();
    if (!gt) { estado.textContent = "Escribe tu gamertag."; return; }
    if (!cloudUserId) { estado.innerHTML = 'Para importar desde Xbox necesitas una cuenta. <a href="/login" class="underline">Inicia sesión o regístrate</a>: es gratis y así tu estante se guarda en la nube.'; return; }
    estado.textContent = "Buscando tus juegos de Xbox…";
    b.disabled = true;
    try {
      const r = await fetchConSesion(`/api/xbox?gt=${encodeURIComponent(gt)}`);
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
      if (data.privado) {
        estado.textContent = `Encontramos a ${data.gamertag}, pero su historial de juegos no es público. Abre "Si no aparecen tus juegos" para ver cómo cambiarlo.`;
        document.getElementById("xboxResultado").hidden = true;
        return;
      }
      mostrar(data.juegos, data.gamertag);
      if (window.Autodatos) window.Autodatos.guardarCuenta({ xbox_gamertag: data.gamertag, xbox_xuid: data.xuid });
    } catch (err) {
      estado.textContent = err.message;
    } finally {
      b.disabled = false;
    }
  }
  document.getElementById("xboxBuscar").addEventListener("click", buscarGamertag);
  document.getElementById("xboxGamertag").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); buscarGamertag(); } });

  document.getElementById("xboxConsultar").addEventListener("click", async (e) => {
    const b = e.currentTarget;
    const clave = document.getElementById("xboxClave").value.trim();
    estado.textContent = "Consultando tu historial de Xbox…";
    b.disabled = true;
    try {
      const r = await fetch("/api/xbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clave }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
      mostrar(data.juegos, "");
    } catch (err) {
      estado.textContent = err.message;
    } finally {
      b.disabled = false;
    }
  });

  // Vuelta de "Iniciar sesión con Xbox": los juegos llegan por sessionStorage
  const params = new URLSearchParams(location.search);
  if (params.has("xbox") && !isSpectatorMode) {
    let datos = null;
    try { datos = JSON.parse(sessionStorage.getItem("xboxImport") || "null"); sessionStorage.removeItem("xboxImport"); } catch (e) { datos = null; }
    history.replaceState(null, "", location.pathname);
    modal.classList.remove("hidden");
    if (params.get("xbox") === "error") estado.textContent = "La conexión con Xbox todavía no está configurada en el servidor.";
    else if (!datos) estado.textContent = "No llegaron datos de Xbox. Vuelve a intentarlo.";
    else if (datos.error) estado.textContent = datos.error;
    else mostrar(datos.juegos, datos.gamertag);
  }

  document.getElementById("xboxTodos").addEventListener("click", (e) => {
    const cajas = [...lista.querySelectorAll("input[type=checkbox]")];
    const marcar = cajas.some(c => !c.checked);
    cajas.forEach(c => { c.checked = marcar; });
    e.currentTarget.textContent = marcar ? "Desmarcar todos" : "Marcar todos";
  });

  document.getElementById("xboxImportar").addEventListener("click", async () => {
    const elegidos = [...lista.querySelectorAll("input[type=checkbox]:checked")].map(c => juegos[Number(c.dataset.i)]).filter(Boolean);
    if (!elegidos.length) { estado.textContent = "Marca al menos un juego."; return; }
    const actuales = StorageManager.getGames();
    const nuevos = [];
    const unidos = new Map();
    elegidos.forEach(j => {
      const datos = {
        plataforma: "Xbox", etiqueta: "#Xbox", xboxTitleId: j.titleId || null, lastPlayed: j.ultimaVez || null,
        achUnlocked: j.logros || 0, achTotal: j.logrosTotal || null, status: j.progreso >= 100 ? "platinum" : null,
        coverUrl: /^https:\/\//.test(j.portada || "") ? j.portada : ""
      };
      const igual = actuales.find(g => !g.xboxTitleId && !unidos.has(g.id) && claveTitulo(g.title) === claveTitulo(j.titulo));
      if (igual) { unidos.set(igual.id, fusionarPlataforma(igual, datos)); return; }
      nuevos.push({
        id: newGameId(),
        title: j.titulo,
        coverUrl: datos.coverUrl,
        status: j.progreso >= 100 ? "platinum" : "backlog",
        platforms: ["Xbox"],
        rating: null,
        hours: 0,
        targetHours: 0,
        completedYear: null,
        favorite: false,
        tags: ["#Xbox"],
        notes: "",
        xboxTitleId: datos.xboxTitleId,
        lastPlayed: datos.lastPlayed,
        achUnlocked: datos.achUnlocked,
        achTotal: datos.achTotal
      });
    });
    const fusionados = [...unidos.values()];
    StorageManager.saveGames([...actuales.map(g => unidos.get(g.id) || g), ...nuevos]);
    await cloudRun(() => DB.upsertGames([...fusionados, ...nuevos]), "No se pudieron subir los juegos importados a la nube.");
    renderLibrary();
    cerrar();
    if (window.Autodatos) window.Autodatos.completar([...nuevos, ...fusionados]);
    document.getElementById("xboxClave").value = "";
    showToast(`Xbox: ${nuevos.length} juegos nuevos${fusionados.length ? ` y ${fusionados.length} unidos a los que ya tenías` : ""}. Ahora reviso sus logros para ponerles estado.`);
  });
})();
