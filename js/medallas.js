/**
 * Medallas del estante (se calculan con los juegos que se están viendo, propio o perfil público)
 * y "¿Qué juego hago ahora?": tres propuestas de los pendientes y pausados según la duración que elijas.
 */
(function () {
  const esc = (s) => escapeHTML(String(s ?? ""));
  const TERMINADO = ["completed", "extras", "platinum"];

  // [id, icono, nombre, descripción, valor(juegos) → número, meta]
  const MEDALLAS = [
    ["platino1", "fa-trophy", "Primer platino", "Consigue tu primer platino", g => g.filter(x => x.status === "platinum").length, 1],
    ["platino10", "fa-trophy", "Cazador de platinos", "10 platinos", g => g.filter(x => x.status === "platinum").length, 10],
    ["platino25", "fa-crown", "Leyenda del 100%", "25 platinos", g => g.filter(x => x.status === "platinum").length, 25],
    ["terminados25", "fa-flag-checkered", "Rematador", "Termina 25 juegos", g => g.filter(x => TERMINADO.includes(x.status)).length, 25],
    ["terminados100", "fa-flag-checkered", "Imparable", "Termina 100 juegos", g => g.filter(x => TERMINADO.includes(x.status)).length, 100],
    ["coleccion50", "fa-layer-group", "Coleccionista", "50 juegos en el estante", g => g.length, 50],
    ["coleccion200", "fa-landmark", "Archivista", "200 juegos en el estante", g => g.length, 200],
    ["horas1000", "fa-stopwatch", "Maratonista", "1.000 horas registradas", g => g.reduce((t, x) => t + (Number(x.hours) || 0), 0), 1000],
    ["horas5000", "fa-hourglass-end", "La vida es un juego", "5.000 horas registradas", g => g.reduce((t, x) => t + (Number(x.hours) || 0), 0), 5000],
    ["fiel", "fa-heart", "Fiel", "Un solo juego con 300 horas", g => Math.max(0, ...g.map(x => Number(x.hours) || 0)), 300],
    ["critico", "fa-star-half-stroke", "Crítico", "Ponle nota a 20 juegos", g => g.filter(x => Number(x.rating) > 0).length, 20],
    ["multi", "fa-gamepad", "Multiplataforma", "Juega en 3 plataformas", g => new Set(g.flatMap(x => x.platforms || [])).size, 3],
    ["malabarista", "fa-shuffle", "Malabarista", "5 juegos en marcha a la vez", g => g.filter(x => x.status === "playing").length, 5]
  ];

  function pintarMedallas() {
    const caja = document.getElementById("medallas");
    if (!caja || typeof getCurrentDataset !== "function") return;
    const juegos = getCurrentDataset() || [];
    if (!juegos.length) { caja.hidden = true; return; }
    const estado = MEDALLAS.map(([id, icono, nombre, desc, valor, meta]) => {
      const v = valor(juegos);
      return { id, icono, nombre, desc, v, meta, ok: v >= meta };
    });
    const ganadas = estado.filter(m => m.ok);
    // Las ganadas, y las 3 más cercanas de conseguir con su progreso
    const proximas = estado.filter(m => !m.ok).sort((a, b) => b.v / b.meta - a.v / a.meta).slice(0, 3);
    document.getElementById("medallasCuenta").textContent = `${ganadas.length} de ${MEDALLAS.length}`;
    document.getElementById("medallasLista").innerHTML = [...ganadas, ...proximas].map(m => `
      <li class="medalla ${m.ok ? "ganada" : ""}" title="${esc(m.desc)}">
        <span class="medalla-icono"><i class="fa-solid ${m.icono}" aria-hidden="true"></i></span>
        <span class="medalla-texto"><b>${esc(m.nombre)}</b><small>${m.ok ? esc(m.desc) : `${Math.min(m.v, m.meta).toLocaleString("es")} / ${m.meta.toLocaleString("es")}`}</small></span>
        ${m.ok ? "" : `<span class="medalla-barra"><span style="width:${Math.round(Math.min(1, m.v / m.meta) * 100)}%"></span></span>`}
      </li>`).join("");
    caja.hidden = false;
  }

  if (typeof renderLibrary === "function") {
    const anterior = renderLibrary;
    // eslint-disable-next-line no-global-assign
    renderLibrary = function () { anterior.apply(this, arguments); pintarMedallas(); };
  }
  pintarMedallas();

  // ---------- ¿Qué juego hago ahora? ----------
  const modal = document.getElementById("queJuegoModal");
  const btn = document.getElementById("queJuegoBtn");
  if (!modal || !btn) return;
  if (isSpectatorMode) { btn.remove(); return; }
  const lista = document.getElementById("queJuegoLista");
  const estado = document.getElementById("queJuegoEstado");
  let duracion = "igual";
  let vistos = new Set();
  const RANGO = { corto: [0, 12], medio: [12, 35], largo: [35, 9999], igual: [0, 9999] };

  const cache = (() => { try { return JSON.parse(localStorage.getItem("gv_duraciones") || "{}"); } catch (e) { return {}; } })();
  async function duracionDe(titulo) {
    if (titulo in cache) return cache[titulo];
    try {
      const d = await fetch(`/api/rawg?detalle=1&search=${encodeURIComponent(titulo)}`).then(r => r.json());
      cache[titulo] = d.encontrado ? (d.duracion || null) : null;
      try { localStorage.setItem("gv_duraciones", JSON.stringify(cache)); } catch (e) { /* sin almacenamiento */ }
    } catch (e) { return null; }
    return cache[titulo];
  }

  // Puntos: pausados y jugados hace poco primero; suma si ya le avanzaste, si es favorito o si tiene etiquetas de tus juegos mejor puntuados
  function puntuar(g, gustos) {
    let p = Math.random() * 2;
    if (g.status === "onhold") p += 2;
    if (g.lastPlayed) p += Math.max(0, 3 - (Date.now() - Date.parse(g.lastPlayed)) / (90 * 86400000));
    if (g.achUnlocked && g.achTotal) p += 2 * (g.achUnlocked / g.achTotal);
    if (g.favorite) p += 2;
    p += (g.tags || []).reduce((t, tag) => t + (gustos.get(tag) || 0), 0);
    return p;
  }

  function motivo(g, horas) {
    const m = [];
    if (g.status === "onhold") m.push("lo dejaste en pausa");
    if (g.achUnlocked && g.achTotal) m.push(`llevas ${Math.round(100 * g.achUnlocked / g.achTotal)}% de logros`);
    if (horas) m.push(`dura unas ${horas} h`);
    if (g.hours) m.push(`ya le echaste ${g.hours} h`);
    return m.length ? m.join(" · ") : "lleva tiempo esperándote";
  }

  async function proponer() {
    const todos = StorageManager.getGames();
    const candidatos = todos.filter(g => ["backlog", "onhold"].includes(g.status) && !vistos.has(g.id));
    if (!candidatos.length) {
      estado.textContent = vistos.size ? "Ya te enseñé todos tus pendientes. Vuelve a abrir para empezar de nuevo." : "No tienes juegos pendientes ni en pausa. ¡Ve a por algo nuevo!";
      lista.innerHTML = "";
      return;
    }
    // Lo que te gusta: etiquetas de tus juegos con nota alta
    const gustos = new Map();
    todos.filter(g => Number(g.rating) >= 8).forEach(g => (g.tags || []).forEach(t => gustos.set(t, Math.min(1.5, (gustos.get(t) || 0) + 0.3))));
    const orden = candidatos.map(g => ({ g, p: puntuar(g, gustos) })).sort((a, b) => b.p - a.p).map(x => x.g);
    estado.textContent = "Pensando…";
    lista.innerHTML = "";
    const [min, max] = RANGO[duracion];
    const elegidos = [];
    for (const g of orden.slice(0, 18)) {
      const horas = duracion === "igual" ? (cache[g.title] ?? null) : await duracionDe(g.title);
      if (duracion !== "igual" && (horas === null || horas < min || horas >= max)) continue;
      elegidos.push({ g, horas });
      if (elegidos.length === 3) break;
    }
    if (!elegidos.length) { estado.textContent = "Ninguno de tus pendientes encaja con esa duración. Prueba con otra."; return; }
    elegidos.forEach(x => vistos.add(x.g.id));
    estado.textContent = "";
    lista.innerHTML = elegidos.map(({ g, horas }, i) => `
      <li>
        ${/^https:\/\//.test(g.coverUrl || "") ? `<img src="${esc(g.coverUrl)}" alt="" loading="lazy">` : `<span class="lista-sin-tapa"></span>`}
        <span class="que-juego-texto"><small>${i === 0 ? "Mi recomendación" : "También"}</small><b>${esc(g.title)}</b><span>${esc(motivo(g, horas))}</span></span>
        <button type="button" class="boton boton-senal" data-empezar="${g.id}">Empezar</button>
      </li>`).join("");
  }

  lista.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-empezar]");
    if (!b) return;
    const id = Number(b.dataset.empezar);
    const juegos = StorageManager.getGames().map(g => g.id === id ? { ...g, status: "playing", lastPlayed: new Date().toISOString() } : g);
    StorageManager.saveGames(juegos);
    const g = juegos.find(x => x.id === id);
    await cloudRun(() => DB.upsertGames([g]), "No se pudo guardar el cambio en la nube.");
    renderLibrary();
    modal.classList.add("hidden");
    showToast(`¡A darle a ${g.title}! Lo pasé a «Jugando».`);
  });

  modal.querySelectorAll("[data-dur]").forEach(b => b.addEventListener("click", () => {
    modal.querySelectorAll("[data-dur]").forEach(x => x.classList.toggle("active", x === b));
    duracion = b.dataset.dur;
    vistos = new Set();
    proponer();
  }));
  btn.addEventListener("click", () => { vistos = new Set(); modal.classList.remove("hidden"); proponer(); });
  document.getElementById("queJuegoOtra").addEventListener("click", proponer);
  document.getElementById("queJuegoCerrar").addEventListener("click", () => modal.classList.add("hidden"));
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.add("hidden"); });
})();
