/**
 * Imagen de vista previa (1200×630) de un perfil público: /api/og?u=nombre
 * Se genera al vuelo con @vercel/og y se cachea en el CDN de Vercel.
 */
import { ImageResponse } from "@vercel/og";
import { perfilPublico, supa, usuarioValido } from "./_supabase.js";

export const config = { runtime: "edge" };

const NOCHE = "#14111a", CARBON = "#1e1a25", HUESO = "#ece7ee", NIEBLA = "#b6adbb", SENAL = "#ff2a48";

// Google Fonts devuelve TTF (lo que necesita @vercel/og) a navegadores antiguos
const UA_TTF = "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; en-us) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1";
async function fuente(familia, peso) {
  const css = await fetch(`https://fonts.googleapis.com/css2?family=${familia}:wght@${peso}`, { headers: { "User-Agent": UA_TTF } }).then(r => r.text());
  const url = css.match(/src:\s*url\(([^)]+)\)/)?.[1];
  if (!url) throw new Error("fuente no disponible: " + familia);
  return fetch(url).then(r => r.arrayBuffer());
}

// Pequeño ayudante para escribir el árbol sin JSX
const h = (style, ...children) => {
  const hijos = children.flat().filter(c => c !== null && c !== undefined && c !== false);
  return { type: "div", props: { style: { display: "flex", ...style }, children: hijos.length === 1 ? hijos[0] : hijos } };
};
const img = (src, w, h2, style) => ({ type: "img", props: { src, width: w, height: h2, style } });

// La P de Paindex con los ojos rojos
const marca = (tam) => ({
  type: "svg",
  props: {
    width: tam, height: tam, viewBox: "0 0 64 64",
    children: [
      { type: "path", props: { d: "M15 58V9h18a19 19 0 0 1 0 38H15", fill: "none", stroke: HUESO, strokeWidth: 6.5 } },
      { type: "path", props: { d: "M21 23.5l10 3.6v3.6l-10-3.6z", fill: SENAL } },
      { type: "path", props: { d: "M46 23.5l-10 3.6v3.6l10-3.6z", fill: SENAL } }
    ]
  }
});

// ---------- Comparar estantes: /api/og?a=uno&b=otro ----------
const claveOg = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "");
async function juegosDe(usuario) {
  if (!usuarioValido(usuario)) return null;
  const [p] = await supa(`profiles?select=id,username&username=eq.${String(usuario).toLowerCase()}&is_public=eq.true&limit=1`);
  if (!p) return null;
  const juegos = await supa(`games?select=title,rating,status,cover_url&user_id=eq.${p.id}`);
  return { usuario: p.username, juegos };
}
function compatibilidad(A, B) {
  const mb = new Map(B.map(g => [claveOg(g.title), g]));
  const comunes = A.filter(g => mb.has(claveOg(g.title))).map(g => [g, mb.get(claveOg(g.title))]);
  const conNota = comunes.filter(([x, y]) => Number(x.rating) > 0 && Number(y.rating) > 0);
  const dif = conNota.length ? conNota.reduce((t, [x, y]) => t + Math.abs(x.rating - y.rating), 0) / conNota.length : null;
  const acuerdo = dif === null ? 0.5 : Math.max(0, 1 - dif / 6);
  const solape = Math.min(1, comunes.length / Math.max(1, Math.min(A.length, B.length)));
  const peso = Math.min(1, conNota.length / 5);
  const c = Math.round(100 * (0.5 * Math.sqrt(solape) + 0.5 * (acuerdo * peso + 0.5 * (1 - peso))));
  return { compat: comunes.length ? c : Math.min(c, 10), comunes };
}

async function imagenComparar(a, b, fuentes) {
  const [A, B] = await Promise.all([juegosDe(a), juegosDe(b)]);
  if (!A || !B) return null;
  const { compat, comunes } = compatibilidad(A.juegos, B.juegos);
  const portadas = comunes.map(([x, y]) => x.cover_url || y.cover_url).filter(u => /^https:\/\//.test(u || "")).slice(0, 4);
  const nombre = (u) => h({ fontFamily: "Display", fontSize: u.length > 11 ? 60 : 76, color: HUESO, lineHeight: 1 }, `@${u}`);
  return new ImageResponse(
    h({ width: "100%", height: "100%", padding: 64, flexDirection: "column", justifyContent: "space-between", background: NOCHE, backgroundImage: "radial-gradient(circle at 50% 110%, rgba(160,20,44,0.6), transparent 60%)" },
      h({ alignItems: "center", gap: 16 }, marca(52), h({ fontFamily: "Display", fontSize: 36, color: HUESO }, "PAINDEX VAULT · COMPARAR ESTANTES")),
      h({ alignItems: "center", justifyContent: "space-between" },
        h({ flexDirection: "column", width: 380 }, nombre(A.usuario), h({ fontFamily: "Texto", fontSize: 26, color: NIEBLA, marginTop: 8 }, `${A.juegos.length} juegos`)),
        h({ width: 260, height: 260, borderRadius: 130, alignItems: "center", justifyContent: "center", flexDirection: "column", border: `14px solid ${SENAL}`, background: CARBON },
          h({ fontFamily: "Display", fontSize: 96, color: HUESO, lineHeight: 1 }, `${compat}%`),
          h({ fontFamily: "Texto", fontSize: 22, color: NIEBLA }, "compatibles")),
        h({ flexDirection: "column", width: 380, alignItems: "flex-end" }, nombre(B.usuario), h({ fontFamily: "Texto", fontSize: 26, color: NIEBLA, marginTop: 8 }, `${B.juegos.length} juegos`))
      ),
      h({ alignItems: "center", gap: 14 },
        ...portadas.map(u => img(u, 72, 96, { width: 72, height: 96, objectFit: "cover", borderRadius: 8 })),
        h({ fontFamily: "Texto", fontSize: 28, color: HUESO, marginLeft: portadas.length ? 10 : 0 }, `${comunes.length} ${comunes.length === 1 ? "juego" : "juegos"} en común`))
    ),
    { width: 1200, height: 630, fonts: fuentes.length ? fuentes : undefined, headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } }
  );
}

export default async function handler(req) {
  const params = new URL(req.url).searchParams;
  if (params.get("a") && params.get("b")) {
    let fuentes = [];
    try {
      const [display, texto] = await Promise.all([fuente("Big+Shoulders+Display", 900), fuente("Archivo", 600)]);
      fuentes = [{ name: "Display", data: display, weight: 900 }, { name: "Texto", data: texto, weight: 600 }];
    } catch (e) { /* tipografía por defecto */ }
    const imagen = await imagenComparar(params.get("a"), params.get("b"), fuentes).catch(() => null);
    if (imagen) return imagen;
  }
  const u = params.get("u");
  let p = null;
  try { p = await perfilPublico(u); } catch (e) { p = null; }

  let fuentes = [];
  try {
    const [display, texto] = await Promise.all([fuente("Big+Shoulders+Display", 900), fuente("Archivo", 600)]);
    fuentes = [{ name: "Display", data: display, weight: 900 }, { name: "Texto", data: texto, weight: 600 }];
  } catch (e) {
    console.error("og fuentes:", e.message); // sin fuentes propias usa la tipografía por defecto
  }

  const cifras = p ? [
    [p.juegos.toLocaleString("es"), "juegos"],
    [p.horas.toLocaleString("es"), "horas"],
    [p.media !== null ? p.media.toFixed(1) : "–", "nota media"]
  ] : [];

  const izquierda = h({ flexDirection: "column", justifyContent: "space-between", width: p && p.top.length ? 620 : 1040, height: "100%" },
    h({ alignItems: "center", gap: 16 }, marca(56), h({ fontFamily: "Display", fontSize: 40, color: HUESO, letterSpacing: 1 }, "PAINDEX VAULT")),
    h({ flexDirection: "column" },
      h({ fontFamily: "Display", fontSize: p && p.usuario.length > 12 ? 92 : 118, lineHeight: 0.95, color: HUESO }, p ? `@${p.usuario}` : "Tu estante de juegos"),
      h({ fontFamily: "Texto", fontSize: 30, color: NIEBLA, marginTop: 14 }, p ? "Estante público" : "Registra, puntúa y comparte lo que juegas")
    ),
    h({ gap: 44 }, ...cifras.map(([n, l]) =>
      h({ flexDirection: "column" },
        h({ fontFamily: "Display", fontSize: 72, color: HUESO, lineHeight: 1 }, n),
        h({ fontFamily: "Texto", fontSize: 24, color: NIEBLA, marginTop: 6 }, l)
      )))
  );

  const tapas = p && p.top.length
    ? h({ position: "relative", width: 470, height: "100%", alignItems: "center", justifyContent: "center" },
        ...p.top.slice(0, 3).reverse().map((t, i, arr) => {
          const pos = arr.length - 1 - i; // 0 = la de enfrente
          const giro = [0, 9, -9][pos], dx = [0, 140, -140][pos], esc = [1, 0.88, 0.88][pos];
          return h({
            position: "absolute", width: 300, height: 400, borderRadius: 16, overflow: "hidden",
            transform: `translateX(${dx}px) rotate(${giro}deg) scale(${esc})`,
            boxShadow: "0 30px 60px rgba(0,0,0,0.6)", border: `2px solid rgba(236,231,238,${pos ? 0.12 : 0.25})`
          }, img(t.portada, 300, 400, { width: 300, height: 400, objectFit: "cover", opacity: pos ? 0.8 : 1 }));
        }),
        h({ position: "absolute", bottom: 14, right: 70, background: HUESO, color: "#c4102e", borderRadius: 10, padding: "6px 14px", fontFamily: "Display", fontSize: 44 }, p.top[0].nota.toFixed(1))
      )
    : null;

  const fondo = { backgroundImage: `radial-gradient(circle at 85% 100%, rgba(160,20,44,0.55), transparent 55%)` };
  return new ImageResponse(
    h({ width: "100%", height: "100%", padding: 64, justifyContent: "space-between", background: NOCHE, ...fondo },
      izquierda, tapas),
    {
      width: 1200, height: 630,
      fonts: fuentes.length ? fuentes : undefined,
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" }
    }
  );
}
