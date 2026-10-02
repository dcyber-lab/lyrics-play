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

// object-fit: cover, with a vertical focus point (0 = top, 1 = bottom).
function drawCover(ctx, img, x, y, w, h, fy = 0.5) {
  const s = Math.max(w / img.width, h / img.height);
  const sw = w / s;
  const sh = h / s;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) * fy, sw, sh, x, y, w, h);
}

// The user's own photo as a small tilted instant-film print, tucked into
// the lower right where the artist photo has already faded out, so it never
// covers the artist or the album covers.
const PHOTO = { cx: 808, cy: 1010, w: 400, rot: 5 };
function drawPolaroid(ctx, img, fy, caption) {
  const pw = PHOTO.w;
  const pad = 22;
  const inner = pw - pad * 2;
  const ph = pad + inner + 78;
  ctx.save();
  ctx.translate(PHOTO.cx, PHOTO.cy);
  ctx.rotate((PHOTO.rot * Math.PI) / 180);
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 44;
  ctx.shadowOffsetY = 20;
  ctx.fillStyle = '#f6f4ef';
  ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
  ctx.shadowColor = 'transparent';
  drawCover(ctx, img, -pw / 2 + pad, -ph / 2 + pad, inner, inner, fy);
  if (caption) {
    ctx.fillStyle = '#3b3a38';
    ctx.font = `600 28px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(ellipsize(ctx, caption, inner), 0, ph / 2 - 30);
    ctx.textAlign = 'left';
  }
  ctx.restore();
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

// Album covers tiled across the hero: 3×3 with nine or more, else 2×2.
function drawMosaic(ctx, imgs, urls, seed) {
  const cols = urls.length >= 9 ? 3 : 2;
  const tile = CARD_W / cols;
  for (let i = 0; i < cols * cols; i++) {
    const x = (i % cols) * tile;
    const y = Math.floor(i / cols) * tile;
    const img = imgs[i % imgs.length];
    if (img) drawCover(ctx, img, x, y, tile, tile);
    else hueTile(ctx, hueOf(`${seed}${i}`), x, y, tile, tile);
  }
}

// Wrap into at most `max` lines. Prefer breaking at " · " separators (and
// drop the dot there, "Arena · 上海" -> "Arena" / "上海"), then at spaces.
function wrapLines(ctx, text, width, max) {
  const fits = (t) => ctx.measureText(t).width <= width;
  const pack = (tokens, sep) => {
    const out = [];
    let cur = '';
    for (const t of tokens) {
      const next = cur ? `${cur}${sep}${t}` : t;
      if (!cur || fits(next)) cur = next;
      else {
        out.push(cur);
        cur = t;
      }
    }
    if (cur) out.push(cur);
    return out;
  };
  const lines = pack(text.split(/\s*·\s*/), ' · ').flatMap((l) => (fits(l) ? [l] : pack(l.split(/\s+/), ' ')));
  if (lines.length > max) lines.splice(max - 1, lines.length, lines.slice(max - 1).join(' '));
  return lines.map((l) => ellipsize(ctx, l, width));
}

const hueOf = (str = '') => [...str].reduce((h, c) => (h * 31 + c.codePointAt(0)) >>> 0, 0) % 360;

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ title: string, eyebrow: string, subtitle?: string, hero?: string,
 *           heroMosaic?: string[], photo?: string, photoY?: number, caption?: string,
 *           songs: { title: string, artist?: string, cover?: string }[] }} card
 *   photo: the user's own picture (a local blob URL), shown as a small print
 *   in the lower right; the artist photo and covers stay fully visible.
 */
export async function renderCard(canvas, card) {
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  const songs = card.songs;
  const single = songs.length <= 12;

  const mosaicUrls = card.heroMosaic ?? [];
  const [hero, photo, mosaic, ...covers] = await Promise.all([
    loadImage(card.hero),
    loadImage(card.photo),
    Promise.all(mosaicUrls.map((u) => loadImage(u))),
    ...(single ? songs.map((s) => loadImage(s.cover)) : []),
  ]);

  // backdrop
  ctx.fillStyle = '#07070a';
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  const HERO_H = 1180;
  if (mosaicUrls.length) drawMosaic(ctx, mosaic, mosaicUrls, card.title);
  // faces sit in the upper part of artist photos; bias the crop upward
  else if (hero) drawCover(ctx, hero, 0, 0, CARD_W, HERO_H, 0.3);
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
  const FULLW = CARD_W - L * 2;
  // with a photo the title block keeps to the left of the print
  const MAXW = photo ? PHOTO.cx - PHOTO.w / 2 - 40 - L : FULLW;

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
    for (const line of wrapLines(ctx, card.subtitle, MAXW, photo ? 2 : 1)) {
      y += 58;
      ctx.fillText(line, L, y);
    }
  }

  // setlist
  const listTop = Math.max(y + 70, photo ? 1290 : 1170);
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
    const colW = (FULLW - 40) / 2;
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

  if (photo) drawPolaroid(ctx, photo, card.photoY ?? 0.5, card.caption);

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
