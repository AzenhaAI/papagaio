/* PapaGaio service worker — минимальная офлайн-оболочка.
   Network-first: свежесть важнее скорости, кэш выручает только когда сети нет.
   Нужен не столько ради офлайна, сколько ради самой возможности установки:
   без обработчика fetch Chrome не считает сайт приложением и не показывает
   кнопку «Установить». */
const CACHE = 'papagaio-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req)),
  );
});
