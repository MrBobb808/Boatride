// New documents load from the network; a fully cached shell remains playable
// offline. An explicit update saves first and resumes the current journey.
export const installedBuild = () => document.querySelector<HTMLMetaElement>('meta[name="remnant-phaser-build"]')?.content ?? 'development';
export async function registerOffline() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register(new URL('sw.js', document.baseURI), { scope: './', updateViaCache: 'none' });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && navigator.onLine) void reg.update().catch(() => {}); });
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
    if (latest.build === installedBuild()) return 'You have the latest Phaser build.';
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration(new URL('./', document.baseURI)) : undefined;
    await reg?.update();
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
