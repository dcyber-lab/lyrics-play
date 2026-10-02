// Offline shell. Lyrics themselves live in IndexedDB, so all we need here is
// the app: index.html, its hashed bundles, icons.
const CACHE = 'lyrics-live-v3';
// Album covers / artist photos. Kept across app versions; it's content, not code.
const IMG_CACHE = 'lyrics-live-img';
const IMG_HOSTS = /(^|\.)(dzcdn\.net|mzstatic\.com)$/;
const SHELL = ['./', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './nosleep.mp4', './nosleep.webm'];
const NAV_TIMEOUT = 3000; // venue wifi: don't wait forever for a fresh index.html

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(SHELL);
      // The page loaded its bundles before this worker existed, so precache
      // whatever the current index.html references.
      const html = await (await cache.match('./')).text();
      const assets = [...html.matchAll(/(?:src|href)="(\.\/assets\/[^"]+)"/g)].map((m) => m[1]);
      await cache.addAll(assets);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE && key !== IMG_CACHE) await caches.delete(key);
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (IMG_HOSTS.test(url.hostname)) {
    event.respondWith(imageCacheFirst(req));
    return;
  }
  if (url.origin !== location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req));
  } else {
    event.respondWith(cacheFirst(req));
  }
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NAV_TIMEOUT)),
    ]);
    if (res.ok) cache.put('./', res.clone());
    return res;
  } catch {
    return (await cache.match('./')) ?? Response.error();
  }
}

// Cross-origin images come back opaque (no CORS); that's fine for <img> and
// for the cache, we just can't inspect them. Keyed by URL so a prefetch with
// fetch(..., {mode: 'no-cors'}) and a later <img> share one entry.
async function imageCacheFirst(req) {
  const cache = await caches.open(IMG_CACHE);
  const hit = await cache.match(req.url);
  if (hit) return hit;
  const res = await fetch(req.url, { mode: 'no-cors' });
  if (res.ok || res.type === 'opaque') cache.put(req.url, res.clone());
  return res;
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return req.headers.has('range') ? rangeResponse(req, hit) : hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

// Safari fetches media with Range headers and refuses a plain 200 for them,
// so slice cached files into 206 responses (needed for the wake-lock video).
async function rangeResponse(req, res) {
  const buf = await res.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range'));
  const start = m && m[1] ? Number(m[1]) : 0;
  const end = m && m[2] ? Math.min(Number(m[2]), buf.byteLength - 1) : buf.byteLength - 1;
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': res.headers.get('Content-Type') || 'video/mp4',
      'Content-Range': `bytes ${start}-${end}/${buf.byteLength}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}
