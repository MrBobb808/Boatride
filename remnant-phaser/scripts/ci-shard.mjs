// Runs one shard of the browser checks listed in scripts/ci-tests.txt (NEXT_PLAN.md A2): `node scripts/ci-shard.mjs 2 8`
// runs every check whose place in the list, modulo 8, is 2, one after another against the built dist/. A failed check
// does not stop the shard: every check runs, the failures are listed at the end, and the shard fails if any did.
// With no arguments it runs the whole list (the same as CI, on one machine).
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const [shard = 0, of = 1] = process.argv.slice(2).map(Number);
const list = readFileSync(new URL('./ci-tests.txt', import.meta.url), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
// A check that exists but is not listed would never run: say so in every shard.
const skip = new Set(['ci-shard.mjs', 'serve.mjs', 'postbuild.mjs', 'assemble-pages.mjs', 'cutover.mjs', 'balance-report.mjs', 'perf.mjs', ...list]);
const unlisted = readdirSync(new URL('.', import.meta.url)).filter((f) => f.endsWith('.mjs') && !skip.has(f));
if (unlisted.length) console.log(`Not in ci-tests.txt (not run by CI): ${unlisted.join(', ')}`);

const mine = list.filter((_, i) => i % of === shard), failed = [];
console.log(`Shard ${shard} of ${of}: ${mine.length} checks\n`);
for (const script of mine) {
  const t = Date.now();
  console.log(`::group::${script}`);
  const r = spawnSync(process.execPath, [`scripts/${script}`], { stdio: 'inherit' });
  console.log('::endgroup::');
  const secs = ((Date.now() - t) / 1000).toFixed(0);
  if (r.status === 0) console.log(`ok    ${script} (${secs} s)`);
  else { failed.push(script); console.log(`FAIL  ${script} (${secs} s, exit ${r.status ?? r.signal})`); }
}
if (failed.length) { console.error(`\n${failed.length} failed: ${failed.join(', ')}`); process.exit(1); }
console.log(`\nShard ${shard}: all ${mine.length} passed`);
