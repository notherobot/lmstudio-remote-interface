// Bump this on every release so old caches are purged (keep in sync with APP_VERSION in app.js)
const CACHE_NAME = 'lmstudio-remote-v0.4.1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './marked.min.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './fonts/Matoran.ttf',
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

// Fetch — network-first for the app shell (so deploys show up immediately),
// falling back to cache only when offline. API calls are left untouched.
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Don't cache API calls to LM Studio
  if (url.pathname.startsWith('/v1/') || url.hostname !== self.location.hostname) {
    return; // let the browser handle it normally
  }

  event.respondWith(
    fetch(event.request)
      .then(resp => {
        // Refresh the cached copy for offline use
        if (resp && resp.status === 200 && resp.type === 'basic') {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return resp;
      })
      .catch(() => caches.match(event.request))
  );
});
