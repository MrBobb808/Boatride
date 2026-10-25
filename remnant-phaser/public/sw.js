// Only this Phaser app's files and caches belong to this worker.
const root = new URL('./', self.registration.scope);
const PREFIX = 'remnant-phaser-shell-' + encodeURIComponent(root.pathname) + '-';
const BUILD = '__BUILD__';
const CACHE = PREFIX + BUILD;
const MUSIC = 'remnant-phaser-music';
const CORE = __CORE__;
const isGameDocument = (text) => /<meta\b[^>]*name=["']remnant-phaser-build["']/i.test(text);
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(async (c) => {
    await c.addAll(CORE.map((p) => new Request(new URL(p, root), { cache: 'reload' })));
    const doc = await c.match(new URL('index.html', root));
    if (!doc || !isGameDocument(await doc.text())) throw Error('Phaser shell unavailable');
    await self.skipWaiting();
  }).catch(async (err) => { await caches.delete(CACHE); throw err; }));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (e.data?.type === 'REMNANT_STATE') e.ports[0]?.postMessage({ build: BUILD, scope: root.href });
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== root.origin || !url.pathname.startsWith(root.pathname)) return;
  const relative = url.pathname.slice(root.pathname.length);
  if (relative.startsWith('phaser/') || relative.startsWith('classic/')) return;
  // Version probes and worker updates always reach the server.
  if (url.pathname.endsWith('/version.json') || url.pathname.endsWith('/sw.js')) return;
  if (url.pathname.includes('/music/')) {
    if (req.headers.has('range')) return;
    e.respondWith(caches.open(MUSIC).then(async (c) => {
      const cached = await c.match(req);
      if (cached) return cached;
      // The installed main app keeps recordings already heard in the old edition.
      const legacy = await caches.match(req, { cacheName: 'remnant-music' });
      if (legacy?.status === 200) { await c.put(req, legacy.clone()); return legacy; }
      const res = await fetch(req);
      if (res.status === 200) await c.put(req, res.clone());
      return res;
    }));
    return;
  }
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req, { cache: 'no-store' }).then(async (res) => {
      if (!res.ok || !res.headers.get('content-type')?.includes('text/html')) throw Error('Unavailable');
      if (!isGameDocument(await res.clone().text())) throw Error('Wrong game document');
      const c = await caches.open(CACHE);
      await c.put(new URL('index.html', root), res.clone());
      return res;
    }).catch(() => caches.open(CACHE).then((c) => c.match(new URL('index.html', root)))));
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
