// Adds songs made in Suno to the game: `node scripts/add-songs.mjs <files or folders>`.
// Each file is matched to a song in soundtrack/songs.json by its id or its title
// (Suno names downloads after the song title), levelled to the same loudness
// with ffmpeg and written to public/music/<id>.mp3, where the game looks for it.
// `--as <id>` names the song for a single file whose name does not match.
// Run with no files to see which songs are present and which are still to make.
import { readFile, readdir, stat, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve, join, extname, basename } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const { songs } = JSON.parse(await readFile(join(root, 'soundtrack/songs.json'), 'utf8'));
const out = join(root, 'public/music');
const norm = (s) => s.toLowerCase().normalize('NFKD').replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
const AUDIO = new Set(['.mp3', '.wav', '.m4a', '.flac', '.ogg', '.aac']);

const args = process.argv.slice(2);
let as = null;
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--as') { as = args[++i]; continue; }
  const p = resolve(args[i]);
  const st = await stat(p).catch(() => null);
  if (!st) { console.error(`Not found: ${args[i]}`); process.exitCode = 1; continue; }
  if (st.isDirectory()) for (const f of await readdir(p)) { if (AUDIO.has(extname(f).toLowerCase())) files.push(join(p, f)); }
  else files.push(p);
}
if (as && files.length !== 1) { console.error('--as names one file at a time.'); process.exit(1); }
if (as && !songs.some((s) => s.id === as)) { console.error(`No song with id "${as}" in soundtrack/songs.json.`); process.exit(1); }

/** A Suno download is often "Title.mp3", "Title (1).mp3" or "Title (Instrumental).mp3"; an id works too. */
function match(file) {
  const name = basename(file, extname(file));
  const n = norm(name);
  const byId = songs.find((s) => s.id === name || norm(s.id) === n);
  if (byId) return byId;
  // A title that includes its brackets, like "Remnant's Rest (Hearth)", wins outright.
  const full = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const exact = songs.find((s) => full(s.title) === full(name));
  if (exact) return exact;
  const instrumental = /instrumental|inst\b/i.test(name);
  // The longest matching title is the most specific ("Remnant's Rest (1)" is not "Remnant").
  const hits = songs.filter((s) => n === norm(s.title) || n.startsWith(norm(s.title) + ' ')).sort((a, b) => norm(b.title).length - norm(a.title).length);
  const best = hits.filter((s) => norm(s.title) === norm(hits[0]?.title ?? ''));
  const same = best.find((s) => (s.kind === 'instrumental') === instrumental);
  if (same) return same;
  // "<Vocal title> (Instrumental)": Suno's instrumental of a vocal song stands for that chapter's instrumental.
  if (instrumental && best.length) {
    const inst = songs.filter((s) => s.kind === 'instrumental' && s.chapter === best[0].chapter);
    return inst.length === 1 ? inst[0] : null;
  }
  return best.length === 1 ? best[0] : null;
}

if (files.length) {
  if (spawnSync('ffmpeg', ['-version']).status !== 0) { console.error('ffmpeg is needed to level the songs (https://ffmpeg.org).'); process.exit(1); }
  await mkdir(out, { recursive: true });
  for (const f of files) {
    const song = as ? songs.find((s) => s.id === as) : match(f);
    if (!song) { console.error(`? ${basename(f)}: no matching song; rename it to a song id or use --as <id>.`); process.exitCode = 1; continue; }
    const dest = join(out, song.id + '.mp3');
    // Same loudness for every song (and a little headroom under the sound effects), 44.1 kHz stereo, 160 kb/s.
    const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', f, '-vn', '-af', 'loudnorm=I=-17:TP=-1.5:LRA=11', '-ar', '44100', '-ac', '2', '-b:a', '160k', dest], { stdio: 'inherit' });
    if (r.status !== 0) { console.error(`✗ ${basename(f)}: ffmpeg failed`); process.exitCode = 1; continue; }
    console.log(`✓ ${basename(f)} → public/music/${song.id}.mp3 (${song.title}, ${song.kind})`);
  }
}

const have = new Set((await readdir(out).catch(() => [])).filter((f) => f.endsWith('.mp3')).map((f) => f.slice(0, -4)));
console.log(`\n${have.size} of ${songs.length} songs present:`);
for (const s of songs) console.log(`  ${have.has(s.id) ? '✓' : '·'} ${s.id.padEnd(18)} ${s.chapter.padEnd(15)} ${s.kind.padEnd(12)} ${s.title}`);
