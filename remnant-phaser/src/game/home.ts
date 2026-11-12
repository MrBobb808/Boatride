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
.hm{position:fixed;inset:0;bottom:auto;height:var(--app-h,100%);z-index:12;overflow-y:auto;-webkit-overflow-scrolling:touch;font-family:Georgia,serif;color:#ddd4c6;
  padding:calc(env(safe-area-inset-top) + 14px) calc(env(safe-area-inset-right) + 16px) calc(env(safe-area-inset-bottom) + 14px) calc(env(safe-area-inset-left) + 16px)}
.hm-wrap{max-width:980px;margin:0 auto;display:flex;flex-direction:column;gap:14px;min-height:100%}
.hm-head{text-align:center;padding-top:4px}
.hm-word{font-family:Cinzel,Georgia,serif;font-weight:bold;color:#f6dea0;font-size:clamp(30px,10vw,56px);letter-spacing:.3em;margin-right:-.3em;line-height:1;text-shadow:0 2px 12px rgba(226,184,90,.35)}
.hm-asc{font-family:Cinzel,Georgia,serif;color:#e2b85a;font-size:clamp(12px,4vw,22px);letter-spacing:.3em;margin:6px -.3em 0 0}
.hm-sub{font-style:italic;color:#9b92a6;font-size:calc(13px*var(--fs-k,1));margin-top:6px}
.hm-stage{height:clamp(84px,17vh,150px)}
.hm-side{display:flex;flex-direction:column;gap:14px}
.hm-modes{display:flex;flex-direction:column;gap:12px}
.hm-journey{border:1px solid rgba(226,184,90,.55);border-radius:12px;padding:14px;background:linear-gradient(160deg,rgba(43,30,18,.92),rgba(18,13,22,.92));box-shadow:0 6px 24px rgba(0,0,0,.45)}
.hm-kicker{font-family:Cinzel,Georgia,serif;font-size:calc(11px*var(--fs-k,1));letter-spacing:.18em;color:#e2b85a;text-transform:uppercase}
.hm-where{font-family:Cinzel,Georgia,serif;font-size:calc(19px*var(--fs-k,1));color:#f6dea0;margin:4px 0 2px}
.hm-meta{font-size:calc(13px*var(--fs-k,1));color:#b9afc4}
.hm-prog{height:4px;border-radius:2px;background:rgba(0,0,0,.5);margin:10px 0 12px;overflow:hidden}
.hm-prog b{display:block;height:100%;background:linear-gradient(90deg,#e2b85a,#fff1c4)}
.hm-btns{display:flex;gap:8px;flex-wrap:wrap}
.hm-btn{flex:1;min-width:120px;min-height:46px;font-family:Cinzel,Georgia,serif;font-size:calc(15px*var(--fs-k,1));letter-spacing:.06em;border-radius:8px;border:1px solid rgba(226,184,90,.55);background:rgba(20,14,24,.9);color:#ddd4c6;cursor:pointer;padding:8px 12px;touch-action:manipulation}
.hm-btn.primary{flex:2;background:linear-gradient(#8a6424,#4e3511);color:#fff6dc;border-color:#f6dea0;font-size:calc(17px*var(--fs-k,1));box-shadow:0 0 18px rgba(226,184,90,.25)}
.hm-btn.warn{color:#ffb08a;border-color:#ff8a5a}
.hm-btn:active{transform:translateY(1px)}
.hm-btn:focus-visible,.hm-card:focus-visible{outline:2px solid #fff1c4;outline-offset:2px}
.hm-h{font-family:Cinzel,Georgia,serif;font-size:calc(13px*var(--fs-k,1));letter-spacing:.18em;color:#e2b85a;text-transform:uppercase;display:flex;align-items:center;gap:10px;margin:2px 0 -4px}
.hm-h::after{content:'';flex:1;height:1px;background:linear-gradient(90deg,rgba(226,184,90,.45),transparent)}
.hm-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.hm-card{position:relative;text-align:left;display:flex;flex-direction:column;gap:3px;min-height:112px;padding:12px;border-radius:10px;border:1px solid rgba(255,255,255,.08);border-left:3px solid var(--a);
  background:linear-gradient(150deg,color-mix(in srgb,var(--a) 16%,#130f19),#100c15 70%);color:#ddd4c6;font-family:Georgia,serif;cursor:pointer;touch-action:manipulation;overflow:hidden}
.hm-card svg{width:26px;height:26px;stroke:var(--a);fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;margin-bottom:2px}
.hm-card b{font-family:Cinzel,Georgia,serif;font-weight:normal;font-size:calc(15px*var(--fs-k,1));color:#f6dea0;letter-spacing:.03em}
.hm-card span{font-size:calc(12px*var(--fs-k,1));color:#a79db2;line-height:1.3}
.hm-card em{font-style:normal;font-size:calc(12px*var(--fs-k,1));color:var(--a);margin-top:auto;padding-top:4px}
.hm-card.new::before{content:'NEW';position:absolute;top:9px;right:9px;font-family:Cinzel,Georgia,serif;font-size:calc(9px*var(--fs-k,1));letter-spacing:.12em;color:#140e04;background:#f6dea0;border-radius:3px;padding:2px 5px}
.hm-card.locked{cursor:default;filter:saturate(.25);opacity:.62}
.hm-card.locked em{color:#9b92a6}
.hm-card:not(.locked):active{transform:scale(.98)}
.hm-today{border:1px solid rgba(154,200,255,.4);border-radius:12px;padding:12px 14px;background:linear-gradient(160deg,rgba(18,28,44,.92),rgba(14,12,22,.92))}
.hm-today .hm-kicker{color:#9ac8ff;display:flex;justify-content:space-between;gap:8px}
.hm-calls{list-style:none;margin:8px 0;padding:0;display:flex;flex-direction:column;gap:5px}
.hm-calls li{display:flex;gap:8px;align-items:baseline;font-size:calc(13px*var(--fs-k,1));color:#cfd6e4;line-height:1.3}
.hm-calls li i{font-style:normal;width:1.1em;color:#6f7a8c;flex:none}
.hm-calls li.done{color:#8f9bb0}.hm-calls li.done i{color:#9be07a}
.hm-calls li u{text-decoration:none;margin-left:auto;color:#8f9bb0;white-space:nowrap;font-size:calc(12px*var(--fs-k,1))}
.hm-chron{font-size:calc(12px*var(--fs-k,1));color:#b9afc4;margin:6px 0 2px}
.hm-today .hm-prog{margin:4px 0 10px}.hm-today .hm-prog b{background:linear-gradient(90deg,#6fa8e8,#d8ecff)}
.hm-today .hm-btn.primary{background:linear-gradient(#2c5a8a,#16304e);border-color:#9ac8ff;box-shadow:0 0 18px rgba(120,170,255,.2)}
.hm-chr{position:fixed;inset:0;z-index:14;background:rgba(6,5,10,.94);overflow-y:auto;font-family:Georgia,serif;color:#ddd4c6;padding:calc(env(safe-area-inset-top) + 16px) 16px calc(env(safe-area-inset-bottom) + 16px)}
.hm-chr>div{max-width:560px;margin:0 auto;display:flex;flex-direction:column;gap:10px}
.hm-chr ol{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}
.hm-chr li{display:flex;gap:10px;font-size:calc(13px*var(--fs-k,1));padding:6px 8px;border-radius:6px;background:rgba(255,255,255,.03)}
.hm-chr li b{width:2em;color:#9ac8ff;font-weight:normal;flex:none}
.hm-chr li.got{color:#8f9bb0}.hm-chr li.got b{color:#9be07a}
.hm-chr li.next{outline:1px solid rgba(154,200,255,.6)}
.hm-more{display:flex;flex-direction:column;gap:8px}
.hm-keep{margin-top:8px;display:flex;flex-direction:column;align-items:flex-start;gap:2px}
.hm-link{background:none;border:0;padding:6px 2px;font:inherit;font-size:calc(12px*var(--fs-k,1));color:#b9a98a;text-decoration:underline;cursor:pointer;text-align:left}
.hm-link.warn{color:#ffb08a}
.hm-link:focus-visible{outline:2px solid #f6dea0;outline-offset:2px}
.hm-note{font-size:calc(11.5px*var(--fs-k,1));color:#9b92a6;line-height:1.4}
.hm-note:empty{display:none}
.hm-more .hm-btn{font-size:calc(13px*var(--fs-k,1));min-height:40px;text-align:left}
.hm-foot{margin-top:auto;text-align:center;font-size:calc(11px*var(--fs-k,1));color:#9b92a6;padding-top:6px}
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
  .hm-side{gap:8px}.hm-stage{height:clamp(48px,14vh,80px)}.hm-sub{display:none}.hm-word{font-size:calc(30px*var(--fs-k,1))}.hm-asc{font-size:calc(13px*var(--fs-k,1))}
  .hm-card{min-height:0;padding:9px 10px}.hm-card span{display:none}.hm-card svg{width:22px;height:22px}
  .hm-journey{padding:11px}.hm-where{font-size:calc(16px*var(--fs-k,1))}.hm-prog{margin:7px 0 9px}.hm-btn{min-height:40px}
  /* Today folds to one line: the streak, and the button for the next call. */
  .hm-modes{min-width:0}.hm-today{padding:6px 10px;display:flex;align-items:center;gap:10px;min-width:0}.hm-today .hm-btns,.hm-today .hm-btn{min-width:0}.hm-today .hm-calls,.hm-today .hm-chron,.hm-today .hm-prog{display:none}
  .hm-today .hm-kicker{flex:none;flex-direction:column;gap:0}.hm-today .hm-btns{flex:1;flex-wrap:nowrap}.hm-today .hm-btn{min-height:32px;padding:4px 10px;font-size:calc(12px*var(--fs-k,1));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
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
    head.append(el('div', 'hm-word', 'REMNANT'), el('div', 'hm-asc', 'ASCENSION'), Object.assign(el('div', 'hm-sub', 'Thirteen chapters · One covenant'), { id: 'title_subtitle' }));
    this.stage = el('div', 'hm-stage');
    const side = el('div', 'hm-side');
    side.append(head, this.stage, this.journey());
    this.foot = el('div', 'hm-foot');
    const right = this.modes(), today = this.today();
    if (today) right.prepend(today);
    wrap.append(side, right, this.foot);
    this.root.appendChild(wrap);
    document.body.appendChild(this.root);
    // A controller moves between every button here (✕ presses; the first is focused: Continue or Begin).
    pushLayer({ el: this.root, nav: 'button' });
  }

  /** The version line under everything. */
  version(text: string, fresh: boolean) { this.foot.textContent = text; this.foot.classList.toggle('fresh', !fresh); this.foot.dataset.k = 'title_version'; }

  destroy() { popLayer(this.root); this.style.remove(); }

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
        el('div', 'hm-meta', 'Elior wakes in the ruins. Thirteen chapters lie ahead.'));
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
    const d = s.day!, box = el('section', 'hm-today');
    box.dataset.k = 'title_today';
    const kick = el('div', 'hm-kicker'), streak = el('span', '', `${d.streak} ${d.streak === 1 ? 'day' : 'days'} in a row`);
    streak.dataset.k = 'title_streak';
    kick.append(el('span', '', 'Today'), streak);
    const list = el('ul', 'hm-calls');
    const boss = dayBoss(s);
    const row = (c: (typeof d.calls)[number], weekly: boolean) => {
      const li = el('li', c.paid ? 'done' : ''), have = c.paid ? c.goal : progress(s, c, weekly);
      li.append(el('i', '', c.paid ? '✓' : weekly ? '◆' : '○'), el('span', '', c.mode === 'dayboss' && boss ? `${c.text}: ${boss.name}, under ${boss.condName}` : c.text), el('u', '', c.paid ? 'done' : c.goal > 1 ? `${have}/${c.goal}` : weekly ? 'this week' : `about ${c.mins} min`));
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
      b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[c.id] ?? ''}"/></svg>`;
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
