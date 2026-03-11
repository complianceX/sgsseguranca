const CACHE_NAME = 'gst-shell-v1';
const APP_SHELL = ['/', '/login', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event?.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(event.request.url);
  const isHttpProtocol =
    requestUrl.protocol === 'http:' || requestUrl.protocol === 'https:';
  if (!isHttpProtocol) {
    return;
  }

  const isSameOrigin = requestUrl.origin === self.location.origin;
  if (!isSameOrigin) {
    // Requests externos (CDNs, extensões, APIs de terceiros) não devem ser
    // interceptados/cached pelo nosso SW para evitar erros de CSP e cache.
    return;
  }

  const isNavigation = event.request.mode === 'navigate';
  const isStaticAsset =
    requestUrl.pathname.startsWith('/_next/') ||
    /\.(?:js|css|png|jpg|jpeg|svg|webp|ico|woff2?)$/i.test(
      requestUrl.pathname,
    );

  if (isNavigation) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, cloned);
          });
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          return cached || (await caches.match('/login'));
        }),
    );
    return;
  }

  if (!isStaticAsset) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, cloned);
            });
          }
          return response;
        })
        .catch(() => caches.match(event.request)),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, cloned);
          });
          return response;
        })
        .catch(() => caches.match('/login'));
    }),
  );
});
