// A journey that cannot be lost (NEXT_PLAN.md A1; the save-systems skill). On the live site every save lives in this
// browser's storage, and a cleared or replaced phone would end a player's game. This writes everything the game keeps
// (the three slots with the Watch and the Horde inside them, the settings, the boards) to one file the player keeps,
// and reads such a file back. Restoring checks the whole file before it changes anything, and each journey it replaces
// is kept under `<key>.before-restore` (ordinary saves never touch that copy, unlike the one last-good `.bak`), so a
// wrong file can be undone. Pure storage: no scene, no network.
import { guardedWrite, readable, type KeyStore } from './saveGuard';

/** This build's own keys begin with this; the boards (the Trial, the Gauntlet, the Rush, Extreme, the Daily) are
 * shared with the original edition under `remnant.<name>.v1`. The original edition's own save slots are its own and
 * are not part of a backup. */
const PREFIX = 'remnant-phaser.';
const BOARD = /^remnant\.[a-z-]+\.v1$/;
const mine = (k: string) => k.startsWith(PREFIX) || BOARD.test(k);
/** Keys that are not the player's progress: last-good copies, and this module's own notes. */
const skip = (k: string) => k.endsWith('.bak') || k.includes('.before-') || k === AT || k === NAG;
/** Where a restore keeps the journey it replaced. */
const BEFORE = '.before-restore';
const AT = 'remnant-phaser.backup-at', NAG = 'remnant-phaser.backup-nag';
const isSave = (k: string) => k === 'remnant-phaser.save.v2' || /^remnant-phaser\.save\.slot\d$/.test(k);

export interface BackupFile {
  app: 'remnant-ascension';
  kind: 'backup';
  v: 1;
  /** When it was made (ISO), and the build that made it. */
  made: string;
  build: string;
  keys: Record<string, string>;
}

/** A store that can also list its keys (localStorage; a Map in tests). */
export interface ListStore extends KeyStore { keys(): string[] }
const local: ListStore = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  remove: (k) => { try { localStorage.removeItem(k); } catch { /* storage unavailable */ } },
  keys: () => { try { return Object.keys(localStorage); } catch { return []; } },
};

/** Everything the game keeps, as one object. */
export function collect(build: string, store: ListStore = local, now = new Date()): BackupFile {
  const keys: Record<string, string> = {};
  for (const k of store.keys().sort()) {
    if (!mine(k) || skip(k)) continue;
    const v = store.get(k);
    if (v !== null) keys[k] = v;
  }
  return { app: 'remnant-ascension', kind: 'backup', v: 1, made: now.toISOString(), build, keys };
}

/** How many journeys a backup holds. */
export const journeys = (f: BackupFile) => Object.keys(f.keys).filter(isSave).length;

export type Checked = { ok: true; file: BackupFile } | { ok: false; why: string };
/** Read a backup file's text. Nothing is changed; a file that is not a whole backup of this game is refused. */
export function check(text: string): Checked {
  let f: BackupFile;
  try { f = JSON.parse(text) as BackupFile; } catch { return { ok: false, why: 'That file is not a backup of this game (it does not read as one).' }; }
  if (!f || typeof f !== 'object' || f.app !== 'remnant-ascension' || f.kind !== 'backup') return { ok: false, why: 'That file is not a backup of this game.' };
  if (f.v !== 1) return { ok: false, why: 'That backup was made by a newer version of the game. Update the game, then restore it.' };
  if (!f.keys || typeof f.keys !== 'object') return { ok: false, why: 'That backup is damaged (nothing is in it).' };
  for (const [k, v] of Object.entries(f.keys)) {
    if (!mine(k) || skip(k) || typeof v !== 'string') return { ok: false, why: 'That backup is damaged (it holds something that is not this game\'s).' };
    if (isSave(k) && !readable(v)) return { ok: false, why: 'That backup is damaged (a journey in it does not read).' };
  }
  if (!journeys(f)) return { ok: false, why: 'That backup holds no journey.' };
  return { ok: true, file: f };
}

/** Put a checked backup in place. Each journey it replaces is kept (see `undoable`). Slots the backup does not hold
 * are left as they are. Returns how many keys were written. */
export function restore(f: BackupFile, store: ListStore = local): number {
  let n = 0;
  // One restore's copies at a time: an older restore's are let go.
  for (const k of store.keys()) if (k.startsWith(PREFIX) && k.endsWith(BEFORE)) store.remove(k);
  for (const [k, v] of Object.entries(f.keys)) {
    if (isSave(k)) {
      const prev = store.get(k);
      if (prev && prev !== v && readable(prev)) store.set(k + BEFORE, prev);
      if (guardedWrite(k, v, store)) n++;
    } else if (store.set(k, v)) n++;
  }
  return n;
}

/** How many journeys the last restore replaced and still keeps. */
export const undoable = (store: ListStore = local) => store.keys().filter((k) => k.startsWith(PREFIX) && k.endsWith(BEFORE)).length;
/** Put back the journeys the last restore replaced. Returns how many. */
export function undoRestore(store: ListStore = local): number {
  let n = 0;
  for (const k of store.keys()) {
    if (!k.startsWith(PREFIX) || !k.endsWith(BEFORE)) continue;
    const prev = store.get(k), key = k.slice(0, -BEFORE.length);
    if (prev && readable(prev) && guardedWrite(key, prev, store)) n++;
    store.remove(k);
  }
  return n;
}

// ---------------------------------------------------------------- the reminder

const DAY = 86400e3;
/** When a backup was last made on this device (ms), or 0. */
export const lastBackup = (store: KeyStore = local) => Number(store.get(AT)) || 0;
export const noteBackup = (store: KeyStore = local, now = Date.now()) => { store.set(AT, String(now)); };
/** Whether to mention backing up: more than two hours played, none made in fourteen days, and not said this week. */
export function shouldRemind(playtimeSecs: number, store: KeyStore = local, now = Date.now()) {
  if (playtimeSecs < 7200 || now - lastBackup(store) < 14 * DAY) return false;
  return now - (Number(store.get(NAG)) || 0) >= 7 * DAY;
}
export const noteReminded = (store: KeyStore = local, now = Date.now()) => { store.set(NAG, String(now)); };

// ---------------------------------------------------------------- the browser's side

/** Ask the browser to keep this site's storage (it may otherwise clear it when space runs short). Never throws. */
export function keepStorage() {
  try { void navigator.storage?.persist?.().catch(() => {}); } catch { /* not offered */ }
}

/** Hand the backup to the player: the share sheet where it takes files (an iPhone: Save to Files), else a download. */
export async function saveBackupFile(f: BackupFile): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const name = `remnant-ascension-backup-${f.made.slice(0, 10)}.json`, text = JSON.stringify(f);
  try {
    const file = new File([text], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Remnant: Ascension backup' }); noteBackup(); return 'shared'; }
      catch (e) { if ((e as Error)?.name === 'AbortError') return 'cancelled'; /* fall through to a download */ }
    }
  } catch { /* no File or share here */ }
  const a = document.createElement('a'), url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.href = url; a.download = name; a.style.display = 'none';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  noteBackup();
  return 'downloaded';
}

/** Let the player pick a backup file; resolves with its text, or null if none was chosen. */
export function pickBackupFile(): Promise<string | null> {
  return new Promise((done) => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json'; inp.style.display = 'none';
    inp.dataset.k = 'backup_file';
    inp.onchange = () => {
      const file = inp.files?.[0];
      inp.remove();
      if (!file) { done(null); return; }
      file.text().then(done, () => done(null));
    };
    inp.addEventListener('cancel', () => { inp.remove(); done(null); });
    document.body.appendChild(inp);
    inp.click();
  });
}
