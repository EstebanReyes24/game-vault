/**
 * Generador de Posters y Share Cards vía HTML5 Canvas
 */
const CanvasPoster = {
  ratingText(game) {
    const r = game ? game.rating : null;
    return r === null || r === undefined || !Number.isFinite(Number(r)) ? "—" : Number(r).toFixed(1);
  },

  generateSmartPoster(title) {
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 550;
    const ctx = canvas.getContext("2d");

    const grad = ctx.createLinearGradient(0, 0, 400, 550);
    grad.addColorStop(0, "#1d1820");
    grad.addColorStop(0.5, "#5c0b19");
    grad.addColorStop(1, "#07060a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 400, 550);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 12;
    ctx.strokeRect(10, 10, 380, 530);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 26px 'Big Shoulders Display', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const words = title.split(" ");
    let line = "";
    let y = 260 - (Math.min(words.length, 3) * 15);
    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + " ";
      if (testLine.length > 18 && n > 0) {
        ctx.fillText(line.trim(), 200, y);
        line = words[n] + " ";
        y += 34;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line.trim(), 200, y);

    ctx.fillStyle = "#ff5a72";
    ctx.font = "bold 12px 'Archivo', sans-serif";
    ctx.fillText("PAINDEX VAULT", 200, 490);

    return canvas.toDataURL("image/png");
  },

  loadImage(src, fallbackTitle) {
    return new Promise((resolve) => {
      if (!src) {
        const fb = new Image();
        fb.src = this.generateSmartPoster(fallbackTitle);
        fb.onload = () => resolve(fb);
        return;
      }

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = src;

      img.onload = () => resolve(img);
      img.onerror = () => {
        const fb = new Image();
        fb.src = this.generateSmartPoster(fallbackTitle);
        fb.onload = () => resolve(fb);
      };
    });
  },

  async drawTopPoster(canvas, games, count = 5) {
    const isTop10 = count === 10;
    const width = 1000;
    const height = isTop10 ? 680 : 440;
    
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    bgGrad.addColorStop(0, "#07060a");
    bgGrad.addColorStop(0.5, "#120f15");
    bgGrad.addColorStop(1, "#07060a");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    const radGrad = ctx.createRadialGradient(width / 2, 80, 50, width / 2, 80, 500);
    radGrad.addColorStop(0, "rgba(255, 42, 72, 0.22)");
    radGrad.addColorStop(1, "transparent");
    ctx.fillStyle = radGrad;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "#ffffff";
    ctx.font = "900 28px 'Big Shoulders Display', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`MY ALL-TIME TOP ${count} GAMES`, 50, 55);

    ctx.fillStyle = "#9b919f";
    ctx.font = "600 12px 'Archivo', sans-serif";
    ctx.fillText("Paindex Vault · Mi top", 50, 75);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 1;
    ctx.strokeRect(20, 20, width - 40, height - 40);

    const items = games.slice(0, count);
    const cardWidth = 160;
    const cardHeight = 225;
    const gapX = 22;
    const startX = 50;

    for (let i = 0; i < items.length; i++) {
      const g = items[i];
      const col = i % 5;
      const row = Math.floor(i / 5);

      const x = startX + col * (cardWidth + gapX);
      const y = isTop10 ? 110 + row * (cardHeight + 45) : 115;

      const img = await this.loadImage(g.coverUrl, g.title);

      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.7)";
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 8;

      ctx.beginPath();
      ctx.roundRect(x, y, cardWidth, cardHeight, 14);
      ctx.clip();
      ctx.drawImage(img, x, y, cardWidth, cardHeight);
      ctx.restore();

      ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, cardWidth, cardHeight);

      ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
      ctx.beginPath();
      ctx.roundRect(x + cardWidth - 48, y + 8, 42, 20, 6);
      ctx.fill();

      ctx.fillStyle = "#e2b65c";
      ctx.font = "bold 10px 'Archivo', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`★ ${this.ratingText(g)}`, x + cardWidth - 27, y + 22);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 13px 'Big Shoulders Display', sans-serif";
      ctx.textAlign = "left";
      const displayTitle = g.title.length > 18 ? g.title.slice(0, 16) + "..." : g.title;
      ctx.fillText(displayTitle, x, y + cardHeight + 18);

      ctx.fillStyle = "#ff5a72";
      ctx.font = "bold 11px 'Archivo', sans-serif";
      const platformText = (g.platforms && g.platforms[0]) ? g.platforms[0] : "PC";
      ctx.fillText(`#${i + 1} • ${platformText}`, x, y + cardHeight + 32);
    }
  },

  async drawSingleGameCard(canvas, game) {
    canvas.width = 1080;
    canvas.height = 1080;
    const ctx = canvas.getContext("2d");

    const bgGrad = ctx.createLinearGradient(0, 0, 1080, 1080);
    bgGrad.addColorStop(0, "#07060a");
    bgGrad.addColorStop(0.5, "#16121a");
    bgGrad.addColorStop(1, "#07060a");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 1080, 1080);

    const img = await this.loadImage(game.coverUrl, game.title);

    ctx.save();
    ctx.filter = "blur(40px)";
    ctx.globalAlpha = 0.35;
    ctx.drawImage(img, 0, 0, 1080, 1080);
    ctx.restore();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.lineWidth = 2;
    ctx.strokeRect(30, 30, 1020, 1020);

    const posterW = 380;
    const posterH = 540;
    const posterX = 80;
    const posterY = 160;

    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 15;
    ctx.beginPath();
    ctx.roundRect(posterX, posterY, posterW, posterH, 24);
    ctx.clip();
    ctx.drawImage(img, posterX, posterY, posterW, posterH);
    ctx.restore();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(posterX, posterY, posterW, posterH, 24);
    ctx.stroke();

    const textX = 510;

    ctx.fillStyle = "rgba(255, 42, 72, 0.22)";
    ctx.beginPath();
    ctx.roundRect(textX, 160, 160, 34, 10);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 42, 72, 0.55)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "#ffc2cc";
    ctx.font = "bold 13px 'Archivo', sans-serif";
    ctx.textAlign = "center";
    const statusTexts = {
      platinum: "🏆 100% PLATINO",
      playing: "🔥 JUGANDO",
      extras: "⭐ CAMPAÑA + EXTRAS",
      onhold: "⏸ EN PAUSA",
      backlog: "📥 PENDIENTE"
    };
    const statusText = statusTexts[game.status] || "✅ COMPLETADO";
    ctx.fillText(statusText, textX + 80, 182);

    ctx.fillStyle = "#ffffff";
    ctx.font = "900 38px 'Big Shoulders Display', sans-serif";
    ctx.textAlign = "left";
    
    const titleWords = game.title.split(" ");
    let titleLine = "";
    let titleY = 240;
    for (let w = 0; w < titleWords.length; w++) {
      const test = titleLine + titleWords[w] + " ";
      if (test.length > 18 && w > 0) {
        ctx.fillText(titleLine.trim(), textX, titleY);
        titleLine = titleWords[w] + " ";
        titleY += 45;
      } else {
        titleLine = test;
      }
    }
    ctx.fillText(titleLine.trim(), textX, titleY);

    ctx.fillStyle = "#e2b65c";
    ctx.font = "900 44px 'Big Shoulders Display', sans-serif";
    ctx.fillText(`★ ${this.ratingText(game)}`, textX, titleY + 65);
    ctx.fillStyle = "#7a7080";
    ctx.font = "bold 18px 'Archivo', sans-serif";
    ctx.fillText("/ 10", textX + 130, titleY + 65);

    ctx.fillStyle = "#9b919f";
    ctx.font = "600 16px 'Archivo', sans-serif";
    const metaInfo = `${(game.platforms || []).join(", ")} • ${game.hours || 0} horas dedicadas`;
    ctx.fillText(metaInfo, textX, titleY + 110);

    if (game.notes) {
      ctx.fillStyle = "rgba(18, 15, 21, 0.85)";
      ctx.beginPath();
      ctx.roundRect(80, 740, 920, 220, 20);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.stroke();

      ctx.fillStyle = "#d9d2dc";
      ctx.font = "italic 20px 'Archivo', sans-serif";
      
      const noteWords = `"${game.notes}"`.split(" ");
      let noteLine = "";
      let noteY = 795;
      for (let nw = 0; nw < noteWords.length; nw++) {
        const testN = noteLine + noteWords[nw] + " ";
        if (testN.length > 55 && nw > 0) {
          ctx.fillText(noteLine.trim(), 110, noteY);
          noteLine = noteWords[nw] + " ";
          noteY += 34;
        } else {
          noteLine = testN;
        }
      }
      ctx.fillText(noteLine.trim(), 110, noteY);
    }

    ctx.fillStyle = "#ff2a48";
    ctx.font = "900 16px 'Big Shoulders Display', sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("PAINDEX VAULT", 1000, 1010);
  }
};