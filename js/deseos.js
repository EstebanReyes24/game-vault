/**
 * Lista de deseos (migración 019): juegos que quieres, con el mejor precio de PC en ese momento
 * (CheapShark: Steam, GOG, Humble, Epic, Fanatical…) y su fecha de salida (RAWG).
 * Al abrir el estante (máximo cada 6 horas) se revisan los precios y, si un juego baja a tu precio
 * objetivo (o tiene 50 % o más de descuento), o si ya salió, te llega un aviso a la campana.
 */
(function () {
  const modal = document.getElementById("deseosModal");
  const btn = document.getElementById("deseosBtn");
  if (!modal || !btn || isSpectatorMode || !window.supabaseClient) return;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => escapeHTML(String(s ?? ""));
  const CS = "https://www.cheapshark.com/api/1.0";
  const usd = (n) => (n === null || n === undefined || n === "" ? "—" : `US$${Number(n).toFixed(2)}`);
  let deseos = [];
  let tiendas = {};

  async function sesion() { return (await supabaseClient.auth.getSession()).data.session; }

  async function cargarTiendas() {
    if (Object.keys(tiendas).length) return;
    try {
      const lista = await fetch(`${CS}/stores`).then(r => r.json());
      lista.forEach(t => { tiendas[t.storeID] = t.storeName; });
    } catch (e) { /* sin nombres de tienda */ }
  }

  async function leer() {
    const { data, error } = await supabaseClient.from("wishlist").select("*").order("creado", { ascending: false });
    if (error) throw new Error(/wishlist/.test(error.message) ? "Falta activar la lista de deseos (migración 019)." : error.message);
    deseos = data || [];
  }

  // Precios actuales de hasta 25 juegos por consulta
  async function actualizarPrecios(forzar) {
    const ultima = Number(localStorage.getItem("gv_deseos_revisados") || 0);
    if (!forzar && Date.now() - ultima < 6 * 3600000) return;
    const conId = deseos.filter(d => d.cheapshark_id);
    for (let i = 0; i < conId.length; i += 25) {
      const lote = conId.slice(i, i + 25);
      let datos = {};
      try { datos = await fetch(`${CS}/games?ids=${lote.map(d => d.cheapshark_id).join(",")}`).then(r => r.json()); } catch (e) { return; }
      for (const d of lote) {
        const info = datos[d.cheapshark_id];
        const mejor = (info?.deals || []).sort((a, b) => Number(a.price) - Number(b.price))[0];
        if (!mejor) continue;
        const cambio = { ultimo_precio: Number(mejor.price), precio_normal: Number(mejor.retailPrice), tienda: (tiendas[mejor.storeID] || "Tienda").slice(0, 40) };
        Object.assign(d, cambio, { _oferta: mejor.dealID, _minimo: info.cheapestPriceEver?.price });
        await supabaseClient.from("wishlist").update(cambio).eq("id", d.id);
        const descuento = cambio.precio_normal ? 1 - cambio.ultimo_precio / cambio.precio_normal : 0;
        const objetivo = d.precio_objetivo !== null && d.precio_objetivo !== undefined ? Number(d.precio_objetivo) : null;
        if ((objetivo !== null && cambio.ultimo_precio <= objetivo) || (objetivo === null && descuento >= 0.5)) {
          await supabaseClient.rpc("avisar_deseo", { p_id: d.id, p_tipo: "precio", p_texto: `${d.titulo} bajó a ${usd(cambio.ultimo_precio)} en ${cambio.tienda}${descuento > 0 ? ` (-${Math.round(descuento * 100)} %)` : ""}` });
        }
      }
    }
    // Lanzamientos: aviso el día que sale
    const hoy = new Date().toISOString().slice(0, 10);
    for (const d of deseos.filter(x => x.fecha_salida && x.fecha_salida <= hoy && !x.avisado_salida)) {
      await supabaseClient.rpc("avisar_deseo", { p_id: d.id, p_tipo: "salida", p_texto: `¡${d.titulo} ya salió!` });
      d.avisado_salida = true;
    }
    try { localStorage.setItem("gv_deseos_revisados", String(Date.now())); } catch (e) { /* nada */ }
  }

  function pintar() {
    const hoy = new Date().toISOString().slice(0, 10);
    $("deseosCuenta").textContent = deseos.length ? `${deseos.length} ${deseos.length === 1 ? "juego" : "juegos"}` : "";
    $("deseosLista").innerHTML = deseos.length ? deseos.map(d => {
      const descuento = d.precio_normal && d.ultimo_precio !== null ? Math.round(100 * (1 - d.ultimo_precio / d.precio_normal)) : 0;
      const falta = d.fecha_salida && d.fecha_salida > hoy ? Math.ceil((Date.parse(d.fecha_salida) - Date.now()) / 86400000) : null;
      return `
      <li data-id="${d.id}">
        ${/^https:\/\//.test(d.portada || "") ? `<img src="${esc(d.portada)}" alt="" loading="lazy">` : `<span class="lista-sin-tapa"></span>`}
        <span class="deseo-texto">
          <a href="${esc(window.urlJuego(d.titulo))}"><b>${esc(d.titulo)}</b></a>
          <small>${falta !== null ? `Sale en ${falta} ${falta === 1 ? "día" : "días"} · ${new Date(d.fecha_salida).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}`
            : d.ultimo_precio !== null ? `${usd(d.ultimo_precio)} en ${esc(d.tienda || "PC")}${descuento > 0 ? ` <em class="deseo-rebaja">-${descuento} %</em>` : ""}${d._minimo ? ` · mínimo histórico ${usd(d._minimo)}` : ""}`
            : d.cheapshark_id ? "Buscando precio…" : "Sin precio en tiendas de PC"}</small>
          <label class="deseo-objetivo">Avísame si baja de US$<input type="number" min="0" max="1000" step="0.5" value="${d.precio_objetivo ?? ""}" data-objetivo="${d.id}" placeholder="—"></label>
        </span>
        <span class="deseo-acciones">
          ${d._oferta ? `<a class="boton boton-senal" href="https://www.cheapshark.com/redirect?dealID=${encodeURIComponent(d._oferta)}" target="_blank" rel="noopener noreferrer">Ver oferta</a>` : ""}
          <button type="button" class="resena-mas" data-quitar="${d.id}">Quitar</button>
        </span>
      </li>`;
    }).join("") : `<li class="deseos-vacio">Tu lista está vacía. Busca arriba un juego que quieras comprar o que estés esperando.</li>`;
  }

  async function abrir() {
    modal.classList.remove("hidden");
    $("deseosEstado").textContent = "Cargando tu lista…";
    try {
      await cargarTiendas();
      await leer();
      pintar();
      $("deseosEstado").textContent = "Revisando precios…";
      await actualizarPrecios(true);
      pintar();
      $("deseosEstado").textContent = "Precios de tiendas de PC en dólares (CheapShark). Para consolas solo se avisa el día de salida.";
    } catch (e) {
      $("deseosEstado").textContent = e.message;
    }
  }

  // Buscar y añadir
  let espera;
  $("deseosBuscar").addEventListener("input", (e) => {
    clearTimeout(espera);
    const q = e.target.value.trim();
    if (q.length < 2) { $("deseosResultados").innerHTML = ""; return; }
    espera = setTimeout(async () => {
      try {
        const d = await fetch(`/api/rawg?search=${encodeURIComponent(q)}&n=6`).then(r => r.json());
        $("deseosResultados").innerHTML = (d.results || []).map((r, i) => `
          <li><button type="button" data-anadir="${i}">
            ${/^https:\/\//.test(r.background_image || "") ? `<img src="${esc(r.background_image)}" alt="" loading="lazy">` : `<span class="lista-sin-tapa"></span>`}
            <span><b>${esc(r.name)}</b><small>${r.released ? new Date(r.released).getFullYear() + (r.released > new Date().toISOString().slice(0, 10) ? " · próximamente" : "") : "sin fecha"}</small></span>
          </button></li>`).join("");
        $("deseosResultados")._datos = d.results || [];
      } catch (err) { /* sin resultados */ }
    }, 300);
  });

  $("deseosResultados").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-anadir]");
    if (!b) return;
    const r = $("deseosResultados")._datos[Number(b.dataset.anadir)];
    if (!r) return;
    const s = await sesion();
    if (!s) { showToast("Inicia sesión para tener lista de deseos.", true); return; }
    let cs = null;
    try { cs = (await fetch(`${CS}/games?title=${encodeURIComponent(r.name)}&limit=5`).then(x => x.json()))[0] || null; } catch (err) { cs = null; }
    const fila = {
      user_id: s.user.id, titulo: String(r.name).slice(0, 150),
      portada: /^https:\/\//.test(r.background_image || "") ? r.background_image : null,
      cheapshark_id: cs?.gameID || null, steam_appid: Number(cs?.steamAppID) || null,
      fecha_salida: r.released || null
    };
    const { error } = await supabaseClient.from("wishlist").insert([fila]);
    if (error) { showToast(/duplicate|unique/.test(error.message) ? "Ya está en tu lista." : error.message, true); return; }
    $("deseosBuscar").value = ""; $("deseosResultados").innerHTML = "";
    showToast(`${r.name} añadido a tu lista de deseos.`);
    await leer(); await actualizarPrecios(true); pintar();
  });

  $("deseosLista").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-quitar]");
    if (!b) return;
    await supabaseClient.from("wishlist").delete().eq("id", Number(b.dataset.quitar));
    deseos = deseos.filter(d => d.id !== Number(b.dataset.quitar));
    pintar();
  });
  $("deseosLista").addEventListener("change", async (e) => {
    const inp = e.target.closest("[data-objetivo]");
    if (!inp) return;
    const v = inp.value === "" ? null : Math.max(0, Math.min(1000, Number(inp.value)));
    const { error } = await supabaseClient.from("wishlist").update({ precio_objetivo: v, avisado_precio: null }).eq("id", Number(inp.dataset.objetivo));
    if (!error) showToast(v === null ? "Aviso quitado: te avisaremos con 50 % de descuento o más." : `Te avisaremos si baja de US$${v.toFixed(2)}.`);
  });

  btn.addEventListener("click", abrir);
  $("deseosCerrar").addEventListener("click", () => modal.classList.add("hidden"));
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.add("hidden"); });

  // Desde un aviso de la campana: /estante?deseos=1
  if (new URLSearchParams(location.search).get("deseos") === "1") {
    history.replaceState(null, "", location.pathname);
    setTimeout(abrir, 700);
  } else {
    // Revisión silenciosa al entrar (como mucho cada 6 horas)
    setTimeout(async () => {
      try { if (!(await sesion())) return; await cargarTiendas(); await leer(); await actualizarPrecios(false); } catch (e) { /* sin migración o sin red */ }
    }, 4000);
  }
})();
