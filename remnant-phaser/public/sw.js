// Only this Phaser app's files and caches belong to this worker.
const CACHE = 'remnant-phaser-shell-__BUILD__';
const MUSIC = 'remnant-phaser-music';
const CORE = __CORE__;
const root = new URL('./', self.registration.scope);
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE.map((p) => new Request(new URL(p, root), { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('remnant-phaser-shell-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', (e) => { if (e.data?.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== root.origin || !url.pathname.startsWith(root.pathname)) return;
  // Version probes and worker updates always reach the server.
  if (url.pathname.endsWith('/version.json') || url.pathname.endsWith('/sw.js')) return;
  if (url.pathname.includes('/music/')) {
    if (req.headers.has('range')) return;
    e.respondWith(caches.open(MUSIC).then(async (c) => {
      const cached = await c.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res.status === 200) await c.put(req, res.clone());
      return res;
    }));
    return;
  }
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req, { cache: 'no-store' }).then(async (res) => {
      if (!res.ok || !res.headers.get('content-type')?.includes('text/html')) throw Error('Unavailable');
      const c = await caches.open(CACHE);
      await c.put(new URL('index.html', root), res.clone());
      return res;
    }).catch(() => caches.match(new URL('index.html', root))));
    return;
  }
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const cached = await c.match(req, { ignoreSearch: true });
    if (cached) return cached;
    const res = await fetch(req);
    if (res.ok) await c.put(req, res.clone());
    return res;
  }));
});
