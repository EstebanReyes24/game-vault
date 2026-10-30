/**
 * Página de un juego: /j/<juego>
 * Lo que la comunidad sabe de él (solo estantes públicos): nota media, quién lo tiene, platinos,
 * reseñas, noticias relacionadas y el video de Paindex si lo hay (lo pone el admin aquí mismo).
 */
(function () {
  const raiz = document.getElementById("juego");
  const slug = (location.pathname.match(/^\/j\/([a-z0-9-]{1,120})\/?$/) || [])[1] || new URLSearchParams(location.search).get("j") || "";
  const clave = slug.replace(/-/g, "");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ESTADO = { playing: "Jugando", completed: "Historia", extras: "Historia + extras", platinum: "Platino", onhold: "En pausa", backlog: "Pendiente" };
  const fecha = (f) => new Date(f).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
  const nota = (n) => (n === null || n === undefined ? "—" : Number(n).toFixed(1));

  function sinJuego(msg) {
    raiz.innerHTML = `<section class="juego-vacio"><h1 class="seccion-titulo">${esc(msg)}</h1><p><a href="/" class="ver-todo">Volver a la portada</a></p></section>`;
  }

  async function cargar() {
    if (!clave || !window.supabaseClient) { sinJuego("Ese juego no existe."); return; }
    const { data, error } = await supabaseClient.rpc("juego_comunidad", { p_clave: clave });
    if (error) { sinJuego("No se pudo cargar el juego. Prueba en un rato."); return; }
    let d = data || {};
    // Nadie lo tiene en un estante público: los datos básicos salen de RAWG
    if (!d.titulo) {
      try {
        const r = await fetch(`/api/rawg?detalle=1&search=${encodeURIComponent(slug.replace(/-/g, " "))}`).then(x => x.json());
        if (r.encontrado && window.slugJuego(r.nombre).replace(/-/g, "") === clave) {
          d = { ...d, titulo: r.nombre, portada: r.portada, anio: r.anio, desarrollador: r.desarrollador, etiquetas: r.etiquetas };
        }
      } catch (e) { /* sin datos extra */ }
    }
    if (!d.titulo) { sinJuego("Todavía nadie tiene este juego en su estante."); return; }
    const esAdmin = await DB.isAdmin().catch(() => false);
    pintar(d, esAdmin);
  }

  function pintar(d, esAdmin) {
    document.title = `${d.titulo} · Paindex Vault`;
    const portada = /^https:\/\//.test(d.portada || "") ? d.portada : "";
    const cifras = [
      [d.jugadores || 0, d.jugadores === 1 ? "lo tiene" : "lo tienen"],
      [nota(d.nota_media), d.notas ? `nota media (${d.notas})` : "sin notas aún"],
      [d.terminados || 0, "lo terminaron"],
      [d.platinos || 0, d.platinos === 1 ? "platino" : "platinos"],
      [d.horas_media ? `${d.horas_media} h` : "—", "horas de media"]
    ];
    const video = d.video?.youtube_id ? `
      <section class="juego-bloque" aria-labelledby="jVideo">
        <h2 id="jVideo" class="seccion-titulo">El video de Paindex</h2>
        <div class="juego-video"><iframe src="https://www.youtube-nocookie.com/embed/${esc(d.video.youtube_id)}" title="${esc(d.video.titulo || d.titulo)}" loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>
      </section>` : "";
    const resenas = (d.resenas || []).map(r => `
      <article class="juego-resena">
        <header><a href="/u/${esc(r.username)}?resena=${r.id}"><b>@${esc(r.username)}</b></a>${r.featured ? `<span class="juego-chip">Destacada</span>` : ""}${r.rating ? `<span class="juego-nota">${nota(r.rating)}</span>` : ""}</header>
        ${r.spoilers ? `<details><summary>Contiene spoilers: tocar para leer</summary><p>${esc(r.body)}</p></details>` : `<p>${esc(r.body)}</p>`}
        <small>${fecha(r.created_at)} · <a href="/u/${esc(r.username)}?resena=${r.id}">Leer completa</a></small>
      </article>`).join("");
    const estantes = (d.estantes || []).map(e => `
      <li><a href="/u/${esc(e.username)}"><b>@${esc(e.username)}</b><small>${esc(ESTADO[e.status] || "")}${e.hours ? ` · ${e.hours} h` : ""}</small>${e.rating ? `<span class="juego-nota">${nota(e.rating)}</span>` : ""}</a></li>`).join("");
    const noticias = (d.noticias || []).map(n => `
      <li><a href="/a/${n.id}">${/^https:\/\//.test(n.cover_url || "") ? `<img src="${esc(n.cover_url)}" alt="" loading="lazy">` : ""}<span><small>${esc(n.category)} · ${fecha(n.created_at)}</small><strong>${esc(n.title)}</strong></span></a></li>`).join("");

    raiz.innerHTML = `
      <section class="juego-cabecera">
        ${portada ? `<div class="juego-fondo" style="background-image:url('${esc(portada)}')" aria-hidden="true"></div>` : ""}
        <div class="juego-portada">${portada ? `<img src="${esc(portada)}" alt="Portada de ${esc(d.titulo)}">` : `<span class="lista-sin-tapa"></span>`}</div>
        <div class="juego-titulo">
          <p class="juego-meta">${[d.anio, d.desarrollador].filter(Boolean).map(esc).join(" · ")}</p>
          <h1>${esc(d.titulo)}</h1>
          ${(d.etiquetas || []).length ? `<p class="juego-meta">${d.etiquetas.map(t => `#${esc(t)}`).join(" ")}</p>` : ""}
          <div class="juego-acciones">
            <a class="boton boton-senal" href="app.html?anadir=${encodeURIComponent(d.titulo)}"><i class="fa-solid fa-plus" aria-hidden="true"></i> Añadir a mi estante</a>
            <button type="button" class="boton boton-linea" id="jCompartir"><i class="fa-solid fa-link" aria-hidden="true"></i> Copiar enlace</button>
          </div>
        </div>
      </section>

      <section class="cifras juego-cifras" aria-label="La comunidad y este juego">
        ${cifras.map(([n, t]) => `<div><b>${esc(n)}</b><span>${esc(t)}</span></div>`).join("")}
      </section>

      ${video}

      <div class="juego-columnas">
        <section class="juego-bloque" aria-labelledby="jResenas">
          <h2 id="jResenas" class="seccion-titulo">Reseñas</h2>
          ${resenas || `<p class="juego-nada">Aún no hay reseñas. Si lo jugaste, escribe la primera desde tu estante.</p>`}
        </section>
        <aside class="juego-bloque" aria-labelledby="jEstantes">
          <h2 id="jEstantes" class="seccion-titulo">En los estantes</h2>
          ${estantes ? `<ul class="juego-estantes">${estantes}</ul>` : `<p class="juego-nada">Nadie lo tiene en un estante público todavía.</p>`}
          ${noticias ? `<h2 class="seccion-titulo juego-sub">Noticias</h2><ul class="juego-noticias">${noticias}</ul>` : ""}
        </aside>
      </div>

      ${esAdmin ? `
      <section class="juego-bloque juego-admin" aria-labelledby="jAdmin">
        <h2 id="jAdmin" class="seccion-titulo">Tu video de este juego</h2>
        <p class="juego-nada">Solo lo ves tú. Pega el enlace de YouTube y aparecerá arriba para todos.</p>
        <div class="flex flex-wrap gap-2">
          <input type="url" id="jVideoUrl" class="console-input lista-buscar" placeholder="https://youtu.be/…" value="${d.video?.youtube_id ? `https://youtu.be/${esc(d.video.youtube_id)}` : ""}">
          <button type="button" class="boton boton-senal" id="jVideoGuardar">Guardar</button>
          ${d.video ? `<button type="button" class="boton boton-linea" id="jVideoQuitar">Quitar</button>` : ""}
        </div>
        <p class="borrador-estado" id="jVideoEstado" role="status"></p>
      </section>` : ""}
    `;

    document.getElementById("jCompartir").addEventListener("click", async (e) => {
      const url = `${location.origin}/j/${slug}`;
      try { await navigator.clipboard.writeText(url); e.currentTarget.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i> Copiado'; }
      catch (err) { prompt("Copia el enlace:", url); }
    });

    if (esAdmin) {
      const estado = document.getElementById("jVideoEstado");
      document.getElementById("jVideoGuardar").addEventListener("click", async () => {
        const v = document.getElementById("jVideoUrl").value.trim();
        const id = (v.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/) || [])[1] || (/^[A-Za-z0-9_-]{11}$/.test(v) ? v : null);
        if (!id) { estado.textContent = "Ese enlace no parece de un video de YouTube."; return; }
        const { error } = await supabaseClient.from("game_videos").upsert([{ clave, youtube_id: id, titulo: d.titulo, updated_at: new Date().toISOString() }]);
        estado.textContent = error ? `No se guardó: ${error.message}` : "Guardado.";
        if (!error) cargar();
      });
      document.getElementById("jVideoQuitar")?.addEventListener("click", async () => {
        const { error } = await supabaseClient.from("game_videos").delete().eq("clave", clave);
        estado.textContent = error ? `No se quitó: ${error.message}` : "Quitado.";
        if (!error) cargar();
      });
    }
  }

  cargar();
})();
