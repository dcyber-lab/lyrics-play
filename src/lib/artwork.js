// Album covers and artist photos. Deezer (via JSONP) gives both; iTunes
// fills in covers Deezer doesn't have. Only URLs are stored; the service
// worker caches the images themselves for offline use.
import { jsonp } from './jsonp.js';
import { cleanTitle } from './lrclib.js';
import { lib, artistKey, setSongArt, setArtistPhoto } from './store.svelte.js';

export const IMAGE_CACHE = 'lyrics-live-img';

// "Metro Boomin, The Weeknd & 21 Savage" -> "Metro Boomin"
export function primaryArtist(artist = '') {
  return artist.split(/\s*,\s*|\s+(?:feat\.?|ft\.?|featuring)\s+/i)[0].trim();
}

// Deezer serves a generic silhouette at ".../images/artist//..." when it has
// no picture; treat those as missing.
export const isPlaceholder = (url) => !url || /\/images\/(?:artist|cover)\/\//.test(url);

const norm = (s) => (s ?? '').toLowerCase().replace(/^the\s+/, '').trim();

// Prefer the right artist, then the closest length.
export function pickDeezer(results, { artist, duration }) {
  const a = norm(artist);
  const score = (r) =>
    (a && !norm(r.artist?.name).includes(a) ? 1000 : 0) +
    (duration && r.duration ? Math.min(Math.abs(r.duration - duration), 300) : 0);
  return results.reduce((best, r) => (!best || score(r) < score(best) ? r : best), null);
}

async function deezerSearch(q) {
  const res = await jsonp(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=10&output=jsonp`);
  return res?.data ?? [];
}

async function lookupDeezer(song) {
  const title = cleanTitle(song.title);
  const artist = primaryArtist(song.artist);
  let results = artist ? await deezerSearch(`artist:"${artist}" track:"${title}"`) : [];
  if (!results.length) results = await deezerSearch(`${artist} ${title}`.trim());
  const best = pickDeezer(results, { artist, duration: song.duration });
  if (!best) return null;
  return {
    cover: isPlaceholder(best.album?.cover_big) ? null : best.album.cover_big,
    album: best.album?.title ?? null,
    artistName: best.artist?.name,
    artistPhoto: isPlaceholder(best.artist?.picture_big) ? null : best.artist.picture_big,
  };
}

async function lookupItunes(song) {
  const term = `${primaryArtist(song.artist)} ${cleanTitle(song.title)}`.trim();
  const res = await jsonp(
    `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=5`
  );
  const hit = res?.results?.find((r) => r.artworkUrl100);
  if (!hit) return null;
  return { cover: hit.artworkUrl100.replace(/\/\d+x\d+bb\./, '/600x600bb.'), album: hit.collectionName ?? null };
}

async function lookupArtistPhoto(name) {
  const res = await jsonp(`https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}&limit=5&output=jsonp`);
  const list = res?.data ?? [];
  const hit = list.find((a) => norm(a.name) === norm(name)) ?? list[0];
  return hit && !isPlaceholder(hit.picture_big) ? hit.picture_big : null;
}

// Throws only when every source failed to answer (offline), so the song is
// retried later instead of being marked "no art".
async function lookupSongArt(song) {
  let deezer = null;
  let deezerFailed = false;
  try {
    deezer = await lookupDeezer(song);
  } catch {
    deezerFailed = true;
  }
  if (deezer?.cover) return deezer;
  try {
    const itunes = await lookupItunes(song);
    if (itunes) return { ...deezer, ...itunes };
  } catch {
    if (deezerFailed) throw new Error('offline');
  }
  return deezer;
}

const inFlight = new Set();

// Fill in art for these songs (and photos for their artists). Safe to call
// repeatedly; songs already checked or in progress are skipped.
export async function ensureArt(songIds, onProgress = () => {}) {
  const songs = [...new Set(songIds)]
    .map((id) => lib.songs[id])
    .filter((s) => s && !s.artChecked && !inFlight.has(s.id));
  songs.forEach((s) => inFlight.add(s.id));

  let done = 0;
  let next = 0;
  const total = songs.length;
  async function worker() {
    while (next < songs.length) {
      const song = songs[next++];
      try {
        const art = await lookupSongArt(song);
        setSongArt(song.id, art && (art.cover || art.album) ? { cover: art.cover, album: art.album } : null);
        if (art?.artistPhoto && art.artistName) setArtistPhoto(art.artistName, art.artistPhoto, { overwrite: false });
      } catch {
        // offline: leave unchecked, try again next time
      } finally {
        inFlight.delete(song.id);
        onProgress(++done, total);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, songs.length) }, worker));

  const names = new Set(
    songIds.map((id) => primaryArtist(lib.songs[id]?.artist)).filter((n) => n && !(artistKey(n) in lib.artists))
  );
  await ensureArtistPhotos([...names]);
}

export async function ensureArtistPhotos(names) {
  for (const name of names) {
    if (artistKey(name) in lib.artists) continue;
    try {
      setArtistPhoto(name, await lookupArtistPhoto(name));
    } catch {
      // offline
    }
  }
}

export const artistPhoto = (name) => lib.artists[artistKey(primaryArtist(name))] ?? null;

// Every image URL a playlist will show.
export function playlistImageUrls(songIds) {
  const urls = new Set();
  for (const id of songIds) {
    const s = lib.songs[id];
    if (s?.art?.cover) urls.add(s.art.cover);
    const photo = s && artistPhoto(s.artist);
    if (photo) urls.add(photo);
  }
  return [...urls];
}

// Pull images through the service worker so they're cached for offline.
// Returns how many are now available offline.
export async function cacheImages(urls, onProgress = () => {}) {
  let ok = 0;
  let done = 0;
  const cache = 'caches' in window ? await caches.open(IMAGE_CACHE) : null;
  for (const url of urls) {
    try {
      if (cache && (await cache.match(url))) ok++;
      else {
        await fetch(url, { mode: 'no-cors' });
        if (!cache || (await cache.match(url))) ok++;
      }
    } catch {
      // offline or blocked
    }
    onProgress(++done, urls.length);
  }
  return ok;
}

export async function countCached(urls) {
  if (!('caches' in window)) return 0;
  const cache = await caches.open(IMAGE_CACHE);
  let n = 0;
  for (const url of urls) if (await cache.match(url)) n++;
  return n;
}

// How a playlist should look: one artist's photo when the playlist is
// mostly one act, else a mosaic of up to four distinct covers.
export function playlistArt(songIds) {
  const counts = new Map();
  const covers = [];
  for (const id of songIds) {
    const s = lib.songs[id];
    if (!s) continue;
    const a = primaryArtist(s.artist);
    counts.set(a, (counts.get(a) ?? 0) + 1);
    if (s.art?.cover && !covers.includes(s.art.cover) && covers.length < 4) covers.push(s.art.cover);
  }
  const [top, n] = [...counts].sort((x, y) => y[1] - x[1])[0] ?? [];
  const photo = top && artistPhoto(top);
  if (photo && n / songIds.length >= 0.6) return { photo };
  if (covers.length >= 4) return { mosaic: covers };
  if (covers.length) return { photo: covers[0] };
  return {};
}
