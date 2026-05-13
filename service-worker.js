const CACHE_NAME = 'gerry-iglu-v6';
const APP_SHELL = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.jsx',
  '/tweaks-panel.jsx',
  '/manifest.webmanifest',
  '/assets/pudgy-penguin-cutout.png',
  '/assets/bluestar-property.jpg',
  '/assets/zeppole-shop.jpg',
  '/assets/great-terriers-coming-soon.png',
  '/assets/iglu-mark.svg',
  '/assets/bluestar-logo.svg',
  '/assets/seal-stay-logo.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => (
      cached || fetch(event.request).catch(() => caches.match('/index.html'))
    ))
  );
});
