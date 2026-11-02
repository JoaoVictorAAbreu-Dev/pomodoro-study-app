const PREFIX = `pomodoro-study:${self.registration.scope}:`;
const CACHE = `${PREFIX}v8-vite-build`;
const CORE = ['./', './index.html', './manifest.json'];
const isLocalAsset = (url) =>
  url.origin === new URL(self.registration.scope).origin &&
  new URL(self.registration.scope).pathname.startsWith('/') &&
  /\/(?:assets|icons)\/[^/]+\.(?:js|css|svg|png|jpe?g|ico|woff2)$/.test(url.pathname);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(PREFIX) && key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () =>
      (await caches.open(CACHE)).match('./index.html') || Response.error()));
    return;
  }
  if (!isLocalAsset(url)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
    return response;
  })());
});
