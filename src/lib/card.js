// Post-show share card, 1080×1920 (Instagram story size), drawn on a canvas.
// Images load with CORS; any that can't (no CORS headers) are replaced by
// gradient tiles so the canvas never gets tainted and can always export.

export const CARD_W = 1080;
export const CARD_H = 1920;
const FONT = '-apple-system, "SF Pro Display", "Helvetica Neue", "PingFang SC", system-ui, sans-serif';
const ACCENT = '#ff3b5c';

function loadImage(src, timeout = 6000) {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    const t = setTimeout(() => resolve(null), timeout);
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      clearTimeout(t);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(t);
      resolve(null);
    };
    img.src = src;
  });
}

function drawCover(ctx, img, x, y, w, h) {
  const s = Math.max(w / img.width, h / img.height);
  const sw = w / s;
  const sh = h / s;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

function ellipsize(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

function hueTile(ctx, hue, x, y, w, h) {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, `hsl(${hue} 80% 55%)`);
  g.addColorStop(1, `hsl(${(hue + 50) % 360} 70% 25%)`);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

const hueOf = (str = '') => [...str].reduce((h, c) => (h * 31 + c.codePointAt(0)) >>> 0, 0) % 360;

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ title: string, eyebrow: string, subtitle?: string, hero?: string,
 *           songs: { title: string, artist?: string, cover?: string }[] }} card
 */
export async function renderCard(canvas, card) {
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  const songs = card.songs;
  const single = songs.length <= 12;

  const [hero, ...covers] = await Promise.all([
    loadImage(card.hero),
    ...(single ? songs.map((s) => loadImage(s.cover)) : []),
  ]);

  // backdrop
  ctx.fillStyle = '#07070a';
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  const HERO_H = 1180;
  if (hero) drawCover(ctx, hero, 0, 0, CARD_W, HERO_H);
  else {
    const h = hueOf(card.title);
    const g = ctx.createRadialGradient(280, 300, 50, 400, 500, 1100);
    g.addColorStop(0, `hsl(${h} 85% 55%)`);
    g.addColorStop(0.45, `hsl(${(h + 50) % 360} 70% 28%)`);
    g.addColorStop(1, '#07070a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CARD_W, HERO_H);
  }
  const fade = ctx.createLinearGradient(0, 380, 0, HERO_H);
  fade.addColorStop(0, 'rgba(7,7,10,0)');
  fade.addColorStop(0.55, 'rgba(7,7,10,0.75)');
  fade.addColorStop(1, '#07070a');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, CARD_W, HERO_H);
  const top = ctx.createLinearGradient(0, 0, 0, 220);
  top.addColorStop(0, 'rgba(0,0,0,0.35)');
  top.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, CARD_W, 220);

  const L = 72;
  const MAXW = CARD_W - L * 2;

  // title block
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = ACCENT;
  ctx.font = `800 34px ${FONT}`;
  ctx.letterSpacing = '4px';
  ctx.fillText(card.eyebrow.toUpperCase(), L, 930);
  ctx.letterSpacing = '0px';

  let size = 120;
  ctx.font = `800 ${size}px ${FONT}`;
  while (size > 60 && ctx.measureText(card.title).width > MAXW) {
    size -= 4;
    ctx.font = `800 ${size}px ${FONT}`;
  }
  ctx.fillStyle = '#fff';
  ctx.fillText(ellipsize(ctx, card.title, MAXW), L - 4, 930 + size * 1.02);
  let y = 930 + size * 1.02;
  if (card.subtitle) {
    ctx.font = `600 40px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    y += 64;
    ctx.fillText(ellipsize(ctx, card.subtitle, MAXW), L, y);
  }

  // setlist
  const listTop = Math.max(y + 70, 1170);
  const listBottom = 1790;
  const avail = listBottom - listTop;
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(L, listTop - 34);
  ctx.lineTo(CARD_W - L, listTop - 34);
  ctx.stroke();

  if (single) {
    const rowH = Math.min(96, avail / Math.max(songs.length, 1));
    const art = Math.round(rowH * 0.74);
    songs.forEach((s, i) => {
      const ry = listTop + i * rowH;
      const img = covers[i];
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(L, ry, art, art, art * 0.18);
      ctx.clip();
      if (img) drawCover(ctx, img, L, ry, art, art);
      else hueTile(ctx, hueOf(s.title), L, ry, art, art);
      ctx.restore();
      const tx = L + art + 26;
      const fs = Math.round(art * 0.48);
      ctx.font = `700 ${fs}px ${FONT}`;
      ctx.fillStyle = '#fff';
      ctx.fillText(ellipsize(ctx, s.title, CARD_W - L - tx), tx, ry + art * 0.52);
      if (s.artist && rowH >= 64) {
        ctx.font = `500 ${Math.round(fs * 0.68)}px ${FONT}`;
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillText(ellipsize(ctx, s.artist, CARD_W - L - tx), tx, ry + art * 0.94);
      }
    });
  } else {
    const rows = Math.ceil(songs.length / 2);
    const rowH = avail / rows;
    const fs = Math.max(18, Math.min(34, Math.round(rowH * 0.62)));
    const colW = (MAXW - 40) / 2;
    songs.forEach((s, i) => {
      const col = i < rows ? 0 : 1;
      const row = col ? i - rows : i;
      const x = L + col * (colW + 40);
      const ry = listTop + row * rowH + fs;
      ctx.font = `700 ${Math.round(fs * 0.8)}px ${FONT}`;
      ctx.fillStyle = ACCENT;
      const num = String(i + 1).padStart(2, '0');
      ctx.fillText(num, x, ry);
      const nx = x + ctx.measureText('00').width + 16;
      ctx.font = `600 ${fs}px ${FONT}`;
      ctx.fillStyle = '#fff';
      ctx.fillText(ellipsize(ctx, s.title, colW - (nx - x)), nx, ry);
    });
  }

  // footer
  ctx.font = `800 26px ${FONT}`;
  ctx.letterSpacing = '5px';
  ctx.fillStyle = ACCENT;
  ctx.fillText('LYRICS LIVE', L, 1862);
  ctx.letterSpacing = '0px';
  ctx.font = `600 28px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  const count = `${songs.length} 首`;
  ctx.fillText(count, CARD_W - L - ctx.measureText(count).width, 1862);
}

export function canvasToFile(canvas, name) {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(new File([b], name, { type: 'image/png' })) : reject(new Error('toBlob'))), 'image/png')
  );
}

// iOS: the share sheet has "Save Image"; elsewhere, download.
export async function saveFile(file) {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
