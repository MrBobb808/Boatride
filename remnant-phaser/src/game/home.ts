// The home screen (the title scene's DOM): the journey card (Continue, or Begin) and, under it, every game mode as a
// card that starts it straight away: the chapters, the Watch, the Horde, the Trial's endless waves, Extreme Survival,
// the Boss Gauntlet, the Boss Rush and the day's challenge. A locked mode says what opens it. Plain DOM over the
// title's canvas (the glow, the embers and Elior standing behind the wordmark), built once per visit.
import { CHAPTERS, RUSH_MIN, type ChapterDef } from '../../../remnant/src/game/chapters';
import { rushRoster } from '../../../remnant/src/game/gauntlet';
import { dailyFor, rankedUsed } from '../../../remnant/src/game/daily';
import { chapterOf } from '../../../remnant/src/game/rooms';
import { G } from '../classic/shim/ctx';
import { ROOMS } from '../shared';
import type { PhaserSave } from './save';

/** What the world does on arrival when the journey is entered from a mode card (World.init's `mode`). */
export type HomeMode = 'chapters' | 'trial' | 'extreme' | 'gauntlet' | 'rush' | 'daily';

const CSS = `
.hm{position:fixed;inset:0;z-index:12;overflow-y:auto;-webkit-overflow-scrolling:touch;font-family:Georgia,serif;color:#ddd4c6;
  padding:calc(env(safe-area-inset-top) + 14px) calc(env(safe-area-inset-right) + 16px) calc(env(safe-area-inset-bottom) + 14px) calc(env(safe-area-inset-left) + 16px)}
.hm-wrap{max-width:980px;margin:0 auto;display:flex;flex-direction:column;gap:14px;min-height:100%}
.hm-head{text-align:center;padding-top:4px}
.hm-word{font-family:Cinzel,Georgia,serif;font-weight:bold;color:#f6dea0;font-size:clamp(30px,10vw,56px);letter-spacing:.3em;margin-right:-.3em;line-height:1;text-shadow:0 2px 12px rgba(226,184,90,.35)}
.hm-asc{font-family:Cinzel,Georgia,serif;color:#e2b85a;font-size:clamp(12px,4vw,22px);letter-spacing:.3em;margin:6px -.3em 0 0}
.hm-sub{font-style:italic;color:#9b92a6;font-size:13px;margin-top:6px}
.hm-stage{height:clamp(84px,17vh,150px)}
.hm-side{display:flex;flex-direction:column;gap:14px}
.hm-modes{display:flex;flex-direction:column;gap:12px}
.hm-journey{border:1px solid rgba(226,184,90,.55);border-radius:12px;padding:14px;background:linear-gradient(160deg,rgba(43,30,18,.92),rgba(18,13,22,.92));box-shadow:0 6px 24px rgba(0,0,0,.45)}
.hm-kicker{font-family:Cinzel,Georgia,serif;font-size:11px;letter-spacing:.18em;color:#e2b85a;text-transform:uppercase}
.hm-where{font-family:Cinzel,Georgia,serif;font-size:19px;color:#f6dea0;margin:4px 0 2px}
.hm-meta{font-size:13px;color:#b9afc4}
.hm-prog{height:4px;border-radius:2px;background:rgba(0,0,0,.5);margin:10px 0 12px;overflow:hidden}
.hm-prog b{display:block;height:100%;background:linear-gradient(90deg,#e2b85a,#fff1c4)}
.hm-btns{display:flex;gap:8px;flex-wrap:wrap}
.hm-btn{flex:1;min-width:120px;min-height:46px;font-family:Cinzel,Georgia,serif;font-size:15px;letter-spacing:.06em;border-radius:8px;border:1px solid rgba(226,184,90,.55);background:rgba(20,14,24,.9);color:#ddd4c6;cursor:pointer;padding:8px 12px;touch-action:manipulation}
.hm-btn.primary{flex:2;background:linear-gradient(#8a6424,#4e3511);color:#fff6dc;border-color:#f6dea0;font-size:17px;box-shadow:0 0 18px rgba(226,184,90,.25)}
.hm-btn.warn{color:#ffb08a;border-color:#ff8a5a}
.hm-btn:active{transform:translateY(1px)}
.hm-btn:focus-visible,.hm-card:focus-visible{outline:2px solid #fff1c4;outline-offset:2px}
.hm-h{font-family:Cinzel,Georgia,serif;font-size:13px;letter-spacing:.18em;color:#e2b85a;text-transform:uppercase;display:flex;align-items:center;gap:10px;margin:2px 0 -4px}
.hm-h::after{content:'';flex:1;height:1px;background:linear-gradient(90deg,rgba(226,184,90,.45),transparent)}
.hm-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.hm-card{position:relative;text-align:left;display:flex;flex-direction:column;gap:3px;min-height:112px;padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,.08);border-left:3px solid var(--a);
  background:linear-gradient(150deg,color-mix(in srgb,var(--a) 16%,#130f19),#100c15 70%);color:#ddd4c6;font-family:Georgia,serif;cursor:pointer;touch-action:manipulation;overflow:hidden}
.hm-card svg{width:26px;height:26px;stroke:var(--a);fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;margin-bottom:2px}
.hm-card b{font-family:Cinzel,Georgia,serif;font-weight:normal;font-size:15px;color:#f6dea0;letter-spacing:.03em}
.hm-card span{font-size:12px;color:#a79db2;line-height:1.3}
.hm-card em{font-style:normal;font-size:12px;color:var(--a);margin-top:auto;padding-top:4px}
.hm-card.new::before{content:'NEW';position:absolute;top:9px;right:9px;font-family:Cinzel,Georgia,serif;font-size:9px;letter-spacing:.12em;color:#140e04;background:#f6dea0;border-radius:3px;padding:2px 5px}
.hm-card.locked{cursor:default;filter:saturate(.25);opacity:.62}
.hm-card.locked em{color:#9b92a6}
.hm-card:not(.locked):active{transform:scale(.98)}
.hm-more{display:flex;flex-direction:column;gap:8px}
.hm-more .hm-btn{font-size:13px;min-height:40px;text-align:left}
.hm-foot{margin-top:auto;text-align:center;font-size:11px;color:#9b92a6;padding-top:6px}
.hm-foot.fresh{color:#f6dea0}
@media (min-width:720px){
  .hm-wrap{display:grid;grid-template-columns:minmax(270px,340px) 1fr;grid-template-rows:auto 1fr auto;align-items:start;column-gap:18px}
  .hm-side{grid-row:1/3}
  .hm-modes{padding-top:6px}
  .hm-grid{grid-template-columns:repeat(4,minmax(0,1fr))}
  .hm-stage{height:clamp(70px,18vh,150px)}
  .hm-foot{grid-column:1/3}
}
/* A phone held sideways: the cards drop their sentence so all eight sit on screen at once. */
@media (min-width:720px) and (max-height:520px){
  .hm-side{gap:8px}.hm-stage{height:clamp(48px,14vh,80px)}.hm-sub{display:none}.hm-word{font-size:30px}.hm-asc{font-size:13px}
  .hm-card{min-height:0;padding:9px 10px}.hm-card span{display:none}.hm-card svg{width:22px;height:22px}
  .hm-journey{padding:11px}.hm-where{font-size:16px}.hm-prog{margin:7px 0 9px}.hm-btn{min-height:40px}
}
`;

const ICON: Record<string, string> = {
  chapters: 'M4 5c3-1 5-1 8 1 3-2 5-2 8-1v13c-3-1-5-1-8 1-3-2-5-2-8-1zM12 6v14',
  watch: 'M6 21V10h12v11M5 10V5h2v2h2V5h2v2h2V5h2v2h2V5h2v5M10 21v-5h4v5',
  horde: 'M5 4l10 10M19 4L9 14M15 14l2.5 2.5M9 14l-2.5 2.5M14 19l5-5M10 19l-5-5',
  trial: 'M3 8c3-3 6 3 9 0s6 3 9 0M3 13c3-3 6 3 9 0s6 3 9 0M3 18c3-3 6 3 9 0s6 3 9 0',
  extreme: 'M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-3-1-5 1-8z',
  gauntlet: 'M3 19h18M4 16L3 7l5 4 4-7 4 7 5-4-1 9z',
  rush: 'M6 3h12M6 21h12M7 3c0 6 10 6 10 9s-10 3-10 9M17 3c0 6-10 6-10 9s10 3 10 9',
  daily: 'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2',
};

interface Card { id: string; name: string; line: string; status: string; accent: string; locked?: string; isNew?: boolean; go: () => void }

export interface HomeHooks {
  save: PhaserSave | null;
  live: { slot: number; save: { level: number; room: string } }[];
  /** Continue the journey, optionally straight into a mode. */
  play: (mode?: HomeMode) => void;
  /** A new journey (the caller picks the slot). Returns false when a second tap is wanted first. */
  begin: () => boolean;
  /** Copy a live-game slot in. Returns false when a second tap is wanted first. */
  bringLive: (slot: number) => boolean;
  watch: () => void;
  horde: () => void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
  const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e;
};

/** The shared chapter and Trial checks read `G.save`; on the home screen the world has not set it yet. */
function withSave<T>(save: PhaserSave, fn: () => T): T {
  const was = G.save; G.save = save;
  try { return fn(); } finally { G.save = was; }
}

export class Home {
  readonly root: HTMLElement;
  /** Where Elior stands behind the wordmark (CSS px), for the canvas to place him. */
  readonly stage: HTMLElement;
  private foot: HTMLElement;
  private style: HTMLStyleElement;

  constructor(private h: HomeHooks) {
    this.style = document.createElement('style'); this.style.textContent = CSS; document.head.appendChild(this.style);
    this.root = el('div', 'hm');
    const wrap = el('div', 'hm-wrap');
    const head = el('div', 'hm-head');
    head.append(el('div', 'hm-word', 'REMNANT'), el('div', 'hm-asc', 'ASCENSION'), Object.assign(el('div', 'hm-sub', 'Twelve chapters · One covenant'), { id: 'title_subtitle' }));
    this.stage = el('div', 'hm-stage');
    const side = el('div', 'hm-side');
    side.append(head, this.stage, this.journey());
    this.foot = el('div', 'hm-foot');
    wrap.append(side, this.modes(), this.foot);
    this.root.appendChild(wrap);
    document.body.appendChild(this.root);
  }

  /** The version line under everything. */
  version(text: string, fresh: boolean) { this.foot.textContent = text; this.foot.classList.toggle('fresh', !fresh); this.foot.dataset.k = 'title_version'; }

  destroy() { this.root.remove(); this.style.remove(); }

  // ---------------------------------------------------------------- the journey

  private journey() {
    const { save } = this.h, box = el('section', 'hm-journey');
    const btns = el('div', 'hm-btns');
    const button = (label: string, k: string, cls: string, go: (b: HTMLButtonElement) => void) => {
      const b = el('button', 'hm-btn ' + cls, label) as HTMLButtonElement; b.dataset.k = k;
      b.addEventListener('click', () => go(b)); btns.appendChild(b); return b;
    };
    if (save) {
      const ch = this.chapterHere(save), done = withSave(save, () => CHAPTERS.filter((c) => c.done()).length);
      box.append(el('div', 'hm-kicker', save.room === 'trial_arena' ? 'In the Trial of the Remnant' : ch ? `Chapter ${ch.roman} · ${ch.title}` : 'Your journey'),
        el('div', 'hm-where', ROOMS[save.room]?.name ?? 'The Sanctuary'),
        el('div', 'hm-meta', `Level ${save.level} · ${save.silver ?? 0} silver · ${done} of ${CHAPTERS.length} chapters complete`));
      const prog = el('div', 'hm-prog'), bar = el('b'); bar.style.width = `${Math.round((done / CHAPTERS.length) * 100)}%`; prog.appendChild(bar);
      box.appendChild(prog);
      button('Continue', 'title_first', 'primary', () => this.h.play());
      button('New journey', 'title_second', '', (b) => { if (!this.h.begin()) { b.textContent = 'Tap again: a new journey'; b.classList.add('warn'); } });
    } else {
      box.append(el('div', 'hm-kicker', 'A new journey'), el('div', 'hm-where', 'The Ashen Village'),
        el('div', 'hm-meta', 'Elior wakes in the ruins. Twelve chapters lie ahead.'));
      box.appendChild(el('div', 'hm-prog'));
      button('Begin', 'title_first', 'primary', () => this.h.begin());
    }
    box.appendChild(btns);
    // The live game's slots share this origin's storage: one can be copied in (the live slot is untouched).
    if (this.h.live.length) {
      const more = el('div', 'hm-more'); more.style.marginTop = '10px';
      this.h.live.forEach(({ slot, save: live }, i) => {
        const b = el('button', 'hm-btn', `Bring live slot ${slot + 1} · level ${live.level} · ${ROOMS[live.room]?.name ?? live.room}`) as HTMLButtonElement;
        b.dataset.k = `title_live_${i}`;
        b.addEventListener('click', () => { if (!this.h.bringLive(slot)) { b.textContent = 'Tap again: replaces this build\'s journey'; b.classList.add('warn'); } });
        more.appendChild(b);
      });
      box.appendChild(more);
    }
    return box;
  }

  private chapterHere(save: PhaserSave): ChapterDef | undefined {
    const n = chapterOf(save.room);
    return CHAPTERS.find((c) => c.n === n);
  }

  // ---------------------------------------------------------------- the modes

  private modes() {
    const box = el('section', 'hm-modes');
    box.appendChild(el('div', 'hm-h', 'Game modes'));
    const grid = el('div', 'hm-grid');
    for (const c of this.cards()) {
      const b = el('button', 'hm-card' + (c.locked ? ' locked' : '') + (c.isNew ? ' new' : '')) as HTMLButtonElement;
      b.dataset.k = `title_${c.id}`;
      b.style.setProperty('--a', c.accent);
      b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[c.id] ?? ''}"/></svg>`;
      b.append(el('b', '', c.name), el('span', '', c.line), el('em', '', c.locked ?? c.status));
      if (c.locked) b.setAttribute('aria-disabled', 'true');
      b.addEventListener('click', () => { if (!c.locked) c.go(); });
      grid.appendChild(b);
    }
    box.appendChild(grid);
    return box;
  }

  private cards(): Card[] {
    const { save } = this.h, s = save as PhaserSave | null;
    const noJourney = 'Begin the journey first';
    // The Trial opens with the covenant relic (or any round already won); the shared check reads the board too.
    const flags = (s?.flags ?? {}) as Record<string, unknown>;
    const trialBest = Math.max(Number(flags.trial_best ?? 0), ...(s?.trialMilestones ?? []));
    const bossBest = Number(flags.boss_trial_best ?? 0);
    const trialOpen = !!s && (!!flags.relic_taken || trialBest > 0 || bossBest > 0);
    const relic = 'Recover the covenant relic (Chapter I) to open it';
    const rush = s ? rushRoster(s.defeated ?? []).length : 0;
    const chaptersDone = s ? withSave(s, () => CHAPTERS.filter((c) => c.done()).length) : 0;
    const daily = dailyFor(), used = rankedUsed(daily.key);
    const w = s?.watch, horde = s?.horde?.best;
    return [
      { id: 'chapters', name: 'Chapters', line: 'Travel to any chapter you have reached, or replay one you finished.', accent: '#e2b85a',
        status: `${chaptersDone} of ${CHAPTERS.length} complete`, locked: s ? undefined : noJourney, go: () => this.h.play('chapters') },
      { id: 'watch', name: 'The Watch', line: 'An idle game: Elior keeps the wall while you are away.', accent: '#c59bff', isNew: !w,
        status: w ? `Stage ${w.stage} · level ${w.level}` : 'A fresh Elior · level 1', go: () => this.h.watch() },
      { id: 'horde', name: 'The Horde', line: 'Top-down endless stages with Elior, Tirzah and Uri.', accent: '#ff7a4a',
        status: horde ? `Best stage ${horde}` : 'Endless stages', go: () => this.h.horde() },
      { id: 'trial', name: 'Trial of the Remnant', line: 'Endless rounds of foes; the way past level 100.', accent: '#7ac8ff',
        status: trialBest > 0 ? `Best round ${trialBest}` : 'Start at round 1', locked: !s ? noJourney : trialOpen ? undefined : relic, go: () => this.h.play('trial') },
      { id: 'extreme', name: 'Extreme Survival', line: 'The Trial made brutal: deeper, tougher, no blessings.', accent: '#ff4a5a',
        status: 'Its own board', locked: !s ? noJourney : trialOpen ? undefined : relic, go: () => this.h.play('extreme') },
      { id: 'gauntlet', name: 'Boss Gauntlet', line: 'A boss every round, each stronger than the last.', accent: '#f6dea0',
        status: bossBest > 0 ? `Best round ${bossBest}` : 'Start at boss round 1', locked: !s ? noJourney : trialOpen ? undefined : relic, go: () => this.h.play('gauntlet') },
      { id: 'rush', name: 'Boss Rush', line: 'Every boss you have beaten, back to back, against the clock.', accent: '#9be07a',
        status: `${rush} bosses ready`, locked: !s ? noJourney : rush >= RUSH_MIN ? undefined : `Beat ${RUSH_MIN} bosses to open it`, go: () => this.h.play('rush') },
      { id: 'daily', name: 'Daily Challenge', line: 'One seeded ten-wave run a day, with its own board.', accent: '#ffd36a',
        status: used ? 'Ranked run used · practice open' : 'Today\'s ranked run is ready', locked: !s ? noJourney : trialOpen ? undefined : relic, go: () => this.h.play('daily') },
    ];
  }
}
