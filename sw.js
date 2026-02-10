const CACHE_NAME = 'lmstudio-remote-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './marked.min.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

// Install — cache shell assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate — clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch — cache-first for app shell, network-first for API calls
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Don't cache API calls to LM Studio
  if (url.pathname.startsWith('/v1/') || url.hostname !== self.location.hostname) {
    return; // let the browser handle it normally
  }

  event.respondWith(
    caches.match(event.request)
      .then(cached => cached || fetch(event.request))
  );
});
