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
