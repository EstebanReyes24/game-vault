/**
 * Ports nativos (/ports): juegos de consola que se pueden jugar nativos en PC gracias a
 * descompilaciones y recompilaciones hechas por fans. Los datos (data/ports.json) se
 * regeneran cada semana desde la lista awesome-unofficial-pc-ports con la última versión de GitHub.
 * Solo se enlaza a la página oficial de cada proyecto: el juego (ROM/ISO) lo pone cada uno.
 */
(function () {
  const raiz = document.getElementById("ports");
  if (!raiz) return;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const seguro = (u) => (/^https:\/\//.test(String(u || "")) ? String(u) : "#");
  const fecha = (f) => (f ? new Date(f + "T12:00:00Z").toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) : "");
  const miles = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)} k` : String(n));
  const SISTEMAS = { windows: ["fa-brands fa-windows", "Windows"], linux: ["fa-brands fa-linux", "Linux"], mac: ["fa-brands fa-apple", "macOS"], android: ["fa-brands fa-android", "Android"], switch: ["fa-solid fa-gamepad", "Switch"] };
  let datos = { juegos: [] };
  let plataforma = "todas";
  let sistema = "todos";

  raiz.innerHTML = `
    <section class="archivo-cabecera">
      <h1 class="seccion-titulo">Ports nativos</h1>
      <p>Juegos de consola que puedes jugar <b>nativos en PC</b>, sin emulador, gracias a descompilaciones y recompilaciones hechas por fans: más resolución, más FPS, pantalla ancha y mods.</p>
    </section>
    <aside class="ports-aviso" role="note">
      <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
      <p><b>El juego lo pones tú.</b> Estos proyectos no incluyen el juego: casi todos te piden tu propia copia (ROM o ISO sacada de tu cartucho o disco). Aquí solo enlazamos a la página oficial de cada proyecto; descarga siempre desde ahí y desconfía de copias en otras webs.</p>
    </aside>
    <div class="archivo-herramientas">
      <label class="archivo-buscar"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
        <input type="search" id="portsBuscar" placeholder="Buscar un juego o un port" autocomplete="off"></label>
      <div class="archivo-filtros" id="portsPlataformas" role="tablist" aria-label="Consola original"></div>
      <div class="archivo-filtros" id="portsSistemas" role="tablist" aria-label="Sistema"></div>
    </div>
    <p class="ports-cuenta" id="portsCuenta"></p>
    <ul class="ports-lista" id="portsLista"><li class="juego-cargando">Cargando…</li></ul>
    <p class="ports-fuente" id="portsFuente"></p>`;

  const pastilla = (valor, texto, grupo, activo) =>
    `<button type="button" data-${grupo}="${esc(valor)}" class="filter-pill px-3 py-1 rounded-xl text-xs font-bold border border-white/10 text-slate-300 cursor-pointer${activo ? " active" : ""}">${texto}</button>`;

  function proyecto(p) {
    const descarga = p.version?.url || p.url;
    const meta = [
      p.destacado ? `<span class="ports-recomendado"><i class="fa-solid fa-star" aria-hidden="true"></i> Recomendado</span>` : "",
      p.version ? `<span>${esc(p.version.nombre)} · ${fecha(p.version.fecha)}</span>` : (p.actividad ? `<span>Actualizado ${fecha(p.actividad)}</span>` : ""),
      p.estrellas ? `<span title="Estrellas en GitHub"><i class="fa-regular fa-star" aria-hidden="true"></i> ${miles(p.estrellas)}</span>` : "",
      (p.sistemas || []).map(s => SISTEMAS[s] ? `<i class="${SISTEMAS[s][0]}" title="${SISTEMAS[s][1]}" aria-label="${SISTEMAS[s][1]}"></i>` : "").join(" "),
      p.archivado ? `<span class="ports-alerta">Archivado</span>` : "",
      p.roto ? `<span class="ports-alerta">Enlace caído</span>` : ""
    ].filter(Boolean).join("");
    return `
      <li class="ports-proyecto${p.destacado ? " destacado" : ""}">
        <div class="ports-proyecto-texto">
          <b>${esc(p.nombre)}</b>
          ${p.descripcion ? `<p lang="en">${esc(p.descripcion)}</p>` : ""}
          <span class="ports-meta">${meta}</span>
        </div>
        <a class="boton ${p.destacado ? "boton-senal" : "boton-linea"}" href="${esc(seguro(descarga))}" target="_blank" rel="noopener noreferrer">
          ${p.version ? `<i class="fa-solid fa-download" aria-hidden="true"></i> Descargar` : `<i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i> Ver proyecto`}
        </a>
      </li>`;
  }

  function tarjeta(j) {
    return `
      <li class="ports-juego" id="${esc(j.slug)}">
        <div class="ports-tapa" data-portada="${esc(j.juego)}"><span class="lista-sin-tapa"></span></div>
        <div class="ports-cuerpo">
          <p class="ports-plataforma">${esc(j.plataforma)}</p>
          <h2><a href="${esc(window.urlJuego ? window.urlJuego(j.juego) : "#")}">${esc(j.juego)}</a></h2>
          <ul class="ports-proyectos">${j.proyectos.map(proyecto).join("")}</ul>
        </div>
      </li>`;
  }

  function pintar() {
    const q = (document.getElementById("portsBuscar").value || "").toLowerCase().trim();
    const vista = datos.juegos.filter(j =>
      (plataforma === "todas" || j.plataforma === plataforma)
      && (sistema === "todos" || j.proyectos.some(p => (p.sistemas || []).includes(sistema)))
      && (!q || j.juego.toLowerCase().includes(q) || j.proyectos.some(p => p.nombre.toLowerCase().includes(q))));
    document.getElementById("portsCuenta").textContent = `${vista.length} ${vista.length === 1 ? "juego" : "juegos"}`;
    document.getElementById("portsLista").innerHTML = vista.length
      ? vista.map(tarjeta).join("")
      : `<li class="juego-nada">No hay ports con esos filtros.</li>`;
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
    document.querySelectorAll(".ports-tapa[data-portada]").forEach(c => { if (observador) observador.observe(c); else ponerPortada(c); });
  }

  async function cargar() {
    try {
      datos = await fetch("/data/ports.json").then(r => r.json());
    } catch (e) {
      document.getElementById("portsLista").innerHTML = `<li class="juego-nada">No se pudo cargar la lista. Prueba en un rato.</li>`;
      return;
    }
    const plataformas = [...new Set(datos.juegos.map(j => j.plataforma))];
    document.getElementById("portsPlataformas").innerHTML = pastilla("todas", "Todas", "plataforma", true) + plataformas.map(p => pastilla(p, esc(p), "plataforma", false)).join("");
    const sistemas = Object.keys(SISTEMAS).filter(s => datos.juegos.some(j => j.proyectos.some(p => (p.sistemas || []).includes(s))));
    document.getElementById("portsSistemas").innerHTML = sistemas.length ? pastilla("todos", "Cualquier sistema", "sistema", true) + sistemas.map(s => pastilla(s, `<i class="${SISTEMAS[s][0]}" aria-hidden="true"></i> ${SISTEMAS[s][1]}`, "sistema", false)).join("") : "";
    document.getElementById("portsFuente").innerHTML = datos.actualizado
      ? `Lista basada en <a href="${esc(seguro(datos.fuente?.url))}" target="_blank" rel="noopener">${esc(datos.fuente?.nombre)}</a> de ${esc(datos.fuente?.autor)} (licencia ${esc(datos.fuente?.licencia)}), con las versiones de GitHub. Actualizada el ${fecha(datos.actualizado)}; se revisa cada semana. Las descripciones son las de cada proyecto, en inglés.`
      : "La lista se está generando por primera vez.";
    pintar();
    if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView({ block: "start" });
  }

  raiz.addEventListener("click", (e) => {
    const p = e.target.closest("[data-plataforma]");
    const s = e.target.closest("[data-sistema]");
    if (p) { plataforma = p.dataset.plataforma; raiz.querySelectorAll("[data-plataforma]").forEach(b => b.classList.toggle("active", b === p)); pintar(); }
    if (s) { sistema = s.dataset.sistema; raiz.querySelectorAll("[data-sistema]").forEach(b => b.classList.toggle("active", b === s)); pintar(); }
  });
  let espera;
  raiz.addEventListener("input", (e) => { if (e.target.id === "portsBuscar") { clearTimeout(espera); espera = setTimeout(pintar, 150); } });

  cargar();
})();
