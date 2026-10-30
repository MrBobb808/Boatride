import { G } from './ctx';
import { installedBuild, installedVersion, checkForUpdates } from '../../game/update';
export const currentBuild = installedBuild;
export const currentVersion = installedVersion;
export async function checkForUpdate(_force = false): Promise<boolean> {
  try { const url = new URL('version.json', document.baseURI); url.searchParams.set('v', String(Date.now())); const r = await fetch(url, { cache: 'no-store' }); return r.ok && (await r.json()).build !== installedBuild(); } catch { return false; }
}
export const applyUpdate = (_slot: number | null) => checkForUpdates(() => G.world.autosave());
