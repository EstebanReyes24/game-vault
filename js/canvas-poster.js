/**
 * Imágenes para compartir (Canvas): tarjeta de un juego, Top 5/10 y Wrapped.
 * Formatos pensados para el celular: 1080×1350 (publicación) y 1080×1920 (historia).
 * Todas comparten la identidad Paindex: fondo noche, brillo rojo y la P con ojos.
 */
const CanvasPoster = {
  C: {
    noche: "#14111a", carbon: "#1e1a25", grafito: "#29232f", ceniza: "#40384a",
    niebla: "#b6adbb", hueso: "#ece7ee", senal: "#ff2a48", vino: "#8c0f24", oro: "#e2b65c"
  },
  DISPLAY: "'Big Shoulders Display', 'Archivo', sans-serif",
  TEXTO: "'Archivo', system-ui, sans-serif",
  usuario: null, // lo fija app.js con el nombre del estante que se está viendo

  ESTADOS: {
    platinum: "Platinado", playing: "Jugando", extras: "Campaña + extras",
    onhold: "En pausa", backlog: "Pendiente", completed: "Pasado"
  },

  ratingText(game) {
    const r = game ? game.rating : null;
    return r === null || r === undefined || !Number.isFinite(Number(r)) || Number(r) <= 0 ? "—" : Number(r).toFixed(1);
  },

  async fuentes() {
    if (!document.fonts || !document.fonts.load) return;
    try {
      await Promise.all([
        document.fonts.load(`900 64px 'Big Shoulders Display'`),
        document.fonts.load(`800 64px 'Big Shoulders Display'`),
        document.fonts.load(`400 24px 'Archivo'`),
        document.fonts.load(`700 24px 'Archivo'`)
      ]);
    } catch (e) { /* si no cargan, se usa la del sistema */ }
  },

  // ---------- piezas comunes ----------
  fondo(ctx, w, h) {
    ctx.fillStyle = this.C.noche;
    ctx.fillRect(0, 0, w, h);
    this.luces(ctx, w, h);
  },

  luces(ctx, w, h) {
    const luz = ctx.createRadialGradient(w * 0.7, -h * 0.05, 0, w * 0.7, -h * 0.05, w * 0.9);
    luz.addColorStop(0, "rgba(236, 231, 238, 0.07)");
    luz.addColorStop(1, "rgba(236, 231, 238, 0)");
    ctx.fillStyle = luz;
    ctx.fillRect(0, 0, w, h);
    const rojo = ctx.createRadialGradient(w / 2, h * 1.08, 0, w / 2, h * 1.08, w * 0.95);
    rojo.addColorStop(0, "rgba(170, 20, 46, 0.55)");
    rojo.addColorStop(1, "rgba(170, 20, 46, 0)");
    ctx.fillStyle = rojo;
    ctx.fillRect(0, 0, w, h);
  },

  marca(ctx, x, y, tam) {
    const s = tam / 64;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.strokeStyle = this.C.hueso;
    ctx.lineWidth = 6.5;
    ctx.stroke(new Path2D("M15 58V9h18a19 19 0 0 1 0 38H15"));
    ctx.fillStyle = this.C.senal;
    ctx.fill(new Path2D("M21 23.5l10 3.6v3.6l-10-3.6z"));
    ctx.fill(new Path2D("M46 23.5l-10 3.6v3.6l10-3.6z"));
    ctx.restore();
  },

  pie(ctx, w, h) {
    const y = h - 92;
    ctx.fillStyle = "rgba(236, 231, 238, 0.12)";
    ctx.fillRect(70, y - 30, w - 140, 2);
    this.marca(ctx, 70, y - 8, 52);
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillStyle = this.C.hueso;
    ctx.font = `900 34px ${this.DISPLAY}`;
    ctx.fillText("PAINDEX VAULT", 136, y + 18);
    if (this.usuario) {
      ctx.textAlign = "right";
      ctx.fillStyle = this.C.niebla;
      ctx.font = `500 26px ${this.TEXTO}`;
      ctx.fillText(`${location.host}/u/${this.usuario}`, w - 70, y + 18);
    }
    ctx.textBaseline = "alphabetic";
  },

  /** Parte un texto en líneas que caben en maxW; corta con "…" si sobra. */
  lineas(ctx, texto, maxW, maxLineas) {
    const palabras = String(texto || "").split(/\s+/).filter(Boolean);
    const out = [];
    let linea = "";
    for (const p of palabras) {
      const prueba = linea ? `${linea} ${p}` : p;
      if (ctx.measureText(prueba).width <= maxW || !linea) linea = prueba;
      else { out.push(linea); linea = p; }
    }
    if (linea) out.push(linea);
    if (out.length > maxLineas) {
      const cortadas = out.slice(0, maxLineas);
      let ultima = cortadas[maxLineas - 1];
      while (ctx.measureText(ultima + "…").width > maxW && ultima.length > 1) ultima = ultima.slice(0, -1);
      cortadas[maxLineas - 1] = ultima.trimEnd() + "…";
      return cortadas;
    }
    return out;
  },

  tapa(ctx, img, x, y, w, h, radio = 18) {
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 18;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radio);
    ctx.fillStyle = this.C.grafito;
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radio);
    ctx.clip();
    // recorte tipo "cover" para no deformar portadas apaisadas
    const ratio = Math.max(w / img.width, h / img.height);
    const iw = img.width * ratio, ih = img.height * ratio;
    ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
    ctx.restore();
    ctx.strokeStyle = "rgba(236, 231, 238, 0.18)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radio);
    ctx.stroke();
  },

  nota(ctx, texto, x, y, tam) {
    ctx.font = `900 ${tam}px ${this.DISPLAY}`;
    const ancho = ctx.measureText(texto).width + tam * 0.5;
    const alto = tam * 1.12;
    ctx.fillStyle = this.C.hueso;
    ctx.beginPath();
    ctx.roundRect(x, y, ancho, alto, tam * 0.18);
    ctx.fill();
    ctx.fillStyle = "#c4102e";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText(texto, x + tam * 0.25, y + alto / 2 + tam * 0.04);
    ctx.textBaseline = "alphabetic";
    return ancho;
  },

  generateSmartPoster(title) {
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 550;
    const ctx = canvas.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, 400, 550);
    grad.addColorStop(0, this.C.grafito);
    grad.addColorStop(1, "#3a0a16");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 400, 550);
    this.marca(ctx, 168, 60, 64);
    ctx.fillStyle = this.C.hueso;
    ctx.font = `900 40px ${this.DISPLAY}`;
    ctx.textAlign = "center";
    const ls = this.lineas(ctx, String(title || "").toUpperCase(), 330, 4);
    const y0 = 300 - (ls.length - 1) * 22;
    ls.forEach((l, i) => ctx.fillText(l, 200, y0 + i * 44));
    return canvas.toDataURL("image/png");
  },

  loadImage(src, fallbackTitle) {
    return new Promise((resolve) => {
      const respaldo = () => {
        const fb = new Image();
        fb.onload = () => resolve(fb);
        fb.src = this.generateSmartPoster(fallbackTitle);
      };
      if (!src) return respaldo();
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = respaldo;
      img.src = src;
    });
  },

  // ---------- tarjeta de un juego (1080×1350) ----------
  async drawSingleGameCard(canvas, game) {
    await this.fuentes();
    const W = 1080, H = 1350;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    const img = await this.loadImage(game.coverUrl, game.title);

    // la portada desenfocada tiñe la parte de arriba
    ctx.fillStyle = this.C.noche;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.filter = "blur(60px)";
    ctx.globalAlpha = 0.35;
    ctx.drawImage(img, -100, -150, W + 200, 900);
    ctx.restore();
    const velo = ctx.createLinearGradient(0, 250, 0, 860);
    velo.addColorStop(0, "rgba(20, 17, 26, 0)");
    velo.addColorStop(1, this.C.noche);
    ctx.fillStyle = velo;
    ctx.fillRect(0, 250, W, 610);
    ctx.fillStyle = this.C.noche;
    ctx.fillRect(0, 860, W, H - 860);
    this.luces(ctx, W, H); // el brillo rojo va encima para que no quede un corte

    const tw = 440, th = 587, tx = 70, ty = 80;
    this.tapa(ctx, img, tx, ty, tw, th, 22);

    // a la derecha de la portada: estado, nota y horas
    const dx = tx + tw + 56, dw = W - dx - 70;
    ctx.fillStyle = this.C.niebla;
    ctx.font = `600 30px ${this.TEXTO}`;
    ctx.textAlign = "left";
    ctx.fillText(this.ESTADOS[game.status] || "Pasado", dx, ty + 34);
    const nt = this.ratingText(game);
    if (nt !== "—") {
      this.nota(ctx, nt, dx, ty + 70, 150);
      ctx.fillStyle = this.C.niebla;
      ctx.font = `600 28px ${this.TEXTO}`;
      ctx.fillText("de 10", dx, ty + 70 + 168 + 36);
    }
    ctx.fillStyle = this.C.hueso;
    ctx.font = `800 64px ${this.DISPLAY}`;
    ctx.fillText(`${Number(game.hours || 0).toLocaleString("es")} h`, dx, ty + th - 70);
    ctx.fillStyle = this.C.niebla;
    ctx.font = `500 26px ${this.TEXTO}`;
    const plataformas = (game.platforms || []).join(" · ");
    this.lineas(ctx, plataformas || "jugadas", dw, 2).forEach((l, i) => ctx.fillText(l, dx, ty + th - 30 + i * 32));

    // título
    ctx.fillStyle = this.C.hueso;
    ctx.font = `900 96px ${this.DISPLAY}`;
    const titulo = this.lineas(ctx, game.title.toUpperCase(), W - 140, 2);
    let y = ty + th + 120;
    titulo.forEach((l, i) => ctx.fillText(l, 70, y + i * 90));
    y += (titulo.length - 1) * 90;

    // opinión (si la hay)
    if (game.notes) {
      ctx.fillStyle = this.C.senal;
      ctx.fillRect(70, y + 44, 6, 1);
      ctx.font = `400 32px ${this.TEXTO}`;
      const op = this.lineas(ctx, `“${game.notes}”`, W - 170, H - 92 - 60 - (y + 70) > 120 ? 3 : 2);
      ctx.fillStyle = this.C.senal;
      ctx.fillRect(70, y + 52, 6, op.length * 44 - 8);
      ctx.fillStyle = this.C.niebla;
      op.forEach((l, i) => ctx.fillText(l, 100, y + 84 + i * 44));
    }
    this.pie(ctx, W, H);
  },

  // ---------- Top 5 (1080×1350) / Top 10 (1080×1920) ----------
  async drawTopPoster(canvas, games, count = 5) {
    await this.fuentes();
    const items = games.slice(0, count);
    const W = 1080, H = count === 10 ? 1920 : 1350;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    this.fondo(ctx, W, H);

    ctx.textAlign = "left";
    ctx.fillStyle = this.C.hueso;
    ctx.font = `900 150px ${this.DISPLAY}`;
    ctx.fillText(`MI TOP ${count}`, 64, 190);
    ctx.fillStyle = this.C.niebla;
    ctx.font = `500 32px ${this.TEXTO}`;
    ctx.fillText(this.usuario ? `Los mejor puntuados de @${this.usuario}` : "Mis juegos mejor puntuados", 70, 245);

    const top = 300, bajo = H - 150;
    const fila = (bajo - top) / count;
    const th = Math.min(fila - 22, 200), tw = th * 0.75;
    const imgs = await Promise.all(items.map(g => this.loadImage(g.coverUrl, g.title)));

    items.forEach((g, i) => {
      const y = top + i * fila + (fila - th) / 2;
      // número
      ctx.fillStyle = i === 0 ? this.C.senal : "rgba(236, 231, 238, 0.28)";
      ctx.font = `900 ${Math.round(th * 0.62)}px ${this.DISPLAY}`;
      ctx.textAlign = "right";
      ctx.fillText(String(i + 1), 64 + th * 0.55, y + th * 0.72);
      ctx.textAlign = "left";
      const tx = 64 + th * 0.55 + 28;
      this.tapa(ctx, imgs[i], tx, y, tw, th, 12);
      // título y datos
      const dx = tx + tw + 32;
      const notaAncho = 150;
      ctx.fillStyle = this.C.hueso;
      ctx.font = `800 ${Math.round(th * 0.25)}px ${this.DISPLAY}`;
      const ls = this.lineas(ctx, g.title.toUpperCase(), W - dx - notaAncho - 70, 2);
      const alto = th * 0.25;
      const y0 = y + th / 2 - (ls.length * alto * 1.02) / 2 + alto * 0.8;
      ls.forEach((l, k) => ctx.fillText(l, dx, y0 + k * alto * 1.02));
      ctx.fillStyle = this.C.niebla;
      ctx.font = `500 ${Math.round(th * 0.13)}px ${this.TEXTO}`;
      const meta = [this.ESTADOS[g.status], g.hours ? `${g.hours} h` : null, (g.platforms || [])[0]].filter(Boolean).join(" · ");
      ctx.fillText(meta, dx, y0 + (ls.length - 1) * alto * 1.02 + th * 0.2);
      // nota
      const tam = Math.round(th * 0.3);
      ctx.font = `900 ${tam}px ${this.DISPLAY}`;
      const txt = this.ratingText(g);
      const ancho = ctx.measureText(txt).width + tam * 0.5;
      this.nota(ctx, txt, W - 70 - ancho, y + th / 2 - tam * 0.56, tam);
    });
    this.pie(ctx, W, H);
  },

  // ---------- Wrapped (historia 1080×1920) ----------
  async drawWrapped(canvas, d) {
    await this.fuentes();
    const W = 1080, H = 1920;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    this.fondo(ctx, W, H);
    ctx.textAlign = "left";

    ctx.fillStyle = this.C.niebla;
    ctx.font = `600 36px ${this.TEXTO}`;
    ctx.fillText(this.usuario ? `@${this.usuario} · Wrapped` : "Mi Wrapped", 70, 130);
    ctx.fillStyle = this.C.senal;
    ctx.font = `900 230px ${this.DISPLAY}`;
    ctx.fillText(d.periodo === "all" ? "TODO" : String(d.periodo), 62, 340);

    // horas: el número protagonista
    ctx.fillStyle = this.C.hueso;
    ctx.font = `900 300px ${this.DISPLAY}`;
    ctx.fillText(Number(d.horas).toLocaleString("es"), 58, 640);
    ctx.fillStyle = this.C.niebla;
    ctx.font = `600 40px ${this.TEXTO}`;
    ctx.fillText("horas jugadas", 70, 700);

    // cifras
    const cifras = [[d.juegos, "juegos"], [d.pasados, "pasados"], [d.platinos, "platinos"]];
    cifras.forEach(([n, l], i) => {
      const x = 70 + i * 320;
      ctx.fillStyle = this.C.hueso;
      ctx.font = `800 110px ${this.DISPLAY}`;
      ctx.fillText(Number(n).toLocaleString("es"), x, 870);
      ctx.fillStyle = this.C.niebla;
      ctx.font = `500 32px ${this.TEXTO}`;
      ctx.fillText(l, x + 4, 915);
    });

    // dos destacados con portada
    const destacados = [
      d.mejor && { etiqueta: "Mejor puntuado", juego: d.mejor, dato: this.ratingText(d.mejor), esNota: true },
      d.masJugado && { etiqueta: "Más horas", juego: d.masJugado, dato: `${d.masJugado.hours || 0} h`, esNota: false }
    ].filter(Boolean);
    const imgs = await Promise.all(destacados.map(x => this.loadImage(x.juego.coverUrl, x.juego.title)));
    destacados.forEach((x, i) => {
      const y = 980 + i * 335;
      const th = 300, tw = 225;
      this.tapa(ctx, imgs[i], 70, y, tw, th, 16);
      const dx = 70 + tw + 44;
      ctx.fillStyle = this.C.niebla;
      ctx.font = `600 32px ${this.TEXTO}`;
      ctx.fillText(x.etiqueta, dx, y + 50);
      ctx.fillStyle = this.C.hueso;
      ctx.font = `900 72px ${this.DISPLAY}`;
      const ls = this.lineas(ctx, x.juego.title.toUpperCase(), W - dx - 70, 2);
      ls.forEach((l, k) => ctx.fillText(l, dx, y + 130 + k * 70));
      const yDato = y + 130 + (ls.length - 1) * 70 + 40;
      if (x.esNota && x.dato !== "—") this.nota(ctx, x.dato, dx, yDato, 70);
      else {
        ctx.fillStyle = this.C.senal;
        ctx.font = `900 80px ${this.DISPLAY}`;
        ctx.fillText(x.dato, dx, yDato + 70);
      }
    });

    // etiquetas favoritas
    if (d.tags && d.tags.length) {
      let x = 70, y = 1745;
      ctx.font = `600 30px ${this.TEXTO}`;
      for (const t of d.tags.slice(0, 5)) {
        const txt = String(t).startsWith("#") ? t : `#${t}`;
        const w = ctx.measureText(txt).width + 44;
        if (x + w > W - 70) break;
        ctx.fillStyle = "rgba(236, 231, 238, 0.10)";
        ctx.beginPath();
        ctx.roundRect(x, y - 44, w, 62, 31);
        ctx.fill();
        ctx.fillStyle = this.C.hueso;
        ctx.fillText(txt, x + 22, y);
        x += w + 14;
      }
    }
    this.pie(ctx, W, H);
  }
};

/** Comparte la imagen (menú del celular) o la descarga si el navegador no puede. */
async function compartirCanvas(canvas, nombre, texto) {
  const blob = await new Promise(r => canvas.toBlob(r, "image/png"));
  if (!blob) return;
  const archivo = new File([blob], `${nombre}.png`, { type: "image/png" });
  try {
    if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
      await navigator.share({ files: [archivo], text: texto || "" });
      return;
    }
  } catch (e) {
    if (e && e.name === "AbortError") return; // la persona cerró el menú
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nombre}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
