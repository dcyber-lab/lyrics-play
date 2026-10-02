import { get, set } from 'idb-keyval';

const KEY = 'library';

// { playlists: [{ id, name, songIds, presetId?, missing? }],
//   songs: { [id]: song },            song.art = { cover, album } | null
//   artists: { [artistKey]: photoUrl | null } }
export const lib = $state({ playlists: [], songs: {}, artists: {}, loaded: false });

export async function load() {
  try {
    const data = await get(KEY);
    if (data) {
      lib.playlists = data.playlists ?? [];
      lib.songs = data.songs ?? {};
      lib.artists = data.artists ?? {};
    }
  } finally {
    lib.loaded = true;
  }
  // Ask iOS/Chrome not to evict our lyrics; best effort.
  navigator.storage?.persist?.().catch(() => {});
}

// Writes are coalesced: artwork lookups update dozens of songs in a burst.
// A pending write is flushed right away if the app is backgrounded or closed.
let saveTimer = null;
function flush() {
  if (saveTimer === null) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  const { playlists, songs, artists } = $state.snapshot(lib);
  return set(KEY, { playlists, songs, artists });
}
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 150);
}
if (typeof window !== 'undefined') {
  addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
}

export const artistKey = (name) => (name ?? '').toLowerCase().replace(/^the\s+/, '').trim();

// Replace a song's lyrics with a freshly tapped-out LRC.
export function setSongLyrics(id, lrc) {
  const song = lib.songs[id];
  if (!song) return;
  song.lyrics = lrc;
  song.synced = true;
  song.tapped = true;
  save();
}

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Remember which songs actually got played tonight (for the share card).
export function markPlayed(pid, songId) {
  const p = playlistById(pid);
  if (!p) return;
  const date = today();
  // Assign, then read back through the proxy: `x ??= []` evaluates to the raw
  // array, and pushing to that bypasses Svelte's state (the first song of the
  // night used to get lost that way).
  if (!p.played) p.played = {};
  if (!p.played[date]) p.played[date] = [];
  const list = p.played[date];
  if (list.includes(songId)) return;
  list.push(songId);
  // keep the last few shows only
  for (const d of Object.keys(p.played).sort().slice(0, -8)) delete p.played[d];
  save();
}

export function playedOn(pid, date = today()) {
  return playlistById(pid)?.played?.[date] ?? [];
}

export function setSongArt(id, art) {
  const song = lib.songs[id];
  if (!song) return;
  song.art = art;
  song.artChecked = true;
  save();
}

export function setArtistPhoto(name, url, { overwrite = true } = {}) {
  const key = artistKey(name);
  if (!key || (!overwrite && lib.artists[key])) return;
  lib.artists[key] = url;
  save();
}

const uid = () => crypto.randomUUID();

export function playlistById(id) {
  return lib.playlists.find((p) => p.id === id);
}

export function createPlaylist(name, extra = {}) {
  const p = { id: uid(), name: name.trim() || '新歌单', songIds: [], ...extra };
  lib.playlists.push(p);
  save();
  return p.id;
}

export function renamePlaylist(id, name) {
  const p = playlistById(id);
  if (!p || !name.trim()) return;
  p.name = name.trim();
  save();
}

export function updatePlaylist(id, patch) {
  const p = playlistById(id);
  if (!p) return;
  Object.assign(p, patch);
  save();
}

export function deletePlaylist(id) {
  lib.playlists = lib.playlists.filter((p) => p.id !== id);
  gc();
  save();
}

// `at` inserts at a position (clamped); default appends.
export function addSong(pid, song, at) {
  const p = playlistById(pid);
  if (!p) return;
  let id =
    song.lrclibId != null &&
    Object.values(lib.songs).find((s) => s.lrclibId === song.lrclibId)?.id;
  if (!id) {
    id = uid();
    lib.songs[id] = { ...song, id };
  }
  if (at == null) p.songIds.push(id);
  else p.songIds.splice(Math.min(at, p.songIds.length), 0, id);
  save();
}

// Tracks an import couldn't find, kept on the playlist so they can be
// retried or searched by hand later: [{ title, artist?, duration?, query?, at }]
export function addMissing(pid, tracks) {
  const p = playlistById(pid);
  if (!p || !tracks.length) return;
  p.missing = [...(p.missing ?? []), ...tracks];
  save();
}

export function dropMissing(pid, i) {
  playlistById(pid)?.missing?.splice(i, 1);
  save();
}

export function moveSong(pid, i, dir) {
  const ids = playlistById(pid)?.songIds;
  const j = i + dir;
  if (!ids || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  save();
}

export function removeSong(pid, i) {
  playlistById(pid)?.songIds.splice(i, 1);
  gc();
  save();
}

// Drop songs no playlist references any more.
function gc() {
  const used = new Set(lib.playlists.flatMap((p) => p.songIds));
  for (const id of Object.keys(lib.songs)) if (!used.has(id)) delete lib.songs[id];
}

export function exportLibrary() {
  const { playlists, songs, artists } = $state.snapshot(lib);
  return JSON.stringify({ version: 1, playlists, songs, artists }, null, 2);
}

// Merge a backup in; playlists/songs with the same id are overwritten.
export function importLibrary(json) {
  const data = JSON.parse(json);
  if (!Array.isArray(data.playlists) || typeof data.songs !== 'object') {
    throw new Error('不是有效的备份文件');
  }
  Object.assign(lib.songs, data.songs);
  Object.assign(lib.artists, data.artists ?? {});
  for (const p of data.playlists) {
    const i = lib.playlists.findIndex((x) => x.id === p.id);
    if (i >= 0) lib.playlists[i] = p;
    else lib.playlists.push(p);
  }
  save();
}
