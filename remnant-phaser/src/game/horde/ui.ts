// The Horde's controls and readouts. Built for a phone held upright: a stick wherever the left thumb lands, four
// buttons in the right thumb's arc, bars along the top. Sideways, the same pieces reflow. Cards (level-ups, a
// cleared stage, the end of a run) are DOM panels over the canvas, styled like the rest of the game's menus.
import Phaser from 'phaser';
import { dpr } from '../screen';
import { safe } from '../../../../remnant/src/ui/safe';
import { bakeActionIcons } from '../actionIcons';
import { bakeAbilityIcons } from '../abilityIcons';
import { sfx } from '../../../../remnant/src/audio/audio';
import { input, type Action } from '../../../../remnant/src/core/input';
import type { Horde } from '../../scenes/Horde';
import type { HeroId } from './defs';

/** Each hero's skill and transformation buttons: icon, label (and a tint for the borrowed icon). */
const FACES: Record<HeroId, [string, string, string, string, number]> = {
  elior: ['action-ultimate', 'STORM', 'action-transform_elior', 'MANTLE', 0xffffff],
  tirzah: ['ability-rain', 'RAIN', 'action-transform_tirzah', 'WINGS', 0xffffff],
  uri: ['ability-pillar_fire', 'FIRE', 'action-transform_elior', 'CROWN', 0xff9a50],
};

export type Act = 'dash' | 'skill' | 'form' | 'switch';
/** The story's controls, carried over: Jump and Dodge dash, Attack and the skills cast, the Mantle's keys transform. */
const BINDS: [Action, Act | 'pause'][] = [['dodge', 'dash'], ['jump', 'dash'], ['attack', 'skill'], ['skill1', 'skill'], ['skill2', 'skill'], ['heavy', 'skill'], ['transform', 'form'], ['ultimate', 'form'], ['skill3', 'form'], ['switch', 'switch'], ['menu', 'pause']];
interface Button { a: Act; x: number; y: number; r: number; g: Phaser.GameObjects.Graphics; icon: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text }

export interface Readout {
  hp: number; maxHp: number; xp: number; xpNext: number; level: number;
  stage: number; time: number; stageTime: number; kills: number; silver: number;
  hero: string; heroId: HeroId; other: string;
  cd: Record<Act, number>; gauge: number; form: number;
  boss: { name: string; title: string; hp: number; max: number } | null;
}

export class HordeUI {
  /** The stick's pull, -1..1 on each axis. */
  mx = 0;
  my = 0;
  readonly pressed = new Set<Act | 'pause'>();
  private k = dpr();
  private W = 0;
  private H = 0;
  private top = 0;
  private bars: Phaser.GameObjects.Graphics;
  private stickG: Phaser.GameObjects.Graphics;
  private stick: { id: number; ox: number; oy: number; x: number; y: number } | null = null;
  private buttons: Button[] = [];
  private texts: Record<string, Phaser.GameObjects.Text> = {};
  private pause!: { x: number; y: number; r: number };
  private banner: Phaser.GameObjects.Text;
  private bannerSub: Phaser.GameObjects.Text;
  private bannerT = 0;
  private toastT = 0;
  private toastText: Phaser.GameObjects.Text;

  constructor(private h: Horde) {
    if (!h.textures.exists('action-dodge')) bakeActionIcons(h);
    if (!h.textures.exists('ability-rain')) bakeAbilityIcons(h);
    const ul = <T extends Phaser.GameObjects.GameObject>(o: T) => h.ul(o);
    this.bars = ul(h.add.graphics());
    this.stickG = ul(h.add.graphics());
    const font = (size: number, color = '#f3ead8') => ({ fontFamily: 'Cinzel, Georgia, serif', fontSize: `${size * this.k}px`, color, stroke: '#07060a', strokeThickness: 3 * this.k });
    this.texts.level = ul(h.add.text(0, 0, '', font(12, '#cfe6ff')));
    this.texts.stage = ul(h.add.text(0, 0, '', font(13, '#f6dea0')).setOrigin(0.5, 0));
    this.texts.kills = ul(h.add.text(0, 0, '', font(11)).setOrigin(1, 0));
    this.texts.hp = ul(h.add.text(0, 0, '', font(10)));
    this.texts.boss = ul(h.add.text(0, 0, '', font(12, '#ffb9a8')).setOrigin(0.5, 0));
    this.banner = ul(h.add.text(0, 0, '', { ...font(26, '#f6dea0'), fontStyle: 'bold' }).setOrigin(0.5).setAlpha(0));
    this.bannerSub = ul(h.add.text(0, 0, '', { ...font(13, '#ddd4c6'), fontStyle: 'italic' }).setOrigin(0.5).setAlpha(0));
    this.toastText = ul(h.add.text(0, 0, '', { ...font(12), backgroundColor: 'rgba(14,10,18,0.78)', padding: { x: 10 * this.k, y: 5 * this.k } }).setOrigin(0.5).setAlpha(0));
    for (const a of ['dash', 'skill', 'form', 'switch'] as Act[]) {
      const g = ul(h.add.graphics());
      const icon = ul(h.add.image(0, 0, 'action-dodge'));
      const label = ul(h.add.text(0, 0, '', font(9, '#ddd4c6')).setOrigin(0.5, 0));
      this.buttons.push({ a, x: 0, y: 0, r: 0, g, icon, label });
    }
    h.input.addPointer(3);
    h.input.on('pointerdown', this.down, this);
    h.input.on('pointermove', this.move, this);
    h.input.on('pointerup', this.up, this);
    h.input.on('pointerupoutside', this.up, this);
    // N switches too (the shared input's Switch is X); every other key and the controller come through the
    // shared input service (remnant/src/core/input.ts), which claims its keys before Phaser sees them.
    h.input.keyboard?.on('keydown-N', () => this.pressed.add('switch'));
    this.layout();
  }

  /** Lay the pieces out for the screen as it is now (upright or sideways). */
  layout() {
    const k = this.k, W = this.h.scale.width, H = this.h.scale.height, portrait = H > W;
    this.W = W; this.H = H;
    this.top = Math.max(safe.top * k, 6 * k);
    const unit = Math.min(W, H) / k, big = Math.max(30, Math.min(44, unit * (portrait ? 0.11 : 0.085))) * k;
    // The right thumb's arc: dash biggest and lowest, the others around it.
    const bx = W - Math.max(safe.right * k, 0) - big * 1.55, by = H - Math.max(safe.bottom * k, 8 * k) - big * 1.45;
    const place: Record<Act, [number, number, number]> = portrait
      ? { dash: [bx, by, big], skill: [bx - big * 2.15, by + big * 0.35, big * 0.78], form: [bx - big * 0.55, by - big * 2.0, big * 0.78], switch: [bx - big * 2.25, by - big * 1.55, big * 0.66] }
      : { dash: [bx, by, big * 0.95], skill: [bx - big * 2.05, by + big * 0.3, big * 0.74], form: [bx - big * 0.2, by - big * 1.95, big * 0.74], switch: [bx - big * 2.0, by - big * 1.5, big * 0.62] };
    for (const b of this.buttons) {
      [b.x, b.y, b.r] = place[b.a];
      b.icon.setPosition(b.x, b.y).setDisplaySize(b.r * 1.1, b.r * 1.1);
      b.label.setPosition(b.x, b.y + b.r + 2 * k);
    }
    this.pause = { x: W - Math.max(safe.right * k, 0) - 24 * k, y: this.top + 34 * k, r: 15 * k };
    const left = Math.max(safe.left * k, 10 * k), right = W - Math.max(safe.right * k, 10 * k);
    this.texts.level.setPosition(left, this.top + 12 * k);
    this.texts.stage.setPosition(W / 2, this.top + 12 * k);
    this.texts.kills.setPosition(right - 46 * k, this.top + 12 * k);
    this.texts.hp.setPosition(left, this.top + 50 * k);
    this.texts.boss.setPosition(W / 2, this.top + 64 * k);
    this.banner.setPosition(W / 2, H * 0.32);
    this.bannerSub.setPosition(W / 2, H * 0.32 + 30 * k);
    this.toastText.setPosition(W / 2, H * (portrait ? 0.62 : 0.72));
  }

  /** Where each button sits on screen, in CSS pixels (for the checks). */
  get spots() { const o: Record<string, { x: number; y: number; r: number }> = {}; for (const b of this.buttons) o[b.a] = { x: b.x / this.k, y: b.y / this.k, r: b.r / this.k }; o.pause = { x: this.pause.x / this.k, y: this.pause.y / this.k, r: this.pause.r / this.k }; return o; }

  banners(title: string, sub = '', dur = 2.4) { this.banner.setText(title); this.bannerSub.setText(sub); this.bannerT = dur; }
  toast(text: string) { this.toastText.setText(text); this.toastT = 2.6; }

  private hitButton(x: number, y: number): Act | 'pause' | null {
    for (const b of this.buttons) if ((x - b.x) ** 2 + (y - b.y) ** 2 < (b.r * 1.25) ** 2) return b.a;
    if ((x - this.pause.x) ** 2 + (y - this.pause.y) ** 2 < (this.pause.r * 1.6) ** 2) return 'pause';
    return null;
  }

  private down(p: Phaser.Input.Pointer) {
    if (this.h.overlay) return;
    const hit = this.hitButton(p.x, p.y);
    if (hit) { this.pressed.add(hit); return; }
    // The stick starts wherever the thumb lands below the bars, away from the buttons.
    if (!this.stick && p.y > this.top + 70 * this.k) this.stick = { id: p.id, ox: p.x, oy: p.y, x: p.x, y: p.y };
  }
  private move(p: Phaser.Input.Pointer) { if (this.stick && p.id === this.stick.id) { this.stick.x = p.x; this.stick.y = p.y; } }
  private up(p: Phaser.Input.Pointer) { if (this.stick && p.id === this.stick.id) this.stick = null; }
  release() { this.stick = null; this.mx = this.my = 0; this.pressed.clear(); }

  update(dt: number, s: Readout, held = false) {
    const k = this.k, W = this.W, g = this.bars;
    if (this.h.scale.width !== this.W || this.h.scale.height !== this.H) this.layout();
    // The stick, or the keys and the controller's left stick.
    if (!held) {
      input.enabled = true; input.poll(); input.beginStep();
      for (const [a, act] of BINDS) if (input.pressed(a)) this.pressed.add(act);
      input.endStep();
    }
    let mx = input.axisX, my = input.axisY;
    this.stickG.clear();
    if (this.stick) {
      const R = 46 * k, dx = this.stick.x - this.stick.ox, dy = this.stick.y - this.stick.oy, d = Math.hypot(dx, dy);
      // A long drag drags the stick's base along, so the thumb never runs out of room.
      if (d > R) { this.stick.ox += (dx / d) * (d - R); this.stick.oy += (dy / d) * (d - R); }
      const ex = this.stick.x - this.stick.ox, ey = this.stick.y - this.stick.oy, m = Math.min(1, Math.hypot(ex, ey) / R);
      if (m > 0.12) { const a = Math.atan2(ey, ex); mx = Math.cos(a) * m; my = Math.sin(a) * m; }
      this.stickG.fillStyle(0x07060a, 0.35).fillCircle(this.stick.ox, this.stick.oy, R).lineStyle(2 * k, 0xe2b85a, 0.45).strokeCircle(this.stick.ox, this.stick.oy, R);
      this.stickG.fillStyle(0xf6dea0, 0.75).fillCircle(this.stick.ox + Math.min(R, Math.hypot(ex, ey)) * Math.cos(Math.atan2(ey, ex)), this.stick.oy + Math.min(R, Math.hypot(ex, ey)) * Math.sin(Math.atan2(ey, ex)), 18 * k);
    } else if (this.h.touch) {
      // A faint ring shows where the stick waits.
      const x = Math.max(safe.left * k, 0) + 80 * k, y = this.H - Math.max(safe.bottom * k, 8 * k) - 90 * k;
      this.stickG.lineStyle(2 * k, 0xe2b85a, 0.18).strokeCircle(x, y, 46 * k).fillStyle(0xf6dea0, 0.12).fillCircle(x, y, 18 * k);
    }
    const n = Math.hypot(mx, my);
    if (n > 1) { mx /= n; my /= n; }
    this.mx = mx; this.my = my;

    // The bars along the top: experience across the whole width, health under the level, the monarch's below.
    g.clear();
    const left = Math.max(safe.left * k, 10 * k), right = W - Math.max(safe.right * k, 10 * k), bw = right - left;
    g.fillStyle(0x07060a, 0.7).fillRect(left, this.top, bw, 6 * k);
    g.fillStyle(0x4fb3ff, 1).fillRect(left, this.top, bw * Math.min(1, s.xp / s.xpNext), 6 * k);
    g.lineStyle(1, 0xe2b85a, 0.5).strokeRect(left, this.top, bw, 6 * k);
    const hw = Math.min(170 * k, bw * 0.42), hy = this.top + 36 * k;
    g.fillStyle(0x07060a, 0.7).fillRect(left, hy, hw, 10 * k);
    g.fillStyle(s.hp < s.maxHp * 0.3 ? 0xff4a4a : 0xd8384a, 1).fillRect(left, hy, hw * Math.max(0, s.hp / s.maxHp), 10 * k);
    g.lineStyle(1, 0xe2b85a, 0.6).strokeRect(left, hy, hw, 10 * k);
    if (s.boss) {
      const w = Math.min(bw * 0.8, 420 * k), x = (W - w) / 2, y = this.top + 84 * k;
      g.fillStyle(0x07060a, 0.75).fillRect(x, y, w, 9 * k);
      g.fillStyle(0xe2493a, 1).fillRect(x, y, w * (s.boss.hp / s.boss.max), 9 * k);
      g.lineStyle(1, 0xffb9a8, 0.8).strokeRect(x, y, w, 9 * k);
      this.texts.boss.setText(`${s.boss.name} · ${s.boss.title}`).setVisible(true);
    } else this.texts.boss.setVisible(false);
    const mm = Math.floor(s.time / 60), ss = Math.floor(s.time % 60);
    this.texts.level.setText(`LV ${s.level}`);
    this.texts.stage.setText(s.boss ? `STAGE ${s.stage}` : `STAGE ${s.stage} · ${mm}:${String(ss).padStart(2, '0')}`);
    this.texts.kills.setText(`☠ ${s.kills}   ◈ ${s.silver}`);
    this.texts.hp.setText(`${s.hero} · ${Math.ceil(s.hp)} / ${s.maxHp}`);
    // The pause button.
    g.fillStyle(0x07060a, 0.6).fillCircle(this.pause.x, this.pause.y, this.pause.r).lineStyle(1.5 * k, 0xe2b85a, 0.7).strokeCircle(this.pause.x, this.pause.y, this.pause.r);
    g.fillStyle(0xf6dea0, 1).fillRect(this.pause.x - 5 * k, this.pause.y - 6 * k, 3 * k, 12 * k).fillRect(this.pause.x + 2 * k, this.pause.y - 6 * k, 3 * k, 12 * k);

    for (const b of this.buttons) {
      const cd = s.cd[b.a], ready = b.a === 'form' ? s.gauge >= 1 || s.form > 0 : cd <= 0;
      b.g.clear().fillStyle(0x07060a, ready ? 0.6 : 0.45).fillCircle(b.x, b.y, b.r);
      b.g.lineStyle(2 * k, b.a === 'form' && ready ? 0xc59bff : 0xe2b85a, ready ? 0.9 : 0.35).strokeCircle(b.x, b.y, b.r);
      // A cooldown sweeps round the rim; the transformation's gauge fills it.
      const fill = b.a === 'form' ? (s.form > 0 ? s.form : Math.min(1, s.gauge)) : 1 - Math.min(1, cd);
      if (fill < 1 || b.a === 'form') b.g.lineStyle(3 * k, b.a === 'form' ? 0xc59bff : 0xf6dea0, 0.95).beginPath().arc(b.x, b.y, b.r - 3 * k, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fill).strokePath();
      b.icon.setAlpha(ready ? 1 : 0.4);
    }
    const [dash, skill, form, sw] = this.buttons;
    dash.icon.setTexture('action-dodge'); dash.label.setText('DASH');
    const [skillIcon, skillName, formIcon, formName, tint] = FACES[s.heroId];
    skill.icon.setTexture(skillIcon); skill.label.setText(skillName);
    form.icon.setTexture(formIcon).setTint(tint); form.label.setText(formName);
    sw.icon.setTexture('action-switch'); sw.label.setText(s.other.toUpperCase());

    this.bannerT -= dt; this.toastT -= dt;
    const ba = Math.max(0, Math.min(1, this.bannerT * 2, (2.4 - this.bannerT) * 4));
    // A card covers the middle of the screen; the banner waits behind it.
    this.banner.setAlpha(this.h.overlay ? 0 : ba); this.bannerSub.setAlpha(this.h.overlay ? 0 : ba);
    this.toastText.setAlpha(Math.max(0, Math.min(1, this.toastT * 2)));
  }

  destroy() {
    this.h.input.off('pointerdown', this.down, this);
    this.h.input.off('pointermove', this.move, this);
    this.h.input.off('pointerup', this.up, this);
    this.h.input.off('pointerupoutside', this.up, this);
  }
}

// ---------------------------------------------------------------- the cards

const CSS = `
.hz-layer{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:20;pointer-events:auto;
  padding:max(14px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(14px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));
  background:radial-gradient(ellipse at center,rgba(7,6,11,.62),rgba(7,6,11,.9));font-family:Georgia,serif;color:#ddd4c6}
.hz-panel{width:min(440px,100%);max-height:100%;overflow:auto;text-align:center}
.hz-title{font-family:Cinzel,Georgia,serif;color:#f6dea0;font-size:22px;letter-spacing:.2em;margin:4px 0 2px}
.hz-sub{color:#9b92a6;font-style:italic;margin:0 0 12px;font-size:14px}
.hz-cards{display:flex;flex-direction:column;gap:10px}
@media (orientation:landscape){.hz-panel{width:min(760px,100%)}.hz-cards{flex-direction:row}.hz-card{flex:1}}
.hz-card{background:rgba(20,14,24,.92);border:1px solid rgba(226,184,90,.45);border-radius:6px;padding:12px 14px;text-align:left;cursor:pointer;color:#ddd4c6;font:inherit}
.hz-card:active,.hz-card:hover,.hz-card:focus{border-color:#f6dea0;background:rgba(40,28,34,.95)}
.hz-card b{font-family:Cinzel,Georgia,serif;color:#f6dea0;font-size:15px;display:block}
.hz-card small{color:#c59bff;display:block;margin:2px 0 4px;letter-spacing:.06em}
.hz-card span{font-size:13px;color:#cfc6b6}
.hz-stats{display:grid;grid-template-columns:1fr 1fr;gap:6px 14px;margin:10px 0 14px;text-align:left;font-size:14px}
.hz-stats b{color:#f6dea0;font-weight:normal}
.hz-btns{display:flex;flex-direction:column;gap:8px}
.hz-btn{font-family:Cinzel,Georgia,serif;font-size:15px;padding:11px 14px;border-radius:6px;border:1px solid rgba(226,184,90,.55);background:rgba(20,14,24,.92);color:#ddd4c6;cursor:pointer}
.hz-btn:focus{outline:2px solid #f6dea0}
.hz-btn.primary{background:linear-gradient(#6b4a1c,#3e2a10);color:#fff1c4;border-color:#f6dea0}
`;

/** Show a card over the game; the returned function closes it. Arrows, the D-pad and the stick move between its
 * buttons; Enter, Space or ✕ presses one. */
export function overlay(build: (root: HTMLElement) => void) {
  if (!document.getElementById('hz-css')) { const st = document.createElement('style'); st.id = 'hz-css'; st.textContent = CSS; document.head.appendChild(st); }
  const root = document.createElement('div');
  root.className = 'hz-layer';
  root.dataset.horde = '1';
  const panel = document.createElement('div');
  panel.className = 'hz-panel';
  root.appendChild(panel);
  build(panel);
  document.body.appendChild(root);
  const buttons = () => Array.from(root.querySelectorAll('button')) as HTMLButtonElement[];
  if (input.lastDevice !== 'touch') buttons()[0]?.focus();
  input.flush();
  const off = input.onAction((a, repeat) => {
    const list = buttons(), i = list.indexOf(document.activeElement as HTMLButtonElement);
    if (a === 'left' || a === 'up' || a === 'right' || a === 'down') { list[(i + (a === 'left' || a === 'up' ? -1 : 1) + list.length) % list.length]?.focus(); return true; }
    if ((a === 'confirm' || a === 'jump') && !repeat) { (list[i] ?? list[0])?.click(); return true; }
    if ((a === 'menu' || a === 'back') && !repeat) { (root.querySelector('[data-k=hz_resume]') as HTMLButtonElement | null)?.click(); return true; }
    return false;
  });
  return () => { off(); root.remove(); };
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = '', onClick?: () => void) {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  if (onClick) e.addEventListener('click', () => { sfx('uiConfirm'); onClick(); });
  return e;
}
