// The home screen (the title scene's DOM): the journey card (Continue, or Begin) and, under it, every game mode as a
// card that starts it straight away: the chapters, the Watch, the Horde, the Trial's endless waves, Extreme Survival,
// the Boss Gauntlet, the Boss Rush and the day's challenge. A locked mode says what opens it. Plain DOM over the
// title's canvas (the glow, the embers and Elior standing behind the wordmark), built once per visit.
import { CHAPTERS, RUSH_MIN, type ChapterDef } from '../../../remnant/src/game/chapters';
import { rushRoster } from '../../../remnant/src/game/rushKeys';
import { dailyFor, rankedUsed } from '../../../remnant/src/game/daily';
import { chapterOf } from '../../../remnant/src/game/rooms';
import { G } from '../classic/shim/ctx';
import { pushLayer, popLayer } from '../../../remnant/src/ui/dom';
import { ROOMS } from '../shared';
import type { PhaserSave } from './save';
import { shouldRemind, noteReminded } from './backup';
import { restoreButton } from './backupUi';
import { dayBoss, settleDay, progress, nextCall, stepProgress, stepOf, monthName, buyOwed, STEPS, OWED_COST, type DayMode } from './day';
import { CAPES } from '../../../remnant/src/game/valor';
import { writeSave } from './save';

/** What the world does on arrival when the journey is entered from a mode card (World.init's `mode`). */
export type HomeMode = 'chapters' | 'trial' | 'extreme' | 'gauntlet' | 'rush' | 'daily' | 'dayboss';

const CSS = `
.hm{--gold:#e2b85a;--gold-hi:#f6dea0;--ink:#ddd4c6;--muted:#9b92a6;--panel:rgba(15,11,21,.80);--line:rgba(226,184,90,.26);
  position:fixed;inset:0;bottom:auto;height:var(--app-h,100%);z-index:12;overflow-y:auto;-webkit-overflow-scrolling:touch;font-family:Georgia,serif;color:var(--ink);
  padding:calc(env(safe-area-inset-top) + 14px) calc(env(safe-area-inset-right) + 16px) calc(env(safe-area-inset-bottom) + 14px) calc(env(safe-area-inset-left) + 16px);
  transition:opacity .28s ease}
.hm.hm-leave{opacity:0;pointer-events:none}
.hm-wrap{max-width:1040px;margin:0 auto;display:flex;flex-direction:column;gap:14px;min-height:100%}
/* Everything rises into place, one after another (none of it with Reduce motion). */
@keyframes hmRise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes hmShine{0%,62%{background-position:-160% 0}100%{background-position:260% 0}}
.hm-rise{animation:hmRise .55s cubic-bezier(.2,.75,.25,1) both;animation-delay:calc(var(--i,0)*45ms)}
@media (prefers-reduced-motion:reduce){.hm-rise,.hm-word{animation:none!important}.hm{transition:none}}
.hm-head{text-align:center;padding-top:4px}
.hm-word{font-family:Cinzel,Georgia,serif;font-weight:bold;font-size:clamp(30px,10vw,54px);letter-spacing:.3em;margin-right:-.3em;line-height:1;
  color:var(--gold-hi);background:linear-gradient(100deg,#f6dea0 40%,#fffaf0 50%,#f6dea0 60%) 0 0/300% 100%;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;
  filter:drop-shadow(0 2px 10px rgba(226,184,90,.35));animation:hmShine 7s ease-in-out 1.2s infinite}
.hm-asc{font-family:Cinzel,Georgia,serif;color:var(--gold);font-size:clamp(12px,3.6vw,19px);letter-spacing:.42em;margin:8px -.42em 0 0}
.hm-orn{display:flex;align-items:center;justify-content:center;gap:10px;margin:8px auto 0;max-width:260px;color:var(--gold)}
.hm-orn::before,.hm-orn::after{content:'';flex:1;height:1px;background:linear-gradient(90deg,transparent,rgba(226,184,90,.6))}
.hm-orn::after{transform:scaleX(-1)}
.hm-orn i{width:6px;height:6px;transform:rotate(45deg);border:1px solid var(--gold);flex:none}
.hm-sub{font-style:italic;color:var(--muted);font-size:calc(13px*var(--fs-k,1));margin-top:6px}
.hm-stage{height:clamp(84px,15vh,140px)}
.hm-side{display:flex;flex-direction:column;gap:14px}
.hm-modes{display:flex;flex-direction:column;gap:12px}
.hm-panel{border:1px solid var(--line);border-radius:14px;background:linear-gradient(160deg,rgba(30,22,16,.86),var(--panel) 60%);box-shadow:0 10px 30px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,241,196,.06)}
.hm-journey{padding:16px;border-color:rgba(226,184,90,.5)}
.hm-top{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
.hm-pct{font-family:Cinzel,Georgia,serif;font-size:calc(11px*var(--fs-k,1));color:var(--gold);letter-spacing:.1em;white-space:nowrap}
.hm-kicker{font-family:Cinzel,Georgia,serif;font-size:calc(11px*var(--fs-k,1));letter-spacing:.18em;color:var(--gold);text-transform:uppercase}
.hm-where{font-family:Cinzel,Georgia,serif;font-size:calc(20px*var(--fs-k,1));color:var(--gold-hi);margin:5px 0 8px;line-height:1.2}
.hm-meta{display:flex;flex-wrap:wrap;gap:6px;font-size:calc(12.5px*var(--fs-k,1));color:#c8bfd2}
.hm-meta>span{padding:3px 9px;border-radius:999px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);white-space:nowrap}
.hm-meta>span:only-child{white-space:normal;border-radius:8px}
.hm-prog{height:4px;border-radius:2px;background:rgba(0,0,0,.5);margin:12px 0 14px;overflow:hidden}
.hm-prog b{display:block;height:100%;background:linear-gradient(90deg,#b88a34,#fff1c4);box-shadow:0 0 8px rgba(255,220,150,.6)}
.hm-btns{display:flex;gap:8px;flex-wrap:wrap}
.hm-btn{flex:1;min-width:120px;min-height:46px;font-family:Cinzel,Georgia,serif;font-size:calc(15px*var(--fs-k,1));letter-spacing:.06em;border-radius:10px;border:1px solid rgba(226,184,90,.45);
  background:rgba(20,14,24,.85);color:var(--ink);cursor:pointer;padding:8px 12px;touch-action:manipulation;transition:transform .12s ease,box-shadow .2s ease,border-color .2s ease,background .2s ease}
.hm-btn.primary{flex:2;background:linear-gradient(#9a7029,#5a3d13);color:#fff6dc;border-color:#f6dea0;font-size:calc(17px*var(--fs-k,1));box-shadow:0 0 22px rgba(226,184,90,.28),inset 0 1px 0 rgba(255,241,196,.35)}
.hm-btn.warn{color:#ffb08a;border-color:#ff8a5a}
.hm-btn:active{transform:translateY(1px) scale(.99)}
.hm-btn:disabled{opacity:.55;cursor:default}
.hm-btn:focus-visible,.hm-card:focus-visible{outline:2px solid #fff1c4;outline-offset:2px}
@media (hover:hover){.hm-btn:not(:disabled):hover{border-color:#f6dea0;box-shadow:0 0 18px rgba(226,184,90,.22)}.hm-btn.primary:hover{box-shadow:0 0 30px rgba(226,184,90,.45),inset 0 1px 0 rgba(255,241,196,.35)}}
.hm-h{font-family:Cinzel,Georgia,serif;font-size:calc(12px*var(--fs-k,1));letter-spacing:.22em;color:var(--gold);text-transform:uppercase;display:flex;align-items:center;gap:10px;margin:2px 0 -4px}
.hm-h::after{content:'';flex:1;height:1px;background:linear-gradient(90deg,rgba(226,184,90,.45),transparent)}
.hm-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.hm-card{--a:#e2b85a;position:relative;text-align:left;display:flex;flex-direction:column;gap:4px;min-height:118px;padding:12px 12px 11px;border-radius:12px;border:1px solid rgba(255,255,255,.08);
  background:radial-gradient(120% 90% at 0% 0%,color-mix(in srgb,var(--a) 20%,transparent),transparent 60%),linear-gradient(160deg,rgba(24,18,32,.88),rgba(12,9,17,.9));
  box-shadow:0 6px 18px rgba(0,0,0,.35),inset 0 1px 0 color-mix(in srgb,var(--a) 30%,transparent);color:var(--ink);font-family:Georgia,serif;cursor:pointer;touch-action:manipulation;overflow:hidden;
  transition:transform .16s ease,box-shadow .2s ease,border-color .2s ease}
.hm-card::after{content:'';position:absolute;left:12px;right:12px;top:0;height:2px;border-radius:0 0 2px 2px;background:linear-gradient(90deg,var(--a),transparent)}
.hm-ico{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:color-mix(in srgb,var(--a) 16%,rgba(0,0,0,.4));border:1px solid color-mix(in srgb,var(--a) 45%,transparent);margin-bottom:4px;flex:none}
.hm-card svg{width:20px;height:20px;stroke:var(--a);fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.hm-card b{font-family:Cinzel,Georgia,serif;font-weight:normal;font-size:calc(14.5px*var(--fs-k,1));color:var(--gold-hi);letter-spacing:.03em;line-height:1.2}
.hm-card span{font-size:calc(12px*var(--fs-k,1));color:#a79db2;line-height:1.3}
.hm-card em{font-style:normal;font-size:calc(11.5px*var(--fs-k,1));color:var(--a);margin-top:auto;padding-top:5px;letter-spacing:.02em}
.hm-card.new::before{content:'NEW';position:absolute;top:12px;right:11px;font-family:Cinzel,Georgia,serif;font-size:calc(9px*var(--fs-k,1));letter-spacing:.14em;color:var(--a);
  border:1px solid color-mix(in srgb,var(--a) 60%,transparent);background:color-mix(in srgb,var(--a) 12%,transparent);border-radius:999px;padding:2px 7px}
.hm-card.locked{cursor:default;filter:saturate(.2);opacity:.6}
.hm-card.locked::before{content:'';position:absolute;top:12px;right:12px;width:12px;height:12px;border-radius:2px;border:1.5px solid #9b92a6;border-top-width:5px;opacity:.8}
.hm-card.locked em{color:var(--muted)}
.hm-card:not(.locked):active{transform:scale(.98)}
@media (hover:hover){.hm-card:not(.locked):hover{transform:translateY(-2px);border-color:color-mix(in srgb,var(--a) 50%,transparent);box-shadow:0 10px 26px rgba(0,0,0,.45),0 0 22px color-mix(in srgb,var(--a) 22%,transparent)}}
.hm-today{padding:13px 15px;border-color:rgba(154,200,255,.38);background:linear-gradient(160deg,rgba(18,28,46,.88),rgba(13,11,22,.86) 70%)}
.hm-today .hm-kicker{color:#9ac8ff;display:flex;justify-content:space-between;align-items:center;gap:8px}
.hm-streak{display:inline-flex;align-items:center;gap:5px;padding:2px 9px;border-radius:999px;background:rgba(154,200,255,.1);border:1px solid rgba(154,200,255,.3);letter-spacing:.1em}
.hm-streak::before{content:'';width:7px;height:7px;border-radius:50%;background:#ffb070;box-shadow:0 0 8px #ff9a40}
.hm-calls{list-style:none;margin:10px 0 8px;padding:0;display:flex;flex-direction:column;gap:2px}
.hm-calls li{display:flex;gap:10px;align-items:baseline;font-size:calc(13px*var(--fs-k,1));color:#cfd6e4;line-height:1.3;padding:5px 6px;border-radius:7px}
.hm-calls li:nth-child(odd){background:rgba(255,255,255,.025)}
.hm-calls li i{font-style:normal;width:1.1em;color:#6f7a8c;flex:none;text-align:center}
.hm-calls li.done{color:#8f9bb0}.hm-calls li.done i{color:#9be07a}.hm-calls li.done span{text-decoration:line-through;text-decoration-color:rgba(155,224,122,.45)}
.hm-calls li u{text-decoration:none;margin-left:auto;color:#8f9bb0;white-space:nowrap;font-size:calc(12px*var(--fs-k,1));font-variant-numeric:tabular-nums}
.hm-chron{font-size:calc(12px*var(--fs-k,1));color:#b9afc4;margin:6px 0 2px}
.hm-today .hm-prog{margin:6px 0 12px}.hm-today .hm-prog b{background:linear-gradient(90deg,#4f88c8,#d8ecff);box-shadow:0 0 8px rgba(150,200,255,.5)}
.hm-today .hm-btn.primary{background:linear-gradient(#2f5f92,#16304e);border-color:#9ac8ff;box-shadow:0 0 18px rgba(120,170,255,.22),inset 0 1px 0 rgba(216,236,255,.25)}
.hm-chr{position:fixed;inset:0;z-index:14;background:rgba(6,5,10,.94);overflow-y:auto;font-family:Georgia,serif;color:#ddd4c6;padding:calc(env(safe-area-inset-top) + 16px) 16px calc(env(safe-area-inset-bottom) + 16px);animation:hmRise .3s ease both}
.hm-chr>div{max-width:560px;margin:0 auto;display:flex;flex-direction:column;gap:10px}
.hm-chr ol{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}
.hm-chr li{display:flex;gap:10px;font-size:calc(13px*var(--fs-k,1));padding:6px 8px;border-radius:6px;background:rgba(255,255,255,.03)}
.hm-chr li b{width:2em;color:#9ac8ff;font-weight:normal;flex:none}
.hm-chr li.got{color:#8f9bb0}.hm-chr li.got b{color:#9be07a}
.hm-chr li.next{outline:1px solid rgba(154,200,255,.6)}
.hm-more{display:flex;flex-direction:column;gap:8px}
.hm-keep{margin-top:10px;display:flex;flex-direction:column;align-items:flex-start;gap:2px}
.hm-link{background:none;border:0;padding:6px 2px;font:inherit;font-size:calc(12px*var(--fs-k,1));color:#b9a98a;text-decoration:underline;text-decoration-color:rgba(185,169,138,.4);text-underline-offset:3px;cursor:pointer;text-align:left}
.hm-link.warn{color:#ffb08a}
.hm-link:focus-visible{outline:2px solid #f6dea0;outline-offset:2px}
.hm-note{font-size:calc(11.5px*var(--fs-k,1));color:var(--muted);line-height:1.45}
.hm-note:empty{display:none}
.hm-more .hm-btn{font-size:calc(13px*var(--fs-k,1));min-height:40px;text-align:left}
.hm-foot{margin-top:auto;text-align:center;font-size:calc(11px*var(--fs-k,1));color:#7f7789;padding-top:6px;letter-spacing:.04em}
.hm-foot.fresh{color:#f6dea0}
@media (min-width:720px){
  .hm-wrap{display:grid;grid-template-columns:minmax(280px,350px) 1fr;grid-template-rows:auto 1fr auto;align-items:start;column-gap:22px}
  .hm-side{grid-row:1/3}
  .hm-modes{padding-top:6px}
  .hm-grid{grid-template-columns:repeat(4,minmax(0,1fr))}
  .hm-stage{height:clamp(70px,16vh,140px)}
  .hm-foot{grid-column:1/3}
}
/* A phone held sideways: the cards drop their sentence so all eight sit on screen at once. */
@media (min-width:720px) and (max-height:520px){
  .hm-side{gap:8px}.hm-stage{height:clamp(44px,13vh,76px)}.hm-sub,.hm-orn{display:none}.hm-word{font-size:calc(28px*var(--fs-k,1))}.hm-asc{font-size:calc(12px*var(--fs-k,1));margin-top:5px}
  .hm-card{min-height:0;padding:9px 10px;gap:2px}.hm-card span{display:none}.hm-ico{width:26px;height:26px;border-radius:8px;margin-bottom:2px}.hm-card svg{width:16px;height:16px}.hm-card em{padding-top:2px}
  .hm-card.new::before{top:9px;right:8px;padding:1px 5px}
  .hm-journey{padding:11px 12px}.hm-where{font-size:calc(16px*var(--fs-k,1));margin:3px 0 6px}.hm-prog{margin:8px 0 9px}.hm-btn{min-height:40px}.hm-keep{margin-top:4px}
  /* Today folds to one line: the streak, and the button for the next call. */
  .hm-modes{min-width:0;gap:9px}.hm-today{padding:6px 10px;display:flex;align-items:center;gap:10px;min-width:0}.hm-today .hm-btns,.hm-today .hm-btn{min-width:0}.hm-today .hm-calls,.hm-today .hm-chron,.hm-today .hm-prog{display:none}
  .hm-today .hm-kicker{flex:none;flex-direction:column;gap:2px;align-items:flex-start}.hm-today .hm-streak{padding:0;border:0;background:none;letter-spacing:.08em}.hm-today .hm-streak::before{width:5px;height:5px}.hm-today .hm-btns{flex:1;flex-wrap:nowrap}.hm-today .hm-btn{min-height:32px;padding:4px 10px;font-size:calc(12px*var(--fs-k,1));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
}
`;

/** The chapters counted in words, as the wordmark's line reads. */
const COUNT: Record<number, string> = { 13: 'Thirteen', 14: 'Fourteen', 15: 'Fifteen', 16: 'Sixteen', 17: 'Seventeen', 18: 'Eighteen' };

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
    const orn = el('div', 'hm-orn'); orn.appendChild(el('i'));
    head.append(el('div', 'hm-word', 'REMNANT'), el('div', 'hm-asc', 'ASCENSION'), orn, Object.assign(el('div', 'hm-sub', `${COUNT[CHAPTERS.length] ?? CHAPTERS.length} chapters · One covenant`), { id: 'title_subtitle' }));
    this.stage = el('div', 'hm-stage');
    const side = el('div', 'hm-side');
    const journey = this.journey();
    side.append(head, this.stage, journey);
    this.foot = el('div', 'hm-foot');
    const right = this.modes(), today = this.today();
    if (today) right.prepend(today);
    wrap.append(side, right, this.foot);
    // The parts rise in reading order: the wordmark, the journey, today, then each mode's card.
    [head, journey, today, ...right.querySelectorAll('.hm-h,.hm-card,.hm-note'), this.foot].forEach((e, i) => { if (!e) return; e.classList.add('hm-rise'); (e as HTMLElement).style.setProperty('--i', String(i)); });
    this.root.appendChild(wrap);
    document.body.appendChild(this.root);
    // A controller moves between every button here (✕ presses; the first is focused: Continue or Begin).
    pushLayer({ el: this.root, nav: 'button' });
  }

  /** The version line under everything. */
  version(text: string, fresh: boolean) { this.foot.textContent = text; this.foot.classList.toggle('fresh', !fresh); this.foot.dataset.k = 'title_version'; }

  destroy() { popLayer(this.root); this.style.remove(); }

  /** Fade the page out as a mode starts (the scene change follows). */
  leave() { this.root.classList.add('hm-leave'); }

  // ---------------------------------------------------------------- the journey

  private journey() {
    const { save } = this.h, box = el('section', 'hm-journey hm-panel');
    const btns = el('div', 'hm-btns');
    const button = (label: string, k: string, cls: string, go: (b: HTMLButtonElement) => void) => {
      const b = el('button', 'hm-btn ' + cls, label) as HTMLButtonElement; b.dataset.k = k;
      b.addEventListener('click', () => go(b)); btns.appendChild(b); return b;
    };
    if (save) {
      const ch = this.chapterHere(save), done = withSave(save, () => CHAPTERS.filter((c) => c.done()).length);
      const pct = Math.round((done / CHAPTERS.length) * 100), top = el('div', 'hm-top');
      top.append(el('div', 'hm-kicker', save.room === 'trial_arena' ? 'In the Trial of the Remnant' : ch ? `Chapter ${ch.roman} · ${ch.title}` : 'Your journey'), el('div', 'hm-pct', `${pct}%`));
      const meta = el('div', 'hm-meta');
      meta.append(el('span', '', `Level ${save.level}`), el('span', '', `${save.silver ?? 0} silver`), el('span', '', `${done} of ${CHAPTERS.length} chapters complete`));
      box.append(top, el('div', 'hm-where', ROOMS[save.room]?.name ?? 'The Sanctuary'), meta);
      const prog = el('div', 'hm-prog'), bar = el('b'); bar.style.width = `${pct}%`; prog.appendChild(bar);
      box.appendChild(prog);
      button('Continue', 'title_first', 'primary', () => this.h.play());
      button('New journey', 'title_second', '', (b) => { if (!this.h.begin()) { b.textContent = 'Tap again: a new journey'; b.classList.add('warn'); } });
    } else {
      const meta = el('div', 'hm-meta');
      meta.appendChild(el('span', '', `Elior wakes in the ruins. ${COUNT[CHAPTERS.length] ?? CHAPTERS.length} chapters lie ahead.`));
      box.append(el('div', 'hm-kicker', 'A new journey'), el('div', 'hm-where', 'The Ashen Village'), meta);
      box.appendChild(el('div', 'hm-prog'));
      button('Begin', 'title_first', 'primary', () => this.h.begin());
    }
    box.appendChild(btns);
    box.appendChild(this.keeping());
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

  /** Under the journey: restoring a backup (a new phone starts here), and a quiet word when one is overdue. */
  private keeping() {
    const row = el('div', 'hm-keep'), note = el('div', 'hm-note');
    const say = (msg: string) => { note.textContent = msg; };
    note.dataset.k = 'title_backup_note';
    if (this.h.save && shouldRemind(this.h.save.playtime ?? 0)) {
      say('It has been a while since this journey was backed up. Menu → System → Save & system → Back up my journey.');
      noteReminded();
    }
    row.append(restoreButton('hm-link', say), note);
    return row;
  }

  // ---------------------------------------------------------------- today

  /** Today's calls with a tick each, the streak, the Chronicle's next step, and one button for the first call not yet
   * answered. Only with a journey: the Day lives in its save. */
  private today() {
    const s = this.h.save as PhaserSave | null;
    if (!s) return null;
    if (settleDay(s).length) writeSave(s);
    const d = s.day!, box = el('section', 'hm-today hm-panel');
    box.dataset.k = 'title_today';
    const kick = el('div', 'hm-kicker'), streak = el('span', 'hm-streak', `${d.streak} ${d.streak === 1 ? 'day' : 'days'} in a row`);
    streak.dataset.k = 'title_streak';
    kick.append(el('span', '', 'Today'), streak);
    const list = el('ul', 'hm-calls');
    const boss = dayBoss(s);
    const row = (c: (typeof d.calls)[number], weekly: boolean) => {
      const li = el('li', c.paid ? 'done' : ''), have = c.paid ? c.goal : progress(s, c, weekly);
      li.append(el('i', '', c.paid ? '✓' : weekly ? '◆' : '○'), el('span', '', c.mode === 'dayboss' && boss ? `${c.text}: ${boss.name}, under ${boss.condName}${s.flags.day_boss_medal === s.flags.day_boss_done && c.paid ? ' · ✦ untouched' : ' (untouched wins a medal)'}` : c.text), el('u', '', c.paid ? 'done' : c.goal > 1 ? `${have}/${c.goal}` : weekly ? 'this week' : `about ${c.mins} min`));
      li.dataset.k = weekly ? 'title_weekly' : 'title_call';
      return li;
    };
    for (const c of d.calls) list.appendChild(row(c, false));
    for (const c of d.weekly) list.appendChild(row(c, true));
    const sp = stepProgress(d), chron = el('div', 'hm-chron', sp.done ? `The Chronicle of ${monthName(d.chron.month)} is finished.` : `Chronicle of ${monthName(d.chron.month)} · step ${d.chron.step + 1} of ${STEPS}: ${stepOf(d.chron.step + 1, d.chron.month).text} · ${sp.have}/${sp.need} marks`);
    chron.dataset.k = 'title_chronicle';
    const prog = el('div', 'hm-prog'), bar = el('b'); bar.style.width = `${sp.done ? 100 : Math.round((sp.have / sp.need) * 100)}%`; prog.appendChild(bar);
    const btns = el('div', 'hm-btns'), next = nextCall(s);
    const go = el('button', 'hm-btn primary', next ? `Answer: ${next.text}` : 'Every call answered today') as HTMLButtonElement;
    go.dataset.k = 'title_answer';
    if (next) go.addEventListener('click', () => this.start(next.mode)); else go.disabled = true;
    const open = el('button', 'hm-btn', 'The Chronicle') as HTMLButtonElement;
    open.dataset.k = 'title_chron_open';
    open.addEventListener('click', () => this.chronicle(s));
    btns.append(go, open);
    box.append(kick, list, chron, prog, btns);
    return box;
  }

  private start(mode: DayMode) {
    if (mode === 'watch') this.h.watch();
    else if (mode === 'horde') this.h.horde();
    else this.h.play(mode === 'journey' ? undefined : mode);
  }

  /** The month's thirty steps, and what an earlier month still owes. */
  private chronicle(s: PhaserSave) {
    const d = s.day!, root = el('div', 'hm-chr'), inner = el('div');
    root.dataset.k = 'chronicle';
    const close = () => { popLayer(root); root.remove(); };
    inner.append(el('div', 'hm-where', `The Chronicle of ${monthName(d.chron.month)}`),
      el('div', 'hm-meta', `Marks come from the day's calls (10 each, 20 more for all of them) and the week's (40 each). ${d.chron.marks} earned this month. Nothing here is bought, and nothing earned is taken back.`));
    const ol = el('ol');
    for (let n = 1; n <= STEPS; n++) {
      const li = el('li', n <= d.chron.step ? 'got' : n === d.chron.step + 1 ? 'next' : '');
      li.append(el('b', '', n <= d.chron.step ? '✓' : String(n)), el('span', '', stepOf(n, d.chron.month).text));
      ol.appendChild(li);
    }
    inner.appendChild(ol);
    if (d.owed?.length) {
      inner.appendChild(el('div', 'hm-meta', `From earlier months (spare marks: ${d.spare ?? 0}; they come from marks earned after a Chronicle is finished, and from what a closed month left over):`));
      for (const id of d.owed) {
        const b = el('button', 'hm-btn', `${CAPES[id]?.name ?? id} · ${OWED_COST} spare marks`) as HTMLButtonElement;
        b.dataset.k = 'chron_owed';
        b.disabled = (d.spare ?? 0) < OWED_COST;
        b.addEventListener('click', () => { if (buyOwed(s, id)) { writeSave(s); close(); this.chronicle(s); } });
        inner.appendChild(b);
      }
    }
    const back = el('button', 'hm-btn primary', 'Back') as HTMLButtonElement;
    back.dataset.k = 'chron_back';
    back.addEventListener('click', close);
    inner.appendChild(back);
    root.appendChild(inner);
    document.body.appendChild(root);
    pushLayer({ el: root, nav: 'button', onBack: close });
    back.focus();
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
    // A first visit is not greeted by eight cards (NEXT_PLAN E2): until the covenant relic is recovered only the modes
    // already open are shown, and each one that opens later carries a "new" mark until it is first tried.
    const s = this.h.save as PhaserSave | null, flags = (s?.flags ?? {}) as Record<string, unknown>;
    const young = !s || !flags.relic_taken;
    const all = this.cards(), shown = young ? all.filter((c) => !c.locked) : all;
    for (const c of all) if (s && !c.locked && c.id !== 'chapters' && !flags[`seen_${c.id}`] && !young) c.isNew = true;
    for (const c of shown) {
      const b = el('button', 'hm-card' + (c.locked ? ' locked' : '') + (c.isNew ? ' new' : '')) as HTMLButtonElement;
      b.dataset.k = `title_${c.id}`;
      b.style.setProperty('--a', c.accent);
      b.innerHTML = `<i class="hm-ico"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[c.id] ?? ''}"/></svg></i>`;
      b.append(el('b', '', c.name), el('span', '', c.line), el('em', '', c.locked ?? c.status));
      if (c.locked) b.setAttribute('aria-disabled', 'true');
      b.addEventListener('click', () => {
        if (c.locked) return;
        if (s && !flags[`seen_${c.id}`]) { s.flags[`seen_${c.id}`] = true; writeSave(s); }
        c.go();
      });
      grid.appendChild(b);
    }
    box.appendChild(grid);
    if (shown.length < all.length) {
      const more = el('p', 'hm-note', `${all.length - shown.length} more modes open as the journey goes on: the Trial and its kin with the covenant relic in Chapter I.`);
      more.dataset.k = 'title_more_modes';
      box.appendChild(more);
    }
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
      { id: 'horde', name: 'The Horde', line: 'Top-down endless stages with Elior, Tirzah, Uri and Barak.', accent: '#ff7a4a',
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
