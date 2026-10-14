// After `vite build`: stamp the service worker with a build id, and write a
// wrapper-free copy of the game for hosting as a claude.ai Artifact
// (the Artifact host supplies its own <html>/<head>/<body> skeleton).
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const dist = resolve('dist');
const build = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);

const swPath = resolve(dist, 'sw.js');
writeFileSync(swPath, readFileSync(swPath, 'utf8').replace('__BUILD__', build));

const html = readFileSync(resolve(dist, 'index.html'), 'utf8');
const pick = (re) => (html.match(re) ?? [])[0] ?? '';
const styles = html.match(/<style[\s\S]*?<\/style>/g) ?? [];
const scripts = html.match(/<script[\s\S]*?<\/script>/g) ?? [];
const body = pick(/<body>([\s\S]*?)<\/body>/).replace(/^<body>/, '').replace(/<\/body>$/, '').replace(/<script[\s\S]*?<\/script>/g, '');
const artifact = [
  '<title>Remnant: Ascension</title>',
  '<meta name="claude:viewport-fit-sides" content="cover">',
  '<meta name="theme-color" content="#07060b">',
  ...styles,
  body.trim(),
  ...scripts,
].join('\n');
mkdirSync(resolve('dist-artifact'), { recursive: true });
writeFileSync(resolve('dist-artifact', 'remnant.html'), artifact);

const kb = (p) => (statSync(p).size / 1024).toFixed(0) + ' KB';
console.log(`build ${build}: dist/index.html ${kb(resolve(dist, 'index.html'))}, dist-artifact/remnant.html ${kb(resolve('dist-artifact', 'remnant.html'))}`);
