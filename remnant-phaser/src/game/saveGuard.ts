// A last-good copy beside every save (the save-systems skill, POLISH_PLAN §19 G2). Each write first moves the save it
// replaces to `<key>.bak`, but only one that still reads as a save, so a damaged write never overwrites the good copy.
// On load, a save that will not read (cut short by a crash, a full disk, a bad sync) is replaced by that copy. An
// empty slot stays empty: the backup never brings back a slot that was deleted.

export interface KeyStore { get(key: string): string | null; set(key: string, val: string): boolean; remove(key: string): void }
const local: KeyStore = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  remove: (k) => { try { localStorage.removeItem(k); } catch { /* storage unavailable */ } },
};

export const backupKey = (key: string) => `${key}.bak`;

/** Whether a stored save reads as one (the shape every loader here requires). */
export function readable(raw: string | null): boolean {
  if (!raw) return false;
  try { const d = JSON.parse(raw) as { version?: unknown; level?: unknown }; return !!d && d.version === 1 && typeof d.level === 'number'; } catch { return false; }
}

/** Write a save, keeping the one it replaces as the backup. False when storage refused the save itself. */
export function guardedWrite(key: string, json: string, store: KeyStore = local): boolean {
  const prev = store.get(key);
  if (prev && prev !== json && readable(prev)) store.set(backupKey(key), prev);
  return store.set(key, json);
}

/** The listeners told when a damaged save was replaced by its backup (the title or the game can say so). */
const restored: ((key: string) => void)[] = [];
export const onRestored = (cb: (key: string) => void) => { restored.push(cb); };

/** Read a save; one that will not read gives way to its backup, which is written back in its place. */
export function guardedRead(key: string, store: KeyStore = local): string | null {
  const raw = store.get(key);
  if (raw === null || readable(raw)) return raw;
  const bak = store.get(backupKey(key));
  if (!readable(bak)) return raw;
  store.set(key, bak!);
  for (const cb of restored) cb(key);
  return bak;
}

/** A deleted slot takes its backup with it. */
export const dropBackup = (key: string, store: KeyStore = local) => store.remove(backupKey(key));
