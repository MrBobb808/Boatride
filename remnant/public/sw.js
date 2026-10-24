// Offline support for the installed web app. The whole game is one HTML file,
// so caching a handful of files is enough to play with no connection.
const VERSION = '__BUILD__';
const CACHE = 'remnant-' + VERSION;
// Songs (public/music) are big and do not change between builds, so they keep a cache of their own that updates leave alone.
const MUSIC = 'remnant-music';
const CORE = ['./', './index.html', './manifest.webmanifest', './icons/apple-touch-icon.png', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE.map((url) => new Request(url, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('remnant-') && k !== CACHE && k !== MUSIC).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  // The Phaser rebuild lives under /phaser/: it must never be cached as this game's page.
  if (url.pathname.includes('/phaser/')) return;
  // Update probes must never get trapped in an installed copy's offline cache.
  if (url.pathname.endsWith('/version.json') || (req.mode !== 'navigate' && url.searchParams.has('v'))) {
    e.respondWith(fetch(req, { cache: 'no-store' }));
    return;
  }
  if (url.pathname.includes('/music/')) {
    // Cache first, whole files only (the game fetches a song in one piece; partial range replies cannot be stored).
    e.respondWith(caches.open(MUSIC).then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.status === 200 && !req.headers.has('range')) c.put(req, res.clone()).catch(() => {});
      return res;
    }))));
    return;
  }
  if (req.mode === 'navigate') {
    // Network first so updates arrive, falling back to the cached game offline.
    const network = fetch(req, { cache: 'no-store' }).then(async (res) => {
      if (!res.ok || !(res.headers.get('content-type') ?? '').includes('text/html')) throw new Error('Game unavailable');
      const c = await caches.open(CACHE);
      await c.put('./index.html', res.clone());
      return res;
    });
    // Keep the refresh alive even when the timeout has already served an offline copy.
    e.waitUntil(network.then(() => {}, () => {}));
    const offline = () => caches.match('./index.html').then((r) => r || caches.match('./'));
    // Explicit update reloads must finish downloading the new game, even on a slow connection.
    if (url.searchParams.has('v')) { e.respondWith(network.catch(offline)); return; }
    e.respondWith(
      Promise.race([
        network,
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3500)),
      ]).catch(offline),
    );
    return;
  }
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && !req.url.includes('/splash/')) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    })),
  );
});
