// https://lrclib.net — open lyrics database with line-synced LRC.
const BASE = 'https://lrclib.net/api';

export async function searchLyrics(query, { signal } = {}) {
  const res = await fetch(`${BASE}/search?q=${encodeURIComponent(query)}`, { signal });
  if (!res.ok) throw new Error(`LRCLIB ${res.status}`);
  const data = await res.json();
  return data
    .filter((d) => !d.instrumental && (d.syncedLyrics || d.plainLyrics))
    .map((d) => ({
      lrclibId: d.id,
      title: d.trackName,
      artist: d.artistName,
      album: d.albumName,
      duration: d.duration,
      synced: !!d.syncedLyrics,
      lyrics: d.syncedLyrics || d.plainLyrics,
      source: 'lrclib',
    }))
    .sort((a, b) => b.synced - a.synced);
}

// "1. Artist - Title" / "Title" -> search query
export function setlistLineToQuery(line, defaultArtist = '') {
  const cleaned = line
    .replace(/^\s*\d+[.)]\s*/, '')
    .replace(/\s+[-–—]\s+/, ' ')
    .trim();
  if (!cleaned) return '';
  return defaultArtist ? `${defaultArtist} ${cleaned}` : cleaned;
}

// "Timeless (feat Playboi Carti)" -> "Timeless". Featured-artist and
// version suffixes make LRCLIB's fuzzy search miss.
export function cleanTitle(title) {
  return title
    .replace(/\s*[([](?:feat\.?|ft\.?|with)\s[^)\]]*[)\]]/gi, '')
    .replace(/\s+-\s+(?:remaster(?:ed)?|live|radio edit|single version)\b.*$/i, '')
    .trim();
}

// Synced beats unsynced; among those, closest duration wins, so a known
// track length steers us away from remasters, live cuts and extended mixes.
export function pickBest(results, duration) {
  const score = (r) =>
    (r.synced ? 0 : 1000) + (duration && r.duration ? Math.min(Math.abs(r.duration - duration), 120) : 0);
  return results.reduce((best, r) => (!best || score(r) < score(best) ? r : best), null);
}

// { title, artist, duration } or { query } -> best LRCLIB match or null
export async function findTrack({ title, artist, duration, query }, opts) {
  const q = query ?? `${artist ?? ''} ${cleanTitle(title)}`.trim();
  return pickBest(await searchLyrics(q, opts), duration);
}
