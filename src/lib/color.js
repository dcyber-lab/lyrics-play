// Stable per-name hue, so every playlist/song gets its own colour without
// needing artwork.
export function hueOf(str = '') {
  let h = 0;
  for (const ch of str) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h % 360;
}

export function coverStyle(str) {
  const h = hueOf(str);
  return `background: linear-gradient(140deg, hsl(${h} 80% 58%), hsl(${(h + 40) % 360} 70% 32%) 60%, hsl(${(h + 80) % 360} 60% 14%));`;
}
