// The AI partner (POLISH_PLAN §11a): the hero you are not playing fights
// beside you when called, never on its own. It wears that hero's look and
// numbers, hunts foes, steps back when Echoes are called (and the Echoes step
// back for it), follows through doors, swaps with you when you switch, pulls
// you up once a room, and joins your finisher. Run after `npm run build`.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
await mkdir('qa', { recursive: true });
const errors = [];
const E = (page, fn, arg) => page.evaluate(fn, arg);
const until = (page, fn, arg, timeout = 20000) => page.waitForFunction(fn, arg, { timeout }).catch((e) => { throw Error(`${e.message}\n${fn}\n${errors.join('\n')}`); });
const room = (page, id) => until(page, (r) => { const w = window.__remnant.world; return w.room.id === r && !w.transitioning && w.player.onGround; }, id);

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  await page.goto(base + '?debug&nostory&autostart&fresh');
  await until(page, () => window.__remnant?.world?.player?.onGround);
  await E(page, () => {
    const w = window.__remnant.world, s = w.save;
    Object.assign(s, { level: 20 }); s.archer.level = 20; s.flags.relic_taken = true;
    s.echoes.push({ uid: 'e_sentinel', species: 'sentinel', level: 3, xp: 0, stage: 0, hp: 9999, absorptions: 1 }); s.active.push('e_sentinel');
    w.refreshStats();
    setInterval(() => { const p = window.__remnant.world.player; if (p && !p.dead && p.hp < p.maxHp * 0.5 && !window.hold) p.hp = p.maxHp; }, 50);
    window.__remnant.warp('ashen_road', 'left');
  });
  await room(page, 'ashen_road');

  // ---- off by default: nobody beside you until called
  await page.waitForTimeout(400);
  assert.deepEqual(await E(page, () => [!!window.__remnant.world.save.partnerOut, window.__remnant.world.partner.unit]), [false, null], 'no partner until called');

  // ---- called from the wheel: Tirzah, with her own look and numbers
  await E(page, () => { const h = window.__remnant.game.scene.getScene('hud'); h.openWheel('main'); h.pickWheel(h.wheelItems.findIndex((i) => i.label === 'Call Tirzah')); });
  await until(page, () => !!window.__remnant.world.partner.unit);
  const her = await E(page, () => {
    const w = window.__remnant.world, u = w.partner.unit, sp = w.partner.sprite, d = window.__remnant.archer.archerStats(w.save, w.eliorD);
    return { hero: u.hero, inSquad: w.classic.squad.echoes.includes(u), tex: sp.texture.key, visible: sp.visible, hp: u.maxHp, herHp: d.maxHp };
  });
  assert.ok(her.hero === 'tirzah' && her.inSquad && /action-tirzah/.test(her.tex) && her.visible && her.hp === her.herHp, `Tirzah fights beside Elior in her own sheet, with her own health (${JSON.stringify(her)})`);
  console.log(`Called: Tirzah came out with ${her.hp} health (her own), drawn from ${her.tex}`);

  // ---- she hunts: the foes take damage while Elior stands still
  const fought = await E(page, async () => {
    const w = window.__remnant.world, foes = () => w.classic.ents.filter((e) => e.isFoe && !e.dying);
    const before = foes().reduce((n, e) => n + e.hp, 0), kills = w.save.kills;
    // Elior on open floor near a husk, as in echoes.mjs, so the foe is in sight.
    const open = (x, y) => w.tileAt(Math.floor(x / 16), Math.floor(y / 16)) === 0;
    let f = null;
    for (const e of foes()) {
      if (!open(e.x - 70, e.y - 2) || open(e.x - 70, e.y + 2)) continue;
      w.player.placeAt(e.x - 70, e.y, 1);
      if (w.player.lineOfSight(e.x, e.cy)) { f = e; break; }
    }
    if (!f) return 'no foe in sight';
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const now = foes().reduce((n, e) => n + e.hp, 0);
      if (now < before - 1 || w.save.kills > kills) return { hurt: Math.round(before - now), kills: w.save.kills - kills };
    }
    return null;
  });
  assert.ok(fought && typeof fought === 'object', `the partner fought the foes on her own (${JSON.stringify(fought)})`);
  await page.screenshot({ path: 'qa/partner.png' });
  console.log(`Fight: Tirzah struck the foes while Elior stood still (${JSON.stringify(fought)})`);

  // ---- the partner or the Echoes: calling the Echoes sends her back, calling her sends them back
  await E(page, () => window.__remnant.world.classic.squad.setSummon('all'));
  await until(page, () => { const w = window.__remnant.world; return !w.save.partnerOut && !w.partner.unit && w.classic.squad.echoes.some((e) => e.inst.uid === 'e_sentinel' && e.despawn <= 0); });
  await E(page, () => window.__remnant.world.partner.toggle());
  await until(page, () => { const w = window.__remnant.world; return w.save.partnerOut && !!w.partner.unit && w.save.flags.army_out === false && !w.classic.squad.echoes.some((e) => e.inst.uid === 'e_sentinel' && e.despawn <= 0); });
  console.log('Partner or Echoes: each sends the other back');

  // ---- the joint finisher: the partner strikes the same foe
  const joint = await E(page, async () => {
    const w = window.__remnant.world, f = w.classic.ents.find((e) => e.isFoe && !e.dying);
    if (!f) return 'no foe';
    f.hp = f.maxHp = 1e7; const hp = f.hp;
    w.partner.unit.x = f.x + 100; w.partner.joinFinisher(f);
    await new Promise((r) => setTimeout(r, 700));
    return { took: hp - f.hp, beside: Math.abs(w.partner.unit.x - f.x) < 40 };
  });
  assert.ok(joint === 'no foe' || (joint.took > 0 && joint.beside), `the partner joined the finisher (${JSON.stringify(joint)})`);
  console.log(`Joint finisher: ${JSON.stringify(joint)}`);


  // ---- switching heroes swaps who the partner is
  // The switch waits for a free moment (the finisher may still hold Elior on a slow runner): ask until it takes.
  await until(page, () => { const w = window.__remnant.world, p = w.player; if (p.hero !== 'tirzah') { p.switchCd = 0; p.switchHero(); } return p.hero === 'tirzah' && w.partner.unit?.hero === 'elior'; });
  const him = await E(page, () => { const w = window.__remnant.world; return { tex: w.partner.sprite.texture.key, hp: w.partner.unit.maxHp, his: w.eliorD.maxHp }; });
  assert.ok(/action-elior/.test(him.tex) && him.hp === him.his, `Elior is now the partner, with his own health (${JSON.stringify(him)})`);
  console.log('Switch: Tirzah fights, and Elior became the partner in his own sheet');

  // ---- through a door, the partner comes along
  await E(page, () => { const ex = window.__remnant.world.room.exits?.find?.((x) => x.to) ?? null; window.exitTo = ex?.to; });
  const next = await E(page, () => window.exitTo);
  if (next) {
    await E(page, (to) => window.__remnant.warp(to, 'start'), next);
    await until(page, (to) => { const w = window.__remnant.world; return w.room.id === to && !w.transitioning && !!w.partner.unit; }, next);
    console.log(`Doors: the partner came along to ${next}`);
  }

  // ---- once a room she pulls you up; the second fall is a fall
  const rev = await E(page, () => {
    const w = window.__remnant.world, p = w.player;
    window.hold = true;
    p.hp = 1; p.die();
    const first = { dead: p.dead, hp: p.hp, of: p.maxHp };
    p.hp = 1; p.invuln = 0; p.die();
    return { first, secondDead: p.dead };
  });
  assert.ok(!rev.first.dead && Math.abs(rev.first.hp / rev.first.of - 0.35) < 0.02 && rev.secondDead, `the partner pulled her up once, not twice (${JSON.stringify(rev)})`);
  console.log(`Revive: the partner pulled the player up to ${rev.first.hp} of ${rev.first.of}; the second fall stood`);

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser partner: all checks passed');
} finally {
  await browser.close();
  close();
}
