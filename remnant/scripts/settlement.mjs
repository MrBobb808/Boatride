// Remnant's Rest: altar travel there once Chapter I is done, the growth tier
// read from existing progress (fresh, mid and late saves), the growth banner,
// services unlocking by tier, a request accepted, completed and paid once,
// the locket hunt, the Hunt kill count, old-save migration, and screenshots
// of every tier at phone and desktop size.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const dist = resolve('dist'), errors = [];
const server = createServer(async (req, res) => {
  let path = new URL(req.url, 'http://localhost').pathname.replace(/^\/Boatride\//, '');
  if (!path || path.endsWith('/')) path += 'index.html';
  try {
    const file = resolve(dist, path);
    if (!file.startsWith(dist + '/')) throw Error('Path');
    res.setHeader('content-type', ({ '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json' })[extname(file)] ?? 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://localhost:${server.address().port}/Boatride/`;
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}), args: process.env.PLAYWRIGHT_CHROMIUM_ARGS ? JSON.parse(process.env.PLAYWRIGHT_CHROMIUM_ARGS) : [] });
await mkdir('qa', { recursive: true });

// Progress by stage: each adds to the one before.
const STAGES = {
  ch1: ['ch1_done', 'ending_done', 'tobiah_saved'],
  ch2: ['ch2_intro', 'ch2_done'],
  mid: ['ch3_intro', 'ch3_done', 'ch4_intro', 'ch4_done', 'captives_freed', 'ch4_image_done'],
  ch6: ['ch5_intro', 'ch5_done', 'ch5_writing', 'ch6_intro', 'ch6_done', 'ch6_storm_done'],
  late: ['ch7_intro', 'ch7_done', 'ch7_rescued', 'ch8_intro', 'ch8_done', 'ch8_rescued', 'ch9_intro', 'ch9_done', 'ch9_rescued', 'ch10_rescued'],
};

async function boot(context, saveFlags = []) {
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '?debug&autostart');
  await page.waitForFunction(() => window.__remnant?.G.world?.player?.style);
  await page.evaluate((flags) => {
    const s = window.__remnant.G.save;
    s.flags.intro_done = s.flags.relic_taken = s.flags.phantom = s.flags.chamber_done = true;
    for (const f of flags) s.flags[f] = true;
    s.level = 40;
    s.altarsLit = ['sanctuary'];
    // A save from before the settlement existed: no settlement block at all.
    delete s.settlement;
    localStorage.setItem('remnant-save-2', JSON.stringify(s));
  }, saveFlags);
  await page.goto(base + '?debug');
  await page.waitForFunction(() => !!window.__remnant);
  await page.evaluate(() => window.__remnant.load(2));
  await page.waitForFunction(() => window.__remnant.G.world.player.style);
  await page.evaluate(() => { const { G } = window.__remnant; G.ui.dialogue = async () => 0; G.ui.lore = async () => {}; G.ui.itemGet = () => {}; });
  return page;
}
const idle = (page) => page.waitForFunction(() => { const { G } = window.__remnant; return !G.inCutscene && !G.world.transitioning && !G.paused; }, null, { timeout: 20000 });
const flags = (page, list) => page.evaluate((list) => { for (const f of list) window.__remnant.G.save.flags[f] = true; }, list);
/** Arrive at the Rest from another room, as a new visit. */
const arrive = async (page) => {
  await page.evaluate(() => { const { G } = window.__remnant; G.world.load('sanctuary', 'altar'); void G.world.transition('remnant_rest', 'altar'); });
  await page.waitForFunction(() => window.__remnant.G.world.room.id === 'remnant_rest' && !window.__remnant.G.world.transitioning);
};
const restState = (page) => page.evaluate(() => {
  const { G } = window.__remnant, W = G.world;
  return { room: W.room.id, tier: W.story.rest.tier(), npcs: W.ents.filter(e => e.kind && e.talkT !== undefined).map(e => e.kind).sort(), t: [1, 2, 3, 4].map(i => !!G.save.flags['rest_t' + i]), seen: G.save.settlement.seen };
});
const banner = (page, text) => page.waitForFunction((text) => [...document.querySelectorAll('.banner .b-title')].some(b => b.textContent === text), text, { timeout: 8000 });
const shoot = async (page, name, xs) => {
  for (const x of xs) {
    await page.evaluate((x) => { const { G } = window.__remnant, p = G.world.player; p.x = x * 16; p.y = 16 * (x < 62 ? 22 : x < 98 ? 20 : 18); p.body.vx = p.body.vy = 0; G.camera.snapTo(p.x, p.y - 40); }, x);
    await page.waitForTimeout(350);
    await page.screenshot({ path: `qa/${name}-x${x}.png` });
  }
};
const results = {};

try {
  // ---------------------------------------------------------------- before and right after Chapter I
  const phone = await browser.newContext({ viewport: { width: 956, height: 440 } });
  const page = await boot(phone, []);
  const before = await page.evaluate(() => {
    const { G } = window.__remnant;
    G.world.load('sanctuary', 'altar');
    return { altars: G.save.altarsLit.includes('remnant_rest'), migrated: !!G.save.settlement && G.save.settlement.seen === -1 };
  });
  assert.equal(before.altars, false, 'no Rest altar before Chapter I ends');
  assert.equal(before.migrated, true, 'old save gets a settlement block');
  await page.evaluate(() => { const { G } = window.__remnant; G.world.restAtAltar(G.world.ents.find(e => e.idKey === 'sanctuary')); });
  await page.locator('[data-k=altar_continue]').waitFor();
  assert.equal(await page.locator('[data-k=altar_travel]').count(), 0, 'nothing to travel to before the Rest opens');
  await page.locator('[data-k=altar_continue]').click();
  await idle(page);

  await flags(page, STAGES.ch1);
  await page.evaluate(() => { const { G } = window.__remnant; G.world.restAtAltar(G.world.ents.find(e => e.idKey === 'sanctuary')); });
  await page.locator('[data-k=altar_travel]').click();
  assert.match(await page.locator('.travel-group .eyebrow').first().textContent(), /Remnant's Rest/);
  await page.locator('[data-k=travel_remnant_rest]').click();
  await page.waitForFunction(() => window.__remnant.G.world.room.id === 'remnant_rest' && !window.__remnant.G.world.transitioning);
  await banner(page, 'REMNANT\'S REST');
  await idle(page);
  const fresh = await restState(page);
  assert.equal(fresh.tier, 0, 'fresh after Chapter I: a camp of tents');
  assert.deepEqual(fresh.t, [false, false, false, false]);
  assert.deepEqual(fresh.npcs, ['azriel', 'mara', 'tobiah'], 'only the Hearthward folk at first');
  assert.equal(fresh.seen, 0);
  await shoot(page, 'rest-t0-phone', [14, 40]);
  results.fresh = fresh;

  // Services locked at tier 0: Ilan is not here, and Dov's forge offers nothing of the Rest's.
  const locked = await page.evaluate(() => ({ board: window.__remnant.G.world.ents.some(e => e.prompt?.() === 'Read the board') }));
  assert.equal(locked.board, true, 'the board stands from the first day');

  // ---------------------------------------------------------------- a request: accept, complete, paid once
  await page.evaluate(() => window.__remnant.G.world.ents.find(e => e.prompt?.() === 'Read the board').interact());
  await page.locator('[data-k=rest_board]').waitFor();
  assert.equal(await page.locator('[data-k^=rq_]').count(), 1, 'only the tier-0 request is posted');
  await page.locator('[data-k=rq_rq_nails]').click();
  const accepted = await page.evaluate(() => { const s = window.__remnant.G.save; return { st: s.settlement.quests.rq_nails, journal: s.quests.rq_nails }; });
  assert.ok(accepted.st && !accepted.st.done && accepted.journal, 'accepted, and in the journal');
  assert.equal(await page.locator('[data-k=rq_rq_nails]').isDisabled(), true, 'cannot turn in without the scrap');
  await page.locator('[data-k=rest_close]').click();
  const paid = await page.evaluate(() => {
    const { G } = window.__remnant, s = G.save;
    s.materials.iron_scrap = 10; s.materials.covenant_fragment = 0;
    const silver = s.silver;
    G.world.ents.find(e => e.prompt?.() === 'Read the board').interact();
    return silver;
  });
  await page.locator('[data-k=rq_rq_nails]').click();
  const reward = await page.evaluate((silver) => {
    const { G } = window.__remnant, s = G.save, before = s.silver;
    const again = G.world.story.rest.turnIn('rq_nails');
    return { gained: s.silver - silver, scrap: s.materials.iron_scrap, frags: s.materials.covenant_fragment, done: s.settlement.quests.rq_nails.done, journal: s.quests.rq_nails.done, again, after: s.silver - before };
  }, paid);
  assert.deepEqual(reward, { gained: 200, scrap: 2, frags: 2, done: true, journal: true, again: false, after: 0 }, 'paid exactly once');
  assert.equal(await page.locator('[data-k=rq_rq_nails]').isDisabled(), true);
  await page.locator('[data-k=rest_close]').click();
  await idle(page);
  results.quest = reward;

  // The path from the Ashen Road leads here too.
  const road = await page.evaluate(() => { const { G } = window.__remnant; G.world.load('ashen_road', 'left'); return G.world.ents.some(e => e.prompt?.() === 'Take the path to Remnant\'s Rest'); });
  assert.equal(road, true, 'a signpost on the Ashen Road');

  // ---------------------------------------------------------------- tier 1: the locket
  await flags(page, STAGES.ch2);
  await arrive(page);
  await banner(page, 'THE SETTLEMENT GROWS');
  const t1 = await restState(page);
  assert.equal(t1.tier, 1);
  assert.ok(t1.npcs.includes('ilan') && !t1.npcs.includes('dov'), 'the market opens at tier 1, not the smithy');
  const stock1 = await page.evaluate(async () => {
    const { G } = window.__remnant, W = G.world;
    await W.story.talk(W.ents.find(e => e.kind === 'ilan'));
    return [...document.querySelectorAll('[data-k^=buy_]')].map(b => b.dataset.k);
  });
  assert.ok(stock1.includes('buy_covenant_fragment') && !stock1.includes('buy_pilgrim_boots'), 'tier 1 stock');
  await page.getByRole('button', { name: 'Leave', exact: true }).click();
  await shoot(page, 'rest-t1-phone', [24, 44]);
  const locket = await page.evaluate(async () => {
    const { G } = window.__remnant, W = G.world, s = G.save;
    W.story.rest.accept('rq_locket');
    W.load('village_square', 'left');
    const k = W.ents.find(e => e.idKey === 'rest_locket');
    if (!k) return 'no locket';
    W.player.x = k.x; W.player.y = k.y;
    k.update(1 / 60);
    const found = s.opened.includes('rest_locket');
    W.load('village_square', 'left');
    const gone = !W.ents.some(e => e.idKey === 'rest_locket');
    W.load('remnant_rest', 'altar');
    const ok = W.story.rest.turnIn('rq_locket');
    return { found, gone, ok, titles: s.settlement.titles };
  });
  assert.deepEqual(locket, { found: true, gone: true, ok: true, titles: ['Finder of Small Things'] }, 'the locket hunt');
  results.locket = locket;

  // ---------------------------------------------------------------- mid save: tier 2 services
  await flags(page, STAGES.mid);
  await arrive(page);
  await banner(page, 'THE SETTLEMENT GROWS');
  await idle(page);
  const t2 = await restState(page);
  assert.equal(t2.tier, 2, 'mid (Chapter IV with the captives): a village');
  for (const k of ['ilan', 'dov', 'ezra', 'talia', 'barak']) assert.ok(t2.npcs.includes(k), `${k} lives here at tier 2`);
  assert.ok(!t2.npcs.includes('hanan') && !t2.npcs.includes('arshan'));
  await page.evaluate(async () => { const { G } = window.__remnant, W = G.world; await W.story.talk(W.ents.find(e => e.kind === 'dov')); });
  await page.getByRole('button', { name: 'Forge', exact: true }).click();
  assert.equal(await page.locator('[data-k=cr_settlers_ward]').count(), 1, 'the settlement-only recipe at the Rest\'s forge');
  assert.equal(await page.locator('[data-k=cr_rest_standard]').count(), 0, 'the festival standard waits for tier 4');
  const forged = await page.evaluate(() => { const s = window.__remnant.G.save; s.materials.iron_scrap = 8; s.materials.covenant_fragment = 4; s.silver += 500; });
  void forged;
  await page.getByRole('button', { name: 'Forge', exact: true }).click();
  await page.locator('[data-k=cr_settlers_ward]').click();
  assert.equal(await page.evaluate(() => window.__remnant.G.save.inventory.filter(i => i.id === 'settlers_ward').length), 1, 'Settler\'s Ward forged');
  await page.getByRole('button', { name: 'Leave', exact: true }).click();
  await idle(page);
  const healer = await page.evaluate(async () => {
    const { G } = window.__remnant, W = G.world, s = G.save;
    s.hp = 1; s.balm = 0;
    await W.story.talk(W.ents.find(e => e.kind === 'ezra'));
    const first = { hp: s.hp === G.d.maxHp, balm: s.balm === s.balmMax };
    s.hp = 1;
    await W.story.talk(W.ents.find(e => e.kind === 'ezra'));
    return { first, again: s.hp === 1 };
  });
  assert.deepEqual(healer, { first: { hp: true, balm: true }, again: true }, 'the healer mends once per visit');
  // Elsewhere the old stall and forge are unchanged.
  const elsewhere = await page.evaluate(() => { const { G } = window.__remnant; G.world.load('sanctuary', 'altar'); G.ui.openShop('merchant'); return [...document.querySelectorAll('[data-k^=buy_]')].map(b => b.dataset.k); });
  assert.ok(!elsewhere.includes('buy_covenant_fragment'), 'the Rest\'s stock stays at the Rest');
  await page.getByRole('button', { name: 'Leave', exact: true }).click();
  await arrive(page);
  await idle(page);
  await shoot(page, 'rest-t2-phone', [52, 70]);
  results.mid = t2;

  // ---------------------------------------------------------------- tier 3, then the late save: tier 4
  await flags(page, STAGES.ch6);
  await arrive(page);
  await banner(page, 'THE SETTLEMENT GROWS');
  await idle(page);
  const t3 = await restState(page);
  assert.equal(t3.tier, 3);
  assert.ok(t3.npcs.includes('hanan'));
  await shoot(page, 'rest-t3-phone', [88, 108]);
  await flags(page, STAGES.late);
  await arrive(page);
  await banner(page, 'THE SETTLEMENT GROWS');
  await idle(page);
  const t4 = await restState(page);
  assert.equal(t4.tier, 4, 'late (VII–IX rescues): the town at festival');
  assert.deepEqual(t4.t, [true, true, true, true]);
  assert.ok(t4.npcs.includes('arshan') && t4.npcs.includes('hanan'));
  await shoot(page, 'rest-t4-phone', [14, 40, 70, 90, 116]);
  // The Hunt request counts only foes felled in Chapter VII.
  const hunt = await page.evaluate(async () => {
    const { G } = window.__remnant, W = G.world, s = G.save;
    W.story.rest.accept('rq_hunt');
    W.load('village_square', 'left');
    for (const e of W.ents) if (e.isFoe) e.takeHit({ dmg: 1e9, poise: 99999, kx: 0, ky: 0, dir: 1, kind: 'ability', src: W.player, unblockable: true, guardBreak: true });
    for (let i = 0; i < 240; i++) W.update(1 / 60);
    const outside = s.settlement.quests.rq_hunt.n;
    for (let n = 0; n < 12 && s.settlement.quests.rq_hunt.n < 20; n++) {
      W.load(['riftwood_trail', 'fang_pits', 'claw_ridge'][n % 3], 'left');
      for (const e of W.ents) if (e.isFoe) e.takeHit({ dmg: 1e9, poise: 99999, kx: 0, ky: 0, dir: 1, kind: 'ability', src: W.player, unblockable: true, guardBreak: true });
      for (let i = 0; i < 240; i++) W.update(1 / 60);
    }
    const counted = s.settlement.quests.rq_hunt.n;
    W.load('remnant_rest', 'altar');
    const cores = s.materials.radiant_core ?? 0;
    const ok = W.story.rest.turnIn('rq_hunt'), twice = W.story.rest.turnIn('rq_hunt');
    return { outside, counted: counted >= 20, ok, twice, cores: (s.materials.radiant_core ?? 0) - cores };
  });
  assert.deepEqual(hunt, { outside: 0, counted: true, ok: true, twice: false, cores: 3 }, 'Hunt request');
  results.hunt = hunt;
  await idle(page);

  // ---------------------------------------------------------------- a late save loads straight into the right tier
  const desk = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const late = await boot(desk, [...STAGES.ch1, ...STAGES.ch2, ...STAGES.mid, ...STAGES.ch6, ...STAGES.late]);
  await late.evaluate(() => { const { G } = window.__remnant; G.world.load('sanctuary', 'altar'); void G.world.transition('remnant_rest', 'altar'); });
  await late.waitForFunction(() => window.__remnant.G.world.room.id === 'remnant_rest' && !window.__remnant.G.world.transitioning);
  await banner(late, 'REMNANT\'S REST');
  const direct = await restState(late);
  assert.equal(direct.tier, 4, 'an old late-game save sees the full town on its first visit');
  await idle(late);
  await shoot(late, 'rest-t4-desktop', [40, 90, 116]);
  for (const [name, list] of [['t0', STAGES.ch1], ['t2', [...STAGES.ch1, ...STAGES.ch2, ...STAGES.mid]]]) {
    const p = await boot(desk, list);
    await p.evaluate(() => { const { G } = window.__remnant; G.save.settlement.seen = 4; G.world.load('remnant_rest', 'altar'); });
    await idle(p);
    await shoot(p, `rest-${name}-desktop`, [40, 70]);
    await p.close();
  }

  // ---------------------------------------------------------------- the Ch I campaign is untouched
  const campaign = await page.evaluate(() => {
    const { G } = window.__remnant, W = G.world;
    for (const id of ['sanctuary', 'ashen_road', 'village_square', 'temple_steps', 'idol_sanctum']) { W.load(id, Object.keys(W.room.spawns)[0]); W.draw(G.renderer.wctx); }
    W.load('remnant_rest', 'altar'); W.draw(G.renderer.wctx);
    return W.room.id;
  });
  assert.equal(campaign, 'remnant_rest');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, ...results }));
} finally {
  await browser.close();
  server.close();
}
