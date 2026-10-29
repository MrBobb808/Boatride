// The economy: Ilan's store in the pause menu and at his stall, selling with
// salvage, Relic Shards, a confirmation for rare gear, locks, keepsakes, Sell
// all junk, buyback, Dov's dismantling, the day's featured curios (bought
// with silver and shards, scaled to the chapter), elixirs that wear off,
// tomes once per chapter, Balm vials, capes that show on Elior, brewing and
// shard-fusing from salvage, the store closed mid-fight, a new day's
// restock and a save round-trip. Run after `npm run build`.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
await mkdir('qa', { recursive: true });
const errors = [];
const E = (page, fn, arg) => page.evaluate(fn, arg);
const until = (page, fn, arg, timeout = 15000) => page.waitForFunction(fn, arg, { timeout }).catch((e) => { throw Error(e.message + '\n' + errors.join('\n')); });
const click = async (page, k) => { await page.click(`[data-k="${k}"]`); await page.waitForTimeout(40); };
const has = (page, k) => E(page, (k) => !!document.querySelector(`[data-k="${k}"]`), k);
const disabled = (page, k) => E(page, (k) => document.querySelector(`[data-k="${k}"]`)?.disabled, k);

try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  let page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  await page.goto(base + '?debug&nostory&autostart&fresh');
  await until(page, () => window.__remnant?.world?.player && !window.__remnant.world.transitioning);

  // A Chapter VI journey: plenty of silver, a helm on, junk, rare gear, a keepsake.
  await E(page, () => {
    const { world: w, G } = window.__remnant, s = w.save;
    Object.assign(s, { level: 30, silver: 60000, balm: 3, balmMax: 3, skillPoints: 0, statPoints: 0 });
    for (let n = 1; n <= 5; n++) s.flags[`ch${n}_done`] = true;
    const put = (uid, id, rarity, plus = 0) => { s.inventory.push({ uid, id, rarity, plus, affixes: [] }); };
    put('t_helm', 'iron_cap', 2); s.equipment.helm = 't_helm';
    put('t_junk', 'iron_cap', 0);
    put('t_epic', 'chain_hauberk', 3);
    put('t_legend', 'bronze_gauntlets', 4, 2);
    put('t_keep', 'cinderbreak', 5);
    put('t_mine', 'greaves', 1);
    s.materials = { iron_scrap: 0, veil_shard: 0 };
    w.refreshStats();
    void G;
  });
  await E(page, () => window.__remnant.warp('sanctuary', 'start'));
  await until(page, () => window.__remnant.world.room.id === 'sanctuary' && !window.__remnant.world.transitioning);

  // ---- the pause menu's Store
  await page.keyboard.press('Escape');
  await until(page, () => !!document.querySelector('#ui .menu'));
  await click(page, 'tab_store');
  const featured = await E(page, () => [...document.querySelectorAll('[data-offer^="feat_"]')].map((r) => ({ k: r.dataset.offer, name: r.querySelector('.nm').textContent, price: r.querySelector('.price').textContent })));
  assert.equal(featured.length, 3, 'three featured curios today');
  assert.ok(featured.every((f) => /^\d+ \+ \d+ ◆$/.test(f.price)), `featured cost silver and Relic Shards (${featured.map((f) => f.price)})`);
  assert.ok(await disabled(page, 'buy_feat_0'), 'no shards, no featured curio');
  await page.screenshot({ path: 'qa/economy-store.png' });
  console.log(`Store: featured today ${featured.map((f) => f.name).join(' / ')}`);

  // ---- selling: the Epic waits for a second press and pays silver, salvage and a shard
  await click(page, 'store_sell');
  assert.ok(!(await has(page, 'sell_t_keep')) && (await E(page, () => document.body.textContent.includes('A keepsake'))), 'a trophy is a keepsake, not for sale');
  assert.ok(!(await has(page, 'sell_t_helm')), 'equipped gear is not offered');
  const s0 = await E(page, () => ({ silver: window.__remnant.world.save.silver, shards: window.__remnant.world.save.materials.relic_dust ?? 0 }));
  await click(page, 'sell_t_epic');
  assert.ok(await E(page, () => window.__remnant.world.save.inventory.some((i) => i.uid === 't_epic')), 'the first press only arms the sale');
  assert.equal(await E(page, () => document.querySelector('[data-k="sell_t_epic"]').textContent), 'Confirm sale');
  await click(page, 'sell_t_epic');
  const s1 = await E(page, () => ({ silver: window.__remnant.world.save.silver, shards: window.__remnant.world.save.materials.relic_dust ?? 0, iron: window.__remnant.world.save.materials.iron_scrap, gone: !window.__remnant.world.save.inventory.some((i) => i.uid === 't_epic') }));
  assert.ok(s1.gone && s1.silver > s0.silver && s1.shards === s0.shards + 1 && s1.iron > 0, `the Epic sold for silver, iron and a shard (${JSON.stringify({ s0, s1 })})`);
  console.log(`Sell: Epic hauberk → ${s1.silver - s0.silver} silver, ${s1.iron} iron scrap, 1 Relic Shard`);

  // ---- buyback returns it, the silver and the salvage
  await click(page, 'back_0');
  const b = await E(page, () => ({ back: window.__remnant.world.save.inventory.some((i) => i.uid === 't_epic'), silver: window.__remnant.world.save.silver, shards: window.__remnant.world.save.materials.relic_dust ?? 0 }));
  assert.ok(b.back && b.silver === s0.silver && b.shards === s0.shards, `bought back whole (${JSON.stringify(b)})`);
  console.log('Buyback: the hauberk came back for exactly what it paid');

  // ---- locks
  await click(page, 'lock_t_mine');
  assert.ok(!(await has(page, 'sell_t_mine')) && (await E(page, () => window.__remnant.world.save.locked.includes('t_mine'))), 'a locked item cannot be sold');
  // ---- Sell all junk: only the Common helm behind a better one
  await click(page, 'sell_junk');
  const inv = await E(page, () => window.__remnant.world.save.inventory.map((i) => i.uid));
  assert.ok(!inv.includes('t_junk') && inv.includes('t_mine') && inv.includes('t_epic') && inv.includes('t_helm'), `junk sold, the rest kept (${inv})`);
  console.log('Locks and junk: the locked greaves stayed, Sell all junk took only the spare Common helm');
  await click(page, 'lock_t_mine');

  // ---- featured curio, bought with shards; scaled to Chapter VI and closed after
  await E(page, () => { window.__remnant.world.save.materials.relic_dust = 10; });
  await click(page, 'store_buy');
  await click(page, 'buy_feat_0');
  const curio = await E(page, () => window.__remnant.world.save.inventory.find((i) => i.id.startsWith('curio_')));
  assert.ok(curio && curio.lootPower === 125 && curio.rarity >= 3, `a chapter-scaled curio (${JSON.stringify(curio)})`);
  assert.ok(await disabled(page, 'buy_feat_0'), 'each featured curio sells once a day');
  console.log(`Featured: bought ${curio.id} (${['', '', '', 'Epic', 'Legendary', 'Covenant'][curio.rarity]}, Power ${curio.lootPower})`);

  // ---- an elixir changes the numbers and wears off
  await click(page, 'kind_elixir');
  const m0 = await E(page, () => window.__remnant.world.d.meleeMult);
  await click(page, 'buy_elixir_might');
  assert.ok(Math.abs((await E(page, () => window.__remnant.world.d.meleeMult)) - m0) < 1e-6 && (await E(page, () => window.__remnant.world.save.pack.elixir_might)) === 1, 'the elixir waits in the pack');
  // ---- tomes once per chapter, Balm vials up to six: bought into the pack
  await click(page, 'kind_tome');
  await click(page, 'buy_tome_insight');
  assert.equal(await E(page, () => window.__remnant.world.save.skillPoints), 0, 'the tome waits in the pack');
  assert.ok(await disabled(page, 'buy_tome_insight'), 'one Tome of Insight per chapter');
  await click(page, 'kind_supply');
  const p1 = await E(page, () => +document.querySelector('[data-offer="balm"] .price').textContent);
  await click(page, 'buy_balm');
  const p2 = await E(page, () => +document.querySelector('[data-offer="balm"] .price').textContent);
  assert.ok(p2 === p1 * 2, `a vial in the pack; the next costs double (${p1} → ${p2})`);
  // ---- Pack → Items: drink, read and use them
  await click(page, 'sec_pack');
  await click(page, 'tab_items');
  await click(page, 'use_elixir_might');
  const m1 = await E(page, () => window.__remnant.world.d.meleeMult);
  assert.ok(Math.abs(m1 / m0 - 1.2) < 1e-6 && (await has(page, 'pack_elixir')), `Elixir of Might: ×1.2 once drunk (${m0} → ${m1})`);
  await click(page, 'use_tome_insight_tirzah');
  assert.deepEqual(await E(page, () => { const s = window.__remnant.world.save; return [s.skillPoints, s.archer.skillPoints > 0]; }), [0, true], 'Tirzah read the Tome of Insight');
  await click(page, 'use_balm_vial');
  assert.equal(await E(page, () => window.__remnant.world.save.balmMax), 4, 'a fourth Balm charge');
  assert.deepEqual(await E(page, () => window.__remnant.world.save.pack), {}, 'the pack is empty again');
  await page.screenshot({ path: 'qa/pack-items.png' });
  await click(page, 'sec_elior');
  await click(page, 'tab_store');
  // ---- a cape: bought, worn, and baked into Elior's sheet
  await click(page, 'kind_cape');
  await click(page, 'buy_cape_saffron');
  assert.equal(await E(page, () => window.__remnant.world.save.valor.cape), 'saffron');
  await page.keyboard.press('Escape');
  await until(page, () => !document.querySelector('#ui .menu'));
  await until(page, () => window.__remnant.world.player.sprite.texture.key.endsWith('-cape-saffron'), undefined, 30000);
  await page.screenshot({ path: 'qa/economy-cape.png' });
  console.log('Store: Might ×1.2, a skill point, a fourth Balm charge, and Elior wears Saffron Pilgrim');

  // ---- the elixir ends on time
  await E(page, () => { const s = window.__remnant.world.save; s.elixir.until = s.playtime + 0.05; });
  await until(page, () => !window.__remnant.world.save.elixir);
  assert.ok(Math.abs((await E(page, () => window.__remnant.world.d.meleeMult)) - m0) < 1e-6, 'Might wore off');
  console.log('Elixir: wore off on the playtime clock and the numbers returned');

  // ---- Dov: dismantle pays double the salvage and no silver; fuse a shard
  const d0 = await E(page, () => { const { G } = window.__remnant; G.ui.openShop('smith'); const s = window.__remnant.world.save; return { silver: s.silver, iron: s.materials.iron_scrap ?? 0, shards: s.materials.relic_dust ?? 0 }; });
  await click(page, 'shop_dismantle');
  await click(page, 'dis_t_legend');
  await click(page, 'dis_t_legend');
  const d1 = await E(page, () => { const s = window.__remnant.world.save; return { silver: s.silver, iron: s.materials.iron_scrap ?? 0, shards: s.materials.relic_dust ?? 0, gone: !s.inventory.some((i) => i.uid === 't_legend') }; });
  assert.ok(d1.gone && d1.silver === d0.silver && d1.shards === d0.shards + 4 && d1.iron - d0.iron === 2 * (1 + 4 + 2), `dismantled for double salvage (${JSON.stringify({ d0, d1 })})`);
  await E(page, () => Object.assign(window.__remnant.world.save.materials, { covenant_fragment: 3, sentinel_steel: 2 }));
  await click(page, 'shop_forge');
  await click(page, 'cr_shard');
  assert.equal(await E(page, () => window.__remnant.world.save.materials.relic_dust), d1.shards + 1, 'three fragments and steel fused into a shard');
  await page.getByRole('button', { name: 'Leave', exact: true }).click();
  console.log(`Forge: Legendary +2 gauntlets → ${d1.iron - d0.iron} iron and 4 shards, no silver; a shard fused`);

  // ---- brewing from salvage in the field
  await E(page, () => Object.assign(window.__remnant.world.save.materials, { covenant_fragment: 1, veil_shard: 1 }));
  await page.keyboard.press('Escape');
  await until(page, () => !!document.querySelector('#ui .menu'));
  await click(page, 'tab_crafting');
  await click(page, 'cr_brew_focus');
  await click(page, 'sec_pack');
  await click(page, 'tab_items');
  await click(page, 'use_elixir_focus');
  assert.equal(await E(page, () => window.__remnant.world.save.elixir?.id), 'focus', 'a brewed Elixir of Focus, drunk from the pack');
  await page.keyboard.press('Escape');
  await until(page, () => !document.querySelector('#ui .menu'));

  // ---- Ilan's stall offers the same store with Sell beside it
  await E(page, () => window.__remnant.G.ui.openShop('merchant'));
  assert.ok((await has(page, 'shop_store')) && (await has(page, 'shop_sell')) && (await has(page, 'buy_feat_1')), 'Ilan\'s stall opens the store');
  await page.getByRole('button', { name: 'Leave', exact: true }).click();

  // ---- closed while foes are on Elior
  await E(page, () => window.__remnant.warp('ashen_road', 'left'));
  await until(page, () => window.__remnant.world.room.id === 'ashen_road' && !window.__remnant.world.transitioning);
  await E(page, () => { const w = window.__remnant.world, f = w.classic.ents.find((e) => e.isFoe && !e.dying); f.aggro = true; f.x = w.player.x + 60; f.think = function () { this.body.vx = 0; }; });
  await page.keyboard.press('Escape');
  await until(page, () => !!document.querySelector('#ui .menu'));
  await click(page, 'sec_elior');
  await click(page, 'tab_store');
  assert.ok(await E(page, () => document.querySelector('.menu-body').textContent.includes('Not while foes are on you.')) && !(await has(page, 'buy_feat_0')), 'the store closes mid-fight');
  console.log('Blocked: the pause-menu store waits until the fight is over');
  await page.keyboard.press('Escape');

  // ---- a new day restocks: today's purchases clear
  await E(page, () => { const w = window.__remnant.world; for (const e of w.classic.ents) if (e.isFoe) e.remove = true; w.save.store.day = '2000-01-01'; });
  await page.waitForTimeout(100);
  await E(page, () => window.__remnant.G.ui.openShop('merchant'));
  assert.equal(await disabled(page, 'buy_feat_0'), false, 'yesterday\'s purchases do not close today\'s stock');
  await page.getByRole('button', { name: 'Leave', exact: true }).click();
  console.log('Restock: a new day reopens the featured slots');

  // ---- save round-trip: locks, capes, tomes, elixir and the curio survive a reload
  await E(page, () => { const s = window.__remnant.world.save; s.locked = ['t_mine']; window.__remnant.world.persist(); });
  await page.goto(base + '?debug&nostory&autostart');
  await until(page, () => window.__remnant?.world?.player && !window.__remnant.world.transitioning);
  const kept = await E(page, () => { const s = window.__remnant.world.save; return { locked: s.locked, capes: s.store?.capes, tomes: s.store?.tomes, elixir: s.elixir?.id, curio: s.inventory.some((i) => i.id.startsWith('curio_')), cape: s.valor?.cape }; });
  assert.deepEqual(kept, { locked: ['t_mine'], capes: ['saffron'], tomes: ['insight_6'], elixir: 'focus', curio: true, cape: 'saffron' }, 'the store\'s save fields round-trip');
  console.log('Saves: locks, capes, tomes, the elixir and the curio survive a reload');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser economy: all checks passed');
} finally {
  await browser.close();
  close();
}
