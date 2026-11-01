/**
 * Ports nativos (/ports): juegos clásicos que se pueden jugar nativos en PC o Android gracias a
 * descompilaciones, recompilaciones y reimplementaciones hechas por fans. data/ports.json se regenera
 * cada semana (scripts/ports.mjs) desde OpenPortsGames y awesome-unofficial-pc-ports, más datos de GitHub.
 * Solo se enlaza a la página oficial de cada proyecto: el juego lo pone cada uno.
 */
(function () {
  const raiz = document.getElementById("ports");
  if (!raiz) return;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const seguro = (u) => (/^https:\/\//.test(String(u || "")) ? String(u) : "#");
  const fecha = (f) => (f ? new Date(String(f).slice(0, 10) + "T12:00:00Z").toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) : "");
  const miles = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)} k` : String(n));
  const SO = { windows: ["fa-brands fa-windows", "Windows"], linux: ["fa-brands fa-linux", "Linux"], macos: ["fa-brands fa-apple", "macOS"], mac: ["fa-brands fa-apple", "macOS"], android: ["fa-brands fa-android", "Android"] };
  const ESTADOS = { stable: ["Estable", "estable"], beta: ["Beta", "beta"], alpha: ["Alfa", "alfa"] };
  const TIPOS = { recompilation: "Recompilación", decompilation: "Descompilación", "source-port": "Port de código", reimplementation: "Reimplementación", "runtime-port": "Port de runtime" };
  const POR_PAGINA = 30;
  let datos = { juegos: [] };
  let vista = [];
  let mostrados = 0;
  const filtro = { q: "", sistema: "todos", so: "todos", solidos: false };

  raiz.innerHTML = `
    <section class="archivo-cabecera">
      <h1 class="seccion-titulo">Ports nativos</h1>
      <p>Juegos que puedes jugar <b>nativos en PC o Android</b>, sin emulador, gracias a descompilaciones y recompilaciones hechas por fans: más resolución, más FPS, pantalla ancha y mods.</p>
    </section>
    <aside class="ports-aviso" role="note">
      <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
      <p><b>El juego lo pones tú.</b> Estos proyectos no incluyen el juego: casi todos te piden tu propia copia (ROM o ISO sacada de tu cartucho o disco). Aquí solo enlazamos a la página oficial de cada proyecto; descarga siempre desde ahí. Muchos están en <b>alfa</b>: los marcados como ⭐ recomendados o <b>estables</b> son los más seguros para empezar.</p>
    </aside>
    <div class="archivo-herramientas ports-herramientas">
      <label class="archivo-buscar"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
        <input type="search" id="portsBuscar" placeholder="Buscar un juego o un port" autocomplete="off"></label>
      <select id="portsSistema" class="console-input ports-select" aria-label="Consola original"><option value="todos">Todas las consolas</option></select>
      <select id="portsSO" class="console-input ports-select" aria-label="Dónde jugarlo">
        <option value="todos">Cualquier sistema</option><option value="windows">Windows</option><option value="linux">Linux</option><option value="macos">macOS</option><option value="android">Android</option>
      </select>
      <label class="ports-solidos"><input type="checkbox" id="portsSolidos"> Solo recomendados, estables o verificados</label>
    </div>
    <p class="ports-cuenta" id="portsCuenta" aria-live="polite"></p>
    <ul class="ports-lista" id="portsLista"><li class="juego-cargando">Cargando…</li></ul>
    <div class="ports-mas"><button type="button" class="boton boton-linea" id="portsMas" hidden>Cargar más</button></div>
    <p class="ports-fuente" id="portsFuente"></p>`;

  const solido = (p) => p.recomendado || p.verificado || p.estado === "stable";

  function proyecto(p) {
    const descarga = p.version?.url || p.url;
    const estado = ESTADOS[p.estado];
    const meta = [
      p.recomendado ? `<span class="ports-recomendado"><i class="fa-solid fa-star" aria-hidden="true"></i> Recomendado</span>` : "",
      p.verificado ? `<span class="ports-verificado"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Verificado</span>` : "",
      estado ? `<span class="ports-estado ${estado[1]}">${estado[0]}</span>` : "",
      TIPOS[p.tipo] ? `<span>${TIPOS[p.tipo]}</span>` : "",
      p.version ? `<span>${esc(p.version.nombre)}${p.version.fecha ? ` · ${fecha(p.version.fecha)}` : ""}</span>` : (p.actividad ? `<span>Actualizado ${fecha(p.actividad)}</span>` : ""),
      p.estrellas ? `<span title="Estrellas en GitHub"><i class="fa-regular fa-star" aria-hidden="true"></i> ${miles(p.estrellas)}</span>` : "",
      (p.plataformas || []).map(s => SO[s] ? `<i class="${SO[s][0]}" title="${SO[s][1]}" aria-label="${SO[s][1]}"></i>` : "").join(" "),
      p.archivado ? `<span class="ports-alerta">Archivado</span>` : ""
    ].filter(Boolean).join("");
    return `
      <li class="ports-proyecto${p.recomendado ? " destacado" : ""}">
        <div class="ports-proyecto-texto">
          <b>${esc(p.nombre)}</b>
          ${p.descripcion ? `<p>${esc(p.descripcion)}</p>` : ""}
          <span class="ports-meta">${meta}</span>
        </div>
        <a class="boton ${p.recomendado ? "boton-senal" : "boton-linea"}" href="${esc(seguro(descarga))}" target="_blank" rel="noopener noreferrer">
          ${p.version?.url ? `<i class="fa-solid fa-download" aria-hidden="true"></i> Descargar` : `<i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i> Ver proyecto`}
        </a>
      </li>`;
  }

  function proyectosVisibles(j) {
    return j.proyectos.filter(p => (filtro.so === "todos" || (p.plataformas || []).includes(filtro.so)) && (!filtro.solidos || solido(p)));
  }

  function tarjeta(j) {
    const ps = proyectosVisibles(j);
    const primeros = ps.slice(0, 3), resto = ps.slice(3);
    return `
      <li class="ports-juego" id="${esc(j.slug)}">
        <div class="ports-tapa" data-portada="${esc(j.juego)}"><span class="lista-sin-tapa"></span></div>
        <div class="ports-cuerpo">
          <p class="ports-plataforma">${esc(j.sistema)} · ${ps.length} ${ps.length === 1 ? "port" : "ports"}</p>
          <h2><a href="${esc(window.urlJuego ? window.urlJuego(j.juego) : "#")}">${esc(j.juego)}</a></h2>
          <ul class="ports-proyectos">${primeros.map(proyecto).join("")}</ul>
          ${resto.length ? `<details class="ports-otros"><summary>Ver ${resto.length} ${resto.length === 1 ? "port más" : "ports más"}</summary><ul class="ports-proyectos">${resto.map(proyecto).join("")}</ul></details>` : ""}
        </div>
      </li>`;
  }

  function filtrar() {
    const q = filtro.q.toLowerCase();
    vista = datos.juegos.filter(j =>
      (filtro.sistema === "todos" || j.sistema === filtro.sistema)
      && proyectosVisibles(j).length
      && (!q || j.juego.toLowerCase().includes(q) || j.proyectos.some(p => p.nombre.toLowerCase().includes(q))));
    mostrados = 0;
    document.getElementById("portsLista").innerHTML = vista.length ? "" : `<li class="juego-nada">No hay ports con esos filtros.</li>`;
    const nPorts = vista.reduce((n, j) => n + proyectosVisibles(j).length, 0);
    document.getElementById("portsCuenta").textContent = `${vista.length.toLocaleString("es")} juegos · ${nPorts.toLocaleString("es")} ports`;
    mas();
  }

  function mas() {
    const lote = vista.slice(mostrados, mostrados + POR_PAGINA);
    document.getElementById("portsLista").insertAdjacentHTML("beforeend", lote.map(tarjeta).join(""));
    mostrados += lote.length;
    document.getElementById("portsMas").hidden = mostrados >= vista.length;
    cargarPortadas();
  }

  // Portadas de RAWG a medida que aparecen en pantalla
  const observador = "IntersectionObserver" in window ? new IntersectionObserver((entradas) => {
    entradas.forEach(e => { if (e.isIntersecting) { observador.unobserve(e.target); ponerPortada(e.target); } });
  }, { rootMargin: "300px" }) : null;
  async function ponerPortada(caja) {
    try {
      const r = await fetch(`/api/rawg?detalle=1&search=${encodeURIComponent(caja.dataset.portada)}`).then(x => x.json());
      if (r.encontrado && /^https:\/\//.test(r.portada || "")) caja.innerHTML = `<img src="${esc(r.portada)}" alt="" loading="lazy">`;
    } catch (e) { /* sin portada */ }
  }
  function cargarPortadas() {
    document.querySelectorAll(".ports-tapa[data-portada]:not([data-pedida])").forEach(c => {
      c.dataset.pedida = "1";
      if (observador) observador.observe(c); else ponerPortada(c);
    });
  }

  async function cargar() {
    try {
      datos = await fetch("/data/ports.json").then(r => r.json());
    } catch (e) {
      document.getElementById("portsLista").innerHTML = `<li class="juego-nada">No se pudo cargar la lista. Prueba en un rato.</li>`;
      return;
    }
    const cuenta = {};
    datos.juegos.forEach(j => { cuenta[j.sistema] = (cuenta[j.sistema] || 0) + 1; });
    document.getElementById("portsSistema").insertAdjacentHTML("beforeend", Object.entries(cuenta)
      .sort((a, b) => (a[0] === "Otros") - (b[0] === "Otros") || b[1] - a[1])
      .map(([s, n]) => `<option value="${esc(s)}">${esc(s)} (${n})</option>`).join(""));
    const f = datos.fuentes || [];
    document.getElementById("portsFuente").innerHTML = datos.actualizado
      ? `Datos de ${f.map(x => `<a href="${esc(seguro(x.url))}" target="_blank" rel="noopener">${esc(x.nombre)}</a>${x.licenciaUrl ? ` (<a href="${esc(seguro(x.licenciaUrl))}" target="_blank" rel="noopener">${esc(x.licencia)}</a>)` : ` (${esc(x.licencia)})`}`).join(" y ")}, agrupados por juego y completados con las versiones y estrellas de GitHub. Actualizado el ${fecha(datos.actualizado)}; se revisa cada semana.`
      : "La lista se está generando.";
    const desde = new URLSearchParams(location.search).get("q");
    if (desde) { filtro.q = desde; document.getElementById("portsBuscar").value = desde; }
    if (location.hash) { filtro.q = ""; }
    filtrar();
    if (location.hash) {
      const id = decodeURIComponent(location.hash.slice(1));
      const i = vista.findIndex(j => j.slug === id);
      if (i >= mostrados) { while (mostrados <= i) mas(); }
      document.getElementById(id)?.scrollIntoView({ block: "start" });
    }
  }

  let espera;
  raiz.addEventListener("input", (e) => {
    if (e.target.id === "portsBuscar") { clearTimeout(espera); espera = setTimeout(() => { filtro.q = e.target.value.trim(); filtrar(); }, 200); }
  });
  raiz.addEventListener("change", (e) => {
    if (e.target.id === "portsSistema") { filtro.sistema = e.target.value; filtrar(); }
    if (e.target.id === "portsSO") { filtro.so = e.target.value; filtrar(); }
    if (e.target.id === "portsSolidos") { filtro.solidos = e.target.checked; filtrar(); }
  });
  document.getElementById("portsMas").addEventListener("click", mas);

  cargar();
})();
