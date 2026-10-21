/**
 * Generador de Posters y Share Cards vía HTML5 Canvas
 */
const CanvasPoster = {
  generateSmartPoster(title) {
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 550;
    const ctx = canvas.getContext("2d");

    const grad = ctx.createLinearGradient(0, 0, 400, 550);
    grad.addColorStop(0, "#1e1b4b");
    grad.addColorStop(0.5, "#312e81");
    grad.addColorStop(1, "#0f172a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 400, 550);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 12;
    ctx.strokeRect(10, 10, 380, 530);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 26px 'Outfit', sans-serif";
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

    ctx.fillStyle = "#818cf8";
    ctx.font = "bold 12px 'Plus Jakarta Sans', sans-serif";
    ctx.fillText("GAME VAULT COLLECTION", 200, 490);

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
    bgGrad.addColorStop(0, "#080c1a");
    bgGrad.addColorStop(0.5, "#0b1227");
    bgGrad.addColorStop(1, "#060914");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    const radGrad = ctx.createRadialGradient(width / 2, 80, 50, width / 2, 80, 500);
    radGrad.addColorStop(0, "rgba(99, 102, 241, 0.25)");
    radGrad.addColorStop(1, "transparent");
    ctx.fillStyle = radGrad;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "#ffffff";
    ctx.font = "900 28px 'Outfit', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`MY ALL-TIME TOP ${count} GAMES`, 50, 55);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "600 12px 'Plus Jakarta Sans', sans-serif";
    ctx.fillText("Game Vault • Personal Hall of Fame", 50, 75);

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

      ctx.fillStyle = "#fbbf24";
      ctx.font = "bold 10px 'Plus Jakarta Sans', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`★ ${g.rating.toFixed(1)}`, x + cardWidth - 27, y + 22);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 13px 'Outfit', sans-serif";
      ctx.textAlign = "left";
      const displayTitle = g.title.length > 18 ? g.title.slice(0, 16) + "..." : g.title;
      ctx.fillText(displayTitle, x, y + cardHeight + 18);

      ctx.fillStyle = "#818cf8";
      ctx.font = "bold 11px 'Plus Jakarta Sans', sans-serif";
      const platformText = (g.platforms && g.platforms[0]) ? g.platforms[0] : "PC";
      ctx.fillText(`#${i + 1} • ${platformText}`, x, y + cardHeight + 32);
    }
  },

  async drawSingleGameCard(canvas, game) {
    canvas.width = 1080;
    canvas.height = 1080;
    const ctx = canvas.getContext("2d");

    const bgGrad = ctx.createLinearGradient(0, 0, 1080, 1080);
    bgGrad.addColorStop(0, "#080c1a");
    bgGrad.addColorStop(0.5, "#0d142b");
    bgGrad.addColorStop(1, "#05070f");
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

    ctx.fillStyle = "rgba(99, 102, 241, 0.25)";
    ctx.beginPath();
    ctx.roundRect(textX, 160, 160, 34, 10);
    ctx.fill();
    ctx.strokeStyle = "rgba(129, 140, 248, 0.5)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "#c7d2fe";
    ctx.font = "bold 13px 'Plus Jakarta Sans', sans-serif";
    ctx.textAlign = "center";
    const statusText = game.status === "platinum" ? "🏆 100% PLATINO" :
                       game.status === "playing" ? "🔥 JUGANDO" : "✅ COMPLETADO";
    ctx.fillText(statusText, textX + 80, 182);

    ctx.fillStyle = "#ffffff";
    ctx.font = "900 38px 'Outfit', sans-serif";
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

    ctx.fillStyle = "#fbbf24";
    ctx.font = "900 44px 'Outfit', sans-serif";
    ctx.fillText(`★ ${game.rating.toFixed(1)}`, textX, titleY + 65);
    ctx.fillStyle = "#64748b";
    ctx.font = "bold 18px 'Plus Jakarta Sans', sans-serif";
    ctx.fillText("/ 10", textX + 130, titleY + 65);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "600 16px 'Plus Jakarta Sans', sans-serif";
    const metaInfo = `${(game.platforms || []).join(", ")} • ${game.hours || 0} horas dedicadas`;
    ctx.fillText(metaInfo, textX, titleY + 110);

    if (game.notes) {
      ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
      ctx.beginPath();
      ctx.roundRect(80, 740, 920, 220, 20);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.stroke();

      ctx.fillStyle = "#cbd5e1";
      ctx.font = "italic 20px 'Plus Jakarta Sans', sans-serif";
      
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

    ctx.fillStyle = "#6366f1";
    ctx.font = "900 16px 'Outfit', sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("GAME VAULT • PLAYER STATION", 1000, 1010);
  }
};