// A journey that cannot be lost (src/game/backup.ts, backupUi.ts; NEXT_PLAN.md A1). Save & system → Back up my journey
// hands the player one file with everything the game keeps. On a new phone (a fresh browser here) the home screen's
// Restore reads it back: a second tap puts it in place and the journey is there again, every key as it was. A file
// that is not a backup, or a damaged one, is refused and changes nothing. Restoring over a journey keeps the one it
// replaces (ordinary saves never touch that copy), nothing saves over the restored one on the way out, and Save &
// system can undo it. The reminder speaks
// only after two hours of play, fourteen days without a backup, and at most once a week. Run after `npm run build`.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const errors = [];
const E = (page, fn, arg) => page.evaluate(fn, arg);
const until = (page, fn, arg, timeout = 60000) => page.waitForFunction(fn, arg, { timeout });
const dir = mkdtempSync(join(tmpdir(), 'remnant-backup-'));
const KEY = 'remnant-phaser.save.v2';
const watch = (page) => {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
};
const inWorld = (page) => until(page, () => window.__remnant?.world?.player && !window.__remnant.world.transitioning);
const atTitle = (page) => until(page, () => window.__remnant?.game?.scene?.isActive('title') && document.querySelector('.hm-btn'));
/** Choose `file` with the restore control `sel` (the first tap opens the picker). */
const choose = async (page, sel, file) => {
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click(sel)]);
  await fc.setFiles(file);
};

try {
  // ---- the phone with the journey: play, then back it up from Save & system
  const old = await browser.newContext({ viewport: { width: 1280, height: 720 }, acceptDownloads: true });
  const page = await old.newPage(); watch(page);
  await page.goto(base + '?debug&nostory&autostart&fresh');
  await inWorld(page);
  await E(page, () => { const w = window.__remnant.world; w.save.level = 17; w.save.silver = 4321; w.save.playtime = 9000; w.refreshStats(); w.persist();
    // A Trial record (the boards are kept apart from the saves), and an old recovery copy that is no one's progress.
    localStorage.setItem('remnant.board.v1', JSON.stringify([{ round: 31, level: 17 }]));
    localStorage.setItem('remnant-phaser.before-cutover.slot0', '{"old":true}');
    window.__remnant.G.ui.openMenu('system'); });
  await page.waitForSelector('[data-k=backup_now]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-k=backup_now]')]);
  const file = join(dir, dl.suggestedFilename());
  await dl.saveAs(file);
  const made = JSON.parse(readFileSync(file, 'utf8'));
  assert.match(dl.suggestedFilename(), /^remnant-ascension-backup-\d{4}-\d\d-\d\d\.json$/, `the file is named for the game and the day (${dl.suggestedFilename()})`);
  assert.ok(made.app === 'remnant-ascension' && made.kind === 'backup' && made.v === 1 && typeof made.build === 'string', 'the file says what it is');
  const inFile = JSON.parse(made.keys[KEY]);
  assert.ok(inFile.level === 17 && inFile.silver === 4321, `the journey is in it (level ${inFile.level}, ${inFile.silver} silver)`);
  assert.ok(Object.keys(made.keys).every((k) => /^remnant(-phaser)?\./.test(k) && !k.endsWith('.bak') && !k.includes('.before-')), `only this game's keys, no last-good or recovery copies (${Object.keys(made.keys)})`);
  assert.equal(made.keys['remnant.board.v1'], JSON.stringify([{ round: 31, level: 17 }]), 'the Trial\'s board is in it');
  assert.ok(await E(page, () => window.__remnant.backup.lastBackup() > Date.now() - 60000), 'the device remembers when it was backed up');
  console.log(`Backup: ${dl.suggestedFilename()} holds ${Object.keys(made.keys).length} keys, the journey at level 17`);

  // ---- a new phone: nothing here; a wrong file and a damaged one are refused; the backup brings the journey back
  const fresh = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p2 = await fresh.newPage(); watch(p2);
  await p2.goto(base + '?debug');
  await atTitle(p2);
  assert.equal(await E(p2, (KEY) => localStorage.getItem(KEY), KEY), null, 'a new phone has no journey');
  const junk = join(dir, 'holiday.json'), broken = join(dir, 'broken.json'), newer = join(dir, 'newer.json');
  writeFileSync(junk, JSON.stringify({ photos: ['beach.jpg'] }));
  writeFileSync(broken, JSON.stringify({ ...made, keys: { ...made.keys, [KEY]: made.keys[KEY].slice(0, 200) } }));
  writeFileSync(newer, JSON.stringify({ ...made, v: 2 }));
  for (const [f, why] of [[junk, /not a backup of this game/], [broken, /damaged/], [newer, /newer version/]]) {
    await choose(p2, '[data-k=backup_restore]', f);
    await until(p2, (re) => new RegExp(re).test(document.querySelector('[data-k=title_backup_note]')?.textContent ?? ''), why.source, 10000);
    assert.equal(await E(p2, (KEY) => localStorage.getItem(KEY), KEY), null, `${why.source}: refused, and nothing changed`);
    assert.equal(await E(p2, () => document.querySelector('[data-k=backup_restore]').textContent), 'Restore from a backup', 'the control still offers a restore');
  }
  console.log('Refused: a file that is not a backup, a damaged one and one from a newer version; nothing changed');
  await choose(p2, '[data-k=backup_restore]', file);
  await until(p2, () => /^Tap again: restore 1 journey from /.test(document.querySelector('[data-k=backup_restore]').textContent), null, 10000);
  assert.equal(await E(p2, (KEY) => localStorage.getItem(KEY), KEY), null, 'choosing the file changes nothing until the second tap');
  await Promise.all([p2.waitForEvent('load'), p2.click('[data-k=backup_restore]')]);
  await atTitle(p2);
  const back = await E(p2, (keys) => ({ same: Object.entries(keys).every(([k, v]) => localStorage.getItem(k) === v), meta: document.querySelector('.hm-meta')?.textContent, first: document.querySelector('[data-k=title_first]')?.textContent }), made.keys);
  assert.ok(back.same, 'every key is as it was on the old phone');
  assert.ok(/Level 17/.test(back.meta) && back.first === 'Continue', `the home screen offers the journey again (${back.meta}; ${back.first})`);
  console.log(`Restored on a new phone: ${back.meta}`);

  // ---- restoring over a journey: the one replaced is kept as the last-good copy, and nothing saves over the restored
  // (Continuing the journey: the first visit's `fresh` would begin a new one again on the reload.)
  await page.goto(base + '?debug&nostory&autostart');
  await inWorld(page);
  await E(page, () => { const w = window.__remnant.world; w.save.level = 20; w.refreshStats(); w.persist(); window.__remnant.G.ui.openMenu('system'); });
  await page.waitForSelector('[data-k=backup_restore]');
  await choose(page, '[data-k=backup_restore]', file);
  await until(page, () => /^Tap again/.test(document.querySelector('[data-k=backup_restore]').textContent), null, 10000);
  await Promise.all([page.waitForEvent('load'), page.click('[data-k=backup_restore]')]);
  await inWorld(page);
  const over = await E(page, (KEY) => ({ now: JSON.parse(localStorage.getItem(KEY)).level, live: window.__remnant.world.save.level, kept: JSON.parse(localStorage.getItem(KEY + '.before-restore') ?? '{}').level }), KEY);
  assert.deepEqual(over, { now: 17, live: 17, kept: 20 }, `the backup's journey is in play and the replaced one is kept (${JSON.stringify(over)})`);
  // Ordinary saves do not touch the kept copy, and a new backup does not carry it.
  const after = await E(page, (KEY) => { const w = window.__remnant.world; w.persist(); w.persist(); return { kept: JSON.parse(localStorage.getItem(KEY + '.before-restore')).level, inBackup: Object.keys(window.__remnant.backup.collect('test').keys).some((k) => k.endsWith('.before-restore')) }; }, KEY);
  assert.deepEqual(after, { kept: 20, inBackup: false }, `the kept journey outlasts ordinary saves and stays out of backups (${JSON.stringify(after)})`);
  console.log('Restored over a journey: level 17 in play, level 20 kept');

  // ---- and undone: Save & system puts the replaced journey back
  await E(page, () => window.__remnant.G.ui.openMenu('system'));
  await page.waitForSelector('[data-k=backup_undo]');
  await page.click('[data-k=backup_undo]');
  await Promise.all([page.waitForEvent('load'), page.click('[data-k=backup_undo]')]);
  await inWorld(page);
  const undone = await E(page, (KEY) => ({ live: window.__remnant.world.save.level, kept: localStorage.getItem(KEY + '.before-restore') }), KEY);
  assert.deepEqual(undone, { live: 20, kept: null }, `undoing the restore puts the replaced journey back (${JSON.stringify(undone)})`);
  console.log('Undone: level 20 in play again');

  // ---- the reminder: two hours played, fourteen days without a backup, once a week
  const remind = await E(page, () => {
    const B = window.__remnant.backup, m = new Map(), DAY = 86400e3, t = 1e12;
    const store = { get: (k) => m.get(k) ?? null, set: (k, v) => (m.set(k, v), true), remove: (k) => m.delete(k) };
    const out = { young: B.shouldRemind(3600, store, t), due: B.shouldRemind(9000, store, t) };
    B.noteReminded(store, t);
    out.sameWeek = B.shouldRemind(9000, store, t + 3 * DAY); out.nextWeek = B.shouldRemind(9000, store, t + 8 * DAY);
    B.noteBackup(store, t + 8 * DAY);
    out.afterBackup = B.shouldRemind(9000, store, t + 15 * DAY); out.overdueAgain = B.shouldRemind(9000, store, t + 23 * DAY);
    return out;
  });
  assert.deepEqual(remind, { young: false, due: true, sameWeek: false, nextWeek: true, afterBackup: false, overdueAgain: true }, `the reminder keeps to its rules (${JSON.stringify(remind)})`);
  console.log('Reminder: after two hours of play, fourteen days without a backup, once a week');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser backup: all checks passed');
} finally {
  await browser.close();
  close();
}
