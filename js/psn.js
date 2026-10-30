/**
 * Importar desde PlayStation (por ID en línea, vía /api/psn) y "Pegar lista" (un juego por línea,
 * para Switch o cualquier plataforma sin conexión). Si el juego ya está en el estante, se une a ese.
 */
(function () {
  const esc = (s) => escapeHTML(String(s ?? ""));
  const abrirModal = (m) => { if (isSpectatorMode) { showToast("Entra a tu propio estante para importar.", true); return false; } m.classList.remove("hidden"); return true; };
  const cerrarAlTocarFuera = (m, cerrar) => m.addEventListener("click", (e) => { if (e.target === m) cerrar(); });

  async function guardar(actuales, unidos, nuevos, texto) {
    const fusionados = [...unidos.values()];
    StorageManager.saveGames([...actuales.map(g => unidos.get(g.id) || g), ...nuevos]);
    await cloudRun(() => DB.upsertGames([...fusionados, ...nuevos]), "No se pudieron subir los juegos importados a la nube.");
    renderLibrary();
    showToast(`${texto}: ${nuevos.length} juegos nuevos${fusionados.length ? ` y ${fusionados.length} unidos a los que ya tenías` : ""}. Ahora completo sus datos.`);
    if (window.Autodatos) window.Autodatos.completar([...nuevos, ...fusionados]);
  }

  // ---------- PlayStation ----------
  const modal = document.getElementById("psnModal");
  const btn = document.getElementById("openPsnBtn");
  if (modal && btn) {
    const estado = document.getElementById("psnEstado");
    const lista = document.getElementById("psnLista");
    let juegos = [];
    const cerrar = () => modal.classList.add("hidden");
    btn.addEventListener("click", () => { if (abrirModal(modal)) document.getElementById("psnId").focus(); });
    document.getElementById("psnCerrar").addEventListener("click", cerrar);
    cerrarAlTocarFuera(modal, cerrar);

    function mostrar(todos, onlineId, conHoras) {
      const mios = StorageManager.getGames();
      const vinculados = new Set(mios.filter(g => g.psnNpId).map(g => g.psnNpId));
      const sinId = new Set(mios.filter(g => !g.psnNpId && (g.platforms || []).includes("PlayStation")).map(g => claveTitulo(g.title)));
      juegos = (todos || [])
        .filter(j => !(j.npId && vinculados.has(j.npId)) && !sinId.has(claveTitulo(j.titulo)))
        .map(j => ({ ...j, seUneCon: mios.find(g => !g.psnNpId && claveTitulo(g.title) === claveTitulo(j.titulo))?.title || null }))
        .sort((a, b) => (Date.parse(b.ultimaVez) || 0) - (Date.parse(a.ultimaVez) || 0));
      if (!juegos.length) {
        estado.textContent = (todos || []).length ? "Todos tus juegos de PlayStation ya están en tu estante." : "PlayStation no devolvió juegos para esta cuenta.";
        document.getElementById("psnResultado").hidden = true;
        return;
      }
      estado.textContent = conHoras ? "" : "Tus horas no llegaron: pon «Juegos» en Cualquiera en tu privacidad de PlayStation si las quieres.";
      const conTrofeos = (x) => x.logros > 0 || x.horas > 0;
      const marcados = juegos.filter(conTrofeos).length;
      document.getElementById("psnCuenta").textContent = `${onlineId} · ${juegos.length} juegos nuevos · ${marcados} marcados`;
      lista.innerHTML = juegos.map((j, i) => `
        <li><label>
          <input type="checkbox" data-i="${i}" ${conTrofeos(j) ? "checked" : ""}>
          ${/^https:\/\//.test(j.portada || "") ? `<img src="${esc(j.portada)}" alt="" loading="lazy">` : `<span class="lista-sin-tapa"></span>`}
          <span class="lista-juego"><b>${esc(j.titulo)}</b><small>${esc(j.plataforma)}${j.logrosTotal ? ` · ${j.logros}/${j.logrosTotal} trofeos · ${Math.round(j.progreso)}%` : ""}${j.platino ? " · 🏆 platino" : ""}${j.horas ? ` · ${j.horas} h` : ""}${j.seUneCon ? ` · se une con «${esc(j.seUneCon)}» que ya tienes` : ""}</small></span>
        </label></li>`).join("");
      document.getElementById("psnTodos").textContent = marcados === juegos.length ? "Desmarcar todos" : "Marcar todos";
      document.getElementById("psnResultado").hidden = false;
    }

    async function buscar() {
      const b = document.getElementById("psnBuscar");
      const id = document.getElementById("psnId").value.trim();
      if (!id) { estado.textContent = "Escribe tu ID en línea."; return; }
      if (!cloudUserId) { estado.innerHTML = 'Para importar desde PlayStation necesitas una cuenta. <a href="login.html" class="underline">Inicia sesión o regístrate</a>: es gratis y así tu estante se guarda en la nube.'; return; }
      estado.textContent = "Buscando tus juegos de PlayStation…";
      b.disabled = true;
      try {
        const r = await fetchConSesion(`/api/psn?id=${encodeURIComponent(id)}`);
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
        if (data.privado) {
          estado.textContent = `Encontramos a ${data.onlineId}, pero sus trofeos no son visibles. Abre "Si no aparecen tus juegos" para ver cómo cambiarlo.`;
          document.getElementById("psnResultado").hidden = true;
          return;
        }
        mostrar(data.juegos, data.onlineId, data.conHoras);
        if (window.Autodatos) window.Autodatos.guardarCuenta({ psn_online_id: data.onlineId, psn_account_id: data.accountId });
      } catch (err) {
        estado.textContent = err.message;
      } finally {
        b.disabled = false;
      }
    }
    document.getElementById("psnBuscar").addEventListener("click", buscar);
    document.getElementById("psnId").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); buscar(); } });

    document.getElementById("psnTodos").addEventListener("click", (e) => {
      const cajas = [...lista.querySelectorAll("input[type=checkbox]")];
      const marcar = cajas.some(c => !c.checked);
      cajas.forEach(c => { c.checked = marcar; });
      e.currentTarget.textContent = marcar ? "Desmarcar todos" : "Marcar todos";
    });

    document.getElementById("psnImportar").addEventListener("click", async () => {
      const elegidos = [...lista.querySelectorAll("input[type=checkbox]:checked")].map(c => juegos[Number(c.dataset.i)]).filter(Boolean);
      if (!elegidos.length) { estado.textContent = "Marca al menos un juego."; return; }
      const actuales = StorageManager.getGames();
      const nuevos = [];
      const unidos = new Map();
      elegidos.forEach(j => {
        const datos = {
          plataforma: "PlayStation", etiqueta: `#${j.plataforma && /^PS/.test(j.plataforma) ? j.plataforma : "PlayStation"}`,
          psnNpId: j.npId, psnService: j.servicio, hours: j.horas || 0, lastPlayed: j.ultimaVez || null,
          achUnlocked: j.logros || 0, achTotal: j.logrosTotal || null, status: j.platino ? "platinum" : null,
          coverUrl: /^https:\/\//.test(j.portada || "") ? j.portada : ""
        };
        const igual = actuales.find(g => !g.psnNpId && !unidos.has(g.id) && claveTitulo(g.title) === claveTitulo(j.titulo));
        if (igual) { unidos.set(igual.id, fusionarPlataforma(igual, datos)); return; }
        nuevos.push({
          id: newGameId(), title: j.titulo, coverUrl: datos.coverUrl,
          status: j.platino ? "platinum" : "backlog", platforms: ["PlayStation"],
          rating: null, hours: datos.hours, targetHours: 0, completedYear: null, favorite: false,
          tags: [datos.etiqueta], notes: "",
          psnNpId: datos.psnNpId, psnService: datos.psnService, lastPlayed: datos.lastPlayed,
          achUnlocked: datos.achUnlocked, achTotal: datos.achTotal
        });
      });
      cerrar();
      await guardar(actuales, unidos, nuevos, "PlayStation");
    });
  }

  // ---------- Pegar lista ----------
  const modalP = document.getElementById("pegarModal");
  const btnP = document.getElementById("openPegarBtn");
  if (modalP && btnP) {
    const cerrarP = () => modalP.classList.add("hidden");
    btnP.addEventListener("click", () => { if (abrirModal(modalP)) document.getElementById("pegarTexto").focus(); });
    document.getElementById("pegarCerrar").addEventListener("click", cerrarP);
    cerrarAlTocarFuera(modalP, cerrarP);

    document.getElementById("pegarAnadir").addEventListener("click", async () => {
      const plataforma = document.getElementById("pegarPlataforma").value;
      const etiqueta = { Nintendo: "#Switch", PlayStation: "#PlayStation", Xbox: "#Xbox", PC: "#PC" }[plataforma] || "";
      // Limpia viñetas, numeraciones y porcentajes que vienen al copiar de otras webs
      const titulos = [...new Set(document.getElementById("pegarTexto").value.split(/\r?\n/)
        .map(l => l.replace(/^\s*(?:[-*•·]|\d+[.)-])\s*/, "").replace(/\s+\d{1,3}\s?%.*$/, "").trim())
        .filter(l => l.length >= 2 && l.length <= 150))];
      const estadoP = document.getElementById("pegarEstado");
      if (!titulos.length) { estadoP.textContent = "Escribe o pega al menos un juego (uno por línea)."; return; }
      if (titulos.length > 500) { estadoP.textContent = "Como máximo 500 juegos por vez."; return; }
      const actuales = StorageManager.getGames();
      const nuevos = [];
      const unidos = new Map();
      const vistos = new Set();
      titulos.forEach(t => {
        const k = claveTitulo(t);
        if (vistos.has(k)) return;
        vistos.add(k);
        const igual = actuales.find(g => claveTitulo(g.title) === k);
        if (igual) {
          if ((igual.platforms || []).includes(plataforma)) return;
          unidos.set(igual.id, fusionarPlataforma(unidos.get(igual.id) || igual, { plataforma, etiqueta }));
          return;
        }
        nuevos.push({
          id: newGameId(), title: t, coverUrl: "", status: "backlog", platforms: [plataforma],
          rating: null, hours: 0, targetHours: 0, completedYear: null, favorite: false,
          tags: etiqueta ? [etiqueta] : [], notes: ""
        });
      });
      if (!nuevos.length && !unidos.size) { estadoP.textContent = "Todos esos juegos ya están en tu estante con esa plataforma."; return; }
      document.getElementById("pegarTexto").value = "";
      estadoP.textContent = "";
      cerrarP();
      await guardar(actuales, unidos, nuevos, "Lista");
    });
  }
})();
