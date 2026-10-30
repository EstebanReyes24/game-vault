/**
 * Comparar estantes: /u/<a>/vs/<b>
 * Compatibilidad, juegos en común, dónde chocan las notas y qué le recomienda cada uno al otro.
 * Solo con estantes públicos.
 */
(function () {
  const raiz = document.getElementById("comparar");
  const m = location.pathname.match(/^\/u\/([A-Za-z0-9_]{3,20})\/vs\/([A-Za-z0-9_]{3,20})\/?$/);
  const q = new URLSearchParams(location.search);
  const a = (m ? m[1] : q.get("a") || "").toLowerCase();
  const b = (m ? m[2] : q.get("b") || "").toLowerCase();
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clave = (t) => window.slugJuego(t).replace(/-/g, "");
  const nota = (n) => Number(n).toFixed(1);
  const tieneNota = (g) => Number(g.rating) > 0;
  const tapa = (g) => /^https:\/\//.test(g.coverUrl || "") ? `<img src="${esc(g.coverUrl)}" alt="" loading="lazy">` : `<span class="lista-sin-tapa"></span>`;

  function formulario(msg) {
    raiz.innerHTML = `
      <section class="comparar-form">
        <h1 class="seccion-titulo">Comparar estantes</h1>
        <p>${esc(msg || "Escribe dos usuarios con estante público y mira qué tan compatibles son.")}</p>
        <form id="cmpForm" class="flex flex-wrap gap-2 items-center">
          <input id="cmpA" class="console-input lista-buscar" placeholder="tu usuario" value="${esc(a)}" maxlength="20" required>
          <span class="comparar-vs">vs</span>
          <input id="cmpB" class="console-input lista-buscar" placeholder="otro usuario" value="${esc(b)}" maxlength="20" required>
          <button class="boton boton-senal">Comparar</button>
        </form>
      </section>`;
    document.getElementById("cmpForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const x = document.getElementById("cmpA").value.trim().toLowerCase().replace(/^@/, "");
      const y = document.getElementById("cmpB").value.trim().toLowerCase().replace(/^@/, "");
      if (x && y) location.href = `/u/${encodeURIComponent(x)}/vs/${encodeURIComponent(y)}`;
    });
  }

  function calcular(A, B) {
    const mapaA = new Map(A.map(g => [clave(g.title), g]));
    const mapaB = new Map(B.map(g => [clave(g.title), g]));
    const comunes = [...mapaA.keys()].filter(k => mapaB.has(k)).map(k => ({ a: mapaA.get(k), b: mapaB.get(k) }));
    const conNota = comunes.filter(p => tieneNota(p.a) && tieneNota(p.b));
    const dif = conNota.length ? conNota.reduce((t, p) => t + Math.abs(p.a.rating - p.b.rating), 0) / conNota.length : null;
    const acuerdo = dif === null ? 0.5 : Math.max(0, 1 - dif / 6);
    const solape = Math.min(1, comunes.length / Math.max(1, Math.min(A.length, B.length)));
    // Compartir juegos pesa la mitad y coincidir en las notas la otra mitad; con pocas notas en común, el acuerdo cuenta menos
    const peso = Math.min(1, conNota.length / 5);
    const compat = Math.round(100 * (0.5 * Math.sqrt(solape) + 0.5 * (acuerdo * peso + 0.5 * (1 - peso))));
    const choques = conNota.filter(p => Math.abs(p.a.rating - p.b.rating) >= 2).sort((x, y) => Math.abs(y.a.rating - y.b.rating) - Math.abs(x.a.rating - x.b.rating)).slice(0, 6);
    const recomendar = (de, para) => de.filter(g => Number(g.rating) >= 8 && !para.has(clave(g.title))).sort((x, y) => y.rating - x.rating || (y.hours || 0) - (x.hours || 0)).slice(0, 8);
    return {
      compat: comunes.length ? compat : Math.min(compat, 10), comunes, conNota, dif, choques,
      paraB: recomendar(A, mapaB), paraA: recomendar(B, mapaA)
    };
  }

  function frase(c) {
    if (c >= 85) return "Almas gemelas del mando.";
    if (c >= 70) return "Muy buen equipo para un cooperativo.";
    if (c >= 50) return "Se entienden, con sus discusiones.";
    if (c >= 30) return "Gustos distintos, pero hay puntos en común.";
    return "Mundos aparte: buen material para recomendarse cosas.";
  }

  function pintar(A, B, r) {
    document.title = `@${a} vs @${b} · ${r.compat}% · Paindex Vault`;
    const comunesOrden = [...r.comunes].sort((x, y) => ((y.a.rating || 0) + (y.b.rating || 0)) - ((x.a.rating || 0) + (x.b.rating || 0)));
    const fila = (p) => `
      <li><a href="${esc(window.urlJuego(p.a.title))}">${tapa(p.a.coverUrl ? p.a : p.b)}<span><b>${esc(p.a.title)}</b>
        <small>@${esc(a)} ${tieneNota(p.a) ? nota(p.a.rating) : "—"} · @${esc(b)} ${tieneNota(p.b) ? nota(p.b.rating) : "—"}</small></span></a></li>`;
    const recos = (lista, quien) => lista.length ? `<ul class="comparar-tapas">${lista.map(g => `
      <li><a href="${esc(window.urlJuego(g.title))}">${tapa(g)}<b>${esc(g.title)}</b><small>${nota(g.rating)} de @${esc(quien)}</small></a></li>`).join("")}</ul>`
      : `<p class="juego-nada">Nada que recomendar: ya tiene todo lo que @${esc(quien)} puntuó alto.</p>`;

    raiz.innerHTML = `
      <section class="comparar-cabecera">
        <a href="/u/${esc(a)}" class="comparar-quien">@${esc(a)}<small>${A.length} juegos</small></a>
        <div class="comparar-medidor" style="--p:${r.compat}">
          <b>${r.compat}%</b><span>compatibles</span>
        </div>
        <a href="/u/${esc(b)}" class="comparar-quien derecha">@${esc(b)}<small>${B.length} juegos</small></a>
      </section>
      <p class="comparar-frase">${esc(frase(r.compat))}</p>
      <section class="cifras" aria-label="Resumen">
        <div><b>${r.comunes.length}</b><span>juegos en común</span></div>
        <div><b>${r.conNota.length}</b><span>con nota de los dos</span></div>
        <div><b>${r.dif === null ? "—" : nota(r.dif)}</b><span>puntos de diferencia media</span></div>
        <div><b>${r.comunes.filter(p => p.a.status === "platinum" && p.b.status === "platinum").length}</b><span>platinos compartidos</span></div>
      </section>
      <div class="comparar-acciones">
        <button type="button" class="boton boton-senal" id="cmpCompartir"><i class="fa-solid fa-link" aria-hidden="true"></i> Copiar enlace</button>
        <a class="boton boton-linea" href="/u/${esc(b)}/vs/${esc(a)}"><i class="fa-solid fa-right-left" aria-hidden="true"></i> Invertir</a>
        <a class="boton boton-linea" href="/comparar">Comparar a otros</a>
      </div>
      <div class="juego-columnas">
        <section class="juego-bloque">
          <h2 class="seccion-titulo">Los dos lo jugaron</h2>
          ${comunesOrden.length ? `<ul class="comparar-lista">${comunesOrden.slice(0, 15).map(fila).join("")}</ul>` : `<p class="juego-nada">No tienen juegos en común todavía.</p>`}
        </section>
        <aside class="juego-bloque">
          <h2 class="seccion-titulo">Donde chocan</h2>
          ${r.choques.length ? `<ul class="comparar-lista">${r.choques.map(fila).join("")}</ul>` : `<p class="juego-nada">No hay grandes desacuerdos (2 puntos o más).</p>`}
        </aside>
      </div>
      <section class="juego-bloque">
        <h2 class="seccion-titulo">@${esc(a)} le recomienda a @${esc(b)}</h2>
        ${recos(r.paraB, a)}
      </section>
      <section class="juego-bloque">
        <h2 class="seccion-titulo">@${esc(b)} le recomienda a @${esc(a)}</h2>
        ${recos(r.paraA, b)}
      </section>`;
    document.getElementById("cmpCompartir").addEventListener("click", async (e) => {
      const url = `${location.origin}/u/${a}/vs/${b}`;
      try { await navigator.clipboard.writeText(url); e.currentTarget.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i> Copiado'; }
      catch (err) { prompt("Copia el enlace:", url); }
    });
  }

  async function cargar() {
    if (!a || !b) { formulario(); return; }
    if (a === b) { formulario("Elige dos usuarios distintos."); return; }
    const [A, B] = await Promise.all([DB.getGamesByUsername(a), DB.getGamesByUsername(b)]);
    if (!A?.length || !B?.length) { formulario(`No encontramos ${!A?.length ? "@" + a : "@" + b}, o su estante es privado o está vacío.`); return; }
    pintar(A, B, calcular(A, B));
  }

  cargar();
})();
