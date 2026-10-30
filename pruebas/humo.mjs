/**
 * Prueba de humo: abre las páginas principales en celular y computadora y falla si
 * hay errores de JavaScript, si algo se sale de la pantalla a lo ancho o si falta lo esencial.
 *   BASE=https://… node pruebas/humo.mjs
 */
import { chromium } from "playwright";

const BASE = (process.env.BASE || "http://localhost:3000").replace(/\/$/, "");
const PAGINAS = [
  { ruta: "/", espera: ".portada" },
  { ruta: "/noticias", espera: "#archivo" },
  { ruta: "/articulos", espera: "#archivo" },
  { ruta: "/app.html", espera: "#gamesGrid, .bienvenida" },
  { ruta: "/comparar", espera: "#comparar" },
  { ruta: "/j/elden-ring", espera: "#juego" },
  { ruta: "/legal.html", espera: "main, h1" },
  { ruta: "/login.html", espera: "form" }
];
const PANTALLAS = [
  { nombre: "celular", width: 390, height: 844, isMobile: true },
  { nombre: "computadora", width: 1366, height: 900, isMobile: false }
];
// Ruido que no depende de nosotros (extensiones, analíticas bloqueadas, etc.)
const IGNORAR = /insights\/script|ResizeObserver loop|Failed to load resource|net::ERR/i;

const navegador = await chromium.launch();
const fallos = [];
for (const pantalla of PANTALLAS) {
  const contexto = await navegador.newContext({ viewport: { width: pantalla.width, height: pantalla.height }, isMobile: pantalla.isMobile, hasTouch: pantalla.isMobile, serviceWorkers: "block" });
  for (const { ruta, espera } of PAGINAS) {
    const pagina = await contexto.newPage();
    const errores = [];
    pagina.on("pageerror", e => { if (!IGNORAR.test(e.message)) errores.push(e.message); });
    try {
      const r = await pagina.goto(BASE + ruta, { waitUntil: "domcontentloaded", timeout: 30000 });
      if (!r || r.status() >= 400) errores.push(`respondió ${r ? r.status() : "sin respuesta"}`);
      await pagina.waitForSelector(espera, { timeout: 15000, state: "attached" }).catch(() => errores.push(`no apareció ${espera}`));
      await pagina.waitForTimeout(2500);
      const ancho = await pagina.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
      if (ancho[0] > ancho[1] + 1) errores.push(`se sale de la pantalla a lo ancho (${ancho[0]}px en ${ancho[1]}px)`);
      const rotas = await pagina.evaluate(() => [...document.images].filter(i => i.complete && i.naturalWidth === 0 && i.src && !i.src.startsWith("data:")).map(i => i.src).slice(0, 3));
      if (rotas.length) console.warn(`  aviso ${pantalla.nombre} ${ruta}: imágenes rotas ${rotas.join(", ")}`);
    } catch (e) {
      errores.push(e.message.split("\n")[0]);
    }
    console.log(`${errores.length ? "✗" : "✓"} ${pantalla.nombre.padEnd(11)} ${ruta}${errores.length ? " → " + errores.join(" | ") : ""}`);
    if (errores.length) fallos.push(`${pantalla.nombre} ${ruta}: ${errores.join(" | ")}`);
    await pagina.close();
  }
  await contexto.close();
}
await navegador.close();
if (fallos.length) {
  console.error(`\n${fallos.length} problema(s):\n- ${fallos.join("\n- ")}`);
  process.exit(1);
}
console.log("\nTodo bien.");
