// https://lrclib.net — open lyrics database with line-synced LRC.
const BASE = 'https://lrclib.net/api';

// Free-text search across title/artist/album.
export function searchLyrics(query, opts) {
  return request({ q: query }, opts);
}

async function request(params, { signal } = {}) {
  const res = await fetch(`${BASE}/search?${new URLSearchParams(params)}`, { signal });
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

const norm = (s) => (s ?? '').toLowerCase().replace(/^the\s+/, '').trim();

// Search with separate title / artist fields. LRCLIB matches these
// per-field, which is much tighter than one free-text query; if that finds
// nothing we fall back to free text so typos in one field aren't fatal.
// Either field may be empty (LRCLIB needs a title for field search, so an
// artist-only search is free text).
export async function searchByFields({ title = '', artist = '' }, opts) {
  title = title.trim();
  artist = artist.trim();
  let results = [];
  if (title) {
    results = await request(artist ? { track_name: title, artist_name: artist } : { track_name: title }, opts);
  }
  if (!results.length) {
    const q = `${artist} ${title && cleanTitle(title)}`.trim();
    if (q) results = await searchLyrics(q, opts);
  }
  return rankResults(results, { title, artist });
}

// Synced first, then artist match, then exact title match; otherwise keep
// LRCLIB's order.
export function rankResults(results, { title = '', artist = '' } = {}) {
  const t = norm(cleanTitle(title));
  const a = norm(artist);
  const score = (r) =>
    (r.synced ? 0 : 4) + (a && !norm(r.artist).includes(a) ? 2 : 0) + (t && norm(cleanTitle(r.title)) !== t ? 1 : 0);
  return results
    .map((r, i) => [score(r), i, r])
    .sort((x, y) => x[0] - y[0] || x[1] - y[1])
    .map(([, , r]) => r);
}

// { title, artist, duration } or { query } -> best LRCLIB match or null
export async function findTrack(track, opts) {
  // Structured search first when we know both fields.
  if (!track.query && track.title && track.artist) {
    const hit = pickBest(
      await request({ track_name: cleanTitle(track.title), artist_name: track.artist }, opts),
      track.duration
    );
    if (hit) return hit;
  }
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
