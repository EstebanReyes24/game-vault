/**
 * Menús de la barra del estante: Importar, Resumen y Más.
 * Los botones de dentro conservan su id y su lógica de siempre; aquí solo se abre y se cierra el menú.
 */
(function () {
  const menus = [...document.querySelectorAll(".menu-barra")];
  if (!menus.length) return;
  const cerrar = (m) => { m.querySelector(".menu-panel").hidden = true; m.querySelector(".menu-barra-boton").setAttribute("aria-expanded", "false"); };
  const cerrarTodos = (menos) => menus.forEach(m => { if (m !== menos) cerrar(m); });

  menus.forEach(m => {
    const boton = m.querySelector(".menu-barra-boton");
    const panel = m.querySelector(".menu-panel");
    boton.addEventListener("click", () => {
      const abrir = panel.hidden;
      cerrarTodos(m);
      panel.hidden = !abrir;
      boton.setAttribute("aria-expanded", String(abrir));
      if (abrir) {
        // Que no se salga por la derecha en pantallas estrechas
        panel.style.transform = "";
        const r = panel.getBoundingClientRect();
        const sobra = r.right - (document.documentElement.clientWidth - 8);
        if (sobra > 0) panel.style.transform = `translateX(${-Math.min(sobra, Math.max(r.left - 8, 0))}px)`;
        panel.querySelector("button:not(.hidden)")?.focus({ preventScroll: true });
      }
    });
    // Al elegir una opción el menú se cierra (el sonido se queda abierto para ver el cambio)
    panel.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b && b.id !== "soundToggleBtn") cerrar(m); });
    panel.addEventListener("keydown", (e) => {
      const items = [...panel.querySelectorAll("button:not(.hidden)")];
      const i = items.indexOf(document.activeElement);
      if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
      if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
      if (e.key === "Escape") { cerrar(m); boton.focus(); }
    });
  });
  document.addEventListener("click", (e) => { if (!e.target.closest(".menu-barra")) cerrarTodos(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrarTodos(); });
})();
