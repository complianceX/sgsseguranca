const SW_URL = new URL(self.location.href);
const BUILD_ID = SW_URL.searchParams.get('build') || 'local-dev';
const CACHE_PREFIX = 'gst-shell';
const CACHE_NAME = `${CACHE_PREFIX}-${BUILD_ID}`;
const APP_SHELL = [
  '/offline.html',
  '/manifest.webmanifest',
  '/icon-192.svg',
  '/icon-512.svg',
  '/icon-maskable.svg',
  '/logo-gst-mark.svg',
];
const SAFE_PUBLIC_ASSETS = new Set(APP_SHELL);

function isHttpRequest(requestUrl) {
  return (
    requestUrl.protocol === 'http:' || requestUrl.protocol === 'https:'
  );
}

function isImmutableNextAsset(pathname) {
  return pathname.startsWith('/_next/static/');
}

function isSafeStaticAsset(pathname) {
  return SAFE_PUBLIC_ASSETS.has(pathname);
}

function isSensitivePath(pathname) {
  return (
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next/data') ||
    pathname.startsWith('/_next/image')
  );
}

async function putInCache(request, response) {
  if (!response || response.status !== 200 || response.type !== 'basic') {
    return response;
  }

  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
  return response;
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => undefined),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
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

  if (!isHttpRequest(requestUrl) || requestUrl.origin !== self.location.origin) {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(async () => {
        return (await caches.match('/offline.html')) || Response.error();
      }),
    );
    return;
  }

  if (
    requestUrl.search ||
    isSensitivePath(requestUrl.pathname) ||
    (!isImmutableNextAsset(requestUrl.pathname) &&
      !isSafeStaticAsset(requestUrl.pathname))
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(event.request)
        .then((response) => putInCache(event.request, response))
        .catch(() => Response.error());
    }),
  );
});
