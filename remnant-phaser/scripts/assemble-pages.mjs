// Keep source builds unchanged for their browser suites. The published artifact
// serves Phaser at the existing app URL and retains both explicit editions.
import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
const out = 'remnant/dist-pages';
await rm(out, { recursive: true, force: true }); await mkdir(out, { recursive: true });
await cp('remnant-phaser/dist', out, { recursive: true });
await cp('remnant-phaser/dist', out + '/phaser', { recursive: true });
await cp('remnant/dist', out + '/classic', { recursive: true });
const manifest = JSON.parse(await readFile('remnant/public/manifest.webmanifest', 'utf8'));
await writeFile(out + '/manifest.webmanifest', JSON.stringify(manifest, null, 2) + '\n');
// The fallback owns its own caches. It must not remove an installed main app.
let worker = await readFile(out + '/classic/sw.js', 'utf8');
worker = worker.replace("const CACHE = 'remnant-' + VERSION;", "const CACHE = 'remnant-classic-' + VERSION;");
worker = worker.replace("k.startsWith('remnant-') &&", "k.startsWith('remnant-classic-') &&");
worker = worker.replace("url.origin !== location.origin) return;", "url.origin !== location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;");
await writeFile(out + '/classic/sw.js', worker);
console.log('Pages artifact: Phaser main + /phaser/ + isolated /classic/ fallback.');
