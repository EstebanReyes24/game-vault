/*
 * Paleta Paindex para Tailwind (CDN).
 * Se carga justo después de cdn.tailwindcss.com en todas las páginas.
 *
 * En vez de reescribir miles de clases, se redefinen las escalas que usa
 * el código: `indigo` y `rose` pasan a ser el rojo señal de Paindex,
 * `purple` el vino oscuro y `slate` unos grises cálidos sacados del logo.
 * Así el HTML y el que genera el JS cambian de identidad a la vez.
 */
(function () {
  var senal = {
    50: "#fff1f3", 100: "#ffe0e5", 200: "#ffc2cc", 300: "#ff94a5", 400: "#ff5a72",
    500: "#ff2a48", 600: "#e6163a", 700: "#bf0d2e", 800: "#8c0f24", 900: "#5c0b19", 950: "#33050d"
  };
  var vino = {
    50: "#fbf0f3", 100: "#f5dbe2", 200: "#ebb5c3", 300: "#dc8399", 400: "#c75572",
    500: "#a8324f", 600: "#8c1f3a", 700: "#70172e", 800: "#521123", 900: "#380b18", 950: "#22060e"
  };
  var ceniza = {
    50: "#f7f4f8", 100: "#ece7ee", 200: "#d9d2dc", 300: "#bdb4c1", 400: "#9b919f",
    500: "#7a7080", 600: "#5a5160", 700: "#3a3240", 800: "#241e28", 900: "#16121a", 950: "#0d0a10"
  };

  window.tailwind = window.tailwind || {};
  window.tailwind.config = {
    theme: {
      extend: {
        colors: {
          indigo: senal,
          rose: senal,
          purple: vino,
          orange: senal,
          violet: vino,
          slate: ceniza,
          gray: ceniza,
          noche: "#07060a",
          carbon: "#120f15",
          grafito: "#1d1820",
          hueso: "#ece7ee",
          senal: "#ff2a48"
        },
        fontFamily: {
          sans: ["Archivo", "system-ui", "sans-serif"],
          display: ["'Big Shoulders Display'", "Archivo", "sans-serif"]
        }
      }
    }
  };
})();
