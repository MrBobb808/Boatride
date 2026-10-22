// Self-update for the installed web app. GitHub Pages serves the newest
// build; this checks it when the app opens or comes back to the front, and
// when a newer build is out it saves, reloads at the next safe moment (the
// title screen or a room change, which is already a fade to black) and
// drops the player straight back where they were.

const RESUME = 'remnant-resume-slot';
const TRIED = 'remnant-update-tried';
const TRIED_AT = 'remnant-update-tried-at';
const RETRY_MS = 60_000;

export const currentBuild = () => document.querySelector('meta[name="remnant-build"]')?.getAttribute('content') ?? '';

let pending = false;
let checking = false;
let lastCheck = 0;
let nextBuild = '';

/** True once a newer build has been found and is waiting for a safe moment. */
export const updatePending = () => pending;

export async function checkForUpdate(force = false): Promise<boolean> {
  const here = currentBuild();
  if (!here || checking || pending) return pending;
  if (!force && Date.now() - lastCheck < RETRY_MS) return false;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return false;
  if (window.top !== window) return false; // embedded previews update with their host
  checking = true;
  lastCheck = Date.now();
  try {
    const res = await fetch(new URL('version.json?v=' + Date.now(), location.href), { cache: 'no-store' });
    if (!res.ok) return false;
    const info = await res.json() as { build?: string };
    const latest = info.build ?? '';
    // A timed-out navigation may still return the old offline document. Retry after a cooldown.
    let retryAfter = 0;
    try { if (sessionStorage.getItem(TRIED) === latest) retryAfter = (Number(sessionStorage.getItem(TRIED_AT) ?? 0) || 0) + RETRY_MS; } catch { /* storage is optional */ }
    if (latest && latest !== here && (force || Date.now() >= retryAfter)) {
      pending = true;
      nextBuild = latest;
    }
  } catch {
    /* offline: try again later */
  } finally {
    checking = false;
  }
  return pending;
}

/** Reload into the new build; `slot` resumes that save right after. */
export function applyUpdate(slot: number | null) {
  try {
    if (nextBuild) { sessionStorage.setItem(TRIED, nextBuild); sessionStorage.setItem(TRIED_AT, String(Date.now())); }
    if (slot !== null) sessionStorage.setItem(RESUME, String(slot));
  } catch {
    /* storage unavailable: the title screen's Continue still works */
  }
  // A new URL also bypasses Safari's HTTP document cache after a successful probe.
  const url = new URL(location.href);
  url.searchParams.set('v', nextBuild || Date.now().toString());
  location.replace(url.href);
}

/** After an update reload: the slot to resume, if any (cleared once read). */
export function takeResumeSlot(): number | null {
  try {
    const v = sessionStorage.getItem(RESUME);
    sessionStorage.removeItem(RESUME);
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
}
