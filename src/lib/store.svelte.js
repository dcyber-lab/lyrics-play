import { get, set } from 'idb-keyval';

const KEY = 'library';

// { playlists: [{ id, name, songIds }], songs: { [id]: song } }
export const lib = $state({ playlists: [], songs: {}, loaded: false });

export async function load() {
  try {
    const data = await get(KEY);
    if (data) {
      lib.playlists = data.playlists ?? [];
      lib.songs = data.songs ?? {};
    }
  } finally {
    lib.loaded = true;
  }
  // Ask iOS/Chrome not to evict our lyrics; best effort.
  navigator.storage?.persist?.().catch(() => {});
}

function save() {
  const { playlists, songs } = $state.snapshot(lib);
  return set(KEY, { playlists, songs });
}

const uid = () => crypto.randomUUID();

export function playlistById(id) {
  return lib.playlists.find((p) => p.id === id);
}

export function createPlaylist(name) {
  const p = { id: uid(), name: name.trim() || '新歌单', songIds: [] };
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

export function deletePlaylist(id) {
  lib.playlists = lib.playlists.filter((p) => p.id !== id);
  gc();
  save();
}

export function addSong(pid, song) {
  const p = playlistById(pid);
  if (!p) return;
  let id =
    song.lrclibId != null &&
    Object.values(lib.songs).find((s) => s.lrclibId === song.lrclibId)?.id;
  if (!id) {
    id = uid();
    lib.songs[id] = { ...song, id };
  }
  p.songIds.push(id);
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
  const { playlists, songs } = $state.snapshot(lib);
  return JSON.stringify({ version: 1, playlists, songs }, null, 2);
}

// Merge a backup in; playlists/songs with the same id are overwritten.
export function importLibrary(json) {
  const data = JSON.parse(json);
  if (!Array.isArray(data.playlists) || typeof data.songs !== 'object') {
    throw new Error('不是有效的备份文件');
  }
  Object.assign(lib.songs, data.songs);
  for (const p of data.playlists) {
    const i = lib.playlists.findIndex((x) => x.id === p.id);
    if (i >= 0) lib.playlists[i] = p;
    else lib.playlists.push(p);
  }
  save();
}
