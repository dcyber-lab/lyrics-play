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

// Queries to try, most specific first. Fallbacks after the first one only
// count if the artist matches, so a bare title can't pull in someone else's
// song of the same name.
export function queriesFor({ title, artist, query }) {
  if (query) return [query];
  const t = cleanTitle(title);
  const first = t.split(/\s*\/\s*/)[0]; // "House Of Balloons / Glass Table Girls"
  const qs = [`${artist ?? ''} ${t}`, t, `${artist ?? ''} ${first}`, first];
  return [...new Set(qs.map((q) => q.trim()).filter(Boolean))];
}

const norm = (s) => (s ?? '').toLowerCase().replace(/^the\s+/, '');

// { title, artist, duration } or { query } -> best LRCLIB match or null
export async function findTrack(track, opts) {
  const qs = queriesFor(track);
  for (const [i, q] of qs.entries()) {
    let results = await searchLyrics(q, opts);
    if (i > 0 && track.artist) {
      results = results.filter((r) => norm(r.artist).includes(norm(track.artist)));
    }
    const hit = pickBest(results, track.duration);
    if (hit) return hit;
  }
  return null;
}
