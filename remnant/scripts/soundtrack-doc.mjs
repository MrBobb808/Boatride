// Writes SOUNDTRACK.md (the readable song sheet) from soundtrack/songs.json:
// `node scripts/soundtrack-doc.mjs`. Edit the JSON, then run this.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const { songs } = JSON.parse(await readFile(join(root, 'soundtrack/songs.json'), 'utf8'));
const out = [];
out.push('# Remnant: the song layer', '');
out.push('Generated from `soundtrack/songs.json` by `node scripts/soundtrack-doc.mjs`; edit the JSON, not this file.', '');
out.push('## How it works', '');
out.push(
  '- Every chapter has a song with lyrics and an instrumental. The song plays once per session when you arrive in its place; after it, the instrumental loops through the chapter.',
  '- Bosses keep the game\'s own adaptive score, which builds with each phase. Anything without a song file also keeps the score, so the game sounds whole with any number of songs present.',
  '- Settings → Audio → Soundtrack chooses Songs or Score only, and Sung songs turns the lyric versions off.',
  '- Songs are downloaded the first time they play and kept for offline play; game updates do not throw them away.',
  '',
);
out.push('## Making a song in Suno', '');
out.push(
  '1. In Suno, choose Custom. Paste the **Style** below into the style box and the **Lyrics** into the lyrics box (for an instrumental, switch Instrumental on and leave the lyrics empty). Use the **Title** as the song title.',
  '2. Pick the take you like and download it as MP3 (WAV also works).',
  '3. Add it to the game: `node scripts/add-songs.mjs ~/Downloads/<file>` (it matches the file to the song by title, levels the volume and writes `public/music/<id>.mp3`). If the name does not match, add `--as <id>`. Run the script with no files to see which songs are still to make.',
  '4. Listen for the scripture lines: they must be sung word for word as written (King James Version). If Suno changes a word, regenerate or pick another take.',
  '',
);
out.push('## The songs', '');
out.push('| Id | Chapter | Kind | Title | Plays in |', '|---|---|---|---|---|');
for (const s of songs) out.push(`| \`${s.id}\` | ${s.chapter} | ${s.kind} | ${s.title} | ${s.keys.map((k) => '`' + k + '`').join(', ')} |`);
out.push('');
for (const s of songs) {
  out.push(`### ${s.title} (\`${s.id}\`)`, '');
  out.push(`- **Chapter:** ${s.chapter}`, `- **Kind:** ${s.kind}`, `- **Style:** ${s.style}`);
  if (s.scripture?.length) out.push(`- **Scripture (KJV, word for word):** ${s.scripture.join('; ')}`);
  out.push('');
  if (s.lyrics) out.push('```', s.lyrics, '```', '');
}
await writeFile(join(root, 'SOUNDTRACK.md'), out.join('\n'));
console.log(`SOUNDTRACK.md: ${songs.length} songs`);
