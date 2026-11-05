// A designer's balance report (not run in CI): for each chapter, a balanced build (every stat point spread evenly)
// at the chapter's arrival level, holding the weapon the previous chapter hands out, on Hard. It prints how many
// opening blows each ordinary foe and the boss take, and how many of their blows fell Elior. POLISH_PLAN §15 reads
// these: mid-rank foes about 3–5 hits and 15–20 blows to fell him; bosses about 200–300 blows (a greatsword's,
// slower and heavier; a spear needs more). Run after `npm run build`: node scripts/balance-report.mjs
import { chromium } from '@playwright/test';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('page error:', e.message));
await page.goto(base + '?debug&nostory&autostart&fresh');
await page.waitForFunction(() => window.__remnant?.world?.player && !window.__remnant.world.transitioning, null, { timeout: 60000 });
// Chapter, arrival level, a room of its foes, its boss's arena, and the weapon in hand (null: the starting gear).
const ROWS = [
  [1, 1, 'ashen_road', null, null], [6, 28, 'ulai_marsh', 'prince_throne', 'twentyfirst_day'],
  [7, 34, 'riftwood_trail', 'hunt_throne', 'twentyfirst_day'], [8, 40, 'greenfall_marsh', 'plague_throne', 'fangbreak_greatsword'],
  [9, 46, 'slag_procession', 'cinder_throne', 'thorn_of_dawn'], [10, 52, 'shattered_colonnade', 'grecia_throne', 'cinderbreak'],
  [11, 58, 'groves_of_baal', 'seat_of_the_gods', 'great_horn_sarissa'], [12, 68, 'palace_tents', 'palace_between_seas', 'idolbreaker'],
];
try {
  for (const [n, lv, room, arena, weapon] of ROWS) {
    const r = await page.evaluate(async ({ n, lv, room, arena, weapon }) => {
      const w = window.__remnant.world, s = w.save;
      Object.assign(s, { level: lv, statPoints: 0, skillPoints: 0, stats: { vit: 5, str: 5, agi: 5, end: 5, res: 5, wis: 5 } });
      const per = Math.floor((lv - 1) * 3 / 6); for (const k in s.stats) s.stats[k] += per;
      if (weapon) { s.inventory.push({ uid: `bal_${n}`, id: weapon, rarity: 5, plus: 0, affixes: [] }); s.equipment.weapon = `bal_${n}`; }
      s.flags[`ch${n}_boundary_open`] = true;
      w.refreshStats();
      const settle = () => new Promise((r) => setTimeout(r, 400));
      w.loadRoom(room, 'start'); await settle();
      const p = w.player, hit = p.power() * p.moves.combo[0].dmg, dr = w.d.dr, out = { level: lv, weapon: weapon ?? 'starting', heroHp: p.maxHp, foes: {} };
      for (const f of w.classic.ents.filter((e) => e.isFoe && !e.isBoss && !e.elite)) out.foes[f.kind] ??= `${(f.maxHp / hit).toFixed(1)} hits, fells him in ${(p.maxHp / Math.max(1, f.dmg * (1 - dr))).toFixed(0)}`;
      if (arena) {
        w.loadRoom(arena, 'start'); await settle();
        const b = w.cboss ?? w.boss;
        if (b) out.boss = `${Math.round(b.maxHp / hit)} blows; fells him in ${(p.maxHp / Math.max(1, (b.dmg ?? 0) * (1 - dr))).toFixed(1)}`;
      }
      return out;
    }, { n, lv, room, arena, weapon });
    console.log(`Chapter ${n} (level ${r.level}, ${r.weapon}, ${r.heroHp} health)`);
    for (const [k, v] of Object.entries(r.foes)) console.log(`  ${k}: ${v}`);
    if (r.boss) console.log(`  boss: ${r.boss}`);
  }
} finally {
  await browser.close();
  close();
}
