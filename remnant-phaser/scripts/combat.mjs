// Combat depth in the Phaser rebuild, with real key presses: a held heavy blow
// out-hits a tap, a perfect parry turns a blow aside and staggers the foe into
// a critical counter, a raised guard blocks most of a blow, Balm heals and runs
// out, the three Covenant skills spend energy and do their work, and the touch
// buttons for parry, Balm and skills answer a thumb. Run after `npm run build`.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
await mkdir('qa', { recursive: true });
const errors = [];
const watch = (page) => {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
};
const ready = (page) => page.waitForFunction(() => window.__remnant?.world?.player && !window.__remnant.world.transitioning, null, { timeout: 20000 });
const E = (page, fn, arg) => page.evaluate(fn, arg);
/** A practice foe in front of Elior: the original's husk, unable to die, standing still unless asked to fight. */
const dummy = async (page, opts = {}) => {
  const hp = await place(page, opts);
  // Settled on the floor and free, so the next press is not lost to the frame after placement.
  await page.waitForFunction(() => { const p = window.__remnant.world.player; return p.onGround && p.state === 'free' && p.parryCd <= 0; }, null, { timeout: 5000 });
  return hp;
};
const place = (page, opts) => E(page, (o) => {
  const w = window.__remnant.world, p = w.player;
  const foes = w.classic.ents.filter((e) => e.isFoe);
  // A husk with open floor where Elior will stand (the Ashen Road has raised blocks).
  const gap = o.gap ?? 22, open = (x, y) => w.tileAt(Math.floor(x / 16), Math.floor(y / 16)) === 0;
  const f = foes.find((e) => e.kind === 'husk' && !e.dying && open(e.x - gap, e.y - 2) && open(e.x - gap, e.y - 24) && !open(e.x - gap, e.y + 2));
  for (const e of foes) if (e !== f) e.remove = true;
  f.hp = f.maxHp = 1e6;
  f.executable = () => false; // Finisher priority is exercised by powers.mjs.
  f.staggered = 0;
  f.hurtT = 0;
  f.poise = f.maxPoise;
  if (o.state === 'chase') { delete f.think; f.aggro = true; f.attackCd = 0; f.setState('chase', 'walk'); }
  else { f.think = function () { this.body.vx = 0; }; f.setState('idle', 'idle'); }
  p.placeAt(f.x - gap, f.y, 1);
  p.hp = p.maxHp;
  w.save.ce = o.ce ?? 0;
  return f.hp;
}, opts);
const foeHp = (page) => E(page, () => window.__remnant.world.classic.ents.find((e) => e.kind === 'husk' && !e.remove).hp);

try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  watch(page);
  await page.goto(base + '?debug&nostory&autostart&fresh');
  await ready(page);
  await E(page, () => window.__remnant.warp('ashen_road', 'left'));
  await page.waitForFunction(() => window.__remnant.world.room.id === 'ashen_road' && !window.__remnant.world.transitioning);
  await page.waitForTimeout(300);

  // ---- a tap against a fully charged heavy blow
  let hp0 = await dummy(page);
  const taps = [];
  for (let i = 0; i < 3; i++) {
    await dummy(page);
    const before = await foeHp(page);
    await page.keyboard.press('KeyJ');
    await page.waitForFunction(b => window.__remnant.world.classic.ents.find(e => e.kind === 'husk' && !e.remove).hp < b, before, { timeout: 5000 });
    await page.waitForFunction(() => window.__remnant.world.player.state === 'free', null, { timeout: 5000 });
    taps.push(before - (await foeHp(page)));
  }
  await dummy(page);
  const beforeHeavy = await foeHp(page);
  await page.keyboard.down('KeyK');
  // Game time, not wall time: a slow headless frame rate stretches the second it takes.
  await page.waitForFunction(() => window.__remnant.world.player.chargeLvl >= 2, null, { timeout: 4000 });
  const charge = await E(page, () => ({ st: window.__remnant.world.player.state, lvl: window.__remnant.world.player.chargeLvl }));
  await page.screenshot({ path: 'qa/combat-charge.png' });
  await page.keyboard.up('KeyK');
  await page.waitForFunction(b => window.__remnant.world.classic.ents.find(e => e.kind === 'husk' && !e.remove).hp < b, beforeHeavy, { timeout: 8000 });
  const heavy = beforeHeavy - (await foeHp(page));
  assert.equal(charge.st, 'charge');
  assert.equal(charge.lvl, 2, 'held a second: full charge');
  assert.ok(heavy > Math.min(...taps) * 3, `a full heavy blow (${heavy}) out-hits a tap (${taps})`);
  console.log(`Heavy: taps of ${taps.join(', ')}; a full charge on K hit for ${heavy}`);

  // Holding the attack button charges too (as on touch).
  await dummy(page);
  await page.keyboard.down('KeyJ');
  await page.waitForFunction(() => window.__remnant.world.player.state === 'charge', null, { timeout: 5000 });
  assert.equal(await E(page, () => window.__remnant.world.player.state), 'charge', 'a held STRIKE charges after its first swing');
  await page.keyboard.up('KeyJ');
  await page.waitForTimeout(500);

  // ---- perfect parry: the blow is turned aside, the foe reels, the counter is critical
  await dummy(page, { ce: 0 });
  await page.keyboard.press('KeyI');
  const parry = await E(page, () => {
    const w = window.__remnant.world, p = w.player, f = w.foes().find((g) => g.kind === 'husk');
    const hp = p.hp, landed = p.hurt({ dmg: 30, dir: -1, src: f });
    return { landed, hp, after: p.hp, staggered: f.e.staggered > 0 || f.e.hurtT > 0, ce: w.save.ce, counter: p.counterT };
  });
  assert.equal(parry.landed, false, 'parried');
  assert.equal(parry.after, parry.hp, 'no damage through a parry');
  assert.ok(parry.staggered, 'the attacker reels');
  assert.ok(parry.ce >= 5, 'a parry feeds Covenant Energy');
  assert.ok(parry.counter > 0, 'a counter window opens');
  const beforeCounter = await foeHp(page);
  await page.keyboard.press('KeyJ');
  await page.waitForFunction(b => window.__remnant.world.classic.ents.find(e => e.kind === 'husk' && !e.remove).hp < b, beforeCounter, { timeout: 8000 });
  const counter = beforeCounter - (await foeHp(page));
  // A counter: critical (×1.6) and half again (×1.5).
  assert.ok(counter > Math.min(...taps) * 2, `the counter (${counter}) is far heavier than a tap (${taps})`);
  console.log(`Parry: no damage, the husk reeled, +${Math.round(parry.ce)} energy, the counter hit for ${counter}`);

  // A real foe's swing, parried by a press of I as it winds up.
  // A real foe's swing (the original husk's: its blow lands 0.48 s in), parried by a press of I as it winds up.
  await dummy(page, { state: 'chase', gap: 20 });
  await page.waitForFunction(() => { const f = window.__remnant.world.classic.ents.find((e) => e.kind === 'husk' && !e.remove); return f.state === 'attack' && f.st > 0.33; }, null, { timeout: 5000, polling: 'raf' });
  const hpBefore = await E(page, () => window.__remnant.world.player.hp);
  await page.keyboard.press('KeyI');
  await page.waitForTimeout(500);
  const live = await E(page, () => { const w = window.__remnant.world, f = w.classic.ents.find((e) => e.kind === 'husk' && !e.remove); return { hp: w.player.hp, st: f.state }; });
  assert.equal(live.hp, hpBefore, 'a timed parry of a live swing costs nothing');
  assert.ok(['hurt', 'stagger'].includes(live.st), `and the husk reels (${live.st})`);
  console.log(`A live husk swing, parried on its wind-up with I: no damage, the husk reels (${live.st})`);

  // ---- block: holding the guard past the window takes a quarter (of what armour lets through)
  await dummy(page);
  await page.keyboard.down('KeyI');
  // Game time, not wall time: past the parry window into the guard.
  await page.waitForFunction(() => window.__remnant.world.player.state === 'block', null, { timeout: 5000 });
  const block = await E(page, () => { const p = window.__remnant.world.player, f = window.__remnant.world.foes()[0]; const hp = p.hp, st = p.state; p.hurt({ dmg: 40, dir: -1, src: f }); return { st, lost: hp - p.hp, dr: window.__remnant.world.d.dr }; });
  await page.keyboard.up('KeyI');
  assert.equal(block.st, 'block');
  assert.equal(block.lost, Math.max(1, Math.round(40 * (1 - block.dr) * 0.25)), 'a block takes a quarter (after armour)');

  // ---- Balm: heals 42%, then runs out
  const balm = await E(page, async () => {
    const w = window.__remnant.world, p = w.player;
    for (const f of w.foes()) f.remove();
    p.hp = Math.round(p.maxHp * 0.3);
    return { hp: p.hp, balm: w.save.balm, max: p.maxHp };
  });
  await page.waitForTimeout(100);
  await page.keyboard.press('KeyH');
  await page.waitForFunction(hp => window.__remnant.world.player.hp > hp, balm.hp, { timeout: 8000 });
  let s = await E(page, () => ({ hp: window.__remnant.world.player.hp, balm: window.__remnant.world.save.balm }));
  assert.equal(s.balm, balm.balm - 1, 'one flask spent');
  assert.equal(s.hp, balm.hp + Math.round(balm.max * 0.42), 'healed 42%');
  await E(page, () => { const w = window.__remnant.world; w.save.balm = 0; w.player.hp = 20; });
  await page.keyboard.press('KeyH');
  await page.waitForTimeout(900);
  assert.equal(await E(page, () => window.__remnant.world.player.hp), 20, 'no Balm, no healing');
  console.log(`Balm: ${balm.hp} → ${s.hp} of ${balm.max}; empty flasks heal nothing`);

  // ---- skills
  await E(page, () => window.__remnant.warp('ashen_road', 'left'));
  await page.waitForFunction(() => !window.__remnant.world.transitioning);
  await page.waitForTimeout(300);
  await dummy(page, { gap: 110, ce: 100 });
  let before = await foeHp(page);
  await page.keyboard.press('KeyQ');
  // Game time: the arc flies until it meets the husk.
  await page.waitForFunction((b) => window.__remnant.world.classic.ents.find((e) => e.kind === 'husk' && !e.remove).hp < b, before, { timeout: 5000 }).catch(() => {});
  s = await E(page, () => ({ ce: window.__remnant.world.save.ce }));
  assert.ok(before - (await foeHp(page)) > 0, 'the Sword of the Word reaches a foe 110 px away');
  assert.ok(s.ce < 100 - 22 + 4, `it cost 22 energy (${s.ce})`);
  await dummy(page, { gap: 40, ce: 100 });
  before = await foeHp(page);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(b => window.__remnant.world.classic.ents.find(e => e.kind === 'husk' && !e.remove).hp < b, before, { timeout: 8000 });
  const horn = await E(page, () => { const f = window.__remnant.world.foes()[0]; return { st: f.e.state, ce: window.__remnant.world.save.ce }; });
  assert.ok(before - (await foeHp(page)) > 0, 'the Trumpet strikes nearby foes');
  assert.equal(horn.st, 'stagger', 'and staggers them');
  // Game time: the Trumpet's cast is over before the next skill.
  await page.waitForFunction(() => window.__remnant.world.player.state === 'free', null, { timeout: 5000 });
  await page.keyboard.press('KeyR');
  await page.waitForFunction(() => window.__remnant.world.player.shieldT > 0, null, { timeout: 5000 }).catch(() => {});
  const shield = await E(page, () => { const w = window.__remnant.world, p = w.player, hp = p.hp; const landed = p.hurt({ dmg: 50, dir: 1, src: w.foes()[0] }); return { landed, lost: hp - p.hp, t: p.shieldT }; });
  assert.ok(shield.t > 0 && !shield.landed && shield.lost === 0, `the Shield of Faith blocks everything: ${JSON.stringify(shield)}`);
  await page.screenshot({ path: 'qa/combat-skills.png' });
  // Not enough energy: nothing is cast.
  await E(page, () => { const w = window.__remnant.world; w.save.ce = 5; w.player.cds.sword_word = 0; });
  await page.keyboard.press('KeyQ');
  await page.waitForTimeout(100);
  assert.notEqual(await E(page, () => window.__remnant.world.player.state), 'cast', 'no energy, no skill');
  console.log('Skills: the Word struck at 110 px, the Trumpet staggered, the Shield blocked a 50-point blow; no energy, no cast');

  // ---- touch: parry, Balm and a skill from their buttons
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const phone = await ctx.newPage();
  watch(phone);
  await phone.goto(base + '?debug&nostory&autostart&fresh');
  await ready(phone);
  await phone.waitForTimeout(400);
  const btn = (a) => E(phone, (a) => { const b = window.__remnant.game.scene.getScene('hud').btns.find((b) => b.a === a); return [b.x / 2, b.y / 2]; }, a);
  for (const [a, expect] of [['parry', 'parry'], ['skill1', 'cast']]) {
    await E(phone, () => { const w = window.__remnant.world; w.save.ce = 100; w.player.hp = w.player.maxHp; });
    // A press during another move is ignored, as in the original: tap once Elior is free.
    await phone.waitForFunction(() => window.__remnant.world.player.state === 'free', null, { timeout: 5000 });
    const [x, y] = await btn(a);
    await phone.touchscreen.tap(x, y);
    await phone.waitForTimeout(40);
    assert.equal(await E(phone, () => window.__remnant.world.player.state), expect, `the ${a} button`);
    await phone.waitForTimeout(500);
  }
  await phone.waitForFunction(() => window.__remnant.world.player.state === 'free', null, { timeout: 5000 });
  await E(phone, () => { const p = window.__remnant.world.player; p.hp = 40; });
  const [hx, hy] = await btn('heal');
  await phone.touchscreen.tap(hx, hy);
  await phone.waitForFunction(() => window.__remnant.world.player.hp > 40, null, { timeout: 5000 }).catch(() => {});
  assert.ok(await E(phone, () => window.__remnant.world.player.hp > 40), 'the BALM button heals');
  await phone.screenshot({ path: 'qa/combat-phone.png' });
  console.log('Touch: PARRY, WORD and BALM buttons each did their work');

  assert.deepEqual(errors, []);
  console.log('phaser combat: all checks passed');
} finally {
  await browser.close();
  close();
}
