import { addSong } from './store.svelte.js';
import { findTrack } from './lrclib.js';

const CONCURRENCY = 4;

// Look up every track on LRCLIB, then add the hits to the playlist in the
// original order. Returns the tracks that found nothing.
export async function importTracks(pid, tracks, onProgress = () => {}) {
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

  const failed = [];
  found.forEach((hit, i) => (hit ? addSong(pid, hit) : failed.push(tracks[i])));
  return failed;
}
