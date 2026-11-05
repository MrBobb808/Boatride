// Legendary Powers (shared game/legendary.ts, effects in src/game/legends.ts): a boss always leaves a legendary
// piece with its pillar of light and name card, elites often do; every power on worn gear fires from its hook and
// wounds foes (Elior's eight, Tirzah's six); only the fighting hero's gear counts; breaking a piece down writes its
// power into the Codex, and Dov imprints a learned power onto another piece. Run after `npm run build`.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
await mkdir('qa', { recursive: true });
const errors = [];
const E = (page, fn, arg) => page.evaluate(fn, arg);
const until = (page, fn, arg, timeout = 20000) => page.waitForFunction(fn, arg, { timeout }).catch((e) => { throw Error(e.message + '\n' + errors.join('\n')); });
const click = async (page, k) => { await page.click(`[data-k="${k}"]`); await page.waitForTimeout(40); };

try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  await page.goto(base + '?debug&nostory&autostart&fresh');
  await until(page, () => window.__remnant?.world?.player && !window.__remnant.world.transitioning);

  // ---- drops: a boss always, elites often, ordinary foes rarely
  const drops = await E(page, () => {
    const w = window.__remnant.world, s = w.save;
    const before = s.inventory.length;
    w.bossSpoils('legend_test');
    const boss = s.inventory.slice(before).find((i) => i.legend);
    let elite = 0, foe = 0;
    for (let i = 0; i < 600; i++) { if (w.gearDrop(true).legend) elite++; if (w.gearDrop(false).legend) foe++; }
    return { boss: boss && { legend: boss.legend, rarity: boss.rarity }, elite: elite / 600, foe: foe / 600 };
  });
  assert.ok(drops.boss && drops.boss.rarity >= 4, `a boss leaves a Legendary piece with a power (${JSON.stringify(drops.boss)})`);
  assert.ok(drops.elite > 0.22 && drops.elite < 0.5, `elites often leave one (${drops.elite})`);
  assert.ok(drops.foe < 0.06, `ordinary foes rarely do (${drops.foe})`);
  // The drop moment: its name card and the slow beat.
  await page.waitForTimeout(3700);
  await page.screenshot({ path: 'qa/legend-drop.png' });
  console.log(`Drops: a boss always (${drops.boss.legend}), elites ${(drops.elite * 100).toFixed(0)}%, foes ${(drops.foe * 100).toFixed(1)}% of gear drops`);

  // ---- every power fires and wounds: a room of foes, a strong Elior, each power worn in turn
  await E(page, () => {
    const w = window.__remnant.world, s = w.save;
    s.level = 58; w.refreshStats();
    window.__god = setInterval(() => { const p = w.player; if (p && !p.dead) p.hp = p.maxHp; }, 30);
    w.loadRoom('groves_of_baal', 'start');
  });
  await until(page, () => window.__remnant.world.room.id === 'groves_of_baal' && !window.__remnant.world.transitioning);
  const fire = async (hero, id, act) => E(page, async ({ hero, id, act }) => {
    const w = window.__remnant.world, s = w.save, p = w.player, L = w.legends;
    // Wear only this power, on a helm (his) or a hood (hers).
    s.inventory = s.inventory.filter((i) => i.uid !== 'lg_worn');
    s.inventory.push({ uid: 'lg_worn', id: hero === 'tirzah' ? 'hood_wool' : 'iron_cap', rarity: 4, plus: 0, affixes: [], legend: id });
    if (hero === 'tirzah') { s.archer.equipment.hood = 'lg_worn'; s.playableHero = 'tirzah'; } else { s.equipment.helm = 'lg_worn'; s.playableHero = 'elior'; }
    L.refresh();
    // Gather the room's foes around the hero.
    const foes = w.foes().filter((f) => f.alive).slice(0, 6);
    w.classic.ents.filter((e) => e.isFoe && !e.dying).slice(0, 6).forEach((e, i) => { e.x = p.x + (i % 2 ? 1 : -1) * (26 + Math.floor(i / 2) * 22); e.y = p.feet; e.vx = 0; e.vy = 0; });
    const near = foes.find((f) => !['knight', 'undying', 'bulwark'].includes(f.kind)) ?? foes[0], t0 = L.tally[id] ?? 0;
    // What the power did to the others (the slain foe's own fall does not count).
    const others = act === 'kill' || act === 'arrowkill' ? foes.filter((f) => f !== near) : foes;
    const hp0 = others.reduce((n, f) => n + (f.hp ?? 0), 0);
    const on = L.has(id);
    if (act === 'crit') L.onHit(near, { crit: true, heavy: false, ender: false });
    if (act === 'heavy') L.onHit(near, { crit: false, heavy: true, ender: false });
    if (act === 'ender') L.onHit(near, { crit: false, heavy: false, ender: true });
    if (act === 'chain') for (let i = 0; i < 8; i++) L.onHit(near, { crit: false, heavy: false, ender: false });
    // A killing blow (through any guard).
    const fell = (kind) => { if (near.e) near.e.hp = 1; near.hit(99999, Math.sign(near.x - p.x) || 1, 1, false, { kind, dot: true }); };
    if (act === 'kill') { fell('melee'); L.onHit(near, { crit: false, heavy: false, ender: false }); }
    if (act === 'parry') { p.parryT = 0.2; p.state = 'parry'; p.hurt({ dmg: 10, dir: -p.face, src: null }); }
    if (act === 'dodge') p.startDodge();
    if (act === 'slam') p.landPlunge();
    if (act === 'charged') L.onArrow(near, { crit: false, charged: true, x: near.x, y: near.box.centerY, dir: 1 });
    if (act === 'arrowcrit') L.onArrow(near, { crit: true, charged: false, x: near.x - 20, y: near.box.centerY, dir: 1 });
    if (act === 'six') for (let i = 0; i < 6; i++) L.onArrow(near, { crit: false, charged: false, x: near.x, y: near.box.centerY, dir: 1 });
    if (act === 'arrowkill') { fell('proj'); L.onArrow(near, { crit: false, charged: false, x: near.x, y: near.box.centerY, dir: 1 }); }
    await new Promise((r) => setTimeout(r, 1800));
    const hp1 = others.reduce((n, f) => n + (f.alive ? f.hp ?? 0 : 0), 0);
    return { on, fired: (L.tally[id] ?? 0) - t0, hurt: Math.round(hp0 - hp1), active: [...L.on] };
  }, { hero, id, act });

  const ELIOR = [['thunder', 'crit'], ['pillar', 'heavy'], ['gideon', 'ender'], ['whirlwind', 'chain'], ['brimstone', 'kill'], ['jericho', 'parry'], ['chariot', 'dodge'], ['samson', 'slam']];
  for (const [id, act] of ELIOR) {
    // Fresh foes for each power.
    await E(page, () => { const w = window.__remnant.world; w.loadRoom('groves_of_baal', 'start'); });
    await until(page, () => !window.__remnant.world.transitioning && window.__remnant.world.foes().filter((f) => f.alive).length >= 6);
    await page.waitForTimeout(600);
    const r = await fire('elior', id, act);
    assert.ok(r.on && r.fired > 0 && r.hurt > 0, `Elior's ${id} fires on ${act} and wounds foes (${JSON.stringify(r)})`);
    if (id === 'gideon' || id === 'samson') await page.screenshot({ path: `qa/legend-${id}.png` });
  }
  console.log(`Elior: ${ELIOR.map(([id]) => id).join(', ')} each fire and wound foes`);

  // Only the fighting hero's gear counts: Elior's helm power does nothing while Tirzah fights.
  const swap = await E(page, () => { const w = window.__remnant.world, s = w.save; s.equipment.helm = 'lg_worn'; s.playableHero = 'tirzah'; w.legends.refresh(); return w.legends.has('samson') || w.legends.has('chariot'); });
  assert.equal(swap, false, 'his powers sleep while she fights');

  const TIRZAH = [['falling_star', 'charged'], ['hawk_spirit', 'arrowcrit'], ['arrow_rain', 'six'], ['hawk_split', 'arrowkill'], ['wind_volley', 'dodge'], ['brimstone', 'arrowkill']];
  for (const [id, act] of TIRZAH) {
    await E(page, () => { const w = window.__remnant.world; w.loadRoom('groves_of_baal', 'start'); });
    await until(page, () => !window.__remnant.world.transitioning && window.__remnant.world.foes().filter((f) => f.alive).length >= 6);
    await page.waitForTimeout(600);
    const r = await fire('tirzah', id, act);
    assert.ok(r.on && r.fired > 0 && r.hurt > 0, `Tirzah's ${id} fires on ${act} and wounds foes (${JSON.stringify(r)})`);
  }
  console.log(`Tirzah: ${TIRZAH.map(([id]) => id).join(', ')} each fire and wound foes`);

  // ---- the Codex: breaking a piece down teaches its power; Dov imprints it onto another
  await E(page, () => {
    const w = window.__remnant.world, s = w.save;
    clearInterval(window.__god);
    s.playableHero = 'elior';
    w.loadRoom('groves_of_baal', 'start');
    s.codex = [];
    Object.assign(s, { silver: 50000 }); s.materials.relic_dust = 20;
    s.inventory.push({ uid: 'lg_old', id: 'chain_hauberk', rarity: 4, plus: 0, affixes: [], legend: 'thunder' });
    s.inventory.push({ uid: 'lg_new', id: 'greaves', rarity: 2, plus: 0, affixes: [] });
  });
  await until(page, () => !window.__remnant.world.transitioning);
  await E(page, () => window.__remnant.G.ui.openShop('smith'));
  await click(page, 'shop_imprint');
  assert.ok(await E(page, () => !!document.querySelector('[data-k="codex_empty"]')), 'the Codex starts empty');
  await click(page, 'shop_dismantle');
  await click(page, 'dis_lg_old');
  await click(page, 'dis_lg_old');
  assert.deepEqual(await E(page, () => window.__remnant.world.save.codex), ['thunder'], 'dismantling it wrote Voice of Thunder in the Codex');
  await click(page, 'shop_imprint');
  const cost = await E(page, () => { const s = window.__remnant.world.save; return { silver: s.silver, shards: s.materials.relic_dust }; });
  await click(page, 'imp_lg_new');
  await click(page, 'imp_lg_new');
  const after = await E(page, () => { const s = window.__remnant.world.save; return { legend: s.inventory.find((i) => i.uid === 'lg_new')?.legend, silver: s.silver, shards: s.materials.relic_dust }; });
  assert.ok(after.legend === 'thunder' && after.silver < cost.silver && after.shards < cost.shards, `Dov imprinted it, for silver and shards (${JSON.stringify({ cost, after })})`);
  await page.screenshot({ path: 'qa/legend-imprint.png' });
  await page.getByRole('button', { name: 'Leave', exact: true }).click();
  console.log(`Codex: dismantled → learned; imprinted onto greaves for ${cost.silver - after.silver} silver and ${cost.shards - after.shards} shards`);

  // ---- the card names the power, and the save keeps it
  const kept = await E(page, () => { const w = window.__remnant.world; w.persist(); const raw = Object.keys(localStorage).map((k) => localStorage.getItem(k)).join(''); return raw.includes('"legend":"thunder"') && raw.includes('"codex"'); });
  assert.ok(kept, 'the power and the Codex are saved');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser legends: all checks passed');
} finally {
  await browser.close();
  close();
}
