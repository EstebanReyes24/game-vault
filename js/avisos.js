/**
 * Campana de avisos (migración 014): "te empezó a seguir" y "comentó tu artículo".
 * Aparece en la cabecera solo con sesión iniciada; al abrirla, los avisos se marcan como leídos.
 */
(function () {
  if (!window.supabaseClient) return;
  const ancla = document.getElementById("appAuthBtn") || document.getElementById("authBtn");
  if (!ancla) return;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const hace = (f) => {
    const min = Math.round((Date.now() - Date.parse(f)) / 60000);
    if (min < 60) return `hace ${Math.max(min, 1)} min`;
    if (min < 1440) return `hace ${Math.round(min / 60)} h`;
    return new Date(f).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  };

  const caja = document.createElement("div");
  caja.className = "avisos";
  caja.hidden = true;
  caja.innerHTML = `
    <button type="button" class="avisos-boton" aria-haspopup="true" aria-expanded="false" aria-label="Avisos">
      <i class="fa-solid fa-bell" aria-hidden="true"></i><span class="avisos-numero" hidden>0</span>
    </button>
    <div class="avisos-panel" hidden role="menu">
      <p class="avisos-titulo">Avisos</p>
      <ul class="avisos-lista"></ul>
    </div>`;
  ancla.parentNode.insertBefore(caja, ancla);
  const boton = caja.querySelector(".avisos-boton");
  const panel = caja.querySelector(".avisos-panel");
  const numero = caja.querySelector(".avisos-numero");
  const lista = caja.querySelector(".avisos-lista");
  let avisos = [];

  async function cargar() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) { caja.hidden = true; return; }
    const { data, error } = await supabaseClient.from("notifications").select("id, kind, actor, texto, enlace, leida, created_at").order("created_at", { ascending: false }).limit(20);
    if (error) { caja.hidden = true; return; } // sin la migración 014 no se muestra nada
    avisos = data || [];
    caja.hidden = false;
    const nuevos = avisos.filter(a => !a.leida).length;
    numero.hidden = !nuevos;
    numero.textContent = nuevos > 9 ? "9+" : String(nuevos);
    lista.innerHTML = avisos.length ? avisos.map(a => `
      <li class="${a.leida ? "" : "nuevo"}"><a href="${esc(a.enlace || "#")}" role="menuitem">
        <i class="fa-solid ${{ seguidor: "fa-user-plus", comentario: "fa-comment", precio: "fa-tag", salida: "fa-rocket" }[a.kind] || "fa-bell"}" aria-hidden="true"></i>
        <span>${["precio", "salida"].includes(a.kind) ? "" : `<b>@${esc(a.actor || "alguien")}</b> `}${esc(a.texto || "")}<small>${hace(a.created_at)}</small></span>
      </a></li>`).join("") : `<li class="avisos-vacio">Todavía no tienes avisos.</li>`;
  }

  boton.addEventListener("click", async () => {
    const abrir = panel.hidden;
    panel.hidden = !abrir;
    boton.setAttribute("aria-expanded", String(abrir));
    if (abrir && avisos.some(a => !a.leida)) {
      const ids = avisos.filter(a => !a.leida).map(a => a.id);
      await supabaseClient.from("notifications").update({ leida: true }).in("id", ids);
      numero.hidden = true;
    }
  });
  document.addEventListener("click", (e) => { if (!caja.contains(e.target)) { panel.hidden = true; boton.setAttribute("aria-expanded", "false"); } });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") panel.hidden = true; });

  supabaseClient.auth.onAuthStateChange(() => cargar());
  cargar();
  setInterval(() => { if (!document.hidden) cargar(); }, 120000);
})();
