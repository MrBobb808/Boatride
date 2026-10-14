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
import { LORE, ITEMS, RARITY_COLORS, RARITY_NAMES, type ItemInst } from '../game/data';
import { setBoss } from './hud';
import { haptic } from './touch';
import { formatTime } from '../core/math';
import { openMenu, openShop, openAltar, isMenuOpen } from './menus';
import { SECRET_IDS } from '../game/story';

let uiRoot: HTMLElement;
let toastBox: HTMLElement;
let promptEl: HTMLElement | null = null;
let hintEl: HTMLElement | null = null;
let captionEl: HTMLElement | null = null;
let fadeEl: HTMLElement;
let blocking = 0;
let wheelEl: HTMLElement | null = null;

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

function waitAdvance(el: HTMLElement, onAdvance: () => void) {
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
  return off;
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
      const box = h('div', { class: 'dialogue panel' }, canvas, h('div', null, who, textEl, choices), next);
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
      const off = waitAdvance(box, () => {
        if (lines[i]?.choices && !typing) return;
        advance();
      });
      pushLayer({ el: layer, onAction: (a) => {
        if (lines[i]?.choices && !typing) return false;
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
      const card = h('div', { class: 'lore-card panel' },
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
    const W = G.world;
    const s = G.save;
    const items: { id: Parameters<typeof W.echoCommand>[0]; label: string; icon: string; on?: boolean }[] = [
      { id: 'toggle', label: W.echoes.length ? 'Dismiss' : 'Summon', icon: 'toggle' },
      { id: 'aggressive', label: 'Aggressive', icon: 'aggressive', on: s.echoMode === 'aggressive' },
      { id: 'defensive', label: 'Defensive', icon: 'defensive', on: s.echoMode === 'defensive' },
      { id: 'follow', label: 'Follow', icon: 'follow', on: s.echoMode === 'follow' },
      { id: 'target', label: 'Mark target', icon: 'target' },
      { id: 'recall', label: 'Recall', icon: 'recall' },
      { id: 'sync', label: W.syncCd > 0 ? `Sync ${Math.ceil(W.syncCd)}s` : 'Sync strike', icon: 'sync' },
    ];
    const ring = h('div', { class: 'wheel-ring' });
    const n = items.length;
    items.forEach((it, i) => {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
      const b = btn([img(it.icon, '#f6dea0'), it.label], () => {
        close();
        W.echoCommand(it.id);
      }, 'wheel-btn' + (it.on ? ' on' : ''), i === 0 ? { 'data-autofocus': '' } : {});
      b.style.left = 50 + Math.cos(a) * 42 + '%';
      b.style.top = 50 + Math.sin(a) * 42 + '%';
      ring.appendChild(b);
    });
    ring.appendChild(h('div', { class: 'wheel-center' }, 'Command the Remnant', h('div', { class: 'muted', style: 'font-family:var(--font-body);letter-spacing:0;font-size:1.2em;margin-top:4px;text-transform:none' }, `${W.echoes.length} of ${s.echoes.length} present`)));
    const layer = h('div', { class: 'wheel' }, ring);
    layer.addEventListener('pointerup', (e) => {
      if (e.target === layer) close();
    });
    uiRoot.appendChild(layer);
    wheelEl = layer;
    const close = () => {
      if (!wheelEl) return;
      popLayer(layer);
      wheelEl = null;
      audio.setMuffled(false);
      input.flush();
    };
    pushLayer({ el: layer, onBack: close, onAction: (a) => {
      if (a === 'echo' || a === 'menu') { close(); return true; }
      return false;
    } });
  },

  showCredits(after) {
    const card = h('div', { class: 'chapter panel' },
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

  chapterEnd() {
    return new Promise<void>((resolve) => {
      const s = G.save;
      blocking++;
      music.play('victory');
      const stat = (v: string | number, l: string) => h('div', { class: 'stat' }, h('b', null, String(v)), h('span', null, l));
      const card = h('div', { class: 'chapter panel' },
        h('div', { class: 'eyebrow' }, 'Chapter I'),
        h('h2', null, 'THE ASHEN VILLAGE'),
        h('div', { class: 'muted' }, 'Complete'),
        h('div', { class: 'stats' },
          stat(formatTime(s.playtime), 'Time'), stat(s.level, 'Level'), stat(s.echoes.length, 'Echoes purified'),
          stat(`${s.secrets.length}/${SECRET_IDS.length}`, 'Hidden chambers'), stat(s.kills, 'Foes overcome'), stat(s.deaths, 'Times fallen'),
        ),
        h('p', { class: 'theme' }, 'True greatness is not found in the power to rule, but in the strength to remain faithful.'),
        h('p', { class: 'next' }, 'Chapter II — The Valley of Bones — is in development. Your journey continues: explore the temple, grow your army, or begin New Game+ at any altar.'),
        h('div', { class: 'row' },
          btn('Continue exploring', () => close(), 'btn primary', { 'data-autofocus': '' }),
          btn('Credits', () => hooks.showCredits()),
        ),
      );
      const layer = h('div', { class: 'layer dim' }, card);
      uiRoot.appendChild(layer);
      const close = () => {
        popLayer(layer);
        blocking--;
        music.play('sanctuary');
        input.flush();
        resolve();
      };
      pushLayer({ el: layer, onBack: close });
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
      const card = h('div', { class: 'choice-card panel' },
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
