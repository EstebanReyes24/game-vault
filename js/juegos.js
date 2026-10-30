/**
 * Índice de juegos (/juegos): lo que hay en los estantes públicos, ordenado por
 * más registrados, mejor puntuados o más platinados. Cada uno lleva a su página /j/<juego>.
 */
(function () {
  const raiz = document.getElementById("juegos");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ORDENES = [["jugadores", "Más registrados"], ["nota", "Mejor puntuados"], ["platinos", "Más platinados"]];
  let orden = new URLSearchParams(location.search).get("orden");
  if (!ORDENES.some(([o]) => o === orden)) orden = "jugadores";
  let lista = [];

  raiz.innerHTML = `
    <section class="archivo-cabecera">
      <h1 class="seccion-titulo">Juegos</h1>
      <p>Lo que hay en los estantes públicos de la comunidad. Entra a cualquiera para ver su nota media, reseñas y quién lo platinó.</p>
    </section>
    <div class="archivo-herramientas">
      <label class="archivo-buscar"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
        <input type="search" id="juegosBuscar" placeholder="Buscar un juego" autocomplete="off"></label>
      <div class="archivo-filtros" id="juegosOrden" role="tablist">
        ${ORDENES.map(([o, t]) => `<button type="button" data-orden="${o}" class="filter-pill px-3 py-1 rounded-xl text-xs font-bold border border-white/10 text-slate-300 cursor-pointer">${t}</button>`).join("")}
      </div>
    </div>
    <ol class="juegos-rejilla" id="juegosLista"><li class="juego-cargando">Cargando…</li></ol>`;

  function pintar() {
    raiz.querySelectorAll("[data-orden]").forEach(b => b.classList.toggle("active", b.dataset.orden === orden));
    const q = (document.getElementById("juegosBuscar").value || "").toLowerCase().trim();
    const vista = lista.filter(j => !q || String(j.titulo).toLowerCase().includes(q));
    const cont = document.getElementById("juegosLista");
    if (!vista.length) { cont.innerHTML = `<li class="archivo-vacio">${lista.length ? "Ningún juego coincide." : "Todavía no hay juegos en estantes públicos."}</li>`; return; }
    cont.innerHTML = vista.map((j, i) => {
      const dato = orden === "nota" ? `${Number(j.nota_media).toFixed(1)} · ${j.notas} notas`
        : orden === "platinos" ? `${j.platinos} ${j.platinos === 1 ? "platino" : "platinos"}`
        : `${j.jugadores} ${j.jugadores === 1 ? "estante" : "estantes"}`;
      return `
      <li><a href="${esc(window.urlJuego(j.titulo))}">
        <span class="juegos-tapa">${/^https:\/\//.test(j.portada || "") ? `<img src="${esc(j.portada)}" alt="" loading="lazy">` : `<span class="lista-sin-tapa"></span>`}
          <b class="juegos-puesto">${i + 1}</b>
          ${j.nota_media ? `<span class="juegos-nota">${Number(j.nota_media).toFixed(1)}</span>` : ""}</span>
        <strong>${esc(j.titulo)}</strong><small>${esc(dato)}</small>
      </a></li>`;
    }).join("");
  }

  async function cargar() {
    raiz.querySelectorAll("[data-orden]").forEach(b => b.classList.toggle("active", b.dataset.orden === orden));
    const { data, error } = await supabaseClient.rpc("juegos_ranking", { p_orden: orden, p_limite: 120 });
    lista = error ? [] : (data || []);
    if (error) document.getElementById("juegosLista").innerHTML = `<li class="archivo-vacio">No se pudo cargar la lista. Prueba en un rato.</li>`;
    else pintar();
  }

  document.getElementById("juegosOrden").addEventListener("click", (e) => {
    const b = e.target.closest("[data-orden]");
    if (!b || b.dataset.orden === orden) return;
    orden = b.dataset.orden;
    history.replaceState(null, "", orden === "jugadores" ? "/juegos" : `/juegos?orden=${orden}`);
    cargar();
  });
  let espera;
  document.getElementById("juegosBuscar").addEventListener("input", () => { clearTimeout(espera); espera = setTimeout(pintar, 150); });
  cargar();
})();
