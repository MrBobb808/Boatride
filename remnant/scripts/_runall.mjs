import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const out = process.argv[2];
const names = process.argv.slice(3);
const all = names.length ? names : ['hero-visuals', 'smoke', 'combat-input', 'combat-gauntlet', 'skills-echoes', 'endless-progression', 'wave-access', 'squad-expansion', 'replay-progression', 'background-audio', 'power-walls', 'fallen-campaign', 'transitions'];
let summary = '';
for (const n of all) {
  const t = Date.now();
  const r = spawnSync('node', [`scripts/${n}.mjs`], { encoding: 'utf8', timeout: 900000 });
  writeFileSync(`${out}/${n}.log`, (r.stdout ?? '') + (r.stderr ?? ''));
  const tail = ((r.stdout ?? '') + (r.stderr ?? '')).trim().split('\n').slice(-2).join(' | ');
  summary += `${n}: exit ${r.status} (${((Date.now() - t) / 1000).toFixed(0)} s) ${tail}\n`;
  writeFileSync(`${out}/summary.txt`, summary);
}
console.log(summary);
