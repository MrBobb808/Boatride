// The song plan (soundtrack/songs.json) against the game: every song plays over
// music the game really uses, ids are unique and file-safe, vocal songs carry
// lyrics and cite their scripture, and the readable sheet is up to date.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const { songs } = JSON.parse(await readFile(join(root, 'soundtrack/songs.json'), 'utf8'));

/** Music keys the game can ask for: the score's tracks. */
async function trackKeys() {
  const src = await readFile(join(root, 'src/audio/music.ts'), 'utf8');
  const body = src.slice(src.indexOf('export const TRACKS'));
  return new Set([...body.matchAll(/^ {2}([a-z_0-9]+): ?\{/gm)].map((m) => m[1]));
}
/** Music keys rooms actually use (rooms*.ts, the settlement, and the Fallen Crown biomes). */
async function roomKeys() {
  const dir = join(root, 'src/game');
  const keys = new Set();
  for (const f of await readdir(dir)) {
    if (!/^(rooms\d?|restRoom|rounds|fallenChapters)\.ts$/.test(f)) continue;
    const src = await readFile(join(dir, f), 'utf8');
    for (const m of src.matchAll(/music: ?'([a-z_0-9]+)'/g)) keys.add(m[1]);
    for (const m of src.matchAll(/biome:'([a-z]+)'/g)) keys.add(m[1]);
  }
  return keys;
}

test('every song plays over a score track that exists', async () => {
  const tracks = await trackKeys();
  for (const s of songs) for (const k of s.keys) assert.ok(tracks.has(k), `${s.id}: no score track "${k}"`);
});

test('every chapter place with a song is a place the game goes', async () => {
  const used = await roomKeys();
  for (const k of ['title']) used.add(k);
  for (const s of songs) assert.ok(s.keys.some((k) => used.has(k)), `${s.id}: none of ${s.keys} is used by a room`);
});

test('ids are unique and file-safe; kinds and fields are complete', () => {
  const ids = new Set();
  for (const s of songs) {
    assert.match(s.id, /^[a-z0-9_]+$/);
    assert.match(s.code, /^R\d{2}$/, `${s.id}: code`);
    assert.ok(!songs.some((o) => o !== s && o.code === s.code), `duplicate code ${s.code}`);
    assert.ok(!ids.has(s.id), `duplicate ${s.id}`);
    ids.add(s.id);
    assert.ok(['vocal', 'instrumental'].includes(s.kind), s.id);
    assert.ok(s.title && s.chapter && s.style && s.keys.length, s.id);
    // Suno's style box takes 200 characters on every model.
    assert.ok(s.style.length <= 200, `${s.id}: style is ${s.style.length} characters`);
    if (s.kind === 'vocal') {
      assert.ok(s.lyrics?.includes('[Chorus]'), `${s.id}: lyrics`);
      assert.ok(s.scripture?.length, `${s.id}: scripture references`);
    } else assert.ok(!s.lyrics, `${s.id}: an instrumental has no lyrics`);
  }
});

test('each chapter has its instrumental wherever its vocal plays', () => {
  for (const v of songs.filter((s) => s.kind === 'vocal' && s.chapter !== 'Title')) {
    for (const k of v.keys) assert.ok(songs.some((s) => s.kind === 'instrumental' && s.keys.includes(k)), `${v.id}: no instrumental for "${k}" after the vocal`);
  }
});

test('SOUNDTRACK.md is generated from the plan', async () => {
  const doc = await readFile(join(root, 'SOUNDTRACK.md'), 'utf8');
  for (const s of songs) {
    assert.ok(doc.includes('`' + s.id + '`'), `${s.id} missing from SOUNDTRACK.md: run node scripts/soundtrack-doc.mjs`);
    assert.ok(doc.includes(`${s.title} ${s.code}`), `${s.code} Suno title missing from SOUNDTRACK.md`);
    if (s.lyrics) assert.ok(doc.includes(s.lyrics), `${s.id} lyrics out of date: run node scripts/soundtrack-doc.mjs`);
  }
});
