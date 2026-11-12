// The two controls for a journey that cannot be lost (game/backup.ts; NEXT_PLAN.md A1), used by the pause menu's Save &
// system page and by the home screen (a new phone has no journey yet, so restoring must be reachable from there).
import { check, collect, journeys, lastBackup, pickBackupFile, restore, saveBackupFile, undoable, undoRestore, type BackupFile } from './backup';
import { freezeSaves } from './save';
import { installedVersion } from './update';

const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
/** "Last backed up 3 Nov 2026", or that none has been made on this device. */
export const backupLine = () => (lastBackup() ? `Last backed up on this device: ${day(lastBackup())}.` : 'No backup has been made on this device yet.');

/** Back up now: `before` saves the game first; `say` reports what happened. */
export function backupButton(cls: string, before: () => void, say: (msg: string) => void) {
  const b = document.createElement('button');
  b.className = cls; b.textContent = 'Back up my journey'; b.dataset.k = 'backup_now';
  b.addEventListener('click', async () => {
    before();
    const how = await saveBackupFile(collect(installedVersion()));
    say(how === 'cancelled' ? 'No backup was made.' : how === 'shared' ? 'Backup made. Keep the file somewhere safe (Files, iCloud Drive, an email to yourself).' : 'Backup downloaded. Keep the file somewhere safe.');
  });
  return b;
}

/** Restore: choose a file; if it is a whole backup of this game, a second tap puts it in place and restarts. */
export function restoreButton(cls: string, say: (msg: string) => void) {
  const b = document.createElement('button'), label = 'Restore from a backup';
  let picked: BackupFile | null = null;
  b.className = cls; b.textContent = label; b.dataset.k = 'backup_restore';
  b.addEventListener('click', async () => {
    if (picked) {
      // Nothing may save over the restored journeys on the way out (the page hiding saves the one in play).
      freezeSaves();
      restore(picked);
      location.reload();
      return;
    }
    const text = await pickBackupFile();
    if (text === null) return;
    const c = check(text);
    if (!c.ok) { say(c.why); return; }
    picked = c.file;
    const n = journeys(c.file);
    b.textContent = `Tap again: restore ${n} journey${n > 1 ? 's' : ''} from ${day(Date.parse(c.file.made) || Date.now())}`;
    b.classList.add('warn');
    say('Restoring replaces the journeys on this device with the backup\'s. The ones replaced are kept, and Save & system can put them back.');
    // Left alone, the question goes away.
    setTimeout(() => { if (picked) { picked = null; b.textContent = label; b.classList.remove('warn'); } }, 20000);
  });
  return b;
}

/** Undo the last restore (shown only while the journeys it replaced are still kept): a second tap puts them back. */
export function undoButton(cls: string): HTMLButtonElement | null {
  const n = undoable();
  if (!n) return null;
  const b = document.createElement('button');
  let armed = false;
  b.className = cls; b.textContent = 'Undo the last restore'; b.dataset.k = 'backup_undo';
  b.addEventListener('click', () => {
    if (!armed) { armed = true; b.textContent = `Tap again: put back the ${n > 1 ? `${n} journeys` : 'journey'} it replaced`; b.classList.add('warn'); return; }
    freezeSaves();
    undoRestore();
    location.reload();
  });
  return b;
}
