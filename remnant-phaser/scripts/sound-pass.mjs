// The archer's sound pass (POLISH_PLAN §3): each bow event plays its own
// generated sound, panned by where it happens: the string creaks rising
// through a draw, the Perfect Draw chimes, a charged shot cracks and whistles,
// an arrow pierces a foe or thunks into a wall, Recall rips, every ability and
// the Wings have a signature, and repeats vary in pitch. Run after `npm run build`.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const errors = [];
const E = (page, fn, arg) => page.evaluate(fn, arg);
const until = (page, fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout }).catch(async (e) => {
  const s = await page.evaluate(() => ({ state: window.__remnant.world.player.state, heard: window.heard.map((h) => h[0]).slice(-20) }));
  throw Error(`${e.message}\n${fn}\n${JSON.stringify(s)}\n${errors.join('\n')}`);
});
const heard = (page, name) => E(page, (n) => window.heard.filter((h) => h[0] === n), name);
const ready = (page) => until(page, () => { const p = window.__remnant.world.player; return p.state === 'free' && p.onGround; });

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  await page.goto(base + '?debug&nostory&autostart&fresh');
  await until(page, () => window.__remnant?.world?.player?.onGround, undefined, 20000);
  await E(page, () => window.__remnant.world.loadRoom('ashen_road', 'left'));
  await until(page, () => { const w = window.__remnant.world; return w.player.onGround && !w.transitioning; });
  // Record every effect asked of the engine (name, pitch, pan), whether or not the page may sound yet.
  await E(page, () => {
    const R = window.__remnant, w = R.world, s = w.save, open = (x, y) => w.tileAt(Math.floor(x / 16), Math.floor(y / 16)) === 0;
    window.heard = [];
    const play = R.audio.play.bind(R.audio);
    R.audio.play = (name, o = {}) => { window.heard.push([name, o.pitch ?? 1, o.pan ?? 0]); return play(name, o); };
    Object.assign(s, { level: 30, playableHero: 'tirzah', mantle: 100 }); s.archer.level = 30; s.flags.relic_taken = true; s.flags.mantle_known = true;
    s.archerSkills = ['deliverance', 'jonathan', 'mark'];
    w.refreshStats(); w.d.crit = 0; w.player.bow.wingsCrit = 0;
    const f = w.classic.ents.find((e) => e.isFoe && !e.dying && !e.flying);
    for (const e of w.classic.ents) if (e !== f && e.isFoe) e.remove = true;
    const feet = w.player.feet, flat = (x) => { for (let dx = -200; dx <= 60; dx += 8) if (open(x + dx, feet + 2) || !open(x + dx, feet - 2) || !open(x + dx, feet - 40)) return false; return true; };
    let x = 0; for (let tx = 220; tx < w.roomW() - 80; tx += 8) if (flat(tx)) { x = tx; break; }
    f.x = x; f.y = feet; f.hp = f.maxHp = 1e8; f.think = function () { this.body.vx = 0; }; f.executable = () => false;
    window.target = f;
    window.place = (dx) => { const p = w.player; f.staggered = 0; f.x = x; f.y = feet; p.placeAt(x + dx, feet, 1); p.body.setVelocity(0, 0); p.bow.cancel(); w.save.ce = p.maxCe; for (const k in p.cds) p.cds[k] = 0; window.heard.length = 0; };
  });
  await ready(page);

  // ---- a held draw creaks, rising; the Perfect window chimes; a charged release cracks and whistles; the hit pierces
  await E(page, () => window.place(-140));
  await page.keyboard.down('KeyK');
  await until(page, () => window.__remnant.world.player.bow.charge >= 0.9);
  await page.keyboard.up('KeyK');
  await until(page, () => window.heard.some((h) => h[0] === 'arrowPierce'));
  const creaks = await heard(page, 'bowCreak');
  const names = await E(page, () => window.heard.map((h) => h[0]));
  assert.ok(creaks.length >= 2 && creaks.at(-1)[1] > creaks[0][1], `the string creaks, rising in pitch (${JSON.stringify(creaks)})`);
  for (const n of ['bowDraw', 'perfectChime', 'bowRelease', 'bowCrack', 'arrowWhistle', 'arrowPierce']) assert.ok(names.includes(n), `${n} played (${names.join(', ')})`);
  const pierce = (await heard(page, 'arrowPierce'))[0];
  assert.ok(pierce[2] !== 0, `the pierce is panned to where it struck (${JSON.stringify(pierce)})`);
  console.log(`Draw: ${creaks.length} creaks rising ${creaks[0][1].toFixed(2)} → ${creaks.at(-1)[1].toFixed(2)}, the Perfect chime, crack, whistle and a panned pierce`);

  // ---- repeats vary: two releases never share a pitch
  await ready(page);
  await E(page, () => window.place(-100));
  for (let i = 0; i < 3; i++) { await page.keyboard.press('KeyJ'); await until(page, (n) => window.heard.filter((h) => h[0] === 'bowRelease').length > n, i); await ready(page); }
  const releases = (await heard(page, 'bowRelease')).map((h) => h[1]);
  assert.ok(releases.every((v, i) => i === 0 || v !== releases[i - 1]), `release pitches vary (${releases})`);
  console.log(`Variation: three releases at pitches ${releases.map((v) => v.toFixed(3)).join(', ')}`);

  // ---- an arrow into a wall thunks; Recall rips
  await E(page, () => { const w = window.__remnant.world, p = w.player; window.place(-100); p.placeAt(p.x, p.feet, -1); });
  // Hold left so the shot goes away from the foe, into the room's left wall.
  await page.keyboard.down('KeyA'); await page.keyboard.press('KeyJ'); await page.keyboard.up('KeyA');
  await until(page, () => window.heard.some((h) => h[0] === 'arrowThunk'), undefined, 10000);
  await ready(page);
  await E(page, () => { window.place(-90); });
  await page.keyboard.press('KeyJ');
  await until(page, () => window.__remnant.world.player.bow.embeddedCount > 0);
  await ready(page);
  await page.keyboard.down('KeyS'); await page.keyboard.press('KeyK'); await page.keyboard.up('KeyS');
  await until(page, () => window.heard.some((h) => h[0] === 'arrowRecall'));
  console.log('Impacts: a wall shot thunked and Recall ripped the arrows home');

  // ---- every ability has its own signature
  const abilities = { deliverance: 'deliverance', jonathan: 'volleyPlant', mark: 'markLock', rain: 'arrowRain', watchman: 'watchEye', quiver: 'quiverMight' };
  for (const [id, sound] of Object.entries(abilities)) {
    await ready(page);
    await E(page, (id) => { window.place(-120); const kit = window.__remnant.world.player.bow.kit; kit.rainT = 0; kit.cast(id); }, id);
    await until(page, (s) => window.heard.some((h) => h[0] === s), sound);
  }
  console.log(`Abilities: ${Object.values(abilities).join(', ')}`);

  // ---- the Wings form with their own stinger, and the jab rings
  await ready(page);
  await E(page, () => window.place(-90));
  await page.keyboard.press('KeyG');
  await until(page, () => window.heard.some((h) => h[0] === 'wingsForm'));
  assert.ok(!(await E(page, () => window.heard.some((h) => h[0] === 'transform'))), "Tirzah's form doesn't play the Mantle's sound");
  await until(page, () => window.__remnant.world.player.dawn.active, undefined, 15000);
  await E(page, () => { const w = window.__remnant.world; window.place(-90); w.d.crit = 1; w.player.dawn.autoCd = 0; window.target.maxHp = 1000; window.target.hp = 300; });
  await page.keyboard.press('KeyJ');
  await until(page, () => window.heard.some((h) => h[0] === 'dawnJab'));
  console.log("Wings: their own stinger, and the jab's bell");

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser sound pass: all checks passed');
} finally {
  await browser.close();
  close();
}
