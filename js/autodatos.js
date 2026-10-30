/**
 * Datos automáticos de los juegos:
 *  1. Etiquetas, año y desarrollador desde RAWG (al añadir/importar o con "Completar datos").
 *  2. "Actualizar": horas y última vez jugado desde Steam, progreso de logros desde Xbox.
 *  3. Logros con fecha en la ficha de cada juego (Steam o Xbox), guardados en la nube.
 *  4. Fechas automáticas: primer y último logro; si llegas al 100%, el año en que lo terminaste.
 * Necesita la migración 012 para guardar vínculos y logros.
 */
(function () {
  if (typeof DB === "undefined") return;
  const esc = (s) => escapeHTML(String(s ?? ""));
  const clave = (t) => (typeof claveTitulo === "function" ? claveTitulo(t) : String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, ""));
  const pausa = (ms) => new Promise(r => setTimeout(r, ms));
  const btnDatos = document.getElementById("autoDataBtn");
  const btnSync = document.getElementById("syncPlatformsBtn");

  // ---------- utilidades ----------
  function aplicar(cambiosPorId) {
    const ids = Object.keys(cambiosPorId);
    if (!ids.length) return [];
    const juegos = StorageManager.getGames().map(g => (cambiosPorId[g.id] ? { ...g, ...cambiosPorId[g.id] } : g));
    StorageManager.saveGames(juegos);
    const cambiados = juegos.filter(g => cambiosPorId[g.id]);
    if (cloudUserId) cloudRun(() => DB.upsertGames(cambiados), "No se pudieron guardar los datos nuevos en la nube.");
    renderLibrary();
    return cambiados;
  }

  const intentados = (() => {
    try { return new Set(JSON.parse(localStorage.getItem("gv_rawg_intentados") || "[]")); } catch (e) { return new Set(); }
  })();
  const marcarIntentado = (titulo) => {
    intentados.add(clave(titulo));
    try { localStorage.setItem("gv_rawg_intentados", JSON.stringify([...intentados].slice(-2000))); } catch (e) { /* sin almacenamiento */ }
  };

  // ---------- 1. etiquetas, año y desarrollador ----------
  async function datosDe(juego) {
    const r = await fetch(`/api/rawg?detalle=1&search=${encodeURIComponent(juego.title)}`);
    if (!r.ok) return null;
    const d = await r.json();
    return d.encontrado ? d : null;
  }

  async function completar(juegos, avisar) {
    const pendientes = (juegos || []).filter(g => g && !g.releaseYear && !intentados.has(clave(g.title)));
    if (!pendientes.length) { if (avisar) showToast("Todos tus juegos ya tienen sus datos."); return 0; }
    const cambios = {};
    let hechos = 0;
    for (const g of pendientes) {
      hechos++;
      if (avisar && pendientes.length > 3 && (hechos % 5 === 0 || hechos === pendientes.length)) showToast(`Completando datos… ${hechos}/${pendientes.length}`);
      try {
        const d = await datosDe(g);
        marcarIntentado(g.title);
        if (!d) continue;
        const actuales = g.tags || [];
        const ya = new Set(actuales.map(t => clave(t)));
        const nuevas = (d.etiquetas || []).map(t => `#${t}`).filter(t => !ya.has(clave(t)));
        cambios[g.id] = {
          tags: [...actuales, ...nuevas].slice(0, 15),
          releaseYear: d.anio || g.releaseYear || null,
          developer: g.developer || d.desarrollador || null,
          ...(g.coverUrl ? {} : (d.portada ? { coverUrl: d.portada } : {}))
        };
      } catch (e) { /* se reintentará otro día */ }
      await pausa(250);
      // se guarda por tandas para no perder el avance si se cierra la página
      if (Object.keys(cambios).length >= 20) { aplicar({ ...cambios }); Object.keys(cambios).forEach(k => delete cambios[k]); }
    }
    aplicar(cambios);
    if (avisar) showToast("Datos completados: etiquetas, año y desarrollador.");
    return pendientes.length;
  }

  // De dónde salen los logros de un juego (Steam, Xbox o PlayStation) según lo vinculado
  function fuenteDe(g, c) {
    if (!c) return null;
    if (g.steamAppId && c.steam_id) return { fuente: "steam", url: `/api/logros?fuente=steam&steamid=${c.steam_id}&appid=${g.steamAppId}` };
    if (g.xboxTitleId && c.xbox_xuid) return { fuente: "xbox", url: `/api/logros?fuente=xbox&xuid=${c.xbox_xuid}&titleId=${g.xboxTitleId}` };
    if (g.psnNpId && c.psn_account_id) return { fuente: "psn", url: `/api/logros?fuente=psn&accountId=${c.psn_account_id}&np=${g.psnNpId}&servicio=${g.psnService || "trophy"}` };
    return null;
  }
  const NOMBRE_FUENTE = { steam: "Steam", xbox: "Xbox", psn: "PlayStation" };
  const hayCuenta = (c) => Boolean(c && (c.steam_id || c.xbox_gamertag || c.psn_online_id));

  // ---------- 2. sincronizar con Steam, Xbox y PlayStation ----------
  let cuentas = null;
  async function cargarCuentas() {
    cuentas = cloudUserId ? await DB.getCuentas() : null;
    if (btnSync) btnSync.classList.toggle("hidden", !hayCuenta(cuentas));
    return cuentas;
  }

  async function guardarCuenta(cambios) {
    if (!cloudUserId) return;
    await DB.guardarCuentas(cambios);
    cargarCuentas();
  }

  function emparejar(juegos, porId, porTitulo) {
    const idx = new Map();
    juegos.forEach(g => { if (porId(g)) idx.set("id:" + porId(g), g); idx.set("t:" + clave(g.title), g); });
    return (item) => idx.get("id:" + item.id) || idx.get("t:" + clave(porTitulo(item)));
  }

  async function sincronizar() {
    const c = cuentas || await cargarCuentas();
    if (!c) { showToast("Importa primero desde Steam o Xbox para vincular tu cuenta.", true); return; }
    const juegos = StorageManager.getGames();
    const cambios = {};
    const informe = [];

    if (c.steam_id) {
      try {
        const r = await fetch(`/api/steam?steamid=${encodeURIComponent(c.steam_id)}`);
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Steam no respondió.");
        const buscar = emparejar(juegos, g => g.steamAppId, s => s.name);
        let n = 0;
        (data.response?.games || []).forEach(s => {
          const g = buscar({ id: s.appid, name: s.name });
          if (!g) return;
          const horas = Math.round((s.playtime_forever || 0) / 60);
          const ultima = s.rtime_last_played ? new Date(s.rtime_last_played * 1000).toISOString() : null;
          const cambio = { steamAppId: s.appid };
          if (horas > (g.hours || 0)) cambio.hours = horas;
          if (ultima && (!g.lastPlayed || ultima > g.lastPlayed)) cambio.lastPlayed = ultima;
          if (Object.keys(cambio).some(k => g[k] !== cambio[k])) { cambios[g.id] = { ...(cambios[g.id] || {}), ...cambio }; n++; }
        });
        informe.push(`Steam: ${n} juegos actualizados`);
      } catch (e) { informe.push(`Steam: ${e.message}`); }
    }

    if (c.xbox_gamertag) {
      try {
        const r = await fetchConSesion(`/api/xbox?gt=${encodeURIComponent(c.xbox_gamertag)}`);
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Xbox no respondió.");
        if (data.xuid && data.xuid !== c.xbox_xuid) DB.guardarCuentas({ xbox_xuid: data.xuid });
        const buscar = emparejar(juegos, g => g.xboxTitleId, x => x.titulo);
        let n = 0;
        (data.juegos || []).forEach(x => {
          const g = buscar({ id: x.titleId, titulo: x.titulo });
          if (!g) return;
          const cambio = { xboxTitleId: x.titleId || g.xboxTitleId };
          if (x.ultimaVez && (!g.lastPlayed || x.ultimaVez > g.lastPlayed)) cambio.lastPlayed = x.ultimaVez;
          if (x.logros > (g.achUnlocked || 0)) cambio.achUnlocked = x.logros;
          if (x.logrosTotal && x.logrosTotal !== g.achTotal) cambio.achTotal = x.logrosTotal;
          if (Object.keys(cambio).some(k => g[k] !== cambio[k])) { cambios[g.id] = { ...(cambios[g.id] || {}), ...cambio }; n++; }
        });
        informe.push(`Xbox: ${n} juegos actualizados`);
      } catch (e) { informe.push(`Xbox: ${e.message}`); }
    }

    if (c.psn_online_id) {
      try {
        const r = await fetchConSesion(`/api/psn?id=${encodeURIComponent(c.psn_online_id)}`);
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "PlayStation no respondió.");
        if (data.accountId && data.accountId !== c.psn_account_id) DB.guardarCuentas({ psn_account_id: data.accountId });
        const buscar = emparejar(juegos, g => g.psnNpId, x => x.titulo);
        let n = 0;
        (data.juegos || []).forEach(x => {
          const g = buscar({ id: x.npId, titulo: x.titulo });
          if (!g) return;
          const cambio = x.npId ? { psnNpId: x.npId, psnService: x.servicio } : {};
          if (x.ultimaVez && (!g.lastPlayed || x.ultimaVez > g.lastPlayed)) cambio.lastPlayed = x.ultimaVez;
          if (x.horas > (g.hours || 0)) cambio.hours = x.horas;
          if (!g.steamAppId && !g.xboxTitleId) {
            if (x.logros > (g.achUnlocked || 0)) cambio.achUnlocked = x.logros;
            if (x.logrosTotal && x.logrosTotal !== g.achTotal) cambio.achTotal = x.logrosTotal;
          }
          if (x.platino && g.status !== "platinum") cambio.status = "platinum";
          if (Object.keys(cambio).some(k => g[k] !== cambio[k])) { cambios[g.id] = { ...(cambios[g.id] || {}), ...cambio }; n++; }
        });
        informe.push(`PlayStation: ${n} juegos actualizados`);
      } catch (e) { informe.push(`PlayStation: ${e.message}`); }
    }

    aplicar(cambios);
    showToast(informe.join(" · ") || "Nada que actualizar.");
  }

  // ---------- 3 y 4. logros en la ficha + fechas automáticas ----------
  const caja = document.getElementById("modalLogros");
  const datosFicha = document.getElementById("modalDatos");
  const fecha = (f) => new Date(f).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
  let fichaActual = null;

  function pintarDatos(g) {
    if (!datosFicha) return;
    const filas = [
      g.developer && ["Desarrollador", esc(g.developer)],
      g.releaseYear && ["Lanzamiento", g.releaseYear],
      g.firstPlayed && ["Empezado", fecha(g.firstPlayed)],
      g.lastPlayed && ["Última vez", fecha(g.lastPlayed)]
    ].filter(Boolean);
    datosFicha.innerHTML = filas.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
    datosFicha.hidden = !filas.length;
  }

  // El servidor de imágenes de Xbox (images-eds) ya no responde: esos logros llevan un trofeo
  function iconoURL(u) {
    try {
      const h = new URL(u).hostname;
      if (/^images-eds/.test(h)) return null;
      // Los iconos de trofeos de PlayStation pasan por la web (su servidor no carga en todos los navegadores)
      if (h === "psnobj.prod.dl.playstation.net") return `/api/icono?u=${encodeURIComponent(u)}`;
      return u;
    } catch (e) { return null; }
  }

  function pintarLogros(items, origen, sincronizado, puedeActualizar) {
    const logrados = items.filter(i => i.logrado);
    const pct = items.length ? Math.round((logrados.length / items.length) * 100) : 0;
    const orden = [
      ...logrados.sort((a, b) => (Date.parse(b.fecha) || 0) - (Date.parse(a.fecha) || 0)),
      ...items.filter(i => !i.logrado).sort((a, b) => (b.rareza ?? -1) - (a.rareza ?? -1))
    ];
    caja.innerHTML = `
      <div class="logros-cabecera">
        <h4>${origen === "psn" ? "Trofeos" : "Logros"} <span>${logrados.length}/${items.length} · ${pct}%</span></h4>
        ${puedeActualizar ? `<button type="button" class="resena-mas" data-logros-recargar>Actualizar</button>` : ""}
      </div>
      <div class="logros-barra" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>
      <p class="logros-origen">${NOMBRE_FUENTE[origen] || origen}${sincronizado ? ` · actualizado ${fecha(sincronizado)}` : ""}</p>
      <ul class="logros-lista">
        ${orden.slice(0, 300).map(i => `
          <li class="${i.logrado ? "si" : "no"}">
            ${iconoURL(i.icono) ? `<img src="${esc(iconoURL(i.icono))}" alt="" loading="lazy">` : `<span class="logro-sin-icono"><i class="fa-solid fa-trophy" aria-hidden="true"></i></span>`}
            <span class="logro-texto"><b>${esc(i.nombre)}</b><small>${esc(i.desc || "")}</small></span>
            <span class="logro-meta">${i.logrado && i.fecha ? fecha(i.fecha) : (i.logrado ? "Logrado" : "Pendiente")}${i.rareza !== null && i.rareza !== undefined ? `<small>${i.rareza}% lo tiene</small>` : ""}</span>
          </li>`).join("")}
      </ul>
      ${orden.length > 300 ? `<p class="logros-origen">Se muestran 300 de ${orden.length}.</p>` : ""}`;
    caja.hidden = false;
  }

  // ---------- estado automático ----------
  // Solo sube de nivel (nunca baja lo que tú pusiste): Pendiente → Jugando/En pausa → Historia → Platino
  const NIVEL = { backlog: 0, onhold: 1, playing: 1, completed: 2, extras: 3, platinum: 4 };
  const DIAS_JUGANDO = 30;
  const FINAL = /\b(complet|termin|acab|finaliz|super|venc)[a-záéíóú]*\s+(el\s+juego|la\s+(campaña|historia|aventura)|el\s+modo\s+historia|la\s+trama)|\b(finish|complete|beat)(ed)?\s+the\s+(game|campaign|story)|\b(ver|roll)\s+(los\s+|the\s+)?(créditos|credits)/i;

  function subir(g, cambio, estado) {
    const actual = cambio.status || g.status || "backlog";
    if ((NIVEL[estado] ?? 0) > (NIVEL[actual] ?? 0)) cambio.status = estado;
    // de Pendiente o En pausa a Jugando si lo jugaste hace poco
    if (estado === "playing" && ["backlog", "onhold"].includes(actual)) cambio.status = "playing";
  }

  // Con lo que ya se sabe del juego, sin pedir nada
  function estadoBasico(g, cambio = {}) {
    const desbloqueados = cambio.achUnlocked ?? g.achUnlocked ?? 0;
    const total = cambio.achTotal ?? g.achTotal ?? 0;
    const ultima = cambio.lastPlayed || g.lastPlayed;
    const horas = cambio.hours ?? g.hours ?? 0;
    if (total && desbloqueados >= total) subir(g, cambio, "platinum");
    const empezado = desbloqueados > 0 || horas >= 1;
    if (!empezado) return cambio;
    const reciente = ultima && Date.now() - Date.parse(ultima) < DIAS_JUGANDO * 86400000;
    subir(g, cambio, reciente ? "playing" : "onhold");
    return cambio;
  }

  // Con la lista de logros: fechas, 100% y si tiene el logro de terminar la historia
  function fechasDesdeLogros(g, items) {
    const logrados = items.filter(i => i.logrado);
    const fechas = logrados.filter(i => i.fecha).map(i => i.fecha).sort();
    const cambio = { achUnlocked: logrados.length, achTotal: items.length };
    if (fechas.length) {
      if (!g.firstPlayed || fechas[0] < g.firstPlayed) cambio.firstPlayed = fechas[0];
      const ultima = fechas[fechas.length - 1];
      if (!g.lastPlayed || ultima > g.lastPlayed) cambio.lastPlayed = ultima;
    }
    estadoBasico(g, cambio);
    const final = logrados.find(i => FINAL.test(`${i.nombre} ${i.desc || ""}`));
    if (final) subir(g, cambio, "completed");
    // En PlayStation el trofeo de platino manda aunque falten trofeos de DLC
    const platino = logrados.find(i => i.tipo === "platinum");
    if (platino || (items.length && logrados.length === items.length)) subir(g, cambio, "platinum");
    if (NIVEL[cambio.status || g.status] >= 2 && !g.completedYear) {
      const cuando = (cambio.status || g.status) === "platinum" ? (platino?.fecha || fechas[fechas.length - 1]) : final?.fecha;
      if (cuando) cambio.completedYear = new Date(cuando).getFullYear();
    }
    return cambio;
  }

  // Revisa en segundo plano los logros de los juegos vinculados para ponerles estado y fechas.
  // Xbox (OpenXBL gratis) permite pocas consultas por hora: como mucho 40 juegos de Xbox por pasada.
  const analizados = (() => {
    try { return JSON.parse(localStorage.getItem("gv_analizados") || "{}"); } catch (e) { return {}; }
  })();
  let analizando = false;
  async function analizar(juegos, avisar) {
    // Primero, al instante: estado según horas, logros y última vez jugado (también para invitados)
    const base = {};
    (juegos || []).forEach(g => { const cb = estadoBasico(g); if (Object.keys(cb).length) base[g.id] = cb; });
    aplicar(base);
    if (analizando || !cloudUserId) return;
    const c = cuentas || await cargarCuentas();
    if (!c) return;
    const semana = 7 * 86400000;
    const actuales = StorageManager.getGames();
    const ids = new Set((juegos || []).map(g => g.id));
    const pendientes = actuales
      .filter(g => ids.has(g.id) && !(Date.now() - (analizados[g.id] || 0) < semana))
      .filter(g => {
        const f = fuenteDe(g, c);
        if (!f) return false;
        return f.fuente === "steam" ? (g.hours || 0) > 0 : ((g.achUnlocked || 0) > 0 || (g.hours || 0) > 0);
      })
      .sort((a, b) => String(b.lastPlayed || "").localeCompare(String(a.lastPlayed || "")));
    // Topes por pasada: Xbox (OpenXBL gratis) 40, PlayStation 60; Steam sin tope
    const tope = { xbox: 40, psn: 60 };
    const usados = { xbox: 0, psn: 0 };
    const lote = pendientes.filter(g => { const f = fuenteDe(g, c).fuente; return f === "steam" || ++usados[f] <= tope[f]; });
    if (!lote.length) return;
    analizando = true;
    let cambios = {}, hechos = 0, cambiados = 0;
    try {
      for (const g of lote) {
        hechos++;
        if (avisar && (hechos % 10 === 0 || hechos === lote.length)) showToast(`Revisando logros… ${hechos}/${lote.length}`);
        const { fuente, url } = fuenteDe(g, c);
        try {
          const r = await fetchConSesion(url);
          if (r.status === 429) { showToast(`${NOMBRE_FUENTE[fuente]} pide una pausa: el resto de juegos se revisa en la próxima actualización.`, true); break; }
          if (r.status === 403) {
            analizados[g.id] = Date.now();
            if (fuente === "steam") { showToast("Steam no deja ver tus logros: en Steam pon «Detalles del juego» como Público en la privacidad de tu perfil.", true); break; }
            continue;
          }
          const data = await r.json();
          analizados[g.id] = Date.now();
          const items = data.items || [];
          if (!r.ok || !items.length) continue;
          DB.guardarLogros(g.id, fuente, items);
          const cambio = fechasDesdeLogros(g, items);
          if (Object.keys(cambio).some(k => g[k] !== cambio[k])) { cambios[g.id] = cambio; cambiados++; }
        } catch (e) { /* se reintenta en la próxima pasada */ }
        if (Object.keys(cambios).length >= 15) { aplicar(cambios); cambios = {}; }
        await pausa(fuente === "steam" ? 250 : 600);
      }
      aplicar(cambios);
    } finally {
      analizando = false;
      try { localStorage.setItem("gv_analizados", JSON.stringify(analizados)); } catch (e) { /* sin almacenamiento */ }
    }
    if (avisar || cambiados) showToast(`Logros revisados: ${cambiados} juegos con estado o fechas nuevas.`);
  }

  async function traerLogros(g, forzar) {
    if (!caja) return;
    const c = cuentas || await cargarCuentas();
    const origen = fuenteDe(g, c);
    if (!origen) return false;
    const { fuente, url } = origen;
    if (!forzar) {
      const guardado = await DB.getLogros(g.id);
      if (guardado && guardado.items?.length && Date.now() - Date.parse(guardado.synced_at) < 24 * 3600 * 1000) {
        if (fichaActual === g.id) pintarLogros(guardado.items, guardado.source, guardado.synced_at, true);
        return true;
      }
    }
    caja.innerHTML = `<p class="logros-origen">Cargando logros…</p>`;
    caja.hidden = false;
    try {
      const r = await fetchConSesion(url);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "No se pudieron cargar los logros.");
      const items = data.items || [];
      if (fichaActual !== g.id) return true;
      if (!items.length) { caja.innerHTML = `<p class="logros-origen">Este juego no tiene logros.</p>`; return true; }
      pintarLogros(items, fuente, new Date().toISOString(), true);
      DB.guardarLogros(g.id, fuente, items);
      analizados[g.id] = Date.now();
      const cambio = fechasDesdeLogros(g, items);
      const actualizado = aplicar({ [g.id]: cambio })[0];
      if (actualizado) pintarDatos(actualizado);
    } catch (e) {
      caja.innerHTML = `<p class="logros-origen">${esc(e.message)}</p>`;
    }
    return true;
  }

  async function logrosEnFicha(g) {
    if (!caja) return;
    caja.hidden = true;
    caja.innerHTML = "";
    if (isSpectatorMode) {
      // En un perfil ajeno solo se muestran los logros que su dueño ya cargó
      const uid = await DB.getUserIdPorNombre(publicProfileTarget);
      const guardado = uid ? await DB.getLogros(g.id, uid) : null;
      if (guardado && guardado.items?.length && fichaActual === g.id) pintarLogros(guardado.items, guardado.source, guardado.synced_at, false);
      return;
    }
    if (!cloudUserId) return;
    const hay = await traerLogros(g, false);
    if (!hay && fichaActual === g.id && hayCuenta(cuentas)) {
      caja.innerHTML = `<p class="logros-origen">Este juego aún no está vinculado a Steam, Xbox ni PlayStation. Pulsa <b>ACTUALIZAR</b> en tu estante para vincularlo.</p>`;
      caja.hidden = false;
    }
  }

  // Si un icono no carga, se cambia por un trofeo en vez de la imagen rota
  if (caja) caja.addEventListener("error", (e) => {
    if (e.target.tagName !== "IMG") return;
    const sustituto = document.createElement("span");
    sustituto.className = "logro-sin-icono";
    sustituto.innerHTML = `<i class="fa-solid fa-trophy" aria-hidden="true"></i>`;
    e.target.replaceWith(sustituto);
  }, true);

  if (caja) caja.addEventListener("click", (e) => {
    if (!e.target.closest("[data-logros-recargar]")) return;
    const g = StorageManager.getGames().find(x => x.id === fichaActual);
    if (g) traerLogros(g, true);
  });

  if (typeof openDetailModal === "function") {
    const abrirAnterior = openDetailModal;
    // eslint-disable-next-line no-global-assign
    openDetailModal = function (game) {
      abrirAnterior(game);
      fichaActual = game.id;
      pintarDatos(game);
      logrosEnFicha(game);
    };
  }

  // ---------- botones y arranque ----------
  if (btnDatos && !isSpectatorMode) {
    btnDatos.classList.remove("hidden");
    btnDatos.addEventListener("click", async () => {
      btnDatos.disabled = true;
      // botón manual: se reintentan también los que antes no se encontraron
      intentados.clear();
      try { await completar(StorageManager.getGames(), true); } finally { btnDatos.disabled = false; }
    });
  }
  if (btnSync && !isSpectatorMode) {
    btnSync.addEventListener("click", async () => {
      btnSync.disabled = true;
      showToast("Actualizando desde Steam y Xbox…");
      try { await sincronizar(); await analizar(StorageManager.getGames(), true); } finally { btnSync.disabled = false; }
    });
  }

  window.Autodatos = {
    // tras añadir o importar: datos de RAWG y, si están vinculados, estado y fechas desde sus logros
    // las dos cosas a la vez: el estado sale al momento y los logros no esperan a RAWG
    completar: (j) => Promise.all([completar(j, false), analizar(j, (j || []).length > 3)]),
    guardarCuenta, sincronizar, analizar
  };
  if (!isSpectatorMode) setTimeout(cargarCuentas, 1500); // tras cargar la sesión
})();
