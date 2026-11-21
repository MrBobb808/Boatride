// Barak on the journey: the chapter tag and its saved choice, Chain Lightning's leaps and walls, his moveset (the Spark
// String, the Rising Volt, the Thunderhead, the Static Palm and the Thunder Drop, the Beast's claws), the storm
// abilities, Skybreaker, the Tempest Beast's sheets, and Barak in every journey mode.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const ready = () => page.waitForFunction(() => window.__remnant?.world?.ready);
  // Prepare an existing slot past the intro, then enter it through story mode.
  await page.goto(base + '?debug&nostory&autostart&fresh');
  await ready();
  await page.evaluate(() => {
    const w = window.__remnant.world;
    w.save.flags.ending_done = true;
    w.save.flags.intro_done = true;
    w.save.playableHero = 'uri';
    w.persist();
  });
  await page.goto(base + '?debug&autostart&fixedstep');
  await ready();
  await page.waitForFunction(() => window.__remnant.world.canUseKit);
  await page.keyboard.press('KeyN');
  await page.waitForFunction(() => window.__remnant.world.player.sprite.texture.key === 'barak');
  await page.reload();
  await ready();
  assert.equal(await page.evaluate(() => window.__remnant.world.player.hero), 'barak');

  await page.waitForFunction(() => window.__remnant.world.canUseKit && window.__remnant.world.player.onGround);

  const atlasCounts = await page.evaluate(() => {
    const textures = window.__remnant.world.player.sprite.scene.textures;
    return ['barak-moves', 'barak-beast-moves', 'barak-shift'].map(key => textures.get(key).getFrameNames().length);
  });
  assert.deepEqual(atlasCounts, [32, 32, 4]);
  await mkdir('qa', { recursive: true });
  await page.screenshot({ path: 'qa/barak-chapter.png' });

  // Stationary targets keep the hop order deterministic. A fourth target is
  // within hop range, and another target stands behind the caster.
  await page.evaluate(() => {
    const w = window.__remnant.world, p = w.player;
    p.face = 1;
    window.barakHits = [];
    window.barakFoe = (dx, x = p.x + dx) => ({
      x, box: { centerX: x, centerY: p.feet - 25, left: x - 2, right: x + 2, top: p.feet - 28, bottom: p.feet, width: 4, height: 28 },
      alive: true, removed: false,
      hit(dmg, dir, force, crit, details) { window.barakHits.push([dx, dmg, !!details?.launch]); return true; },
    });
    const foes = window.barakFoes = [-72, 28, 96, 164, 232].map(dx => window.barakFoe(dx));
    w.foes = () => foes;
    w.heroHit = () => {};
  });
  // Heavy is tapped (held, it gathers the Thunderhead); every other key is held until something is struck.
  const hit = async key => {
    if (key === 'KeyK') { await page.keyboard.press(key); await page.waitForFunction(() => window.barakHits.length > 0); await page.waitForFunction(() => window.__remnant.world.player.state === 'free'); return page.evaluate(() => window.barakHits.splice(0)); }
    await page.keyboard.down(key);
    try { await page.waitForFunction(() => window.barakHits.length > 0); }
    finally { await page.keyboard.up(key); }
    await page.waitForFunction(() => window.__remnant.world.player.state === 'free');
    return page.evaluate(() => window.barakHits.splice(0));
  };
  const arc = await hit('KeyK');
  assert.deepEqual(arc.map(a => a[0]), [28, 96, 164]);
  assert.ok(arc[0][1] > arc[1][1] && arc[1][1] > arc[2][1]);
  const jab = await hit('KeyJ');
  assert.deepEqual(jab.map(a => a[0]), [28]);

  // ---- the moveset: each move from where he stood, so its reach is measured from the same place
  await page.evaluate(() => { const p = window.__remnant.world.player; window.barakHome = [p.x, p.feet]; });
  const home = () => page.evaluate(() => { const p = window.__remnant.world.player; p.placeAt(...window.barakHome, 1); p.body.setVelocity(0, 0); window.barakHits.length = 0; });
  const move = () => page.evaluate(() => window.__remnant.world.player.barakMove);
  const freeNow = () => page.waitForFunction(() => window.__remnant.world.player.state === 'free' && window.__remnant.world.player.onGround);
  // The Spark String: jab, jab, then the Arc Burst; each link starts as soon as the last has struck.
  await freeNow(); await home();
  const string = [];
  for (const next of ['jab1', 'jab2', 'burst']) {
    await page.keyboard.press('KeyJ');
    await page.waitForFunction((id) => { const p = window.__remnant.world.player; return p.state === 'lightning' && p.barakMove === id && p.arcReleased; }, next, { timeout: 5000 }).catch(() => {});
    string.push(await move());
  }
  assert.deepEqual(string, ['jab1', 'jab2', 'burst'], `the Spark String goes jab, jab, Arc Burst (${string})`);
  await freeNow();
  const strung = await page.evaluate(() => window.barakHits.splice(0));
  assert.ok(strung.filter(([x]) => x === 28).length === 3, `all three links land (${JSON.stringify(strung)})`);
  // Up + Strike: the Rising Volt throws the foe ahead into the air.
  await home();
  await page.keyboard.down('KeyW'); await page.keyboard.press('KeyJ'); await page.keyboard.up('KeyW');
  await page.waitForFunction(() => window.barakHits.length > 0);
  const volt = await page.evaluate(() => [window.__remnant.world.player.barakMove, window.barakHits.splice(0)]);
  assert.equal(volt[0], 'volt');
  assert.ok(volt[1].length && volt[1].every(([, , launch]) => launch), `the Rising Volt launches (${JSON.stringify(volt[1])})`);
  await freeNow();
  // Heavy held: Chain Lightning gathers into the Thunderhead, which reaches further and strikes more.
  await home();
  await page.keyboard.down('KeyK');
  await page.waitForFunction(() => window.__remnant.world.player.barakCharge >= 0.45);
  await page.keyboard.up('KeyK');
  await page.waitForFunction(() => window.barakHits.length > 0);
  await freeNow();
  const head = await page.evaluate(() => window.barakHits.splice(0));
  assert.deepEqual(head.map(a => a[0]), [28, 96, 164, 232], `the Thunderhead leaps to four (${JSON.stringify(head)})`);
  // In the air: the Static Palm holds him up; Down + Strike is the Thunder Drop, which rings out on both sides.
  await home();
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__remnant.world.player.body.velocity.y < -100);
  await page.keyboard.press('KeyJ');
  await page.waitForFunction(() => window.__remnant.world.player.barakMove === 'palm' && window.__remnant.world.player.arcReleased);
  // One more foe just behind where he will land.
  await page.evaluate(() => { window.barakHits.length = 0; window.barakFoes.push(window.barakFoe('behind', window.__remnant.world.player.x - 40)); });
  await page.keyboard.down('KeyS'); await page.keyboard.press('KeyJ'); await page.keyboard.up('KeyS');
  await page.waitForFunction(() => window.__remnant.world.player.barakMove === 'drop');
  await page.waitForFunction(() => window.barakHits.length > 0);
  await freeNow();
  const drop = await page.evaluate(() => { window.barakFoes.pop(); return window.barakHits.splice(0).map(([x]) => x); });
  assert.ok(drop.includes('behind') && drop.includes(28), `the Thunder Drop strikes on both sides (${drop})`);
  // The Tempest Beast's claws arc on: a jab finds a second foe.
  await home();
  await page.evaluate(() => { window.__remnant.world.player.mantleT = 5; });
  const claw = await hit('KeyJ');
  assert.deepEqual(claw.map(a => a[0]), [28, 96], `in the Beast a jab leaps on (${JSON.stringify(claw)})`);
  await page.evaluate(() => { window.__remnant.world.player.mantleT = 0; });
  await home();
  // Chain Lightning is drawn: arcs crackle from his hand and foe to foe.
  await page.keyboard.press('KeyK');
  await page.waitForFunction(() => window.__remnant.world.player.zaps.count >= 3);
  await freeNow(); await page.evaluate(() => { window.barakHits.length = 0; });
  // The teleports. Each is read from the move it starts and the blows it lands.
  const bolt = async (start, kind) => {
    await freeNow(); await home();
    await start();
    // The Storm Chain slows the world and ends in a finale's slow motion: on a loaded runner that is many seconds.
    await page.waitForFunction((k) => { const p = window.__remnant.world.player; return p.state === 'bolt' && p.boltKind === k; }, kind, { timeout: 25000 });
    await page.waitForFunction(() => window.__remnant.world.player.state !== 'bolt', null, { timeout: 25000 });
    return page.evaluate(() => [window.__remnant.world.player.boltHits, window.barakHits.splice(0).length]);
  };
  const string3 = async (then) => { for (let i = 0; i < 3; i++) { await page.keyboard.press('KeyJ'); await page.waitForTimeout(60); } if (then) { await page.waitForFunction(() => window.__remnant.world.player.barakMove === 'burst' && window.__remnant.world.player.arcReleased); await page.keyboard.press('KeyJ'); } };
  // Human: Strike after the Arc Burst is the Chain Rush, three foes.
  const rush = await bolt(() => string3(true), 'rush');
  assert.ok(rush[0] >= 2, `the Chain Rush teleports through foes (${rush})`);
  // Up + Strike, then Strike: the Sky Pursuit follows the launched foe up and comes down in a Thunder Drop.
  const pursuit = await bolt(async () => { await page.keyboard.down('KeyW'); await page.keyboard.press('KeyJ'); await page.keyboard.up('KeyW'); await page.waitForFunction(() => window.__remnant.world.player.voltFoe); await page.keyboard.press('KeyJ'); }, 'pursuit');
  assert.ok(pursuit[0] >= 1, `the Sky Pursuit reaches the launched foe (${pursuit})`);
  await page.waitForFunction(() => window.__remnant.world.player.barakMove === 'drop');
  // The Tempest Beast: the dodge is the Lightning Step, and the third strike the Storm Chain, the sky at its end.
  await freeNow(); await home();
  await page.evaluate(() => { window.__remnant.world.player.mantleT = 30; });
  const step = await bolt(() => page.keyboard.press('KeyL'), 'step');
  assert.equal(step[0], 1, `the Lightning Step strikes the foe ahead (${step})`);
  const storm = await bolt(() => string3(false), 'storm');
  assert.ok(storm[0] >= 4, `the Storm Chain runs through the pack (${storm})`);
  assert.ok(storm[1] > storm[0], `and the sky's bolt strikes at its end (${storm})`);
  await page.screenshot({ path: 'qa/barak-storm-chain.png' });
  await page.evaluate(() => { window.__remnant.world.player.mantleT = 0; });
  await freeNow(); await home();
  console.log(`Teleports: Chain Rush ×${rush[0]}, Sky Pursuit into the Thunder Drop, Lightning Step, Storm Chain ×${storm[0]} with the sky's bolt`);
  console.log('Moveset: the Spark String (jab, jab, Arc Burst), the Rising Volt launches, the Thunderhead leaps to four, the Static Palm and the Thunder Drop, the Beast\'s claws leap on');
  // Test Barak's three skill slots, the full Rally, and the transformed sheet.
  await page.evaluate(() => {
    const w = window.__remnant.world;
    w.save.flags.relic_taken = true;
    w.save.level = 25;
    w.save.ce = w.player.maxCe;
    window.barakStart = [w.player.x, w.player.feet];
  });
  assert.ok(await page.evaluate(() => {
    const p = window.__remnant.world.player;
    p.startParry();
    const hp = p.hp;
    p.hurt({ dmg: 20, dir: -p.face });
    return p.hp === hp && window.barakHits.splice(0).length > 0;
  }));
  await page.waitForFunction(() => window.__remnant.world.player.state === 'free');
  const dash = await hit('KeyL');
  assert.equal(dash.filter(([x]) => x === 28).length, 1);
  await page.evaluate(() => window.__remnant.world.player.placeAt(...window.barakStart, 1));
  for (const [key, id] of [['KeyE', 'thunderclap'], ['KeyR', 'forked_spear'], ['KeyQ', 'piercing_current']]) {
    await page.evaluate(() => { const w = window.__remnant.world; w.save.ce = w.player.maxCe; });
    assert.ok((await hit(key)).length);
    assert.ok(await page.evaluate(id => window.__remnant.world.player.cds[id] > 0, id));
  }
  await page.evaluate(() => {
    const w = window.__remnant.world;
    w.player.placeAt(...window.barakStart, 1); w.save.rally = 100;
  });
  const sky = await hit('KeyT');
  assert.equal(sky.filter(([x]) => x === 28).length, 3);
  await page.evaluate(() => { window.__remnant.world.save.mantle = 100; });
  await page.keyboard.press('KeyG');
  await page.waitForFunction(() => window.__remnant.world.player.sprite.texture.key === 'barak-shift');
  await page.waitForFunction(() => window.__remnant.world.player.sprite.texture.key.startsWith('barak-beast'));
  await page.screenshot({ path: 'qa/barak-beast.png' });
  await page.waitForFunction(() => window.__remnant.world.player.state === 'free');
  await page.evaluate(() => { window.__remnant.world.player.mantleT = 0; });
  // Put a solid tile column between the first and second impact.
  await page.evaluate(() => {
    const w = window.__remnant.world;
    const wall = Math.floor((w.player.x + 65) / 16);
    const tileAt = w.tileAt.bind(w);
    w.tileAt = (tx, ty) => tx === wall ? tileAt(-1, ty) : tileAt(tx, ty);
  });
  assert.deepEqual((await hit('KeyK')).map(a => a[0]), [28]);

  // Every journey mode runs on the same World: Barak stays himself in the Trial's arena (the Trial, Extreme, the
  // Gauntlet, the Rush, the Daily Challenge) and in Remnant's Rest, and the switch reaches him there.
  for (const room of ['trial_arena', 'remnant_rest']) {
    await page.evaluate((id) => { const w = window.__remnant.world; delete w.foes; delete w.heroHit; delete w.tileAt; w.loadRoom(id, 'start'); }, room);
    await page.waitForFunction(() => window.__remnant.world.player.state === 'free' && !window.__remnant.world.transitioning);
    await page.waitForFunction(() => window.__remnant.world.player.sprite.texture.key.startsWith('barak'));
    assert.deepEqual(await page.evaluate(() => {
      const p = window.__remnant.world.player, was = p.hero;
      p.switchCd = 0; p.switchHero('elior'); p.switchCd = 0;
      return [was, p.hero, p.nextHero === 'tirzah', p.switchHero('barak'), p.hero, p.sprite.texture.key.replace('~L', '')];
    }), ['barak', 'elior', true, true, 'barak', 'barak'], `Barak plays in ${room}`);
  }
  // The full cycle: Elior, Tirzah, Uri, Barak, and round again.
  assert.deepEqual(await page.evaluate(() => {
    const p = window.__remnant.world.player, seen = [];
    p.switchCd = 0; p.switchHero('elior');
    for (let i = 0; i < 4; i++) { seen.push(p.hero); p.switchCd = 0; p.switchHero(); }
    seen.push(p.hero);
    return seen;
  }), ['elior', 'tirzah', 'uri', 'barak', 'elior']);
  assert.deepEqual(errors, []);
  console.log('Chapter tag and save, three diminishing hits, single jab, blocked hop, Barak in the Trial arena and the Rest, the four-hero cycle passed.');
} finally {
  await browser.close();
  close();
}
