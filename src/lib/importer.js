import { addSong, addMissing, playlistById, lib } from './store.svelte.js';
import { findTrack } from './lrclib.js';

const CONCURRENCY = 4;

// LRCLIB lookups, a few at a time; result order matches `tracks`.
async function lookupAll(tracks, onProgress) {
  const found = new Array(tracks.length);
  let done = 0;
  let next = 0;

  async function worker() {
    while (next < tracks.length) {
      const i = next++;
      try {
        found[i] = await findTrack(tracks[i]);
      } catch {
        found[i] = null;
      }
      onProgress(++done, tracks.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, tracks.length) }, worker));
  return found;
}

// Append tracks to a playlist in order. Misses are remembered on the
// playlist (with the slot they belong in) and also returned.
export async function importTracks(pid, tracks, onProgress = () => {}) {
  const base = playlistById(pid)?.songIds.length ?? 0;
  const found = await lookupAll(tracks, onProgress);

  const failed = [];
  found.forEach((hit, i) => {
    if (hit) addSong(pid, hit);
    else failed.push({ ...tracks[i], at: base + i });
  });
  addMissing(pid, failed);
  return failed;
}

// Re-run a preset against an existing playlist: anything not already in it
// goes back into its preset slot, misses get recorded. Lookups are
// deterministic, so songs that matched before resolve to the same LRCLIB id
// and are skipped.
export async function fillPreset(pid, tracks, onProgress = () => {}) {
  const found = await lookupAll(tracks, onProgress);
  const p = playlistById(pid);
  if (!p) return [];
  const have = new Set(p.songIds.map((id) => lib.songs[id]?.lrclibId));
  const known = new Set((p.missing ?? []).map((m) => m.title));

  const failed = [];
  found.forEach((hit, i) => {
    if (hit && !have.has(hit.lrclibId)) addSong(pid, hit, i);
    else if (!hit && !known.has(tracks[i].title)) failed.push({ ...tracks[i], at: i });
  });
  addMissing(pid, failed);
  return failed;
}
