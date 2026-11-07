// The Watch's readouts and controls (POLISH_PLAN §18b): a bar over the wall (coins, the stage, the boss's timer) and,
// below it, the tabs: Upgrades, Skills, Hero, Ascend; the speed (×1, ×2, ×3) by Leave; and the skill bar along the foot of
// the wall, a button for each ability he takes in, with its wait running round it. Plain DOM, styled like the game's menus; built once and then only
// updated (text and classes) a few times a second, never rebuilt per frame.
import { sfx } from '../../../../remnant/src/audio/audio';
import * as D from './defs';
import bladesUrl from '../../assets/cc0/blades.png';
import vanguardUrl from '../../../../remnant/src/assets/echo-vanguard.png';
import sovereignUrl from '../../../../remnant/src/assets/echo-sovereign.png';
import veilUrl from '../../../../remnant/src/assets/foes-veil.png';
import { ECHO_SPECIES, ECHO_ROLES } from '../../../../remnant/src/game/data';
import { SHADOW_ORDER, SHADOW_ART, ROLE_ORDER, UNLOCK_COST, SHADOW_MAX, levelCost, tierOf, shadowName, shadowRole, owned, type ShadowId } from './shadows';
import type { Watch } from '../../scenes/Watch';
import { awayCap, type AwayReport } from './offline';

const CSS = `
.wt-hud{position:fixed;left:0;right:0;z-index:15;pointer-events:none;font-family:Georgia,serif;color:#ddd4c6;padding:0 10px}
.wt-row{display:flex;align-items:center;gap:8px;justify-content:space-between}
.wt-row.mid{min-height:28px}
.wt-coins{font-family:Cinzel,Georgia,serif;color:#f6dea0;font-size:18px;text-shadow:0 1px 2px #000;white-space:nowrap}
.wt-coins i{display:inline-block;width:14px;height:14px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#fff1c4,#e2b85a 55%,#8a6a34);margin-right:6px;vertical-align:-1px}
.wt-stage{font-family:Cinzel,Georgia,serif;font-size:13px;letter-spacing:.06em;text-align:center;text-shadow:0 1px 2px #000}
.wt-statline{display:flex;justify-content:space-between;gap:4px;margin-top:5px;text-shadow:0 1px 2px #000;white-space:nowrap}
.wt-statline span{display:flex;flex-direction:column;align-items:center;min-width:0;font-size:9px;letter-spacing:.08em;color:#9b92a6;line-height:1.15}
.wt-statline b{color:#f6dea0;font-weight:normal;font-size:min(12px,3.3vw);letter-spacing:0}
.wt-statline b.low{color:#ff8a7a}
.wt-bar{height:5px;background:rgba(0,0,0,.55);border-radius:3px;overflow:hidden;margin-top:3px}
.wt-bar b{display:block;height:100%;background:linear-gradient(90deg,#e2b85a,#fff1c4);width:0}
.wt-bar.boss b{background:linear-gradient(90deg,#ff5a3a,#ffb08a)}
.wt-btn{pointer-events:auto;font-family:Cinzel,Georgia,serif;font-size:12px;padding:6px 10px;border-radius:6px;border:1px solid rgba(226,184,90,.6);background:rgba(20,14,24,.85);color:#f6dea0;cursor:pointer}
.wt-btn.hot{background:linear-gradient(#6b4a1c,#3e2a10);color:#fff1c4;border-color:#f6dea0}
.wt-btn.violet{border-color:#c59bff;color:#e6d4ff;background:rgba(40,20,60,.9)}
.wt-btn[hidden]{display:none}
.wt-toast{position:fixed;left:50%;transform:translateX(-50%);z-index:16;pointer-events:none;background:rgba(20,14,24,.92);border:1px solid rgba(226,184,90,.55);border-radius:6px;padding:7px 12px;font-family:Georgia,serif;color:#f6dea0;font-size:13px;max-width:88vw;text-align:center;opacity:0;transition:opacity .25s}
.wt-toast.on{opacity:1}
.wt-call{position:fixed;left:50%;z-index:16;pointer-events:none;font-family:Cinzel,Georgia,serif;font-size:min(24px,6.4vw);letter-spacing:.14em;color:#fff6dc;white-space:nowrap;opacity:0;transform:translateX(-50%);--g:#e2b85a;padding:6px 28px;border-radius:40px;background:radial-gradient(closest-side,rgba(5,4,10,.7),rgba(5,4,10,.4) 60%,transparent);text-shadow:0 0 2px #000,0 0 6px var(--g),0 0 14px var(--g),0 2px 2px #000}
.wt-call.on{animation:wtCall 1.15s ease-out forwards}
@keyframes wtCall{0%{opacity:0;transform:translateX(-50%) scale(1.9);letter-spacing:.5em}14%{opacity:1;transform:translateX(-50%) scale(1);letter-spacing:.14em}72%{opacity:1}100%{opacity:0;transform:translateX(-50%) translateY(-8px) scale(1.04)}}
.wt-panel{position:fixed;left:0;right:0;bottom:0;z-index:14;display:flex;flex-direction:column;background:#0d0a12;border-top:1px solid rgba(226,184,90,.35);font-family:Georgia,serif;color:#ddd4c6;padding-bottom:env(safe-area-inset-bottom)}
.wt-body{flex:1;overflow:auto;padding:8px 10px;-webkit-overflow-scrolling:touch}
.wt-tabs{display:flex;border-top:1px solid rgba(226,184,90,.25)}
.wt-tab{flex:1;padding:10px 2px;font-family:Cinzel,Georgia,serif;font-size:12px;letter-spacing:.06em;background:#120e18;color:#9b92a6;border:0;border-right:1px solid rgba(226,184,90,.15);cursor:pointer}
.wt-tab.on{color:#f6dea0;background:#1d1424}
.wt-amt{display:flex;gap:6px;justify-content:flex-end;margin-bottom:6px}
.wt-amt button{font-family:Cinzel,Georgia,serif;font-size:11px;padding:4px 8px;border-radius:5px;border:1px solid rgba(226,184,90,.35);background:#120e18;color:#9b92a6;cursor:pointer}
.wt-amt button.on{color:#f6dea0;border-color:#f6dea0}
.wt-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.wt-card{display:flex;flex-direction:column;align-items:stretch;gap:4px;background:#1a1220;border:1px solid rgba(226,184,90,.3);border-radius:7px;padding:7px;cursor:pointer;color:#ddd4c6;font:inherit;text-align:left;min-width:0;touch-action:manipulation;-webkit-user-select:none;user-select:none}
.wt-card .n{flex:1;display:flex;flex-direction:column;min-width:0}
.wt-card .hd{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:0 6px}
.wt-card .n b{font-family:Cinzel,Georgia,serif;font-size:12px;color:#f6dea0;font-weight:normal}
.wt-card .n small{font-size:10.5px;color:#9b92a6}
.wt-card .n span{font-size:min(14px,3.7vw);color:#f6dea0;font-family:Cinzel,Georgia,serif;margin-top:3px;white-space:nowrap}
.wt-card .n span i{font-style:normal;color:#9be07a}
.wt-card .n em{font-style:normal;font-size:10.5px;color:#9b92a6;line-height:1.25}
.wt-card.bought{box-shadow:0 0 0 2px #9be07a inset}
.wt-card .c{display:flex;align-items:center;justify-content:center;gap:6px;border-radius:5px;background:#2c5a2a;color:#eaffd8;font-family:Cinzel,Georgia,serif;font-size:12px;padding:5px 6px;white-space:nowrap}
.wt-card .c small{font-family:Georgia,serif;font-size:12px;color:#fff1c4}
.wt-card.poor .c{background:#3a2c2c;color:#c9a9a0}
.wt-card.locked{opacity:.5;cursor:default}
.wt-card.locked .c{background:#241c28;color:#9b92a6}
.wt-card.maxed .c{background:#3a3020;color:#f6dea0}
.wt-h{font-family:Cinzel,Georgia,serif;color:#f6dea0;font-size:15px;margin:2px 0 6px;letter-spacing:.06em}
.wt-p{font-size:13px;color:#cfc6b6;margin:0 0 8px;line-height:1.35}
.wt-stats{display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;font-size:13px;margin-bottom:10px}
.wt-stats b{color:#f6dea0;font-weight:normal}
.wt-list{font-size:12.5px;margin:0;padding:0;list-style:none}
.wt-list li{display:grid;grid-template-columns:54px 1fr;padding:4px 0;border-bottom:1px solid rgba(226,184,90,.1);color:#9b92a6}
.wt-list li.got{color:#ddd4c6}
.wt-arm{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-bottom:10px}
.wt-blade{display:flex;gap:8px;align-items:center;padding:6px 8px;border:1px solid rgba(226,184,90,.22);border-radius:8px;background:#120e18;color:#ddd4c6;font-family:Georgia,serif;font-size:12px;text-align:left;cursor:pointer;line-height:1.25}
.wt-blade i{flex:none;width:24px;height:48px;background-size:192px 48px;background-repeat:no-repeat;image-rendering:pixelated}
.wt-blade b{display:block;font-family:Cinzel,Georgia,serif;font-weight:normal;color:#f6dea0;font-size:12.5px}
.wt-blade.on{border-color:#f6dea0;background:#1f1726}
.wt-blade:disabled{opacity:.45;cursor:default}
.wt-list li b{color:#f6dea0;font-weight:normal}
.wt-big{width:100%;margin-top:6px;font-size:14px;padding:10px}
.wt-skillbar{display:flex;gap:7px;align-items:center;padding:6px 10px;border-bottom:1px solid rgba(226,184,90,.18);background:#110c16}
.wt-skillbar .sp{flex:1}
.wt-sk{pointer-events:auto;position:relative;width:40px;height:40px;border-radius:50%;border:1px solid rgba(226,184,90,.7);background:rgba(16,11,22,.88);display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;overflow:hidden;touch-action:manipulation}
.wt-sk svg{width:22px;height:22px;stroke:#f6dea0;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;position:relative;z-index:1}
.wt-sk::before{content:'';position:absolute;inset:0;background:conic-gradient(rgba(0,0,0,.72) calc(var(--p,0)*1turn),transparent 0);z-index:0}
.wt-sk.ready{box-shadow:0 0 10px rgba(246,222,160,.45)}
.wt-sk.flash{border-color:#fff;box-shadow:0 0 16px #fff1c4}
.wt-sk.empty{opacity:.35;cursor:default;border-style:dashed}
.wt-chip{pointer-events:auto;font-family:Cinzel,Georgia,serif;font-size:10px;letter-spacing:.06em;padding:5px 7px;border-radius:12px;border:1px solid rgba(226,184,90,.5);background:rgba(16,11,22,.85);color:#9b92a6;cursor:pointer}
.wt-chip.on{color:#f6dea0;border-color:#f6dea0}
.wt-ab{display:grid;grid-template-columns:34px 1fr auto;gap:8px;align-items:center;padding:8px;border:1px solid rgba(226,184,90,.22);border-radius:8px;background:#140f1a;margin-bottom:6px}
.wt-ab.locked{opacity:.5}
.wt-ab.on{border-color:#f6dea0;background:#1d1526}
.wt-ab svg{width:28px;height:28px;stroke:#f6dea0;fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.wt-ab b{font-family:Cinzel,Georgia,serif;font-weight:normal;color:#f6dea0;font-size:13px}
.wt-ab small{display:block;color:#9b92a6;font-size:11px;margin-top:1px}
.wt-ab p{margin:2px 0 0;font-size:12px;color:#cfc6b6;line-height:1.3}
.wt-ab .act{display:flex;flex-direction:column;gap:4px;min-width:84px}
.wt-ab .act button{font-family:Cinzel,Georgia,serif;font-size:11px;padding:6px 6px;border-radius:6px;border:1px solid rgba(226,184,90,.5);background:#2c5a2a;color:#eaffd8;cursor:pointer}
.wt-ab .act button.eq{background:#1a1424;color:#f6dea0}
.wt-ab .act button.eq.on{background:#3a2c14}
.wt-ab .act button:disabled{background:#2a2230;color:#8a8094;cursor:default}
.wt-sh{display:grid;grid-template-columns:64px 1fr auto;gap:8px;align-items:center;padding:8px;border:1px solid rgba(226,184,90,.22);border-radius:8px;background:#140f1a;margin-bottom:6px}
.wt-sh.on{border-color:#f6dea0;background:#1d1526}
.wt-sh.locked .pic{filter:brightness(.25) grayscale(1)}
.wt-sh .pic{width:64px;height:64px;background-repeat:no-repeat;background-size:384px 384px;image-rendering:pixelated;border-radius:6px;background-color:#0c0910}
.wt-sh b{font-family:Cinzel,Georgia,serif;font-weight:normal;color:#f6dea0;font-size:13px}
.wt-sh small{display:block;color:#9b92a6;font-size:11px;margin-top:1px}
.wt-sh p{margin:3px 0 0;font-size:12px;color:#cfc6b6;line-height:1.3}
.wt-sh .ess{height:4px;border-radius:2px;background:#0a070d;margin-top:4px;overflow:hidden}
.wt-sh .ess i{display:block;height:100%;background:linear-gradient(90deg,#7a5aa8,#c9a8ff)}
.wt-sh .act{display:flex;flex-direction:column;gap:4px;min-width:92px}
.wt-sh .act button,.wt-sh select{font-family:Cinzel,Georgia,serif;font-size:11px;padding:6px 4px;border-radius:6px;border:1px solid rgba(226,184,90,.5);background:#3d2a5a;color:#f0e6ff;cursor:pointer}
.wt-sh .act button.tm{background:#1a1424;color:#f6dea0}
.wt-sh .act button.tm.on{background:#3a2c14}
.wt-sh select{background:#120e18;color:#ddd4c6}
.wt-sh .act button:disabled{background:#2a2230;color:#8a8094;cursor:default}
.wt-role{display:inline-block;font-size:10px;letter-spacing:.06em;padding:1px 6px;border-radius:8px;border:1px solid currentColor;margin-left:4px}
.wt-card-layer{position:fixed;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;background:rgba(7,6,11,.78);padding:16px}
.wt-welcome{width:min(380px,100%);background:#150f1b;border:1px solid rgba(226,184,90,.55);border-radius:8px;padding:16px;text-align:center;font-family:Georgia,serif;color:#ddd4c6}
.wt-welcome b{display:block;font-family:Cinzel,Georgia,serif;color:#f6dea0;font-size:22px;margin:6px 0}
.wt-away{display:grid;grid-template-columns:auto 1fr;gap:5px 12px;text-align:left;font-size:13px;margin:10px 0 8px;padding:10px 12px;background:#0f0b14;border-radius:6px}
.wt-away dt{color:#9b92a6}
.wt-away dd{margin:0;color:#f6dea0;font-family:Cinzel,Georgia,serif}
.wt-away dd.up{color:#9be07a}
.wt-held{font-size:12.5px;color:#ffb08a;margin:0 0 8px;line-height:1.35}
`;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };

type Tab = 'up' | 'skills' | 'shadows' | 'hero' | 'ascend';
const SHEET_URL: Record<string, string> = { 'echo-vanguard': vanguardUrl, 'echo-sovereign': sovereignUrl, 'foes-veil': veilUrl };

/** The abilities' marks, drawn as strokes. */
const ICON: Record<D.AbilityId, string> = {
  strike: 'M12 3v13M8 12l4 5 4-5M7 21h10',
  pillar: 'M12 21c-3 0-5-2-5-5 0-4 5-6 4-13 3 3 6 7 6 13 0 3-2 5-5 5zM12 21v-5',
  phantom: 'M4 18l6-6-6-6M11 18l6-6-6-6M19 6v12',
  storm: 'M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M12 4a8 8 0 0 1 8 8M20 12a8 8 0 0 1-8 8M12 20a8 8 0 0 1-8-8M4 12a8 8 0 0 1 8-8',
  comet: 'M6 20l8-8M14 12V5h7M14 5l7 7M4 4l3 3',
  balm: 'M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 11c0 5.5-7 10-7 10zM12 9v6M9 12h6',
  judgment: 'M12 2l2.4 6.6L21 9l-5 4.6L17.6 21 12 17.3 6.4 21 8 13.6 3 9l6.6-.4z',
};
const fmt1 = (n: number) => D.fmt(n);
const svg = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;

export class WatchUI {
  private hud = el('div', 'wt-hud');
  private panel = el('div', 'wt-panel');
  private body = el('div', 'wt-body');
  private toastEl = el('div', 'wt-toast');
  private callEl = el('div', 'wt-call');
  private coins = el('div', 'wt-coins');
  private stage = el('div', 'wt-stage');
  private bar = el('div', 'wt-bar');
  private barFill = el('b');
  private challenge = el('button', 'wt-btn hot', 'Challenge the boss');
  private transform = el('button', 'wt-btn violet', 'Transform');
  private leave = el('button', 'wt-btn', 'Leave');
  private speed = el('button', 'wt-btn', '×1');
  private skillbar = el('div', 'wt-skillbar');
  private auto = el('button', 'wt-chip', 'AUTO');
  private bar_: { id: D.AbilityId | null; b: HTMLButtonElement }[] = [];
  private barSig = '';
  private abCards = new Map<D.AbilityId, { root: HTMLElement; buy: HTMLButtonElement; eq: HTMLButtonElement; lv: HTMLElement }>();
  private tab: Tab = 'up';
  private tabs: Record<Tab, HTMLButtonElement> = { up: el('button', 'wt-tab on', 'Upgrades'), skills: el('button', 'wt-tab', 'Skills'), shadows: el('button', 'wt-tab', 'Shadows'), hero: el('button', 'wt-tab', 'Hero'), ascend: el('button', 'wt-tab', 'Ascend') };
  /** Buy one, ten, or as many as the coins allow. */
  amount: 1 | 10 | 0 = 1;
  private cards = new Map<D.TrackId, { root: HTMLButtonElement; lvl: HTMLElement; now: Text; next: HTMLElement; per: HTMLElement; cost: HTMLElement; n: HTMLElement }>();
  /** His numbers under the stage bar: blow, health, swings, damage a second, coins a second. */
  private statline = el('div', 'wt-statline');
  private sl = { atk: el('b'), hp: el('b'), spd: el('b'), dps: el('b'), coins: el('b') };
  private toastT = 0;
  /** Where the bar over the wall ends (CSS px), as last placed. */
  private hudB = 0;
  private overlayEl: HTMLElement | null = null;

  constructor(private sc: Watch) {
    if (!document.getElementById('wt-css')) { const st = el('style'); st.id = 'wt-css'; st.textContent = CSS; document.head.appendChild(st); }
    const top = el('div', 'wt-row');
    const rightTop = el('div', 'wt-row');
    rightTop.append(this.speed, this.leave);
    top.append(this.coins, rightTop);
    this.speed.dataset.k = 'wt_speed';
    this.speed.onclick = () => { sfx('ui'); const next = ((sc.w.speed ?? 1) % 3) + 1 as 1 | 2 | 3; sc.setSpeed(sc.w.level >= D.SPEEDS[next] ? next : 1); this.refresh(); };
    this.auto.dataset.k = 'wt_auto';
    this.auto.onclick = () => { sfx('ui'); sc.w.autoSkills = !sc.w.autoSkills; this.refresh(); };
    this.bar.appendChild(this.barFill);
    const mid = el('div', 'wt-row mid');
    mid.style.marginTop = '4px';
    const right = el('div', 'wt-row');
    right.append(this.transform, this.challenge);
    mid.append(this.stage, right);
    for (const [label, b] of [['ATK', this.sl.atk], ['HEALTH', this.sl.hp], ['SPEED', this.sl.spd], ['DPS', this.sl.dps], ['COINS', this.sl.coins]] as const) {
      const span = el('span', '', label); span.appendChild(b); this.statline.appendChild(span);
    }
    this.statline.dataset.k = 'wt_stats';
    this.hud.append(top, mid, this.bar, this.statline);
    this.challenge.dataset.k = 'wt_challenge'; this.transform.dataset.k = 'wt_transform'; this.leave.dataset.k = 'wt_leave';
    this.challenge.onclick = () => { sfx('uiConfirm'); sc.challenge(); };
    this.transform.onclick = () => { sfx('uiConfirm'); sc.transformNow(); };
    this.leave.onclick = () => { sfx('uiBack'); sc.leave(); };
    const tabs = el('div', 'wt-tabs');
    for (const [k, b] of Object.entries(this.tabs) as [Tab, HTMLButtonElement][]) { b.dataset.k = 'wt_tab_' + k; b.onclick = () => { sfx('ui'); this.show(k); }; tabs.appendChild(b); }
    this.panel.append(this.skillbar, this.body, tabs);
    document.body.append(this.hud, this.panel, this.toastEl, this.callEl);
    this.buildBar();
    this.show('up');
  }

  /** Place the bar at `top` and say where it ends (CSS pixels): the wall starts under it, however it wraps. */
  placeHud(top: number, landscape: boolean, split: number): number {
    // Below the status bar and the Dynamic Island: the inset comes from CSS itself (as the home screen's does), so a
    // value the phone reports late, or a measurement taken too early, never tucks the bar under them.
    this.hud.style.top = `calc(max(env(safe-area-inset-top, 0px), ${top}px) + 10px)`;
    this.hud.style.right = landscape ? `${window.innerWidth - split}px` : '0px';
    this.hudB = this.hud.getBoundingClientRect().bottom;
    return this.hudB;
  }

  /** Place the panel below the wall (`wallTop` and `stripBottom` in CSS pixels). */
  layout(wallTop: number, stripBottom: number, landscape: boolean, split: number) {
    this.callEl.style.top = `${wallTop + (stripBottom - wallTop) * 0.2}px`;
    this.callEl.style.left = `${split / 2}px`;
    if (landscape) {
      Object.assign(this.panel.style, { top: '0px', left: `${split}px`, borderTop: '0', borderLeft: '1px solid rgba(226,184,90,.35)' });
      this.toastEl.style.top = `${stripBottom - 40}px`;
    } else {
      Object.assign(this.panel.style, { top: `${stripBottom}px`, left: '0px', borderTop: '1px solid rgba(226,184,90,.35)', borderLeft: '0' });
      this.toastEl.style.top = `${stripBottom - 40}px`;
    }
  }

  /** The skill bar: a button per slot (what he takes in), and AUTO. Rebuilt when the loadout changes. */
  buildBar() {
    const w = this.sc.w;
    this.barSig = `${D.slotsAt(w.level)}:${(w.loadout ?? []).join()}`;
    this.skillbar.textContent = '';
    this.bar_ = [];
    const lo = w.loadout ?? [];
    for (let i = 0; i < D.slotsAt(w.level); i++) {
      const id = lo[i] ?? null, b = el('button', 'wt-sk' + (id ? '' : ' empty')) as HTMLButtonElement;
      if (id) { b.innerHTML = svg(ICON[id]); b.dataset.k = 'wt_cast_' + id; b.title = D.ABILITY[id].name; b.onclick = () => { if (this.sc.cast(id, true)) sfx('uiConfirm'); }; }
      this.skillbar.appendChild(b);
      this.bar_.push({ id, b });
    }
    const label = el('span', 'sp');
    if (!lo.length) { label.textContent = w.level < D.ABILITIES[0].level ? `Abilities open at Watch level ${D.ABILITIES[0].level}` : 'Learn abilities in Skills'; label.style.cssText = 'font-size:11px;color:#9b92a6'; }
    this.skillbar.append(label, this.auto);
  }

  /** A moment's glow on an ability's button when he uses it by himself. */
  flashSkill(id: D.AbilityId) {
    const s = this.bar_.find((o) => o.id === id);
    if (!s) return;
    s.b.classList.add('flash');
    setTimeout(() => s.b.classList.remove('flash'), 260);
  }

  show(tab: Tab) {
    this.tab = tab;
    for (const [k, b] of Object.entries(this.tabs)) b.classList.toggle('on', k === tab);
    this.body.textContent = '';
    this.cards.clear();
    this.abCards.clear();
    if (tab === 'up') this.buildUpgrades();
    else if (tab === 'skills') this.buildSkills();
    else if (tab === 'shadows') this.buildShadows();
    else if (tab === 'hero') this.buildHero();
    else this.buildAscend();
    this.refresh();
  }

  private buildUpgrades() {
    const amt = el('div', 'wt-amt');
    for (const [label, v] of [['×1', 1], ['×10', 10], ['Max', 0]] as const) {
      const b = el('button', this.amount === v ? 'on' : '', label);
      b.dataset.k = 'wt_amt_' + label;
      b.onclick = () => { this.amount = v; for (const c of Array.from(amt.children)) c.classList.toggle('on', c === b); this.refresh(); };
      amt.appendChild(b);
    }
    const grid = el('div', 'wt-grid');
    for (const t of D.TRACKS) {
      const root = el('button', 'wt-card'), n = el('div', 'n'), c = el('div', 'c');
      // The stat itself, now and after this purchase, over what each level adds.
      const name = el('b', '', t.name), lvl = el('small'), val = el('span'), now = document.createTextNode(''), next = el('i'), per = el('em'), cst = el('small'), num = el('div');
      val.append(now, next);
      val.dataset.k = 'wt_val_' + t.id;
      root.dataset.k = 'wt_up_' + t.id;
      const hd = el('div', 'hd'); hd.append(name, lvl);
      n.append(hd, val, per); c.append(num, cst);
      root.append(n, c);
      const buy = () => {
        if (!this.sc.buy(t.id, this.amount)) return false;
        sfx('pickup', { vol: 0.6 });
        root.classList.add('bought'); setTimeout(() => root.classList.remove('bought'), 220);
        this.refresh();
        return true;
      };
      // A tap buys once; held, it keeps buying (after a short pause) until the coins or the finger run out.
      let hold = 0, held = false;
      const stop = () => { clearTimeout(hold); clearInterval(hold); hold = 0; };
      root.onpointerdown = () => { held = false; stop(); hold = window.setTimeout(() => { held = true; hold = window.setInterval(() => { if (!buy()) stop(); }, 110); }, 380); };
      root.onpointerup = root.onpointerleave = root.onpointercancel = stop;
      root.onclick = () => { if (!held) buy(); held = false; };
      grid.appendChild(root);
      this.cards.set(t.id, { root, lvl, now, next, per, cost: cst, n: num });
    }
    this.body.append(amt, grid);
  }

  private buildHero() {
    const w = this.sc.w, s = D.watchStats(w);
    this.body.appendChild(el('div', 'wt-h', `Elior · Watch level ${w.level}`));
    const xp = el('div', 'wt-bar'), f = el('b'); f.style.width = `${Math.min(100, (w.xp / D.watchXpNext(w.level)) * 100)}%`; xp.appendChild(f);
    this.body.appendChild(xp);
    const st = el('div', 'wt-stats');
    st.style.marginTop = '8px';
    const row = (k: string, v: string) => { const d = el('div'); d.append(document.createTextNode(k + ' '), el('b', '', v)); st.appendChild(d); };
    row('Damage', D.fmt(s.atk)); row('Health', D.fmt(s.maxHp)); row('Swings', `×${s.aspd.toFixed(2)}`); row('Critical', `${Math.round(s.crit * 100)}% · ×${s.critDmg.toFixed(2)}`);
    row('Regen', `${fmt1(s.maxHp * s.regen)}/s (${(s.regen * 100).toFixed(1)}%)`); row('Blows softened', `${Math.round(s.dr * 100)}%${this.sc.band.aegis() ? ` · guardians ${Math.round(this.sc.band.aegis() * 100)}%` : ''}`);
    row('Damage a second', D.fmt(D.dpsOf(s))); row('Coins a second', D.fmt(w.rate)); row('Coins', `×${s.coinMult.toFixed(2)}`); row('Shadows', `${(w.team ?? []).length} of ${D.shadowsAt(w.level)}`);
    this.body.appendChild(st);
    // The armoury: a blade for each of the first eight gates.
    this.body.appendChild(el('div', 'wt-h', 'The armoury'));
    const arm = el('div', 'wt-arm'), won = D.bladesWon(w), held = D.bladeOf(w);
    const card = (i: number, name: string, line: string) => {
      const b = el('button', 'wt-blade' + (held === i ? ' on' : '')) as HTMLButtonElement;
      b.dataset.k = i < 0 ? 'wt_blade_none' : `wt_blade_${i}`;
      const icon = el('i');
      if (i >= 0) { icon.style.backgroundImage = `url(${bladesUrl})`; icon.style.backgroundPosition = `${-i * 24}px 0`; }
      const text = el('span'); text.append(el('b', '', name), document.createTextNode(line));
      b.append(icon, text);
      b.disabled = i >= 0 && !won[i];
      b.addEventListener('click', () => { this.sc.wield(i); this.show('hero'); });
      arm.appendChild(b);
    };
    card(-1, 'His own sword', held === -1 ? 'In hand' : 'Wield');
    D.BLADES.forEach((bl, i) => card(i, won[i] ? bl.name : 'Locked', won[i] ? `Blows ×${bl.atk}${held === i ? ' · in hand' : ''}` : `Gate ${i + 1}'s boss`));
    this.body.appendChild(arm);
    this.body.appendChild(el('div', 'wt-h', 'What his levels open'));
    const ul = el('ul', 'wt-list');
    for (const [lv, text] of D.UNLOCKS) { const li = el('li', w.level >= lv ? 'got' : ''); li.append(el('b', '', `Lv ${lv}`), document.createTextNode(text)); ul.appendChild(li); }
    this.body.appendChild(ul);
  }

  /** The abilities: buy and level each with coins, and choose which he takes into the fight. */
  private buildSkills() {
    const w = this.sc.w;
    this.body.appendChild(el('div', 'wt-h', 'Abilities'));
    this.body.appendChild(el('p', 'wt-p', `He takes ${D.slotsAt(w.level)} into the fight (more at levels 25, 60 and 100) and uses them by himself while AUTO is on; tap one on the bar to use it now. Each level hits harder and comes round sooner. Abilities stay through an Ascension.`));
    for (const a of D.ABILITIES) {
      const root = el('div', 'wt-ab'), icon = el('div'), mid = el('div'), act = el('div', 'act');
      icon.innerHTML = svg(ICON[a.id]);
      const lv = el('small');
      mid.append(el('b', '', a.name), lv, el('p', '', a.desc));
      const buy = el('button') as HTMLButtonElement, eq = el('button', 'eq') as HTMLButtonElement;
      buy.dataset.k = 'wt_buy_' + a.id; eq.dataset.k = 'wt_eq_' + a.id;
      buy.onclick = () => { if (this.sc.buySkill(a.id)) { sfx('pickup', { vol: 0.6 }); this.buildBar(); this.refresh(); } };
      eq.onclick = () => { sfx('ui'); this.sc.toggleSkill(a.id); this.buildBar(); this.refresh(); };
      act.append(buy, eq);
      root.append(icon, mid, act);
      this.body.appendChild(root);
      this.abCards.set(a.id, { root, buy, eq, lv });
    }
  }

  /** The shadows: raise each with its essence, level it, choose its role, and set the team beside him. */
  private buildShadows() {
    const w = this.sc.w, slots = D.shadowsAt(w.level), team = w.team ?? [];
    this.body.appendChild(el('div', 'wt-h', `Shadows · ${team.length} of ${slots} beside him`));
    this.body.appendChild(el('p', 'wt-p', `The Echoes of the journey, earned here. Gold elite foes and the gates' holders leave essence of a shadow; enough raises it, and more takes it a level further (its second and third stage at levels 10 and 20). Choose each one's role, and who stands beside him: ${slots ? `${slots} slot${slots > 1 ? 's' : ''} now, ` : ''}more at Watch levels ${D.SHADOW_LEVELS.filter((l) => l > w.level).slice(0, 3).join(', ') || 'none left'}.`));
    for (const id of SHADOW_ORDER) {
      const raised = owned(w, id), lv = w.shadows?.[id]?.lv ?? 0, role = shadowRole(w, id), sp = ECHO_SPECIES[id];
      const root = el('div', 'wt-sh' + (team.includes(id) ? ' on' : '') + (raised ? '' : ' locked'));
      const a = SHADOW_ART[id], pic = el('div', 'pic');
      pic.style.backgroundImage = `url(${SHEET_URL[a.sheet]})`;
      // The ready pose, its feet on the box's floor and its body centred.
      pic.style.backgroundPosition = `${32 - a.ox}px ${60 - 88 - a.row * 96}px`;
      const mid = el('div');
      const name = el('b', '', raised ? shadowName(id, lv) : sp.stages[0].name);
      const chip = el('span', 'wt-role', ECHO_ROLES[role].name); chip.style.color = ECHO_ROLES[role].color;
      name.appendChild(chip);
      const have = w.essence?.[id] ?? 0, need = raised ? levelCost(lv) : UNLOCK_COST[id];
      const line = el('small', '', raised ? `Level ${lv}/${SHADOW_MAX} · ${sp.stages[tierOf(lv) - 1].title} · ${lv >= SHADOW_MAX ? `${have} essence` : `${have} of ${need} essence to level`}` : `${have} of ${need} essence to raise · ${sp.cls}`);
      const bar = el('div', 'ess'), fill = el('i'); fill.style.width = `${Math.min(100, (have / need) * 100)}%`; bar.appendChild(fill);
      const ability = el('p', '', `${ECHO_ROLES[role].signature[tierOf(Math.max(1, lv)) - 1]} ${sp.stages[tierOf(Math.max(1, lv)) - 1].ability}`);
      mid.append(name, line, bar, ability);
      const act = el('div', 'act');
      const up = el('button') as HTMLButtonElement;
      up.dataset.k = 'wt_raise_' + id;
      up.textContent = lv >= SHADOW_MAX ? 'MAX' : raised ? `Level up · ${need}` : `Raise · ${need}`;
      up.disabled = lv >= SHADOW_MAX || have < need;
      up.onclick = () => { if (this.sc.raiseShadow(id)) { sfx('lootRare', { vol: 0.5 }); this.show('shadows'); } };
      act.appendChild(up);
      if (raised) {
        const tm = el('button', 'tm' + (team.includes(id) ? ' on' : '')) as HTMLButtonElement;
        tm.dataset.k = 'wt_team_' + id;
        tm.textContent = team.includes(id) ? 'Beside him' : 'Set beside him';
        tm.onclick = () => { sfx('ui'); this.sc.toggleTeam(id); this.show('shadows'); };
        const sel = el('select') as HTMLSelectElement;
        sel.dataset.k = 'wt_role_' + id;
        for (const r of ROLE_ORDER) { const o = el('option', '', ECHO_ROLES[r].name) as HTMLOptionElement; o.value = r; o.selected = r === role; sel.appendChild(o); }
        sel.onchange = () => { sfx('ui'); this.sc.setShadowRole(id, sel.value as typeof role); this.show('shadows'); };
        act.append(tm, sel);
      }
      root.append(pic, mid, act);
      this.body.appendChild(root);
    }
  }

  private buildAscend() {
    const w = this.sc.w, seals = D.sealsFor(w.best);
    this.body.appendChild(el('div', 'wt-h', 'The Ascension'));
    this.body.appendChild(el('p', 'wt-p', `Leave the wall to a new watch and begin again from stage 1, stronger. Your stage, coins and upgrades reset; Elior's level, his shadows and his Seals stay. Each Seal adds 5% to every blow and every coin. The Ascension opens at stage ${D.ASCEND_AT}; the further past it you go, the more Seals it gives.`));
    const st = el('div', 'wt-stats');
    const row = (k: string, v: string) => { const d = el('div'); d.append(document.createTextNode(k + ' '), el('b', '', v)); st.appendChild(d); };
    row('Best this watch', `stage ${w.best}`); row('Seals now', String(w.seals)); row('Ascending gives', `${seals} Seals`); row('Ascensions', String(w.ascensions));
    this.body.appendChild(st);
    const b = el('button', 'wt-btn hot wt-big', seals > 0 ? `Ascend for ${seals} Seals` : `Reach stage ${D.ASCEND_AT} to Ascend`);
    b.dataset.k = 'wt_ascend';
    b.disabled = seals <= 0;
    let armed = false;
    b.onclick = () => {
      if (!armed) { armed = true; b.textContent = 'Tap again: begin a new watch'; return; }
      this.sc.ascend(); this.show('ascend');
    };
    this.body.appendChild(b);
  }

  /** Numbers and states, a few times a second. */
  refresh() {
    // The bar moved or changed height (a button came or went, the safe area settled): the wall stays just under it.
    if (this.hudB && Math.abs(this.hud.getBoundingClientRect().bottom - this.hudB) > 0.5) this.sc.refit();
    const sc = this.sc, w = sc.w;
    this.coins.innerHTML = '';
    this.coins.append(el('i'), document.createTextNode(D.fmt(w.coins)));
    const boss = D.isBoss(w.stage);
    this.stage.textContent = `Gate ${D.gateOf(w.stage)} · ${boss ? 'the boss' : `stage ${w.stage}${D.isRush(w.stage) ? ' · rush' : ''} · ${sc.kills}/${D.KILLS_PER_STAGE}`} · Lv ${w.level}`;
    this.bar.classList.toggle('boss', boss);
    this.barFill.style.width = `${Math.max(0, Math.min(1, boss ? sc.bossTimeLeft / D.BOSS_TIME : sc.kills / D.KILLS_PER_STAGE)) * 100}%`;
    this.challenge.hidden = w.auto;
    const st = D.watchStats(w);
    this.sl.atk.textContent = D.fmt(st.atk);
    this.sl.hp.textContent = `${D.fmt(Math.max(0, sc.heroHp))}/${D.fmt(st.maxHp)}`;
    this.sl.hp.classList.toggle('low', sc.heroHp < st.maxHp * 0.35);
    this.sl.spd.textContent = `${st.aspd.toFixed(2)}/s`;
    this.sl.dps.textContent = D.fmt(D.dpsOf(st));
    this.sl.coins.textContent = `${D.fmt(w.rate)}/s`;
    this.speed.textContent = `×${w.speed ?? 1}`;
    this.auto.classList.toggle('on', !!w.autoSkills);
    if (this.barSig !== `${D.slotsAt(w.level)}:${(w.loadout ?? []).join()}`) this.buildBar();
    for (const { id, b } of this.bar_) {
      if (!id) continue;
      const cd = D.abilityCd(id, D.skillLvl(w, id)), left = sc.abilT[id] ?? 0;
      b.style.setProperty('--p', String(Math.min(1, left / cd)));
      b.classList.toggle('ready', left <= 0);
    }
    for (const a of D.ABILITIES) {
      const c = this.abCards.get(a.id);
      if (!c) continue;
      const lv = D.skillLvl(w, a.id), open = w.level >= a.level, on = (w.loadout ?? []).includes(a.id), cost = D.abilityCost(a.id, lv);
      const effect = a.id === 'balm' ? `heals ${Math.round(D.abilityMult(a.id, Math.max(1, lv)) * 100)}%` : `×${D.abilityMult(a.id, Math.max(1, lv)).toFixed(1)} blows`;
      c.lv.textContent = !open ? `Opens at Watch level ${a.level}` : lv ? `Level ${lv}/${D.ABILITY_MAX} · ${effect} · every ${D.abilityCd(a.id, lv).toFixed(1)} s` : `${effect} · every ${a.cd} s`;
      c.root.classList.toggle('locked', !open);
      c.root.classList.toggle('on', on);
      c.buy.textContent = lv >= D.ABILITY_MAX ? 'MAX' : `${lv ? 'Level up' : 'Learn'} · ${D.fmt(cost)}`;
      c.buy.disabled = !open || lv >= D.ABILITY_MAX || cost > w.coins;
      c.eq.textContent = on ? 'In the fight' : 'Take in';
      c.eq.classList.toggle('on', on);
      c.eq.disabled = lv <= 0;
    }
    this.transform.hidden = !(w.level >= D.MANTLE.level && w.gauge >= 100 && sc.mantleT <= 0);
    for (const t of D.TRACKS) {
      const c = this.cards.get(t.id);
      if (!c) continue;
      const lv = D.lvlOf(w, t.id), open = D.isOpen(w, t), maxed = t.max !== undefined && lv >= t.max;
      const n = this.amount === 0 ? Math.max(1, D.affordable(t.id, lv, w.coins)) : this.amount;
      const take = t.max !== undefined ? Math.min(n, Math.max(0, t.max - lv)) : n;
      const price = D.costN(t.id, lv, Math.max(1, take));
      const doubles = t.id === 'attack' || t.id === 'health' ? ` · ×2\u00a0at\u00a0Lv\u00a0${D.nextMilestone(lv)}` : '';
      c.lvl.textContent = open ? `Lv ${lv}${maxed ? ' · max' : ''}` : 'Locked';
      c.now.textContent = open ? D.trackStat(w, t.id) : '';
      c.next.textContent = open && !maxed ? ` → ${D.trackStat(w, t.id, take)}` : '';
      c.per.textContent = open ? (maxed ? t.per.replace(/, to .*$/, ' · at its height') : t.per + doubles) : D.opensText(t);
      c.n.textContent = maxed ? 'MAX' : `+${take}`;
      c.cost.textContent = maxed || !open ? '' : D.fmt(price);
      c.root.classList.toggle('locked', !open);
      c.root.classList.toggle('maxed', maxed);
      c.root.classList.toggle('poor', open && !maxed && price > w.coins);
    }
  }

  /** An ability's name over the wall as it is used, in its colour. */
  callout(text: string, glow: string) {
    const c = this.callEl;
    c.textContent = text;
    c.style.setProperty('--g', glow);
    c.classList.remove('on');
    void c.offsetWidth; // restart the animation
    c.classList.add('on');
  }

  toast(text: string, sec = 2.6) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('on');
    this.toastT = sec;
  }

  tick(dt: number) {
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.toastEl.classList.remove('on'); }
  }

  /** The welcome-back card: what the wall did while the player was away (already his: game/watch/offline.ts). */
  welcome(r: AwayReport, away: number) {
    const layer = el('div', 'wt-card-layer'), card = el('div', 'wt-welcome');
    const h = Math.floor(r.secs / 3600), m = Math.floor((r.secs % 3600) / 60);
    const capped = away > awayCap(this.sc.w) + 60 ? ` (the Watch counts ${awayCap(this.sc.w) / 3600} hours at most)` : '';
    card.append(el('div', 'wt-h', 'Welcome back to the Watch'), el('p', 'wt-p', `For ${h ? `${h} h ` : ''}${m} min Elior held the wall without you, at half his pace${capped}.`), el('b', '', `+${D.fmt(r.coins)} coins`));
    const dl = el('dl', 'wt-away');
    const row = (k: string, v: string, up = false) => { dl.append(el('dt', '', k), el('dd', up ? 'up' : '', v)); };
    row('Stages', r.to !== r.from ? `${r.from} → ${r.to}` : `held at ${r.to}`, r.to > r.from);
    if (r.levels) row('Watch level', `+${r.levels} (now ${r.level})`, true);
    row('Foes felled', D.fmt(r.kills));
    if (r.gates.length) row(r.gates.length > 1 ? 'Gates won' : 'Gate won', r.gates.join(', '), true);
    const ess = (Object.entries(r.essence) as [ShadowId, number][]).filter(([, n]) => n > 0).map(([id, n]) => `${shadowName(id, 1)} ×${n}`);
    if (ess.length) row('Essence', ess.join(' · '), true);
    card.appendChild(dl);
    if (r.held !== null && !r.auto) card.appendChild(el('p', 'wt-held', D.isBoss(r.held)
      ? `Gate ${D.gateOf(r.held)}'s holder stopped him at stage ${r.held}. Grow stronger, then Challenge it.`
      : `Stage ${r.held}'s foes stopped him. He holds the stage before it, growing, and tries again as he levels.`));
    const ok = el('button', 'wt-btn hot wt-big', 'Collect');
    ok.dataset.k = 'wt_collect';
    ok.onclick = () => { sfx('lootRare'); layer.remove(); this.overlayEl = null; this.refresh(); };
    card.appendChild(ok);
    layer.appendChild(card);
    document.body.appendChild(layer);
    this.overlayEl = layer;
  }

  destroy() { this.hud.remove(); this.panel.remove(); this.toastEl.remove(); this.callEl.remove(); this.skillbar.remove(); this.overlayEl?.remove(); }
}
