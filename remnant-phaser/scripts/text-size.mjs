// Settings → Text size → Largest (×1.5; POLISH_PLAN §19 phase 8): on the smallest phone the game supports, an iPhone SE
// in landscape, every page of the pause menu (the original's and this build's Tirzah and Psalms pages) shows its text
// larger than at Extra large, with nothing running off the screen and no text cut off (pages scroll down instead).
// The home screen, the Watch (upright) and the Horde's level-up cards do the same, and the Horde's cards show the
// gold focus ring. Run after `npm run build`.
import { chromium, devices } from '@playwright/test';
import assert from 'node:assert/strict';
import { serve } from './serve.mjs';

const { base, close } = await serve();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
const errors = [];
const E = (page, fn, arg) => page.evaluate(fn, arg);
const PAGES = ['quests', 'map', 'chapters', 'valor', 'character', 'equipment', 'skills', 'progression', 'moves', 'crafting', 'store',
  'tz_character', 'tz_equipment', 'tz_skills', 'tz_abilities', 'psalms', 'items', 'gear', 'echoes', 'imprints', 'lore', 'bestiary', 'settings', 'system'];

/** Anything under `sel` that runs past the screen's sides (outside a strip that scrolls sideways), or text cut off. */
const OVERFLOW = (sel) => {
  const W = window.innerWidth, root = document.querySelector(sel);
  if (!root) return { missing: sel };
  const off = new Set(), clip = new Set();
  for (const e of root.querySelectorAll('*')) {
    const b = e.getBoundingClientRect();
    if (!b.width || !b.height) continue;
    let p = e.parentElement, strip = false;
    while (p && p !== root) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll') { strip = true; break; } p = p.parentElement; }
    if (!strip && (b.right > W + 1 || b.left < -1)) off.add(`${e.className || e.tagName}@${Math.round(b.left)}–${Math.round(b.right)}`);
    const cs = getComputedStyle(e);
    if (!e.children.length && e.textContent.trim() && cs.overflow !== 'visible' && cs.textOverflow !== 'ellipsis' && e.scrollWidth > e.clientWidth + 2) clip.add(`${e.className || e.tagName}: ${e.textContent.trim().slice(0, 24)}`);
  }
  return { off: [...off].slice(0, 4), clip: [...clip].slice(0, 4) };
};

const open = async (device, textSize, q) => {
  const ctx = await browser.newContext({ ...devices[device] }), page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
  await page.addInitScript((ts) => localStorage.setItem('remnant-phaser.settings.v1', JSON.stringify({ textSize: ts, v: 5 })), textSize);
  await page.goto(base + q);
  return page;
};

try {
  // ---- every page of the pause menu, at Extra large and at Largest
  const body = {};
  for (const ts of ['xl', 'xxl']) {
    const page = await open('iPhone SE landscape', ts, '?debug&nostory&autostart&fresh');
    await page.waitForFunction(() => window.__remnant?.world?.player && !window.__remnant.world.transitioning, null, { timeout: 60000 });
    await E(page, () => { const s = window.__remnant.world.save; s.level = 30; for (const sp of ['sentinel', 'archer', 'knight']) { const i = { uid: 'e_' + sp, species: sp, level: 5, xp: 0, stage: 0, hp: 999, absorptions: 1 }; s.echoes.push(i); s.active.push(i.uid); } window.__remnant.world.refreshStats(); });
    for (const t of PAGES) {
      const r = await E(page, async ([t, overflow]) => {
        window.__remnant.G.ui.openMenu(t);
        await new Promise((r) => setTimeout(r, 200));
        const out = new Function(`return (${overflow})`)()('.menu');
        out.fs = parseFloat(getComputedStyle(document.querySelector('.menu-body')).fontSize);
        return out;
      }, [t, OVERFLOW.toString()]);
      if (ts === 'xxl') {
        assert.ok(!r.missing, `${t}: the page opens`);
        assert.deepEqual(r.off, [], `${t} at Largest: nothing runs off the screen`);
        assert.deepEqual(r.clip, [], `${t} at Largest: no text cut off`);
      }
      body[ts] = r.fs;
    }
    if (ts === 'xxl') await page.screenshot({ path: 'qa/text-largest-menu.png' });
    await page.context().close();
  }
  assert.ok(body.xxl > body.xl * 1.1, `the menus' text is larger at Largest (${body.xl} → ${body.xxl} px)`);
  console.log(`Pause menu: all ${PAGES.length} pages fit an iPhone SE sideways at Largest; text ${body.xl} → ${body.xxl} px`);

  // ---- the home screen and the Watch, upright
  {
    const page = await open('iPhone SE', 'xxl', '?debug');
    await page.waitForFunction(() => window.__remnant?.game?.scene?.isActive('title') && document.querySelector('.hm-card'), null, { timeout: 60000 });
    const home = await E(page, (o) => new Function(`return (${o})`)()('.hm'), OVERFLOW.toString());
    assert.deepEqual([home.off, home.clip], [[], []], `the home screen at Largest (${JSON.stringify(home)})`);
    await page.click('[data-k=title_watch]');
    await page.waitForFunction(() => window.__remnant?.watch?.w && document.querySelector('.wt-card'), null, { timeout: 30000 });
    await page.waitForTimeout(400);
    for (const tab of ['up', 'skills', 'shadows', 'daily', 'hero', 'ascend']) {
      await page.click(`[data-k=wt_tab_${tab}]`);
      await page.waitForTimeout(150);
      const r = await E(page, (o) => new Function(`return (${o})`)()('.wt-root'), OVERFLOW.toString());
      assert.deepEqual(r.off, [], `the Watch's ${tab} tab at Largest: nothing off the screen`);
    }
    await page.screenshot({ path: 'qa/text-largest-watch.png' });
    console.log('Home and the Watch: every tab fits an iPhone SE upright at Largest');
    await page.context().close();
  }

  // ---- the Horde's level-up cards: they fit, and the focused one wears the gold ring
  {
    const page = await open('iPhone SE', 'xxl', '?debug&horde');
    await page.waitForFunction(() => window.__remnant?.horde?.hero?.sprite && window.__remnant.game.scene.isActive('horde'), null, { timeout: 60000 });
    await E(page, () => { const h = window.__remnant.horde; h.hurtHero = () => {}; h.pendingLevels = 1; });
    await page.waitForFunction(() => document.querySelector('.hz-card'), null, { timeout: 15000 });
    await page.keyboard.press('ArrowDown');
    const r = await E(page, (o) => {
      const out = new Function(`return (${o})`)()('.hz-layer'), f = document.activeElement, s = getComputedStyle(f);
      out.ring = f.classList.contains('hz-card') || f.classList.contains('hz-btn') ? `${s.outlineStyle} ${s.outlineColor}` : `focus on ${f.className || f.tagName}`;
      return out;
    }, OVERFLOW.toString());
    assert.deepEqual(r.off, [], 'the Horde\'s cards at Largest: nothing off the screen');
    assert.match(r.ring, /solid rgb\(246, 222, 160\)/, `the focused Horde card wears the gold ring (${r.ring})`);
    await page.screenshot({ path: 'qa/text-largest-horde.png' });
    console.log(`Horde: the level-up cards fit at Largest; the focused one: ${r.ring}`);
    await page.context().close();
  }

  assert.deepEqual(errors, [], 'no page errors');
  console.log('phaser text size: all checks passed');
} finally {
  await browser.close();
  close();
}
