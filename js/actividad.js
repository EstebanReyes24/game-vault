/**
 * "Qué está jugando la gente": actividad reciente de los estantes públicos.
 * Con sesión iniciada se puede filtrar a quienes sigues.
 */
(function () {
  const lista = document.getElementById("actividadLista");
  const pestanas = document.getElementById("actividadPestanas");
  if (!lista || typeof DB === "undefined") return;

  const esc = (s) => (typeof escapeHTML === "function" ? escapeHTML(String(s ?? "")) : String(s ?? ""));
  const VERBOS = { jugando: "empezó", terminado: "terminó", platino: "platinó", nota: "calificó", resena: "reseñó" };

  function hace(fecha) {
    const seg = Math.max(1, Math.round((Date.now() - new Date(fecha).getTime()) / 1000));
    const unidades = [[31536000, "año", "años"], [2592000, "mes", "meses"], [86400, "día", "días"], [3600, "hora", "horas"], [60, "minuto", "minutos"]];
    for (const [s, uno, varios] of unidades) {
      const n = Math.floor(seg / s);
      if (n >= 1) return `hace ${n} ${n === 1 ? uno : varios}`;
    }
    return "hace un momento";
  }

  function item(a) {
    const portada = /^https:\/\//.test(a.cover_url || "")
      ? `<img src="${esc(a.cover_url)}" alt="" loading="lazy">`
      : `<span class="actividad-sin-portada" aria-hidden="true">${esc(String(a.game_title || "?").charAt(0))}</span>`;
    const nota = a.rating ? `<b class="actividad-nota">${Number(a.rating).toFixed(1)}</b>` : "";
    const destino = a.kind === "resena" ? `/u/${esc(a.username)}#perfilResenas` : `/u/${esc(a.username)}`;
    const juego = window.urlJuego ? window.urlJuego(a.game_title) : destino;
    return `
      <li class="actividad-item${a.kind === "platino" ? " es-platino" : ""}">
        <div class="actividad-enlace">
          <a href="${esc(juego)}" class="actividad-tapa" aria-label="${esc(a.game_title)}">${portada}</a>
          <span class="actividad-texto">
            <span><a href="${destino}" class="actividad-quien">@${esc(a.username)}</a> ${VERBOS[a.kind] || "jugó"} <a href="${esc(juego)}" class="actividad-juego">${esc(a.game_title)}</a></span>
            <time datetime="${esc(a.created_at)}">${hace(a.created_at)}</time>
          </span>
          ${nota}
        </div>
      </li>`;
  }

  async function cargar(soloSeguidos) {
    lista.setAttribute("aria-busy", "true");
    const datos = await DB.getActividad(soloSeguidos, 12);
    lista.removeAttribute("aria-busy");
    lista.innerHTML = datos.length
      ? datos.map(item).join("")
      : `<li class="actividad-vacia">${soloSeguidos
          ? "Todavía no sigues a nadie con actividad. Entra al perfil de otro jugador y pulsa Seguir."
          : "Aún no hay actividad. Cuando alguien termine o califique un juego en su estante público aparecerá aquí."}</li>`;
  }

  if (pestanas) pestanas.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-seguidos]");
    if (!b) return;
    pestanas.querySelectorAll("button").forEach(x => x.setAttribute("aria-selected", String(x === b)));
    cargar(b.dataset.seguidos === "1");
  });

  // Reseñas destacadas por Paindex (migración 008)
  async function destacadas() {
    const caja = document.getElementById("resenasDestacadas");
    const cont = document.getElementById("resenasDestacadasLista");
    if (!caja || !cont || !DB.getResenasDestacadas) return;
    const datos = await DB.getResenasDestacadas(3);
    if (!datos.length) return;
    cont.innerHTML = datos.map(r => {
      const extracto = String(r.body).replace(/\s+/g, " ").slice(0, 260);
      return `
        <a class="destacada" href="/u/${esc(r.username)}?resena=${r.id}">
          ${r.cover_url ? `<img src="${esc(r.cover_url)}" alt="" loading="lazy">` : ""}
          <span class="destacada-texto">
            <b>${esc(r.game_title)}</b>
            <span class="destacada-extracto">${r.spoilers ? "Contiene spoilers. Ábrela para leerla." : esc(extracto) + (r.body.length > 260 ? "…" : "")}</span>
            <small>@${esc(r.username)}${r.rating ? ` · ${Number(r.rating).toFixed(1)}` : ""}</small>
          </span>
        </a>`;
    }).join("");
    caja.hidden = false;
  }

  (async () => {
    cargar(false);
    destacadas();
    try { if (await DB.getUser()) pestanas && pestanas.classList.remove("hidden"); } catch (e) { /* invitado */ }
  })();
})();
