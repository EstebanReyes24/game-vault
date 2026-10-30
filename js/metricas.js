/**
 * Panel de métricas (solo admin, migración 020): usuarios, activos, retención, embudo,
 * funciones más usadas, de dónde llega la gente y los últimos registros.
 */
(function () {
  const btn = document.getElementById("openMetricasBtn");
  const modal = document.getElementById("metricasModal");
  const cuerpo = document.getElementById("metricasCuerpo");
  if (!btn || !modal || !cuerpo || !window.supabaseClient || typeof DB === "undefined") return;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const num = (n) => Number(n || 0).toLocaleString("es");
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
  const NOMBRES = {
    importar_steam: "Importar Steam", importar_xbox: "Importar Xbox", importar_psn: "Importar PlayStation", pegar_lista: "Pegar lista",
    sincronizar: "Actualizar", repetidos: "Unir repetidos", completar_datos: "Completar datos", presumir: "Presumir",
    deseos: "Lista de deseos", que_juego: "¿Qué juego?", wrapped: "Wrapped", stats: "Stats", top_cards: "Top cards",
    listas: "Listas", mis_videos: "Mis videos", registrar_juego: "Registrar juego a mano", resena: "Escribir reseña",
    compartir_perfil: "Compartir perfil", exportar: "Exportar", pagina_juego: "Página de un juego", comparar: "Comparar estantes",
    ranking: "Ranking de juegos", lo_quiero: "«Lo quiero»", perfil: "Mi perfil",
    usa_app: "Abrió la app instalada", instalar_app: "Pulsó «Instalar app»", app_instalada: "Instaló la app", discord: "Fue al Discord"
  };
  const ORIGENES = { directo: "Directo / sin rastro", youtube: "YouTube", google: "Google", x: "X (Twitter)", "sin dato": "Sin dato (cuentas de antes)",
    enlace_perfil: "Enlace a un perfil", enlace_juego: "Enlace a un juego", enlace_articulo: "Enlace a un artículo", app: "App instalada", yt: "YouTube (?ref=yt)" };

  function barras(lista, clave, etiqueta) {
    const max = Math.max(1, ...lista.map(x => Number(x[clave]) || 0));
    return `<ul class="metricas-barras">${lista.map(x => `
      <li><span>${esc(etiqueta(x))}</span><i style="--w:${(100 * (Number(x[clave]) || 0)) / max}%"></i><b>${num(x[clave])}</b></li>`).join("")}</ul>`;
  }

  function grafico(dias) {
    const max = Math.max(1, ...dias.map(d => d.activos));
    const ancho = 100 / dias.length;
    const columnas = dias.map((d, i) => {
      const h = (60 * d.activos) / max, hn = (60 * d.nuevos) / max;
      const fecha = new Date(d.dia + "T12:00:00Z").toLocaleDateString("es-ES", { day: "numeric", month: "short" });
      return `<g><title>${fecha}: ${d.activos} activos, ${d.nuevos} nuevos</title>
        <rect x="${i * ancho + ancho * 0.15}" y="${62 - h}" width="${ancho * 0.7}" height="${Math.max(h, 0.6)}" class="m-act"/>
        ${d.nuevos ? `<rect x="${i * ancho + ancho * 0.15}" y="${62 - hn}" width="${ancho * 0.7}" height="${hn}" class="m-nue"/>` : ""}</g>`;
    }).join("");
    const ini = new Date(dias[0].dia + "T12:00:00Z").toLocaleDateString("es-ES", { day: "numeric", month: "short" });
    return `<svg viewBox="0 0 100 64" preserveAspectRatio="none" class="metricas-grafico" role="img" aria-label="Personas activas por día, últimos 30 días">${columnas}</svg>
      <p class="metricas-eje"><span>${ini}</span><span><i class="m-ley m-act"></i> activos <i class="m-ley m-nue"></i> nuevos · máx. ${max}/día</span><span>hoy</span></p>`;
  }

  function pintar(m) {
    const t = m.totales, a = m.activos, r = m.retencion || {};
    const embudo = [
      ["Se registraron", t.usuarios], ["Tienen algún juego", t.con_juegos],
      ["Importaron de Steam, Xbox o PSN", t.importaron], ["Estante público", t.publicos]
    ];
    cuerpo.innerHTML = `
      <section class="cifras metricas-cifras">
        <div><b>${num(t.usuarios)}</b><span>cuentas</span></div>
        <div><b>${num(a.hoy)}</b><span>activas hoy</span></div>
        <div><b>${num(a.semana)}</b><span>activas esta semana</span></div>
        <div><b>${num(a.mes)}</b><span>activas este mes</span></div>
      </section>

      <section class="metricas-bloque"><h3>Últimos 30 días</h3>${grafico(m.por_dia || [])}</section>

      <div class="metricas-columnas">
        <section class="metricas-bloque">
          <h3>Embudo</h3>
          <ul class="metricas-barras">${embudo.map(([n, v]) => `<li><span>${n}</span><i style="--w:${pct(v, t.usuarios)}%"></i><b>${num(v)} · ${pct(v, t.usuarios)} %</b></li>`).join("")}</ul>
        </section>
        <section class="metricas-bloque">
          <h3>¿Vuelven?</h3>
          ${r.cohorte ? `
          <p class="metricas-grande"><b>${pct(r.volvieron_semana1, r.cohorte)} %</b> volvió otro día en su primera semana</p>
          <p class="metricas-grande"><b>${pct(r.activos_ahora, r.cohorte)} %</b> sigue activo esta semana</p>
          <p class="metricas-nota">De las ${num(r.cohorte)} cuentas creadas hace entre 8 y 90 días.</p>`
          : `<p class="metricas-nota">Aún no hay cuentas con más de una semana para medirlo.</p>`}
        </section>
      </div>

      <div class="metricas-columnas">
        <section class="metricas-bloque">
          <h3>Qué usan (personas, últimos 30 días)</h3>
          ${(m.funciones || []).length ? barras(m.funciones, "personas", x => NOMBRES[x.funcion] || x.funcion) : `<p class="metricas-nota">Se empieza a contar desde hoy: vuelve en unos días.</p>`}
        </section>
        <section class="metricas-bloque">
          <h3>De dónde llegan (últimos 90 días)</h3>
          ${barras(m.origenes || [], "personas", x => ORIGENES[x.origen] || x.origen)}
          <p class="metricas-nota">Pon <code>?ref=yt</code> (o el nombre que quieras) en los enlaces de tus videos y redes para distinguirlos.</p>
        </section>
      </div>

      <div class="metricas-columnas">
        <section class="metricas-bloque">
          <h3>Lo más añadido esta semana</h3>
          ${(m.juegos_semana || []).length ? `<ol class="metricas-lista">${m.juegos_semana.map(j => `<li><a href="${esc(window.urlJuego ? window.urlJuego(j.titulo) : "#")}">${esc(j.titulo)}</a><b>${num(j.personas)}</b></li>`).join("")}</ol>` : `<p class="metricas-nota">Nada esta semana.</p>`}
        </section>
        <section class="metricas-bloque">
          <h3>Totales</h3>
          <ul class="metricas-lista">
            <li>Juegos en estantes<b>${num(t.juegos)}</b></li>
            <li>Cuentas vinculadas<b>Steam ${num(t.steam)} · Xbox ${num(t.xbox)} · PSN ${num(t.psn)}</b></li>
            <li>Reseñas<b>${num(t.resenas)}</b></li>
            <li>Comentarios<b>${num(t.comentarios)}</b></li>
            <li>Seguimientos<b>${num(t.seguimientos)}</b></li>
            <li>Juegos en listas de deseos<b>${num(t.deseos)}</b></li>
          </ul>
        </section>
      </div>

      <section class="metricas-bloque">
        <h3>Últimos registros</h3>
        <div class="metricas-tabla"><table>
          <thead><tr><th>Usuario</th><th>Se unió</th><th>Juegos</th><th>Llegó por</th><th>Último día activo</th></tr></thead>
          <tbody>${(m.recientes || []).map(u => `<tr>
            <td>${u.publico ? `<a href="/u/${encodeURIComponent(u.username)}">@${esc(u.username)}</a>` : `@${esc(u.username)} <small>(privado)</small>`}</td>
            <td>${new Date(u.creado).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}</td>
            <td>${num(u.juegos)}</td><td>${esc(ORIGENES[u.origen] || u.origen || "—")}</td>
            <td>${u.ultimo_dia ? new Date(u.ultimo_dia + "T12:00:00Z").toLocaleDateString("es-ES", { day: "numeric", month: "short" }) : "—"}</td></tr>`).join("")}</tbody>
        </table></div>
      </section>
      <p class="metricas-nota">«Activo» = entró con su cuenta ese día (antes de hoy se estima con los juegos que añadió o cambió). Los visitantes sin cuenta no se cuentan.</p>`;
  }

  async function abrir() {
    modal.classList.remove("hidden");
    cuerpo.innerHTML = `<p class="metricas-nota">Cargando…</p>`;
    const { data, error } = await supabaseClient.rpc("metricas_admin");
    if (error) { cuerpo.innerHTML = `<p class="metricas-nota">${/metricas_admin/.test(error.message) ? "Falta ejecutar la migración 020 en Supabase." : esc(error.message)}</p>`; return; }
    pintar(data);
  }

  btn.addEventListener("click", abrir);
  const cerrar = () => modal.classList.add("hidden");
  document.getElementById("cerrarMetricasBtn").addEventListener("click", cerrar);
  modal.addEventListener("click", (e) => { if (e.target === modal) cerrar(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.classList.contains("hidden")) cerrar(); });
  (async () => { try { if (await DB.isAdmin()) btn.classList.remove("hidden"); } catch (e) { /* no admin */ } })();
})();
