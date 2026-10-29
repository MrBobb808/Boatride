// Tirzah's six abilities on her own three skill buttons (POLISH_PLAN §5a):
// the loadout fills as she levels and is equipped from the Echo wheel; Arrow of
// Deliverance pierces the line, Jonathan's Volley bursts back from behind the
// foes, Hunter's Mark, Rain of Arrows, Watchman's Eye (slowed time and
// precision shots) and Quiver of the Mighty (split shots). Arrow types nock with
// Down + Sub and carry their element. Run after `npm run build`.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
await mkdir('qa', { recursive: true });
const errors = [];
const E = (page, fn, arg) => page.evaluate(fn, arg);
const until = (page, fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout }).catch(async (e) => {
  const s = await page.evaluate(() => { const w = window.__remnant.world, p = w.player; return { state: p.state, ce: w.save.ce, slots: w.save.archerSkills, cds: Object.fromEntries(Object.entries(p.cds).filter(([, v]) => v > 0)), arrows: p.bow.arrows.filter((a) => a.life > 0).map((a) => a.move), foes: window.foes.map((f) => f.hp) }; });
  throw Error(`${e.message}\n${fn}\n${JSON.stringify(s)}\n${errors.join('\n')}`);
});
const ready = (page) => until(page, () => { const p = window.__remnant.world.player; return p.state === 'free' && p.onGround; });

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  await page.goto(base + '?debug&nostory&autostart&fresh');
  await until(page, () => window.__remnant?.world?.player?.onGround, undefined, 20000);
  await E(page, () => window.__remnant.world.loadRoom('ashen_road', 'left'));
  await until(page, () => { const w = window.__remnant.world; return w.player.onGround && !w.transitioning; });
  // Level 30 Tirzah, two foes in a line on flat ground that never move or fall.
  const slots = await E(page, () => {
    const w = window.__remnant.world, s = w.save, open = (x, y) => w.tileAt(Math.floor(x / 16), Math.floor(y / 16)) === 0;
    Object.assign(s, { level: 30, playableHero: 'tirzah' }); s.archer.level = 30; s.flags.relic_taken = true;
    w.refreshStats(); w.d.crit = 0;
    const foes = w.classic.ents.filter((e) => e.isFoe && !e.dying && !e.flying).slice(0, 2);
    for (const e of w.classic.ents) if (!foes.includes(e) && e.isFoe) e.remove = true;
    const feet = w.player.feet, flat = (x) => { for (let dx = -140; dx <= 140; dx += 8) if (open(x + dx, feet + 2) || !open(x + dx, feet - 2) || !open(x + dx, feet - 40)) return false; return true; };
    let x = 0; for (let tx = 160; tx < w.roomW() - 160; tx += 8) if (flat(tx)) { x = tx; break; }
    foes.forEach((f, i) => { f.x = x + i * 60; f.y = feet; f.body.vx = f.body.vy = 0; f.hp = f.maxHp = 1e8; f.think = function () { this.body.vx = 0; }; f.executable = () => false; });
    window.foes = foes;
    window.reset = (dx = -100) => { const p = w.player; for (const f of foes) { f.staggered = 0; f.burn = 0; if (f.state !== 'idle') f.setState('idle', 'idle'); f.x = x + foes.indexOf(f) * 60; f.y = feet; } p.placeAt(x + dx, feet, 1); p.body.setVelocity(0, 0); w.save.ce = p.maxCe; for (const k in p.cds) p.cds[k] = 0; };
    window.hp = () => foes.map((f) => f.hp);
    return { slots: s.archerSkills, quiver: s.quiver, label: w.hud.skillTexts[0].text };
  });
  assert.deepEqual(slots.slots, ['deliverance', 'jonathan', 'mark'], `her three slots filled in order as she levelled (${JSON.stringify(slots)})`);
  assert.deepEqual(slots.quiver, ['standard', 'fire', 'frost', 'storm', 'holy'], 'level 30 opened every arrow type');
  console.log(`Loadout: ${slots.slots.join(', ')} on her buttons; quiver ${slots.quiver.join(', ')}`);
  // Every ability has its own pixel icon, and the skill bar shows hers.
  const icons = await E(page, async () => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const R = window.__remnant, tex = R.game.textures, ids = ['sword_word', 'trumpet', 'shield_faith', 'lion', 'still_waters', 'pillar_fire', 'chains', 'armor_light', 'chain_snare', 'blink_strike', 'mending_light', 'frost_ring', 'deliverance', 'jonathan', 'mark', 'rain', 'watchman', 'quiver'];
    const sig = (id) => { const c = tex.get('ability-' + id).getSourceImage(), d = c.getContext('2d').getImageData(0, 0, 64, 64).data; let h = 0; for (let i = 0; i < d.length; i += 4) h = (h * 31 + d[i] * 3 + d[i + 1] * 5 + d[i + 2] * 7 + (d[i + 3] ? 1 : 0)) >>> 0; return h; };
    const sigs = ids.map((id) => tex.exists('ability-' + id) ? sig(id) : 0);
    const bar = R.world.hud.skillIcons.map((i) => i.texture.key);
    return { missing: ids.filter((_, i) => !sigs[i]), distinct: new Set(sigs).size, bar };
  });
  assert.ok(!icons.missing.length && icons.distinct === 18 && icons.bar[0] === 'ability-deliverance', `18 distinct ability icons, hers on the bar (${JSON.stringify(icons)})`);
  console.log(`Icons: 18 distinct ability icons; the bar shows ${icons.bar.join(', ')}`);
  await ready(page);

  // ---- Arrow of Deliverance pierces the whole line and breaks guards
  let hp0 = await E(page, () => { window.reset(); return window.hp(); });
  await page.keyboard.press('KeyQ');
  await until(page, (hp) => window.hp().every((h, i) => h < hp[i]), hp0);
  console.log('Deliverance: one arrow pierced both foes in the line');

  // ---- Jonathan's Volley plants past the foes and bursts back from behind
  await ready(page);
  hp0 = await E(page, () => { window.reset(); return window.hp(); });
  await page.keyboard.press('KeyE');
  await until(page, () => window.__remnant.world.player.bow.arrows.some((a) => a.life > 0 && a.move === 'jonathan' && a.back && Math.sign(a.vx) === -1));
  await until(page, (hp) => window.hp().some((h, i) => h < hp[i]), hp0);
  console.log("Jonathan's Volley: three arrows planted past the foes and struck them from behind");

  // ---- Hunter's Mark: marked foe takes more from her, and her arrows curve to it
  await ready(page);
  await E(page, () => window.reset());
  await page.keyboard.press('KeyR');
  await until(page, () => !!window.__remnant.world.player.bow.kit.mark);
  const mark = await E(page, async () => {
    const p = window.__remnant.world.player, k = p.bow.kit; await new Promise((r) => requestAnimationFrame(r));
    return { marked: !!k.mark && k.mark.e === window.foes[0], mul: k.mark ? k.damageFor(k.mark) : 0, shown: k.markImg.visible };
  });
  assert.ok(mark.marked && mark.mul === 1.25 && mark.shown, `Hunter's Mark marked the nearest foe (${JSON.stringify(mark)})`);
  console.log("Hunter's Mark: the nearest foe is marked and takes a quarter more from her");

  // ---- the Echo wheel equips her other abilities; the third slot takes a new one when all are full
  const wheel = await E(page, () => {
    const w = window.__remnant.world, hud = w.hud;
    hud.openWheel('archer');
    const pick = (word) => hud.pickWheel(hud.wheelItems.findIndex((it) => it.label.includes(word)));
    pick('RAIN');
    const afterRain = [...w.save.archerSkills];
    pick('DELIVER'); pick('VOLLEY');
    pick('EYE'); pick('QUIVER');
    const labels = hud.wheelItems.map((it) => it.label);
    hud.closeWheel();
    return { afterRain, slots: w.save.archerSkills, labels };
  });
  assert.deepEqual(wheel.afterRain, ['deliverance', 'jonathan', 'rain'], `a full loadout puts the new ability in the third slot (${JSON.stringify(wheel)})`);
  assert.deepEqual(wheel.slots, ['watchman', 'quiver', 'rain'], `taking two off and adding two refills the open slots (${JSON.stringify(wheel)})`);
  await page.screenshot({ path: 'qa/archer-wheel.png' });
  console.log(`Wheel: equipped ${wheel.slots.join(', ')} from "Tirzah's abilities"`);

  // ---- Rain of Arrows (third slot)
  await ready(page);
  hp0 = await E(page, () => { window.reset(-110); return window.hp(); });
  await page.keyboard.press('KeyR');
  await until(page, () => window.__remnant.world.player.bow.arrows.some((a) => a.life > 0 && a.move === 'rain'));
  await until(page, (hp) => window.hp().some((h, i) => h < hp[i]), hp0);
  console.log('Rain of Arrows: arrows fell over the foes');

  // ---- Watchman's Eye: time slows and her next shots are precision hits
  await E(page, () => { window.__remnant.world.player.bow.kit.rainT = 0; });
  await ready(page);
  await E(page, () => { window.reset(-100); window.__remnant.world.player.bow.tally.precise = 0; });
  await page.keyboard.press('KeyQ');
  await until(page, () => window.__remnant.world.player.bow.kit.eyeShots > 0);
  const eye = await E(page, async () => { const w = window.__remnant.world; return { shots: w.player.bow.kit.eyeShots, slow: w.classic.slowScale }; });
  assert.ok(eye.shots === 3 && eye.slow < 1, `Watchman's Eye slowed time and readied three precision shots (${JSON.stringify(eye)})`);
  await ready(page);
  await page.keyboard.press('KeyJ');
  await until(page, () => window.__remnant.world.player.bow.tally.precise >= 1);
  console.log("Watchman's Eye: time slowed and the next shot struck as a precision hit");

  // ---- Quiver of the Mighty splits every shot in three
  await ready(page);
  await E(page, () => window.reset(-100));
  await page.keyboard.press('KeyE');
  await until(page, () => window.__remnant.world.player.bow.kit.quiverT > 0);
  await ready(page);
  await E(page, () => { for (const a of window.__remnant.world.player.bow.arrows) a.life = 0; });
  await page.keyboard.press('KeyJ');
  await until(page, () => window.__remnant.world.player.bow.arrows.filter((a) => a.life > 0 && a.move === 'bow_quick').length === 3);
  console.log('Quiver of the Mighty: one shot split into three');

  // ---- arrow types: Down + Sub nocks fire arrows, and they set foes burning
  await until(page, () => window.__remnant.world.player.bow.kit.quiverT <= 0, undefined, 15000).catch(() => {});
  await E(page, () => { window.__remnant.world.player.bow.kit.quiverT = 0; window.reset(-100); });
  await ready(page);
  await page.keyboard.down('KeyS'); await page.keyboard.press('KeyU'); await page.keyboard.up('KeyS');
  assert.equal(await E(page, () => window.__remnant.world.save.arrowType), 'fire', 'Down + Sub nocked fire arrows');
  await page.keyboard.press('KeyJ');
  await until(page, () => window.foes[0].burn > 0);
  const saved = await E(page, () => { const w = window.__remnant.world; w.persist(); const raw = localStorage.getItem('remnant-phaser.save.v2'); const d = JSON.parse(raw); return { slots: d.archerSkills, arrow: d.arrowType, quiver: d.quiver }; });
  assert.ok(saved.arrow === 'fire' && saved.slots?.includes('rain') && saved.quiver?.length === 5, `her loadout and quiver are saved (${JSON.stringify(saved)})`);
  console.log('Arrow types: Down + Sub nocked fire arrows, which set the foe burning; loadout and quiver saved');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser archer kit: all checks passed');
} finally {
  await browser.close();
  close();
}
