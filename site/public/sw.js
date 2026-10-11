/* PapaGaio service worker.
 *
 * It used to be network-only in practice: a page was kept only after it had
 * been opened online, so without a connection every other tab was the
 * browser's dinosaur and the ones that did open showed dead panels. Now the
 * whole site's shell is stored on the first visit, and:
 *
 *   pages        network first (4 s), then the stored copy, then /offline/
 *   _astro/*,    stored first — their names change with their content, so a
 *   icons,       stored copy is never stale
 *   audio
 *   /api/*       network; a few read-only answers (the deck, verb tables) are
 *                kept for offline use, and when there is no network at all
 *                the page gets {error:'offline'} at once instead of hanging,
 *                which every page now shows as a plain sentence.
 *
 * The list and the version are filled in at build time (sw_precache in
 * astro.config.mjs); a new build means a new cache and the old one goes.
 */
const VERSION = '__VERSION__';
const PRECACHE = self.__PRECACHE || [];
const CACHE = 'papagaio-' + VERSION;
const BASE = '/papagaio/';
const KEEP_API = /^\/api\/(deck|conjugate|counts)\b/;

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      // One by one: a single missing file must not cancel the whole install.
      Promise.all(PRECACHE.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {})))
    ).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('papagaio-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const offlineJson = () => new Response(
  JSON.stringify({ error: 'offline', message: 'No connection — this needs the internet. What you opened before still works.' }),
  { status: 503, headers: { 'content-type': 'application/json' } },
);

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

async function page(req) {
  const c = await caches.open(CACHE);
  try {
    const res = await Promise.race([fetch(req), timeout(4000)]);
    if (res && res.ok) c.put(req, res.clone()).catch(() => {});
    return res;
  } catch (e) {
    return (await c.match(req, { ignoreSearch: true }))
      || (await c.match(BASE + 'offline/'))
      || new Response('Offline', { status: 503, headers: { 'content-type': 'text/plain' } });
  }
}

async function stored(req) {
  const c = await caches.open(CACHE);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) c.put(req, res.clone()).catch(() => {});
  return res;
}

async function api(req, path) {
  const c = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    // Only good answers are kept: a 503 cached once would be served forever.
    if (res.ok && req.method === 'GET' && KEEP_API.test(path)) c.put(req, res.clone()).catch(() => {});
    return res;
  } catch (e) {
    if (req.method === 'GET') {
      const hit = await c.match(req);
      if (hit) return hit;
    }
    return offlineJson();
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) {
    // Speech is synthesised per phrase; nothing to keep, and the page has its
    // own fallback to the device's voice.
    if (url.pathname.startsWith('/api/tts')) return;
    e.respondWith(api(req, url.pathname));
    return;
  }
  if (req.method !== 'GET' || !url.pathname.startsWith(BASE)) return;
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    e.respondWith(page(req));
    return;
  }
  if (/\/_astro\/|\.(png|svg|ico|webmanifest|mp3|woff2?)$/.test(url.pathname)) {
    e.respondWith(stored(req));
  }
});
