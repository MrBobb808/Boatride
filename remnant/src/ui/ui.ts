// DOM overlay layer implementing the game's UI hooks: toasts, banners,
// dialogue with portraits, captions, scripture cards, choices, the Echo
// command wheel, death and chapter-complete screens.

import { G, type DialogueLine, type UIHooks } from '../game/ctx';
import { h, btn, pushLayer, popLayer, clear } from './dom';
import { img } from './icons';
import { input } from '../core/input';
import { sfx, audio } from '../audio/audio';
import { music } from '../audio/music';
import { NPC_DEFS, renderPortrait } from '../game/props';
import { LORE, ITEMS, RARITY_COLORS, RARITY_NAMES, ECHO_SPECIES, type ItemInst, type EchoOrder } from '../game/data';
import { ORDER_MARK } from '../game/echoes';
import { setBoss } from './hud';
import { haptic } from './touch';
import { formatTime } from '../core/math';
import { openMenu, openShop, openAltar, isMenuOpen } from './menus';
import { SECRET_IDS } from '../game/story';
import { CH2_SECRETS } from '../game/story2';
import { CH3_SECRETS } from '../game/story3';
import { CH4_SECRETS } from '../game/story4';
import { CH5_SECRETS } from '../game/story5';

let uiRoot: HTMLElement;
let toastBox: HTMLElement;
let promptEl: HTMLElement | null = null;
let hintEl: HTMLElement | null = null;
let captionEl: HTMLElement | null = null;
let fadeEl: HTMLElement;
let blocking = 0;
let wheelEl: HTMLElement | null = null;

/** Hold the game still while a card from another module is up (+1 on, -1 off). */
export function holdUI(d: number) {
  blocking = Math.max(0, blocking + d);
}

export function blockingUI() {
  return blocking > 0 || isMenuOpen() || !!wheelEl;
}

export function initUI() {
  uiRoot = document.getElementById('ui')!;
  fadeEl = document.getElementById('fade')!;
  toastBox = h('div', { class: 'toasts' });
  uiRoot.appendChild(toastBox);
  G.ui = hooks;
}

function waitAdvance(el: HTMLElement, onAdvance: () => void): { off: () => void; go: () => void } {
  // One physical press can map to several actions (Space = jump + confirm); debounce.
  let last = 0;
  const go = () => {
    const now = performance.now();
    if (now - last < 160) return;
    last = now;
    onAdvance();
  };
  const off = input.onAction((a, repeat) => {
    if (repeat) return;
    if (a === 'confirm' || a === 'attack' || a === 'jump' || a === 'interact' || a === 'back') go();
  });
  el.addEventListener('pointerup', (e) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    go();
  });
  return { off, go };
}

const hooks: UIHooks = {
  toast(text, kind = 'info', color) {
    const t = h('div', { class: 'toast ' + kind }, text);
    if (color) t.style.borderColor = color;
    toastBox.prepend(t);
    while (toastBox.children.length > 4) toastBox.lastChild?.remove();
    setTimeout(() => t.classList.add('out'), 3200);
    setTimeout(() => t.remove(), 3700);
  },

  banner(title, sub = '', kind = 'area') {
    const b = h('div', { class: 'banner ' + kind }, h('div', { class: 'b-title' }, title), sub ? h('div', { class: 'b-sub' }, sub) : null, h('div', { class: 'b-line' }));
    uiRoot.querySelectorAll('.banner').forEach((x) => x.remove());
    uiRoot.appendChild(b);
    if (kind === 'boss' || kind === 'echo' || kind === 'level' || kind === 'ability') haptic('heavy');
    const dur = kind === 'area' ? 2600 : 3200;
    setTimeout(() => b.classList.add('out'), dur);
    setTimeout(() => b.remove(), dur + 900);
  },

  dialogue(lines: DialogueLine[]) {
    return new Promise<number>((resolve) => {
      blocking++;
      let i = 0;
      let choice = 0;
      const canvas = h('canvas', { width: '152', height: '152' });
      const who = h('div', { class: 'who' });
      const textEl = h('div', { class: 'text' });
      const choices = h('div', { class: 'choices' });
      const next = h('div', { class: 'next' }, '▼');
      const box = h('div', { class: 'dialogue panel' }, canvas, h('div', { class: 'dl-body scroll' }, who, textEl, choices), next);
      const layer = h('div', { class: 'layer', style: 'align-items:flex-end;padding:0;' }, box);
      uiRoot.appendChild(layer);
      let full = '';
      let shown = 0;
      let typing: number | null = null;
      let raf = 0;
      const anim = () => {
        const l = lines[i];
        if (l) renderPortrait(canvas, l.who, performance.now() / 1000);
        raf = requestAnimationFrame(anim);
      };
      anim();
      const show = () => {
        const l = lines[i];
        const def = (NPC_DEFS as Record<string, { name: string; title: string }>)[l.who];
        clear(who);
        if (l.who === 'elior') who.append('Elior', h('small', null, 'Watchman of Hearthward'));
        else if (def) who.append(def.name, h('small', null, def.title));
        else who.append(l.who === 'narrator' ? '' : l.who);
        canvas.style.display = l.who === 'elior' || def ? '' : 'none';
        clear(choices);
        full = l.text;
        shown = 0;
        textEl.textContent = '';
        next.style.display = 'none';
        if (typing) clearInterval(typing);
        typing = window.setInterval(() => {
          shown += 2;
          textEl.textContent = full.slice(0, shown);
          if (shown % 6 === 0) sfx('ui', { vol: 0.15, gap: 50 });
          if (shown >= full.length) finishTyping();
        }, 22);
      };
      const finishTyping = () => {
        if (typing) clearInterval(typing);
        typing = null;
        textEl.textContent = full;
        const l = lines[i];
        if (l.choices) {
          l.choices.forEach((c, ci) => choices.appendChild(btn(c.label, () => pick(ci), 'btn', ci === 0 ? { 'data-autofocus': '' } : {})));
          setTimeout(() => {
            if (input.lastDevice !== 'touch') (choices.querySelector('[data-nav]') as HTMLElement)?.focus();
          }, 30);
        } else next.style.display = '';
      };
      const pick = (ci: number) => {
        if (closed) return;
        choice = ci;
        sfx('uiConfirm');
        advance(true);
      };
      let closed = false;
      const advance = (fromChoice = false) => {
        if (closed || i >= lines.length) return;
        if (typing) {
          finishTyping();
          return;
        }
        if (lines[i].choices && !fromChoice) return;
        i++;
        if (i >= lines.length) {
          closed = true;
          off();
          cancelAnimationFrame(raf);
          popLayer(layer);
          blocking--;
          resolve(choice);
          return;
        }
        show();
      };
      // A tap anywhere advances, not only on the box: the layer covers the screen anyway.
      const { off, go } = waitAdvance(layer, () => {
        if (lines[i]?.choices && !typing) return;
        advance();
      });
      // Menu navigation consumes confirm before later listeners hear it, so
      // the dialogue layer advances on confirm itself (Enter on a keyboard).
      pushLayer({ el: layer, onAction: (a) => {
        if (lines[i]?.choices && !typing) return false;
        if (a === 'confirm') go();
        return a === 'confirm';
      } });
      show();
    });
  },

  itemGet(it: ItemInst) {
    const base = ITEMS[it.id];
    const c = RARITY_COLORS[it.rarity];
    hooks.toast(`${RARITY_NAMES[it.rarity]} — ${base.name}`, 'loot', c);
    if (it.rarity >= 3) haptic('heavy');
  },

  levelUp(levels: number) {
    sfx('levelup');
    haptic('heavy');
    hooks.banner(`LEVEL ${G.save.level}`, `${levels * 3} stat points and ${levels} skill point${levels > 1 ? 's' : ''} to spend — open the menu`, 'level');
  },

  hint(text) {
    hintEl?.remove();
    hintEl = null;
    if (text) {
      hintEl = h('div', { class: 'hint' }, text);
      uiRoot.appendChild(hintEl);
    }
  },

  prompt(text) {
    if (!text) {
      promptEl?.remove();
      promptEl = null;
      return;
    }
    if (input.lastDevice === 'touch') text = text.replace(/^\[[^\]]*\]\s*/, '');
    if (!promptEl) {
      promptEl = h('div', { class: 'prompt' });
      uiRoot.appendChild(promptEl);
    }
    if (promptEl.textContent !== text) promptEl.textContent = text;
  },

  lore(id: string) {
    return new Promise<void>((resolve) => {
      const L = LORE[id];
      if (!L) return resolve();
      blocking++;
      const card = h('div', { class: 'lore-card panel scroll' },
        h('div', { class: 'eyebrow' }, L.title),
        h('div', { class: 'verse-text' }, '“' + L.text + '”'),
        h('div', { class: 'ref' }, L.ref),
        h('hr', { class: 'rule' }),
        h('div', { class: 'note' }, L.note),
        h('div', { style: 'margin-top:14px' }, btn('Continue', () => close(), 'btn primary', { 'data-autofocus': '' })),
      );
      const layer = h('div', { class: 'layer dim' }, card);
      uiRoot.appendChild(layer);
      const close = () => {
        popLayer(layer);
        blocking--;
        input.flush();
        resolve();
      };
      pushLayer({ el: layer, onBack: close });
    });
  },

  cinematicBars(on: boolean) {
    document.getElementById('app')!.classList.toggle('bars', true);
    document.getElementById('app')!.classList.toggle('on', on);
  },

  fade(to: number, dur: number) {
    return new Promise<void>((resolve) => {
      fadeEl.style.transition = `opacity ${dur}s linear`;
      fadeEl.style.opacity = String(to);
      setTimeout(resolve, dur * 1000 + 20);
    });
  },

  openMenu(tab?: string) {
    openMenu(tab);
  },
  openShop(kind) {
    openShop(kind);
  },
  openAltar(id) {
    openAltar(id);
  },

  echoWheel(open: boolean) {
    if (!open) {
      wheelEl && popLayer(wheelEl);
      wheelEl = null;
      return;
    }
    if (wheelEl || !G.save.echoes.length) {
      if (!G.save.echoes.length) hooks.toast('You have no Echoes yet.', 'warn');
      return;
    }
    sfx('uiOpen');
    audio.setMuffled(true);
    openWheel('main');
  },

  showCredits(after) {
    const card = h('div', { class: 'chapter panel scroll' },
      h('div', { class: 'eyebrow' }, 'Credits'),
      h('h2', null, 'REMNANT: ASCENSION'),
      h('p', null, 'A vertical slice — Chapter I: The Ashen Village.'),
      h('p', { class: 'muted' }, 'Design, code, procedural art, animation, music and sound: generated for this project. Every character is drawn by code on a skeleton; every sound and note is synthesized live in your browser.'),
      h('p', { class: 'muted' }, 'Typefaces: Cinzel and Cormorant Garamond (SIL Open Font License).'),
      h('p', { class: 'muted' }, 'Scripture quotations are from the King James Version (public domain). The world, its kingdoms and its people are fiction; nothing here claims to retell biblical history.'),
      h('p', { class: 'theme' }, 'True greatness is not found in the power to rule, but in the strength to remain faithful.'),
      h('div', { class: 'row' }, btn('Close', () => close(), 'btn primary', { 'data-autofocus': '' })),
    );
    const layer = h('div', { class: 'layer dim' }, card);
    uiRoot.appendChild(layer);
    const close = () => {
      popLayer(layer);
      after?.();
    };
    pushLayer({ el: layer, onBack: close });
  },

  chapterEnd(chapter = 1) {
    return new Promise<'next' | 'stay'>((resolve) => {
      const s = G.save;
      blocking++;
      music.play('victory');
      const stat = (v: string | number, l: string) => h('div', { class: 'stat' }, h('b', null, String(v)), h('span', null, l));
      const C = [
        { n: 'Chapter I', title: 'THE ASHEN VILLAGE', secrets: SECRET_IDS, sl: 'Hidden chambers', theme: 'True greatness is not found in the power to rule, but in the strength to remain faithful.', next: 'The road east leads down to the Plain of Shinar, where a red tower has risen in a single month.', go: 'Begin Chapter II', stay: 'Stay in Hearthward', music: 'sanctuary' },
        { n: 'Chapter II', title: 'THE TOWER OF SHINAR', secrets: CH2_SECRETS, sl: 'Hidden caches', theme: 'Pride builds towers to make a name. Faithfulness keeps an oath when no one is watching.', next: 'Two days east lies the Valley of Bones, where a swarm has eaten everything that grew.', go: 'Begin Chapter III', stay: 'Stay in Shinar', music: 'shinar' },
        { n: 'Chapter III', title: 'THE VALLEY OF BONES', secrets: CH3_SECRETS, sl: 'Hidden caches', theme: 'The locust takes; the covenant restores. An army raised by mercy follows further than one driven by fear.', next: 'South, by the rivers of Babylon, an image of gold has been raised on the plain of Dura, and three captives are bound for the furnace.', go: 'Begin Chapter IV', stay: 'Stay in the valley', music: 'valley' },
        { n: 'Chapter IV', title: 'THE PLAIN OF DURA', secrets: CH4_SECRETS, sl: 'Hidden caches', theme: 'The furnace could not burn those who would not bow. Every image of gold stands on feet of clay.', next: 'Across the river, Babylon holds a feast for a thousand lords, and they mean to drink from the vessels of the temple.', go: 'Begin Chapter V', stay: 'Stay by the river', music: 'dura' },
        { n: 'Chapter V', title: 'THE WRITING ON THE WALL', secrets: CH5_SECRETS, sl: 'Treasures and vessels', theme: 'Pride drinks from holy things and calls itself a god. It is weighed in a single night, and found wanting.', next: 'Chapter VI is in development. Your journey continues: train in the Trial of the Remnant, grow your army toward level 100, or begin New Game+ at any altar.', go: '', stay: 'Continue exploring', music: 'riverbed' },
      ][Math.min(4, Math.max(1, chapter) - 1)];
      const card = h('div', { class: 'chapter panel scroll' },
        h('div', { class: 'eyebrow' }, C.n),
        h('h2', null, C.title),
        h('div', { class: 'muted' }, 'Complete'),
        h('div', { class: 'stats' },
          stat(formatTime(s.playtime), 'Time'), stat(s.level, 'Level'), stat(s.echoes.length, 'Echoes purified'),
          stat(`${C.secrets.filter((x) => s.secrets.includes(x)).length}/${C.secrets.length}`, C.sl), stat(s.kills, 'Foes overcome'), chapter > 1 ? stat(s.bestCombo ?? 0, 'Best combo') : stat(s.deaths, 'Times fallen'),
        ),
        h('p', { class: 'theme' }, C.theme),
        h('p', { class: 'next' }, C.next),
        h('div', { class: 'row' },
          C.go ? btn(C.go, () => close('next'), 'btn primary', { 'data-autofocus': '' }) : null,
          btn(C.stay, () => close('stay'), C.go ? 'btn' : 'btn primary', C.go ? {} : { 'data-autofocus': '' }),
          btn('Credits', () => hooks.showCredits()),
        ),
      );
      const layer = h('div', { class: 'layer dim' }, card);
      uiRoot.appendChild(layer);
      const close = (r: 'next' | 'stay' = 'stay') => {
        popLayer(layer);
        blocking--;
        if (r === 'stay') music.play(C.music);
        input.flush();
        resolve(r);
      };
      pushLayer({ el: layer, onBack: () => close('stay') });
    });
  },

  bossBar(name, sub) {
    setBoss(name, sub);
  },

  caption(text, ref) {
    captionEl?.remove();
    captionEl = null;
    if (text) {
      captionEl = h('div', { class: 'caption' }, text, ref ? h('span', { class: 'ref' }, ref) : null);
      uiRoot.appendChild(captionEl);
    }
  },

  refreshHud() {},

  isBlocking() {
    return blockingUI();
  },

  choice(title, body, options) {
    return new Promise<number>((resolve) => {
      blocking++;
      const card = h('div', { class: 'choice-card panel scroll' },
        h('div', { class: 'eyebrow' }, 'A choice'),
        h('h2', { class: 'title-text' }, title),
        h('p', null, body),
        h('div', { class: 'opts' }, options.map((o, i) => btn([h('b', null, o.label), o.sub ? h('span', null, o.sub) : null], () => done(i), 'btn opt', i === 0 ? { 'data-autofocus': '' } : {}))),
      );
      const layer = h('div', { class: 'layer dim' }, card);
      uiRoot.appendChild(layer);
      const done = (i: number) => {
        popLayer(layer);
        blocking--;
        sfx('uiConfirm');
        input.flush();
        resolve(i);
      };
      pushLayer({ el: layer });
    });
  },

  death() {
    return new Promise<void>((resolve) => {
      blocking++;
      music.stop(1.5);
      const box = h('div', { class: 'layer death' },
        h('h2', null, 'YOU HAVE FALLEN'),
        h('p', null, '“Rejoice not against me, O mine enemy: when I fall, I shall arise; when I sit in darkness, the LORD shall be a light unto me.”'),
        h('div', { class: 'ref' }, 'Micah 7:8 (KJV)'),
        btn('Rise again', () => done(), 'btn primary', { 'data-autofocus': '' }),
      );
      uiRoot.appendChild(box);
      const done = () => {
        popLayer(box);
        blocking--;
        input.flush();
        resolve();
      };
      pushLayer({ el: box, onBack: done });
    });
  },
};

export { hooks };

// ---------------------------------------------------------------- command wheel
type WheelItem = { label: string; icon: string; on?: boolean; color?: string; run: () => void };

/** The Echo command wheel and its two pages: Squad (how many to summon) and Orders. */
function wheelItems(page: 'main' | 'squad' | 'orders'): { title: string; sub: string; items: WheelItem[] } {
  const W = G.world;
  const s = G.save;
  const cmd = (id: Parameters<typeof W.echoCommand>[0]) => () => W.echoCommand(id);
  if (page === 'squad') {
    const pre = s.summonPreset ?? 'all';
    const picked = (s.squadPick ?? []).filter((u) => s.echoes.some((e) => e.uid === u)).length;
    return {
      title: 'Summon', sub: `${W.echoes.length} of ${Math.min(s.echoes.length, G.d.echoSlots)} out`,
      items: [
        { label: 'One', icon: 'echo', on: pre === 'one', run: () => W.setSummon('one') },
        { label: 'Two', icon: 'sync', on: pre === 'two', run: () => W.setSummon('two') },
        { label: picked ? `Squad (${picked})` : 'Squad', icon: 'sigil', on: pre === 'squad', run: () => W.setSummon('squad') },
        { label: 'All', icon: 'rally', on: pre === 'all', run: () => W.setSummon('all') },
        { label: W.echoes.length ? 'Dismiss' : 'Summon', icon: 'toggle', run: cmd('toggle') },
        { label: 'Back', icon: 'recall', run: () => openWheel('main') },
      ],
    };
  }
  if (page === 'orders') {
    const all = W.echoes.map((e) => e.order);
    const same = all.length && all.every((o) => o === all[0]) ? all[0] ?? 'free' : null;
    const o = (order: EchoOrder | undefined) => () => {
      W.orderEchoes(order);
      hooks.toast(order ? `All Echoes: ${ORDER_INFO[order].name} — ${ORDER_INFO[order].sub}` : 'All Echoes: free to follow the army\'s mode', 'info');
    };
    return {
      title: 'Orders', sub: 'for every Echo out',
      items: [
        { label: 'Guard', icon: 'defensive', on: same === 'guard', color: ORDER_MARK.guard, run: o('guard') },
        { label: 'Hunt', icon: 'aggressive', on: same === 'hunt', color: ORDER_MARK.hunt, run: o('hunt') },
        { label: 'Flank', icon: 'switch', on: same === 'flank', color: ORDER_MARK.flank, run: o('flank') },
        { label: 'Hold here', icon: 'pillar', on: same === 'hold', color: ORDER_MARK.hold, run: o('hold') },
        { label: 'Focus', icon: 'target', on: same === 'focus', color: ORDER_MARK.focus, run: o('focus') },
        { label: 'Free', icon: 'follow', on: same === 'free', run: o(undefined) },
        { label: 'Each Echo…', icon: 'echo', run: () => openOrdersPanel() },
        { label: 'Back', icon: 'recall', run: () => openWheel('main') },
      ],
    };
  }
  return {
    title: 'Command the Remnant', sub: `${W.echoes.length} of ${s.echoes.length} present`,
    items: [
      { label: 'Summon…', icon: 'toggle', run: () => openWheel('squad') },
      { label: 'Orders…', icon: 'sigil', run: () => openWheel('orders') },
      { label: 'Aggressive', icon: 'aggressive', on: s.echoMode === 'aggressive', run: cmd('aggressive') },
      { label: 'Defensive', icon: 'defensive', on: s.echoMode === 'defensive', run: cmd('defensive') },
      { label: 'Follow', icon: 'follow', on: s.echoMode === 'follow', run: cmd('follow') },
      { label: 'Mark target', icon: 'target', run: cmd('target') },
      { label: 'Recall', icon: 'recall', run: cmd('recall') },
      { label: W.syncCd > 0 ? `Sync ${Math.ceil(W.syncCd)}s` : 'Sync strike', icon: 'sync', run: cmd('sync') },
      { label: W.switchCd > 0 ? `Switch ${Math.ceil(W.switchCd)}s` : s.echoes.length > G.d.echoSlots ? 'Switch in' : 'Swap', icon: 'switch', run: cmd('switch') },
    ],
  };
}

function closeWheel() {
  if (!wheelEl) return;
  popLayer(wheelEl);
  wheelEl = null;
  audio.setMuffled(false);
  input.flush();
}

function openWheel(page: 'main' | 'squad' | 'orders') {
  if (wheelEl) {
    popLayer(wheelEl);
    wheelEl = null;
  }
  const { title, sub, items } = wheelItems(page);
  const ring = h('div', { class: 'wheel-ring' });
  const n = items.length;
  const btns: HTMLElement[] = [];
  items.forEach((it, i) => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    const sub = it.label.endsWith('…') || it.label === 'Back';
    const b = btn([img(it.icon, it.color ?? '#f6dea0'), it.label], () => {
      // Pages swap in place; commands close the wheel.
      if (!sub) closeWheel();
      it.run();
    }, 'wheel-btn' + (it.on ? ' on' : ''), i === 0 ? { 'data-autofocus': '' } : {});
    b.style.left = 50 + Math.cos(a) * 42 + '%';
    b.style.top = 50 + Math.sin(a) * 42 + '%';
    btns.push(b);
    ring.appendChild(b);
  });
  ring.appendChild(h('div', { class: 'wheel-center' }, title, h('div', { class: 'muted', style: 'font-family:var(--font-body);letter-spacing:0;font-size:1.2em;margin-top:4px;text-transform:none' }, sub)));
  const layer = h('div', { class: 'wheel' }, ring);
  layer.addEventListener('pointerup', (e) => {
    if (e.target === layer) closeWheel();
  });
  uiRoot.appendChild(layer);
  wheelEl = layer;
  // On a controller the stick points straight at a command (✕ picks it),
  // the way radial menus work on consoles.
  const stickMag = () => Math.hypot(input.axisX, input.axisY);
  const aim = () => {
    if (wheelEl !== layer) return;
    if (input.lastDevice === 'gamepad' && stickMag() > 0.55) {
      const ang = Math.atan2(input.axisY, input.axisX) + Math.PI / 2;
      const i = ((Math.round((ang / (Math.PI * 2)) * n) % n) + n) % n;
      if (document.activeElement !== btns[i]) {
        btns[i].focus({ preventScroll: true });
        sfx('ui', { vol: 0.5 });
      }
    }
    requestAnimationFrame(aim);
  };
  requestAnimationFrame(aim);
  const back = () => (page === 'main' ? closeWheel() : openWheel('main'));
  pushLayer({ el: layer, onBack: back, onAction: (a) => {
    if (a === 'echo' || a === 'menu') { closeWheel(); return true; }
    // The stick aims radially above; only the D-pad steps between buttons.
    if ((a === 'left' || a === 'right' || a === 'up' || a === 'down') && stickMag() > 0.5) return true;
    return false;
  } });
}

const ORDER_INFO: Record<EchoOrder, { name: string; sub: string }> = {
  guard: { name: 'Guard', sub: 'shield Elior and cut off foes that close in' },
  hunt: { name: 'Hunt', sub: 'pursue foes anywhere in the fight' },
  flank: { name: 'Flank', sub: 'get behind Elior\'s foe and strike its back' },
  hold: { name: 'Hold', sub: 'defend this spot; swap back to it later' },
  focus: { name: 'Focus', sub: 'stay on one foe until it falls' },
};

/** Orders one Echo at a time, and who belongs to the hand-picked squad. */
function openOrdersPanel() {
  if (wheelEl) {
    popLayer(wheelEl);
    wheelEl = null;
  }
  const W = G.world;
  const s = G.save;
  const list = h('div', { class: 'orders-list scroll' });
  const orders: (EchoOrder | 'free')[] = ['free', 'guard', 'hunt', 'flank', 'hold', 'focus'];
  const render = () => {
    clear(list);
    const out = new Set(W.echoes.map((e) => e.inst.uid));
    const sorted = [...s.echoes].sort((a, b) => Number(out.has(b.uid)) - Number(out.has(a.uid)));
    for (const inst of sorted) {
      const name = inst.nickname || ECHO_SPECIES[inst.species].stages[inst.stage].name;
      const here = out.has(inst.uid);
      const cur = inst.order ?? 'free';
      const seg = h('div', { class: 'seg' });
      for (const o of orders) {
        const live = o === 'hold' || o === 'focus';
        const b = btn(o === 'free' ? 'Free' : ORDER_INFO[o].name, () => {
          if (live && !here) { hooks.toast(`${name} must be summoned to ${o === 'hold' ? 'hold a spot' : 'focus a foe'}.`, 'warn'); return; }
          W.orderEchoes(o === 'free' ? undefined : o, inst.uid);
          render();
        }, 'btn small' + (cur === o ? ' on' : ''), { 'data-nav': '' });
        if (o !== 'free') b.style.borderColor = cur === o ? ORDER_MARK[o] : '';
        seg.appendChild(b);
      }
      const inSquad = (s.squadPick ?? []).includes(inst.uid);
      const sq = btn(inSquad ? '✓ In squad' : 'In squad', () => {
        const pick = new Set(s.squadPick ?? []);
        if (pick.has(inst.uid)) pick.delete(inst.uid);
        else if (pick.size >= G.d.echoSlots) { hooks.toast(`Your squad holds ${G.d.echoSlots}.`, 'warn'); return; }
        else pick.add(inst.uid);
        s.squadPick = [...pick];
        if (s.summonPreset === 'squad') W.summonEchoes(true);
        render();
      }, 'btn small' + (inSquad ? ' on' : ''), { 'data-nav': '' });
      list.appendChild(h('div', { class: 'orders-row' + (here ? '' : ' away') },
        h('div', { class: 'orders-name' }, name, h('small', null, here ? `Lv ${inst.level} · on the field` : `Lv ${inst.level} · not summoned`)), seg, sq));
    }
  };
  render();
  const card = h('div', { class: 'panel orders' },
    h('div', { class: 'eyebrow' }, 'Orders'),
    h('p', { class: 'muted', style: 'margin:0 0 6px;font-size:0.85em' }, 'Guard shields you · Hunt chases · Flank strikes from behind · Hold keeps a spot you can swap back to · Focus stays on one foe. Mark up to ' + G.d.echoSlots + ' Echoes "In squad" for the Squad summon.'),
    list,
    h('div', { class: 'row' }, btn('Done', () => close(), 'btn primary', { 'data-autofocus': '' })));
  const layer = h('div', { class: 'layer dim' }, card);
  uiRoot.appendChild(layer);
  wheelEl = layer;
  const close = () => closeWheel();
  pushLayer({ el: layer, onBack: close });
}
