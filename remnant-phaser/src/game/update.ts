// New documents load from the network; a fully cached shell remains playable
// offline. An explicit update saves first and resumes the current journey.
export const installedBuild = () => document.querySelector<HTMLMetaElement>('meta[name="remnant-phaser-build"]')?.content ?? 'development';
/** The readable version (the build's UTC date and time, YYYY.MM.DD.HHMM), or "development". */
export const installedVersion = () => document.querySelector<HTMLMetaElement>('meta[name="remnant-phaser-version"]')?.content ?? 'development';
/** What the site is serving now, or null when offline. */
export async function latestRelease(): Promise<{ build: string; version?: string } | null> {
  try { const u = new URL('version.json', document.baseURI); u.searchParams.set('v', String(Date.now())); const r = await fetch(u, { cache: 'no-store' }); return r.ok ? await r.json() : null; } catch { return null; }
}
let ready = false;
let readinessCheck = 0;
export const offlineReady = () => ready;
export const offlineStatusText = () => !('serviceWorker' in navigator) ? 'Offline installation is unavailable in this browser.' : ready ? 'Ready for offline play.' : 'Preparing offline files. Keep the game open online.';
async function refreshOfflineState() {
  if (!('serviceWorker' in navigator)) return;
  const check = ++readinessCheck;
  const worker = navigator.serviceWorker.controller;
  const state = worker ? await new Promise<{ build: string; scope: string } | null>((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); resolve(null); }, 800);
    channel.port1.onmessage = (e) => { clearTimeout(timer); channel.port1.close(); resolve(e.data); };
    try { worker.postMessage({ type: 'REMNANT_STATE' }, [channel.port2]); } catch { clearTimeout(timer); channel.port1.close(); resolve(null); }
  }) : null;
  if (check !== readinessCheck) return;
  ready = !!state && state.build === installedBuild() && state.scope === new URL('./', document.baseURI).href;
  for (const el of document.querySelectorAll<HTMLElement>('[data-phaser-offline]')) el.textContent = offlineStatusText();
}
let pending = '';
export const updatePending = () => !!pending;
async function probeUpdate() {
  if (!navigator.onLine || document.hidden) return;
  try { const u = new URL('version.json', document.baseURI); u.searchParams.set('v', String(Date.now())); const r = await fetch(u, { cache: 'no-store' }); if (!r.ok) return; const { build } = await r.json(); if (build && build !== installedBuild() && pending !== build) { pending = build; window.dispatchEvent(new Event('remnant-update-ready')); } } catch {}
}
export async function registerOffline() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => void refreshOfflineState());
  void refreshOfflineState();
  try {
    const reg = await navigator.serviceWorker.register(new URL('sw.js', document.baseURI), { scope: './', updateViaCache: 'none' });
    void navigator.serviceWorker.ready.then(() => refreshOfflineState());
    // A recent registration can reuse the previous edition's worker without a fetch.
    void reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (!document.hidden && navigator.onLine) { void reg.update().catch(() => {}); void probeUpdate(); } });
    setTimeout(() => void probeUpdate(), 4000); setInterval(() => void probeUpdate(), 60_000);
  } catch { /* Online play remains available when installation is blocked. */ }
}

export async function checkForUpdates(save: () => void): Promise<string> {
  try {
    const probe = new URL('version.json', document.baseURI);
    probe.searchParams.set('v', String(Date.now()));
    const res = await fetch(probe, { cache: 'no-store' });
    if (!res.ok) throw Error('Unavailable');
    const latest = await res.json() as { build?: string };
    if (!latest.build) throw Error('Missing build');
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration(new URL('./', document.baseURI)) : undefined;
    await reg?.update();
    void refreshOfflineState();
    if (latest.build === installedBuild()) return 'You have the latest Phaser build.';
    reg?.waiting?.postMessage({ type: 'SKIP_WAITING' });
    save();
    const next = new URL(location.href);
    next.searchParams.delete('fresh');
    next.searchParams.set('autostart', '');
    next.searchParams.set('v', latest.build);
    location.replace(next);
    return 'Opening the new Phaser build…';
  } catch { return 'Updates are unavailable right now. Your current game is ready to play.'; }
}
