// The Watch's readouts and controls (POLISH_PLAN §18b): a bar over the wall (coins, the stage, the boss's timer) and,
// below it, the tabs: Upgrades, Hero, Ascend. Plain DOM, styled like the game's menus; built once and then only
// updated (text and classes) a few times a second, never rebuilt per frame.
import { sfx } from '../../../../remnant/src/audio/audio';
import * as D from './defs';
import type { Watch } from '../../scenes/Watch';

const CSS = `
.wt-hud{position:fixed;left:0;right:0;z-index:15;pointer-events:none;font-family:Georgia,serif;color:#ddd4c6;padding:0 10px}
.wt-row{display:flex;align-items:center;gap:8px;justify-content:space-between}
.wt-coins{font-family:Cinzel,Georgia,serif;color:#f6dea0;font-size:18px;text-shadow:0 1px 2px #000;white-space:nowrap}
.wt-coins i{display:inline-block;width:14px;height:14px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#fff1c4,#e2b85a 55%,#8a6a34);margin-right:6px;vertical-align:-1px}
.wt-stage{font-family:Cinzel,Georgia,serif;font-size:13px;letter-spacing:.06em;text-align:center;text-shadow:0 1px 2px #000}
.wt-bar{height:5px;background:rgba(0,0,0,.55);border-radius:3px;overflow:hidden;margin-top:3px}
.wt-bar b{display:block;height:100%;background:linear-gradient(90deg,#e2b85a,#fff1c4);width:0}
.wt-bar.boss b{background:linear-gradient(90deg,#ff5a3a,#ffb08a)}
.wt-btn{pointer-events:auto;font-family:Cinzel,Georgia,serif;font-size:12px;padding:6px 10px;border-radius:6px;border:1px solid rgba(226,184,90,.6);background:rgba(20,14,24,.85);color:#f6dea0;cursor:pointer}
.wt-btn.hot{background:linear-gradient(#6b4a1c,#3e2a10);color:#fff1c4;border-color:#f6dea0}
.wt-btn.violet{border-color:#c59bff;color:#e6d4ff;background:rgba(40,20,60,.9)}
.wt-btn[hidden]{display:none}
.wt-toast{position:fixed;left:50%;transform:translateX(-50%);z-index:16;pointer-events:none;background:rgba(20,14,24,.92);border:1px solid rgba(226,184,90,.55);border-radius:6px;padding:7px 12px;font-family:Georgia,serif;color:#f6dea0;font-size:13px;max-width:88vw;text-align:center;opacity:0;transition:opacity .25s}
.wt-toast.on{opacity:1}
.wt-panel{position:fixed;left:0;right:0;bottom:0;z-index:14;display:flex;flex-direction:column;background:#0d0a12;border-top:1px solid rgba(226,184,90,.35);font-family:Georgia,serif;color:#ddd4c6;padding-bottom:env(safe-area-inset-bottom)}
.wt-body{flex:1;overflow:auto;padding:8px 10px;-webkit-overflow-scrolling:touch}
.wt-tabs{display:flex;border-top:1px solid rgba(226,184,90,.25)}
.wt-tab{flex:1;padding:10px 4px;font-family:Cinzel,Georgia,serif;font-size:13px;letter-spacing:.06em;background:#120e18;color:#9b92a6;border:0;border-right:1px solid rgba(226,184,90,.15);cursor:pointer}
.wt-tab.on{color:#f6dea0;background:#1d1424}
.wt-amt{display:flex;gap:6px;justify-content:flex-end;margin-bottom:6px}
.wt-amt button{font-family:Cinzel,Georgia,serif;font-size:11px;padding:4px 8px;border-radius:5px;border:1px solid rgba(226,184,90,.35);background:#120e18;color:#9b92a6;cursor:pointer}
.wt-amt button.on{color:#f6dea0;border-color:#f6dea0}
.wt-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.wt-card{display:flex;align-items:stretch;gap:6px;background:#1a1220;border:1px solid rgba(226,184,90,.3);border-radius:7px;padding:7px;cursor:pointer;color:#ddd4c6;font:inherit;text-align:left;min-height:62px}
.wt-card .n{flex:1;display:flex;flex-direction:column;justify-content:center;min-width:0}
.wt-card .n b{font-family:Cinzel,Georgia,serif;font-size:12px;color:#f6dea0;font-weight:normal}
.wt-card .n small{font-size:11px;color:#9b92a6}
.wt-card .n span{font-size:12px}
.wt-card .c{min-width:62px;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:5px;background:#2c5a2a;color:#eaffd8;font-family:Cinzel,Georgia,serif;font-size:12px;padding:2px 6px}
.wt-card .c small{font-family:Georgia,serif;font-size:11px;color:#fff1c4}
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
.wt-list li b{color:#f6dea0;font-weight:normal}
.wt-big{width:100%;margin-top:6px;font-size:14px;padding:10px}
.wt-card-layer{position:fixed;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;background:rgba(7,6,11,.78);padding:16px}
.wt-welcome{width:min(380px,100%);background:#150f1b;border:1px solid rgba(226,184,90,.55);border-radius:8px;padding:16px;text-align:center;font-family:Georgia,serif;color:#ddd4c6}
.wt-welcome b{display:block;font-family:Cinzel,Georgia,serif;color:#f6dea0;font-size:22px;margin:6px 0}
`;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };

type Tab = 'up' | 'hero' | 'ascend';

export class WatchUI {
  private hud = el('div', 'wt-hud');
  private panel = el('div', 'wt-panel');
  private body = el('div', 'wt-body');
  private toastEl = el('div', 'wt-toast');
  private coins = el('div', 'wt-coins');
  private stage = el('div', 'wt-stage');
  private bar = el('div', 'wt-bar');
  private barFill = el('b');
  private challenge = el('button', 'wt-btn hot', 'Challenge the boss');
  private transform = el('button', 'wt-btn violet', 'Transform');
  private leave = el('button', 'wt-btn', 'Leave');
  private tab: Tab = 'up';
  private tabs: Record<Tab, HTMLButtonElement> = { up: el('button', 'wt-tab on', 'Upgrades'), hero: el('button', 'wt-tab', 'Hero'), ascend: el('button', 'wt-tab', 'Ascend') };
  /** Buy one, ten, or as many as the coins allow. */
  amount: 1 | 10 | 0 = 1;
  private cards = new Map<D.TrackId, { root: HTMLButtonElement; lvl: HTMLElement; eff: HTMLElement; cost: HTMLElement; n: HTMLElement }>();
  private toastT = 0;
  private overlayEl: HTMLElement | null = null;

  constructor(private sc: Watch) {
    if (!document.getElementById('wt-css')) { const st = el('style'); st.id = 'wt-css'; st.textContent = CSS; document.head.appendChild(st); }
    const top = el('div', 'wt-row');
    top.append(this.coins, this.leave);
    this.bar.appendChild(this.barFill);
    const mid = el('div', 'wt-row');
    mid.style.marginTop = '4px';
    const right = el('div', 'wt-row');
    right.append(this.transform, this.challenge);
    mid.append(this.stage, right);
    this.hud.append(top, mid, this.bar);
    this.challenge.dataset.k = 'wt_challenge'; this.transform.dataset.k = 'wt_transform'; this.leave.dataset.k = 'wt_leave';
    this.challenge.onclick = () => { sfx('uiConfirm'); sc.challenge(); };
    this.transform.onclick = () => { sfx('uiConfirm'); sc.transformNow(); };
    this.leave.onclick = () => { sfx('uiBack'); sc.leave(); };
    const tabs = el('div', 'wt-tabs');
    for (const [k, b] of Object.entries(this.tabs) as [Tab, HTMLButtonElement][]) { b.dataset.k = 'wt_tab_' + k; b.onclick = () => { sfx('ui'); this.show(k); }; tabs.appendChild(b); }
    this.panel.append(this.body, tabs);
    document.body.append(this.hud, this.panel, this.toastEl);
    this.show('up');
  }

  /** Place the bar over the wall and the panel below it (`top` and `bottom` of the wall in CSS pixels). */
  layout(top: number, stripBottom: number, landscape: boolean, split: number) {
    this.hud.style.top = `${top + 4}px`;
    if (landscape) {
      this.hud.style.right = `${window.innerWidth - split}px`;
      Object.assign(this.panel.style, { top: '0px', left: `${split}px`, borderTop: '0', borderLeft: '1px solid rgba(226,184,90,.35)' });
      this.toastEl.style.top = `${stripBottom - 40}px`;
    } else {
      this.hud.style.right = '0px';
      Object.assign(this.panel.style, { top: `${stripBottom}px`, left: '0px', borderTop: '1px solid rgba(226,184,90,.35)', borderLeft: '0' });
      this.toastEl.style.top = `${stripBottom - 40}px`;
    }
  }

  show(tab: Tab) {
    this.tab = tab;
    for (const [k, b] of Object.entries(this.tabs)) b.classList.toggle('on', k === tab);
    this.body.textContent = '';
    this.cards.clear();
    if (tab === 'up') this.buildUpgrades();
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
      const name = el('b', '', t.name), lvl = el('small'), eff = el('span'), cst = el('small'), num = el('div');
      root.dataset.k = 'wt_up_' + t.id;
      n.append(name, lvl, eff); c.append(num, cst);
      root.append(n, c);
      root.onclick = () => { if (this.sc.buy(t.id, this.amount)) { sfx('pickup', { vol: 0.6 }); this.refresh(); } };
      grid.appendChild(root);
      this.cards.set(t.id, { root, lvl, eff, cost: cst, n: num });
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
    row('Regen', `${(s.regen * 100).toFixed(1)}%/s`); row('Blows softened', `${Math.round(s.dr * 100)}%`); row('Coins', `×${s.coinMult.toFixed(2)}`); row('Shadows', String(D.shadowsAt(w.level)));
    this.body.appendChild(st);
    this.body.appendChild(el('div', 'wt-h', 'What his levels open'));
    const ul = el('ul', 'wt-list');
    for (const [lv, text] of D.UNLOCKS) { const li = el('li', w.level >= lv ? 'got' : ''); li.append(el('b', '', `Lv ${lv}`), document.createTextNode(text)); ul.appendChild(li); }
    this.body.appendChild(ul);
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
    const sc = this.sc, w = sc.w;
    this.coins.innerHTML = '';
    this.coins.append(el('i'), document.createTextNode(D.fmt(w.coins)));
    const boss = D.isBoss(w.stage);
    this.stage.textContent = `Gate ${D.gateOf(w.stage)} · ${boss ? 'the boss' : `stage ${w.stage} · ${sc.kills}/${D.KILLS_PER_STAGE}`} · Lv ${w.level}`;
    this.bar.classList.toggle('boss', boss);
    this.barFill.style.width = `${Math.max(0, Math.min(1, boss ? sc.bossTimeLeft / D.BOSS_TIME : sc.kills / D.KILLS_PER_STAGE)) * 100}%`;
    this.challenge.hidden = w.auto;
    this.transform.hidden = !(w.level >= D.MANTLE.level && w.gauge >= 100 && sc.mantleT <= 0);
    for (const t of D.TRACKS) {
      const c = this.cards.get(t.id);
      if (!c) continue;
      const lv = D.lvlOf(w, t.id), open = D.isOpen(w, t), maxed = t.max !== undefined && lv >= t.max;
      const n = this.amount === 0 ? Math.max(1, D.affordable(t.id, lv, w.coins)) : this.amount;
      const take = t.max !== undefined ? Math.min(n, Math.max(0, t.max - lv)) : n;
      const price = D.costN(t.id, lv, Math.max(1, take));
      c.lvl.textContent = open ? `Lv ${lv}` : 'Locked';
      c.eff.textContent = open ? t.per : D.opensText(t);
      c.n.textContent = maxed ? 'MAX' : `+${take}`;
      c.cost.textContent = maxed || !open ? '' : D.fmt(price);
      c.root.classList.toggle('locked', !open);
      c.root.classList.toggle('maxed', maxed);
      c.root.classList.toggle('poor', open && !maxed && price > w.coins);
    }
  }

  toast(text: string, sec = 2.6) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('on');
    this.toastT = sec;
  }

  tick(dt: number) {
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.toastEl.classList.remove('on'); }
  }

  /** The welcome-back card: what the wall earned while the player was away. */
  welcome(secs: number, coins: number, onTake: () => void) {
    const layer = el('div', 'wt-card-layer'), card = el('div', 'wt-welcome');
    const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
    card.append(el('div', 'wt-h', 'Welcome back to the Watch'), el('p', 'wt-p', `For ${h ? `${h} h ` : ''}${m} min Elior held the wall without you.`), el('b', '', `+${D.fmt(coins)} coins`));
    const ok = el('button', 'wt-btn hot wt-big', 'Collect');
    ok.dataset.k = 'wt_collect';
    ok.onclick = () => { sfx('lootRare'); layer.remove(); this.overlayEl = null; onTake(); };
    card.appendChild(ok);
    layer.appendChild(card);
    document.body.appendChild(layer);
    this.overlayEl = layer;
  }

  destroy() { this.hud.remove(); this.panel.remove(); this.toastEl.remove(); this.overlayEl?.remove(); }
}
