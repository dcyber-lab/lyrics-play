// Playlist <-> URL. Only metadata travels (name, title/artist/duration per
// track); the receiver fetches lyrics from LRCLIB like a preset import.
//
// Format: "z" + base64url(deflate-raw(json)) when CompressionStream exists,
// otherwise "j" + base64url(json). json = { n: name, t: [[title, artist, dur]] }

const toB64url = (bytes) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = (str) => {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

async function pipe(bytes, stream) {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export function playlistPayload(name, songs) {
  return {
    n: name,
    t: songs.map((s) => [s.title, s.artist ?? '', Math.round(s.duration || 0)]),
  };
}

export async function encodePayload(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  if (typeof CompressionStream !== 'undefined') {
    return 'z' + toB64url(await pipe(bytes, new CompressionStream('deflate-raw')));
  }
  return 'j' + toB64url(bytes);
}

export async function decodePayload(code) {
  const kind = code[0];
  let bytes = fromB64url(code.slice(1));
  if (kind === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
  else if (kind !== 'j') throw new Error('unknown format');
  const data = JSON.parse(new TextDecoder().decode(bytes));
  if (typeof data.n !== 'string' || !Array.isArray(data.t)) throw new Error('bad payload');
  return {
    name: data.n,
    tracks: data.t
      .filter((x) => Array.isArray(x) && typeof x[0] === 'string')
      .map(([title, artist, duration]) => ({ title, artist: artist || '', duration: duration || null })),
  };
}

export function shareUrl(code) {
  return `${location.origin}${location.pathname}#/import/${code}`;
}
