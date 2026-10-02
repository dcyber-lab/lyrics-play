// LRC parsing. Times are in seconds.

const META = /^\[(ar|ti|al|by|offset|length|re|ve|au|#):(.*)\]$/i;
const STAMP = /^\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/;
const WORD_STAMP = /<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g;

export function parseLrc(raw) {
  const meta = {};
  const lines = [];
  let offset = 0;

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const m = line.match(META);
    if (m) {
      const key = m[1].toLowerCase();
      if (key === 'offset') offset = (parseInt(m[2], 10) || 0) / 1000;
      else meta[key] = m[2].trim();
      continue;
    }

    // A line may carry several leading timestamps: [00:12.00][01:30.50]text
    const stamps = [];
    let rest = line;
    let s;
    while ((s = rest.match(STAMP))) {
      const frac = s[3] ? parseInt(s[3], 10) / 10 ** s[3].length : 0;
      stamps.push(parseInt(s[1], 10) * 60 + parseInt(s[2], 10) + frac);
      rest = rest.slice(s[0].length);
    }
    if (!stamps.length) continue;

    const text = rest.replace(WORD_STAMP, '').trim();
    // Positive [offset] means lyrics should show earlier.
    for (const t of stamps) lines.push({ t: Math.max(0, t - offset), text });
  }

  lines.sort((a, b) => a.t - b.t);
  return { meta, lines };
}

// Plain (unsynced) lyrics: spread lines across the song, weighted by length.
// Rough on purpose — the user calibrates by tapping.
export function estimateTimeline(text, duration) {
  const texts = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!texts.length) return [];
  if (!duration) return texts.map((t, i) => ({ t: 10 + i * 3.5, text: t }));

  const start = duration * 0.08;
  const span = duration * 0.84;
  const weights = texts.map((t) => t.length + 8);
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  return texts.map((t, i) => {
    const line = { t: start + (acc / total) * span, text: t };
    acc += weights[i];
    return line;
  });
}

export function songTimeline(song) {
  if (song.synced) {
    const { lines } = parseLrc(song.lyrics);
    if (lines.length) return { lines, synced: true };
  }
  return { lines: estimateTimeline(song.lyrics, song.duration), synced: false };
}
