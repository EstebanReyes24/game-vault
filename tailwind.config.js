/**
 * Tailwind compilado (antes se generaba en el navegador con el CDN).
 * Vercel ejecuta `npm run build` al publicar y genera css/tw.css.
 *
 * La paleta Paindex redefine las escalas que usa el código: `indigo`, `rose`
 * y `orange` son el rojo señal, `purple`/`violet` el vino y `slate`/`gray`
 * los grises cálidos. Así el HTML y el JS no tienen que reescribirse.
 */
const senal = {
  50: "#fff1f3", 100: "#ffe0e5", 200: "#ffc2cc", 300: "#ff94a5", 400: "#ff5a72",
  500: "#ff2a48", 600: "#e6163a", 700: "#bf0d2e", 800: "#8c0f24", 900: "#5c0b19", 950: "#33050d"
};
const vino = {
  50: "#fbf0f3", 100: "#f5dbe2", 200: "#ebb5c3", 300: "#dc8399", 400: "#c75572",
  500: "#a8324f", 600: "#8c1f3a", 700: "#70172e", 800: "#521123", 900: "#380b18", 950: "#22060e"
};
const ceniza = {
  50: "#f7f4f8", 100: "#ece7ee", 200: "#dcd5df", 300: "#c8c0cc", 400: "#b6adbb",
  500: "#968c9b", 600: "#6c6372", 700: "#40384a", 800: "#2b2532", 900: "#1e1a25", 950: "#16121c"
};

module.exports = {
  content: ["./*.html", "./js/**/*.js"],
  theme: {
    extend: {
      colors: {
        indigo: senal,
        rose: senal,
        orange: senal,
        purple: vino,
        violet: vino,
        slate: ceniza,
        gray: ceniza,
        noche: "#14111a",
        carbon: "#1e1a25",
        grafito: "#29232f",
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
