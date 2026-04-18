// Ghost Session service worker.
// Caches the app shell (HTML + hashed JS/CSS) so the plugin's WebView2 can
// boot React even with no network. Once React boots, it uses useOnlineStatus
// to render OfflineScreen with the proper UI.
//
// Strategy: stale-while-revalidate for same-origin GETs against the shell
// and /assets. API/socket.io traffic is never touched by the worker.

const CACHE = 'ghost-shell-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(['/', '/index.html']).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/socket.io')) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    } catch {
      const cached = await cache.match(req);
      if (cached) return cached;
      // Fall back to cached index.html for navigations (SPA shell).
      if (req.mode === 'navigate' || req.destination === 'document') {
        const shell = await cache.match('/') || await cache.match('/index.html');
        if (shell) return shell;
      }
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    }
  })());
});
