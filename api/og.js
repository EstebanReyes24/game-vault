/**
 * Imagen de vista previa (1200×630) de un perfil público: /api/og?u=nombre
 * Se genera al vuelo con @vercel/og y se cachea en el CDN de Vercel.
 */
import { ImageResponse } from "@vercel/og";
import { perfilPublico } from "./_supabase.js";

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
const h = (type, style, ...children) => ({ type, props: { style: { display: "flex", ...style }, children: children.flat().filter(c => c !== null && c !== undefined && c !== false) } });
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

export default async function handler(req) {
  const u = new URL(req.url).searchParams.get("u");
  let p = null;
  try { p = await perfilPublico(u); } catch (e) { p = null; }

  const debug = new URL(req.url).searchParams.has("debug");
  let fuentes = [];
  try {
    const [display, texto] = await Promise.all([fuente("Big+Shoulders+Display", 900), fuente("Archivo", 600)]);
    fuentes = [{ name: "Display", data: display, weight: 900 }, { name: "Texto", data: texto, weight: 600 }];
  } catch (e) {
    if (debug) return new Response("fuentes: " + e.message, { status: 500 });
  }
  if (debug) return new Response(JSON.stringify({ perfil: p, fuentes: fuentes.map(f => [f.name, f.data.byteLength]) }), { headers: { "content-type": "application/json" } });

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
    ? h({ position: "relative", width: 440, height: "100%", alignItems: "center", justifyContent: "center" },
        ...p.top.slice(0, 3).reverse().map((t, i, arr) => {
          const pos = arr.length - 1 - i; // 0 = la de enfrente
          const giro = [0, 8, -8][pos], dx = [0, 120, -120][pos], esc = [1, 0.86, 0.86][pos];
          return h({
            position: "absolute", width: 250, height: 333, borderRadius: 14, overflow: "hidden",
            transform: `translateX(${dx}px) rotate(${giro}deg) scale(${esc})`,
            boxShadow: "0 30px 60px rgba(0,0,0,0.6)", border: `2px solid rgba(236,231,238,${pos ? 0.12 : 0.25})`
          }, img(t.portada, 250, 333, { width: 250, height: 333, objectFit: "cover", opacity: pos ? 0.8 : 1 }));
        }),
        h({ position: "absolute", bottom: 30, right: 95, background: HUESO, color: "#c4102e", borderRadius: 10, padding: "6px 14px", fontFamily: "Display", fontSize: 44 }, p.top[0].nota.toFixed(1))
      )
    : null;

  // ?nivel=1..4 permite aislar qué parte falla al renderizar (diagnóstico)
  const nivel = Number(new URL(req.url).searchParams.get("nivel") || 4);
  const fondo = nivel >= 4 ? { backgroundImage: `radial-gradient(circle at 85% 100%, rgba(160,20,44,0.55), transparent 55%)` } : {};
  const izq = nivel >= 2 ? izquierda : h({ color: HUESO, fontSize: 60 }, "prueba");
  return new ImageResponse(
    h({ width: "100%", height: "100%", padding: 64, justifyContent: "space-between", background: NOCHE, ...fondo },
      izq, nivel >= 3 ? tapas : null),
    {
      width: 1200, height: 630,
      fonts: fuentes.length ? fuentes : undefined,
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" }
    }
  );
}
