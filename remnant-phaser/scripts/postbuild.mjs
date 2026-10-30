// Stamp the multi-file Phaser build and precache every shell asset. Songs are
// kept on demand, so installing never downloads the full soundtrack at once.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const html = readFileSync('dist/index.html', 'utf8');
const commit = process.env.GITHUB_SHA ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const hash = createHash('sha256').update(html).digest('hex').slice(0, 10);
const build = `phaser-${commit.slice(0, 8)}-${hash}`;
// A version a person can read: when it was built (UTC), to the minute.
const at = new Date(), two = (n) => String(n).padStart(2, '0');
const version = `${at.getUTCFullYear()}.${two(at.getUTCMonth() + 1)}.${two(at.getUTCDate())}.${two(at.getUTCHours())}${two(at.getUTCMinutes())}`;
writeFileSync('dist/index.html', html.replace('</head>', `<meta name="remnant-phaser-build" content="${build}" />\n<meta name="remnant-phaser-version" content="${version}" />\n</head>`));
writeFileSync('dist/version.json', JSON.stringify({ build, version, commit, milestone: 'phaser-main' }) + '\n');
const core = ['./', 'index.html', 'manifest.webmanifest', ...readdirSync('dist/assets').map((p) => `assets/${p}`), ...readdirSync('dist/icons').map((p) => `icons/${p}`)];
const sw = readFileSync('public/sw.js', 'utf8').replace('__BUILD__', build).replace('__CORE__', JSON.stringify(core));
writeFileSync('dist/sw.js', sw);
const manifest = JSON.parse(readFileSync('dist/manifest.webmanifest', 'utf8'));
Object.assign(manifest, { name: 'Remnant: Ascension — Phaser', short_name: 'Remnant Phaser', description: 'The Phaser edition of Remnant: Ascension. Progress is saved on this device.' });
writeFileSync('dist/manifest.webmanifest', JSON.stringify(manifest, null, 2) + '\n');
console.log(`Phaser build ${build} (version ${version}): ${core.length} offline shell files; songs cache as played.`);
