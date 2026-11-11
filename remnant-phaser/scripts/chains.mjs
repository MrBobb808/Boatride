// The Sundered Chains (src/game/chains.ts; the owner's ask of 10 November 2026): Elior's chained blades. Without them
// the Chain key does nothing; finishing Chapter I wins them. The lash reaches a foe the sword cannot, sets it burning,
// and runs lash → lash → slam → cyclone on repeated presses. A far light foe is hooked and dragged to his feet, and
// his next blow lands harder; a heavy one carries him to it and into a strike. Down + Heavy lashes too; Tirzah and the
// Unshorn's bare hands do not. The chain is drawn while it is out and gone after. Run after `npm run build`.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const errors = [];
const E = (page, fn, arg) => page.evaluate(fn, arg);
const until = (page, fn, arg, timeout = 15000) => page.waitForFunction(fn, arg, { timeout });
// Headless, the scene runs slower than the wall clock: every wait is on the game's own state or clock.
/** Free, on the ground, and the last blow's combo window closed: the next press starts afresh. */
const idle = (page) => until(page, () => { const p = window.__remnant.world.player; return p.state === 'free' && p.onGround && !p.linger; });
/** Settled on the ground, then a real jump: off the ground and rising (he is not on the ground for a frame after he is
 * placed, which is not a jump). Space is left held; the caller lets it go. */
const leap = async (page) => {
  await until(page, () => { const p = window.__remnant.world.player; return p.onGround && p.state === 'free'; });
  await page.keyboard.down('Space');
  await until(page, () => { const p = window.__remnant.world.player; return !p.onGround && p.body.velocity.y < -120; });
};
/** `secs` of game time. */
const gameWait = async (page, secs) => { const t0 = await E(page, () => window.__remnant.world.player.clock); await until(page, ([t0, secs]) => window.__remnant.world.player.clock - t0 >= secs, [t0, secs]); };

try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  await page.goto(base + '?debug&nostory&autostart&fresh');
  await until(page, () => window.__remnant?.world?.player && !window.__remnant.world.transitioning, null, 60000);
  await E(page, () => { const w = window.__remnant.world; w.save.level = 12; w.refreshStats(); window.__remnant.warp('ashen_road', 'left'); });
  await until(page, () => window.__remnant.world.room.id === 'ashen_road' && !window.__remnant.world.transitioning);

  // Helpers in the page: the room's foes held still where a case wants them, Elior kept alive and facing right.
  await E(page, () => {
    const w = window.__remnant.world, L = w.classic;
    const T = (window.__t = {
      foes: () => L.ents.filter((e) => e.isFoe && !e.dying && !e.remove && !e.isBoss),
      /** Park every foe far away, then stand the first `n` at these offsets ahead of Elior, whole and still. */
      set(...dx) {
        const p = w.player, fs = T.foes();
        // Every case starts from the same spot (his lunges carry him forward, and a ledge stands further along).
        p.placeAt(T.home.x, T.home.feet, 1);
        for (const f of fs) { f.x = 99999; f.body.vx = 0; }
        T.held = dx.map((d, i) => { const f = fs[i]; f.hp = f.maxHp = 1e7; f.burn = 0; f.x = p.x + d; f.y = p.feet; f.body.vx = f.body.vy = 0; return { f, d }; });
        p.face = 1; p.hookCd = 0; p.hp = p.maxHp;
        return T.held.map((h) => h.f);
      },
      held: [],
      home: { x: w.player.x, feet: w.player.feet },
      seen: new Set(),
      chainShown: 0,
    });
    // Keep him alive, and note every move he makes and whether the chain is drawn.
    setInterval(() => {
      const p = w.player; p.hp = p.maxHp;
      if (p.state === 'attack') T.seen.add(p.atk.id);
      if (p.state === 'hook') T.seen.add('hook:' + p.hook.phase);
      if (p.chainFx.a.live) T.chainShown++;
    }, 8);
  });
  const P = (page) => E(page, () => { const p = window.__remnant.world.player; return { state: p.state, atk: p.state === 'attack' ? p.atk.id : null, x: p.x }; });

  // ---- without the chains, the key does nothing
  await E(page, () => window.__t.set(60));
  await page.keyboard.press('KeyY');
  await gameWait(page, 0.1);
  assert.equal((await P(page)).state, 'free', 'without the chains the Chain key does nothing');

  // ---- finishing Chapter I wins them (the next door grants them)
  await E(page, () => { const w = window.__remnant.world; w.save.flags.ending_done = true; window.__remnant.warp('ashen_road', 'left'); });
  await until(page, () => window.__remnant.world.save.flags.sundered_chains === true && !window.__remnant.world.transitioning);
  console.log('Won: finishing Chapter I gave the Sundered Chains');

  // ---- the lash reaches where the sword cannot, and sets its foe burning
  const sword = await E(page, async () => {
    const [f] = window.__t.set(104), hp = f.hp;
    window.__hp0 = hp; return 0;
  });
  await page.keyboard.press('KeyJ');
  await until(page, () => window.__t.seen.has('b1'));
  await idle(page);
  const swordDealt = await E(page, () => window.__hp0 - window.__t.held[0].f.hp);
  await E(page, () => { window.__t.set(104); window.__t.seen.clear(); window.__t.chainShown = 0; });
  await page.keyboard.press('KeyY');
  await until(page, () => window.__t.seen.has('ch1'));
  await until(page, () => window.__remnant.world.player.state === 'free');
  const lash = await E(page, () => { const { f } = window.__t.held[0]; return { dealt: f.maxHp - f.hp, burn: f.burn, shown: window.__t.chainShown, live: window.__remnant.world.player.chainFx.a.live }; });
  assert.equal(sword + swordDealt, 0, 'the sword does not reach a foe 104 px away');
  assert.ok(lash.dealt > 0 && lash.burn > 0, `the lash reached it and set it burning (${JSON.stringify(lash)})`);
  assert.ok(lash.shown > 3 && !lash.live, `the chain was drawn while it was out and is gone after (${JSON.stringify(lash)})`);
  console.log(`Lash: ${lash.dealt} dealt at 104 px (the sword: ${swordDealt}), burning ${lash.burn.toFixed(1)} s`);

  // ---- repeated presses: lash, lash, the slam, then the cyclone (after the last lash's combo window has closed)
  await idle(page);
  await E(page, () => { window.__t.set(70, 90); window.__t.seen.clear(); });
  for (let i = 0; i < 40 && !(await E(page, () => window.__t.seen.has('chcyc'))); i++) { await page.keyboard.press('KeyY'); await gameWait(page, 0.08); }
  const combo = await E(page, () => [...window.__t.seen]);
  assert.deepEqual(combo.filter((id) => id.startsWith('ch')), ['ch1', 'ch2', 'ch3', 'chcyc'], `the chain combo runs lash, lash, slam, cyclone (${combo})`);
  await page.screenshot({ path: 'qa/chains-cyclone.png' });
  await until(page, () => window.__remnant.world.player.state === 'free');
  console.log(`Combo: ${combo.join(' → ')}`);

  // ---- out of the sword's third blow, the chains whirl
  await idle(page);
  await E(page, () => { window.__t.set(40); window.__t.seen.clear(); });
  for (let i = 0; i < 30 && !(await E(page, () => window.__t.seen.has('b3'))); i++) { await page.keyboard.press('KeyJ'); await gameWait(page, 0.1); }
  for (let i = 0; i < 20 && !(await E(page, () => window.__t.seen.has('chcyc'))); i++) { await page.keyboard.press('KeyY'); await gameWait(page, 0.06); }
  assert.ok(await E(page, () => window.__t.seen.has('chcyc')), 'the sword\'s third blow cancels into the cyclone');
  await until(page, () => window.__remnant.world.player.state === 'free');

  // ---- the hook: a far light foe is dragged to his feet, and his next blow lands harder
  await idle(page);
  const x0 = await E(page, () => { window.__t.set(150); window.__t.seen.clear(); return window.__remnant.world.player.x; });
  await page.keyboard.press('KeyY');
  await until(page, () => window.__t.seen.has('hook:throw'));
  await page.screenshot({ path: 'qa/chains-hook.png' });
  await until(page, () => window.__remnant.world.player.state !== 'hook');
  const yank = await E(page, () => { const p = window.__remnant.world.player, { f } = window.__t.held[0]; return { gap: Math.round(f.x - p.x), moved: Math.round(p.x), bonus: p.swapStrikeT, seen: [...window.__t.seen], hurt: f.maxHp - f.hp, burn: f.burn }; });
  assert.ok(yank.seen.includes('hook:yank') && yank.gap > 0 && yank.gap < 70, `the hooked foe was dragged to his feet (${JSON.stringify(yank)})`);
  assert.ok(Math.abs(yank.moved - x0) < 30 && yank.bonus > 0 && yank.hurt > 0 && yank.burn > 0, `he stood his ground, the hook bit, and his next blow is readied (${JSON.stringify(yank)})`);
  console.log(`Hook (light): the foe came from 150 px to ${yank.gap} px; next blow readied`);

  // ---- a heavy foe carries him to it, and into the arriving strike
  await idle(page);
  await until(page, () => window.__remnant.world.player.state === 'free');
  await E(page, () => { const [f] = window.__t.set(160); f.heavyBody = true; window.__t.seen.clear(); });
  await page.keyboard.press('KeyY');
  await until(page, () => window.__t.seen.has('charrive'));
  const carry = await E(page, () => { const p = window.__remnant.world.player, { f } = window.__t.held[0]; f.heavyBody = false; return { gap: Math.round(Math.abs(f.x - p.x)), seen: [...window.__t.seen] }; });
  assert.ok(carry.seen.includes('hook:fly') && carry.gap < 80, `the chain carried him to the heavy foe (${JSON.stringify(carry)})`);
  await until(page, () => window.__remnant.world.player.state === 'free');
  console.log(`Hook (heavy): the chain carried him 160 px to within ${carry.gap} px, into the strike`);

  // ---- nothing in reach: the lash, not a throw at nothing
  await idle(page);
  await E(page, () => { window.__t.set(); window.__t.seen.clear(); });
  await page.keyboard.press('KeyY');
  await until(page, () => window.__t.seen.has('ch1'));
  await until(page, () => window.__remnant.world.player.state === 'free');

  // ---- Down + Heavy lashes too
  await idle(page);
  await E(page, () => { window.__t.set(60); window.__t.seen.clear(); });
  await page.keyboard.down('KeyS'); await page.keyboard.press('KeyK'); await page.keyboard.up('KeyS');
  await until(page, () => window.__t.seen.has('ch1'));
  await until(page, () => window.__remnant.world.player.state === 'free');
  console.log('Down + Heavy lashes the chains');

  // ---- in the air: one wheel of fire a leap
  await idle(page);
  // No foe in reach, so the wheel is the only answer (with one near, a higher leap puts it in the hook's reach).
  await E(page, () => { window.__t.set(); window.__t.seen.clear(); });
  await leap(page);
  await page.keyboard.press('KeyY');
  await page.keyboard.up('Space');
  await until(page, () => window.__t.seen.has('chair'));
  await until(page, () => { const p = window.__remnant.world.player; return p.onGround && p.state === 'free'; });
  console.log('Aloft: the wheel of fire');

  // ---- and aloft with a foe in reach: the hook, from the air
  await idle(page);
  await E(page, () => { window.__t.set(140); window.__t.seen.clear(); });
  await leap(page);
  await page.keyboard.press('KeyY');
  await page.keyboard.up('Space');
  await until(page, () => window.__t.seen.has('hook:throw'));
  await until(page, () => { const p = window.__remnant.world.player; return p.onGround && p.state === 'free'; });
  console.log('Aloft: a foe in reach is hooked from the air');

  // ---- the touch button stands with the others, and the chains are not Tirzah's
  const spec = await E(page, () => { const hud = window.__remnant.game.scene.getScene('hud'); return hud.btns.some((b) => b.a === 'chain'); });
  assert.ok(spec, 'the HUD has a CHAINS touch button');
  await E(page, () => { const w = window.__remnant.world; w.save.playableHero = 'tirzah'; window.__t.set(60); window.__t.seen.clear(); });
  await page.keyboard.press('KeyY');
  await gameWait(page, 0.2);
  assert.ok(!(await E(page, () => [...window.__t.seen].some((id) => id.startsWith('ch') || id.startsWith('hook')))), 'the chains are Elior\'s, not Tirzah\'s');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser chains: all checks passed');
} catch (e) {
  // What he was doing when a wait ran out, for the log.
  const page = browser.contexts()[0]?.pages()[0];
  if (page) console.error('At failure:', await page.evaluate(() => { const p = window.__remnant?.world?.player; return p ? { state: p.state, atk: p.atk?.id, linger: p.linger, ground: p.onGround, hook: p.hook?.phase, vy: Math.round(p.body.velocity.y), airChain: p.airChain, seen: [...(window.__t?.seen ?? [])] } : null; }).catch(() => null));
  throw e;
} finally {
  await browser.close();
  close();
}
