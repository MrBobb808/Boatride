// Adds songs to the game from Suno share links: `node scripts/suno-links.mjs <notes.txt>`
// (or pipe the text in). Any text works: every suno.com link in it is followed to
// its song page, the song's title gives its code ("The Ashen Village R05"), the
// MP3 is downloaded and handed to add-songs.mjs, which levels it and writes
// public/music/<id>.mp3. Needs network access to suno.com and *.suno.ai.
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const { songs } = JSON.parse(await readFile(join(root, 'soundtrack/songs.json'), 'utf8'));
const text = process.argv[2] ? await readFile(process.argv[2], 'utf8') : await new Promise((r) => { let s = ''; process.stdin.on('data', (d) => (s += d)); process.stdin.on('end', () => r(s)); });
const links = [...new Set(text.match(/https?:\/\/(?:www\.)?suno\.(?:com|ai)\/[^\s<>"')\]]+/gi) ?? [])];
if (!links.length) { console.error('No suno.com links found.'); process.exit(1); }

const UA = { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' };
const meta = (html, prop) => html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`, 'i'))?.[1]
  ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'))?.[1];
const unescape = (s) => s.replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

const tmp = await mkdtemp(join(tmpdir(), 'suno-'));
const done = new Map();
try {
  for (const link of links) {
    try {
      // Share links (suno.com/s/…) redirect to the song page (suno.com/song/<id>).
      const page = await fetch(link, { headers: UA, redirect: 'follow' });
      if (!page.ok) throw new Error(`the link answered ${page.status}`);
      const html = await page.text();
      const id = (page.url.match(/\/song\/([0-9a-f-]{36})/i) ?? html.match(/\/song\/([0-9a-f-]{36})/i))?.[1];
      const title = unescape(meta(html, 'og:title') ?? html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? '').trim();
      const code = title.match(/\bR(\d{2})\b/i);
      const song = code && songs.find((s) => s.code === 'R' + code[1]);
      if (!song) throw new Error(`its title "${title || '?'}" has no song code (R01–R${songs.length}); rename it in Suno`);
      const audio = meta(html, 'og:audio') ?? meta(html, 'og:audio:url') ?? (id && `https://cdn1.suno.ai/${id}.mp3`);
      if (!audio) throw new Error('no audio found on the song page');
      const res = await fetch(unescape(audio), { headers: UA });
      if (!res.ok) throw new Error(`the MP3 answered ${res.status}`);
      const file = join(tmp, `${song.code}.mp3`);
      await writeFile(file, Buffer.from(await res.arrayBuffer()));
      const r = spawnSync('node', [join(root, 'scripts/add-songs.mjs'), file, '--as', song.id], { encoding: 'utf8' });
      if (r.status !== 0) throw new Error((r.stderr || r.stdout).trim().split('\n')[0]);
      if (done.has(song.id)) console.log(`  (${song.code} came twice; the later link replaced ${done.get(song.id)})`);
      done.set(song.id, link);
      console.log(`✓ ${song.code} ${song.title} (${song.kind}) ← ${link}`);
    } catch (e) {
      console.error(`✗ ${link}: ${e.message}`);
      process.exitCode = 1;
    }
  }
} finally {
  await rm(tmp, { recursive: true, force: true });
}
console.log(`\n${done.size} of ${links.length} links added.`);
spawnSync('node', [join(root, 'scripts/add-songs.mjs')], { stdio: 'inherit' });
