// The HUD and touch controls, drawn over the world in screen pixels (device
// pixels: `k` is CSS-to-device, so sizes below are written in CSS px × k).
// Top-left: level, health, experience, silver. Toasts under it, banners in the
// middle, the room name and hints top-right. On touch: a floating stick on the
// left half, attack / jump / dodge on the right, and a context button to talk,
// rest or open. Everything stays inside the iPhone's safe areas.

import Phaser from 'phaser';
import { xpToNext, type RoomDef } from '../shared';
import { SKILLS, SLOTS } from '../game/abilities';
import { dpr } from '../game/screen';
import { measureSafe, safe } from '../game/safe';
import type { Action } from '../game/controls';
import type { World } from './World';

const GOLD = '#e2b85a', BONE = '#ddd4c6';

interface Btn { a: Action; x: number; y: number; r: number; label: string; g: Phaser.GameObjects.Arc; t: Phaser.GameObjects.Text; down: boolean }

export class Hud extends Phaser.Scene {
  paused = false;
  private k = 1;
  private bars!: Phaser.GameObjects.Graphics;
  private levelText!: Phaser.GameObjects.Text;
  private hpText!: Phaser.GameObjects.Text;
  private silverText!: Phaser.GameObjects.Text;
  private roomText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private bannerBox?: Phaser.GameObjects.Container;
  private toasts: Phaser.GameObjects.Text[] = [];
  private pauseBox?: Phaser.GameObjects.Container;
  private hpGhost = 1;
  btns: Btn[] = [];
  private stick = { id: -1, ox: 0, oy: 0, base: null as Phaser.GameObjects.Arc | null, knob: null as Phaser.GameObjects.Arc | null };
  private touchUi!: Phaser.GameObjects.Container;
  private interactLabel: string | null = null;
  private menuBtn!: Phaser.GameObjects.Text;
  /** The keyboard and pad skill bar along the bottom (touch has its buttons). */
  private skillBar!: Phaser.GameObjects.Container;
  private skillG!: Phaser.GameObjects.Graphics;
  private skillTexts: Phaser.GameObjects.Text[] = [];
  /** Cooldown shading over the touch buttons. */
  private cdG!: Phaser.GameObjects.Graphics;
  private balmText!: Phaser.GameObjects.Text;

  constructor() { super('hud'); }

  private get world() { return this.scene.get('world') as World; }

  create() {
    // Device pixels, times the original's HUD scale for the screen size.
    const cw = this.scale.width / dpr(), ch = this.scale.height / dpr();
    this.k = dpr() * Phaser.Math.Clamp(Math.min(ch / 430, cw / 900), 0.85, 1.6);
    measureSafe();
    const k = this.k;
    const font = (px: number, color = BONE, bold = false) => ({ fontFamily: 'Cinzel, Georgia, serif', fontSize: `${px * k}px`, color, fontStyle: bold ? 'bold' : '', stroke: '#07050a', strokeThickness: 3 * k });
    this.bars = this.add.graphics();
    this.levelText = this.add.text(0, 0, '', font(12, '#f6dea0', true)).setOrigin(0.5);
    this.hpText = this.add.text(0, 0, '', font(8.5)).setOrigin(1, 0.5);
    this.silverText = this.add.text(0, 0, '', font(8.5)).setOrigin(0, 0.5);
    this.roomText = this.add.text(0, 0, '', font(9, GOLD)).setOrigin(1, 0).setAlpha(0);
    this.hintText = this.add.text(0, 0, '', { ...font(10), fontFamily: 'Georgia, serif', fontStyle: 'italic', wordWrap: { width: 260 * k }, align: 'center' }).setOrigin(0.5, 0).setAlpha(0);
    this.menuBtn = this.add.text(0, 0, '❚❚', font(14, BONE)).setOrigin(1, 0).setInteractive({ useHandCursor: true }).setPadding(10 * k, 6 * k, 10 * k, 6 * k);
    this.menuBtn.on('pointerup', () => this.togglePause());
    this.balmText = this.add.text(0, 0, '', font(8.5)).setOrigin(0, 0.5);
    this.skillG = this.add.graphics();
    this.skillBar = this.add.container(0, 0, [this.skillG]);
    SLOTS.forEach((id) => {
      const t = this.add.text(0, 0, '', { ...font(8, '#f6dea0'), align: 'center' }).setOrigin(0.5);
      this.skillTexts.push(t);
      this.skillBar.add(t);
    });
    this.buildTouch();
    this.layout();
    // A turn of the phone changes the scale: rebuild the HUD at the new size.
    const onResize = () => this.scene.restart();
    this.scale.once('resize', onResize);
    this.events.once('shutdown', () => this.scale.off('resize', onResize));
  }

  /** Re-place everything for the current screen and safe areas. */
  private layout() {
    measureSafe();
    const k = this.k, { width: W, height: H } = this.scale;
    this.cameras.main.setSize(W, H);
    const x0 = (12 + safe.left) * k, y0 = (10 + safe.top) * k;
    this.levelText.setPosition(x0 + 15 * k, y0 + 15 * k);
    this.roomText.setPosition(W - (12 + safe.right + 44) * k, y0 + 4 * k);
    this.menuBtn.setPosition(W - (6 + safe.right) * k, y0 - 6 * k);
    this.hintText.setPosition(W / 2, H * 0.16).setWordWrapWidth(Math.min(W * 0.5, 320 * k));
    this.placeTouch();
  }

  // ---------------------------------------------------------------- per frame

  sync(w: World) {
    const k = this.k, s = w.save, p = w.player;
    const x0 = (12 + safe.left) * k, y0 = (10 + safe.top) * k;
    const g = this.bars.clear();
    // The level badge: a gold-edged diamond.
    const bx = x0 + 15 * k, by = y0 + 15 * k, d = 11 * k;
    const r = d * 1.35;
    g.fillStyle(0x0c0910, 0.9).lineStyle(1.4 * k, 0xe2b85a, 1);
    g.beginPath().moveTo(bx, by - r).lineTo(bx + r, by).lineTo(bx, by + r).lineTo(bx - r, by).closePath();
    g.fillPath().strokePath();
    this.levelText.setText(String(s.level));
    // Health, with a pale trail that catches up after a blow.
    const hx = x0 + 34 * k, hy = y0 + 6 * k, hw = 196 * k, hh = 10 * k;
    const f = Phaser.Math.Clamp(p.hp / p.maxHp, 0, 1);
    this.hpGhost = f > this.hpGhost ? f : Phaser.Math.Linear(this.hpGhost, f, 0.04);
    g.fillStyle(0x0a070c, 0.85).fillRect(hx - k, hy - k, hw + 2 * k, hh + 2 * k);
    g.fillStyle(0xf0d8c0, 0.5).fillRect(hx, hy, hw * this.hpGhost, hh);
    g.fillStyle(0xb02a36, 1).fillRect(hx, hy, hw * f, hh);
    g.fillStyle(0xe05060, 1).fillRect(hx, hy, hw * f, 2 * k);
    g.lineStyle(k, 0xe2b85a, 0.7).strokeRect(hx - k, hy - k, hw + 2 * k, hh + 2 * k);
    this.hpText.setText(`${Math.ceil(p.hp)} / ${p.maxHp}`).setPosition(hx + hw - 4 * k, hy + hh / 2);
    // Covenant Energy, then experience.
    let cy = hy + hh + 4 * k;
    const cf = Phaser.Math.Clamp(s.ce / p.maxCe, 0, 1);
    g.fillStyle(0x0a070c, 0.85).fillRect(hx - k, cy - k, hw * 0.82 + 2 * k, 6 * k + 2 * k);
    g.fillStyle(0xd8b45a, 1).fillRect(hx, cy, hw * 0.82 * cf, 6 * k);
    g.fillStyle(0xfff1c4, 0.8).fillRect(hx, cy, hw * 0.82 * cf, 1.5 * k);
    cy += 6 * k + 4 * k;
    const xf = Phaser.Math.Clamp(s.xp / xpToNext(s.level), 0, 1);
    g.fillStyle(0xffffff, 0.08).fillRect(hx, cy, hw * 0.82, 2 * k);
    g.fillStyle(0x9fc4ff, 1).fillRect(hx, cy, hw * 0.82 * xf, 2 * k);
    cy += 2 * k + 8 * k;
    // Balm flasks: full ones red, spent ones dim.
    for (let i = 0; i < s.balmMax; i++) {
      const vx = hx + i * 12 * k;
      g.fillStyle(i < s.balm ? 0xd04a5a : 0x5a4a5a, i < s.balm ? 1 : 0.5);
      g.fillCircle(vx + 4 * k, cy + 2 * k, 4 * k).fillRect(vx + 2.5 * k, cy - 5 * k, 3 * k, 4 * k);
    }
    const silver = `${s.silver} silver`;
    if (this.silverText.text !== silver) this.silverText.setText(silver);
    this.silverText.setPosition(hx + s.balmMax * 12 * k + 8 * k, cy + 1 * k);
    const touch = w.controls.device === 'touch';
    this.touchUi.setVisible(touch);
    this.skillBar.setVisible(!touch);
    if (touch) this.drawTouchCooldowns(w); else this.drawSkillBar(w);
    this.updateInteractBtn();
  }

  /** Keyboard and pad: the three skills along the bottom, with their key, cost and cooldown. */
  private drawSkillBar(w: World) {
    const k = this.k, { width: W, height: H } = this.scale, p = w.player;
    const size = 34 * k, gap = 8 * k, total = SLOTS.length * size + (SLOTS.length - 1) * gap;
    const x0 = (W - total) / 2, y0 = H - (14 + safe.bottom) * k - size;
    const keys = w.controls.device === 'gamepad' ? ['R1', 'L2', 'R2'] : ['Q', 'E', 'R'];
    const g = this.skillG.clear();
    SLOTS.forEach((id, i) => {
      const def = SKILLS[id], x = x0 + i * (size + gap);
      const ready = p.cds[id] <= 0 && w.save.ce >= def.cost;
      g.fillStyle(0x0c0910, 0.82).fillRect(x, y0, size, size);
      g.lineStyle(1.2 * k, ready ? def.color : 0x5a5060, ready ? 0.9 : 0.6).strokeRect(x, y0, size, size);
      const cd = p.cds[id] / def.cd;
      if (cd > 0) g.fillStyle(0x000000, 0.55).fillRect(x, y0 + size * (1 - cd), size, size * cd);
      const label = `${def.short}\n${keys[i]} · ${def.cost}`;
      const t = this.skillTexts[i];
      if (t.text !== label) t.setText(label);
      t.setPosition(x + size / 2, y0 + size / 2).setAlpha(ready ? 1 : 0.5);
    });
  }

  /** Touch: each skill button darkens from the top while it recharges, and dims without the energy. */
  private drawTouchCooldowns(w: World) {
    const g = this.cdG.clear(), p = w.player;
    for (const b of this.btns) {
      const id = b.a === 'skill1' ? SLOTS[0] : b.a === 'skill2' ? SLOTS[1] : b.a === 'skill3' ? SLOTS[2] : null;
      if (b.a === 'heal') {
        const label = `BALM ${w.save.balm}`;
        if (b.t.text !== label) b.t.setText(label);
        b.t.setAlpha(w.save.balm > 0 ? 0.85 : 0.35);
        continue;
      }
      if (!id) continue;
      const def = SKILLS[id], cd = p.cds[id] / def.cd;
      b.t.setAlpha(w.save.ce >= def.cost ? 0.9 : 0.4);
      if (cd > 0) g.fillStyle(0x000000, 0.5).slice(b.x, b.y, b.r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * cd, false).fillPath();
    }
  }

  roomEntered(r: RoomDef) {
    this.roomText.setText(r.name.toUpperCase()).setAlpha(1);
    this.tweens.killTweensOf(this.roomText);
    this.tweens.add({ targets: this.roomText, alpha: 0, delay: 4500, duration: 1200 });
  }

  setHint(text: string | null) {
    if ((this.hintText.getData('t') ?? null) === text) return;
    this.hintText.setData('t', text);
    this.tweens.killTweensOf(this.hintText);
    if (text) { this.hintText.setText(this.keyNames(text)); this.tweens.add({ targets: this.hintText, alpha: 0.9, duration: 300 }); }
    else this.tweens.add({ targets: this.hintText, alpha: 0, duration: 400 });
  }

  setInteract(label: string | null) { this.interactLabel = label; }

  /** Hints name actions as {attack}; show the button or key for the device in use. */
  private keyNames(text: string) {
    const dev = this.world.controls.device;
    const names: Record<string, [string, string, string]> = {
      attack: ['STRIKE', 'J', '□ / X'], jump: ['JUMP', 'Space', '✕ / A'], dodge: ['DODGE', 'L', '○ / B'], interact: ['the context button', 'F', 'D-pad ↑'],
      heavy: ['a held STRIKE', 'K', '△ / Y'], parry: ['PARRY', 'I', 'L1'], heal: ['BALM', 'H', 'D-pad ↓'],
      skill1: [SKILLS[SLOTS[0]].short, 'Q', 'R1'], skill2: [SKILLS[SLOTS[1]].short, 'E', 'L2'], skill3: [SKILLS[SLOTS[2]].short, 'R', 'R2'],
      left: ['the stick', 'A / ←', 'the stick'], right: ['the stick', 'D / →', 'the stick'], down: ['the stick down', 'S / ↓', 'down'], up: ['the stick up', 'W / ↑', 'up'],
    };
    const i = dev === 'touch' ? 0 : dev === 'keyboard' ? 1 : 2;
    return text.replace(/\{(\w+)\}/g, (_m, a: string) => names[a]?.[i] ?? a);
  }

  toast(text: string) {
    const k = this.k;
    const t = this.add.text(0, 0, text, { fontFamily: 'Georgia, serif', fontSize: `${12 * k}px`, color: BONE, backgroundColor: 'rgba(10,8,15,0.88)', padding: { x: 10 * k, y: 5 * k }, wordWrap: { width: Math.min(this.scale.width * 0.4, 360 * k) } });
    this.toasts.unshift(t);
    while (this.toasts.length > 3) this.toasts.pop()!.destroy();
    this.toasts.forEach((x, i) => x.setPosition((14 + safe.left) * k, (70 + safe.top) * k + i * 30 * k));
    this.tweens.add({ targets: t, alpha: 0, delay: 3200, duration: 500, onComplete: () => { t.destroy(); this.toasts = this.toasts.filter((x) => x !== t); } });
  }

  banner(title: string, sub: string) {
    const k = this.k, { width: W, height: H } = this.scale;
    this.bannerBox?.destroy();
    const a = this.add.text(0, 0, title, { fontFamily: 'Cinzel, Georgia, serif', fontSize: `${Math.min(46, W / k / 14) * k}px`, color: '#f6dea0', fontStyle: 'bold', stroke: '#07050a', strokeThickness: 4 * k }).setOrigin(0.5).setLetterSpacing(6 * k);
    const b = this.add.text(0, 30 * k, sub, { fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: `${15 * k}px`, color: BONE, stroke: '#07050a', strokeThickness: 3 * k }).setOrigin(0.5);
    const box = (this.bannerBox = this.add.container(W / 2, H * 0.32, [a, b]).setAlpha(0));
    this.tweens.add({ targets: box, alpha: 1, duration: 400, yoyo: true, hold: 2200, onComplete: () => box.destroy() });
  }

  togglePause() {
    const w = this.world, k = this.k, { width: W, height: H } = this.scale;
    this.paused = !this.paused;
    this.pauseBox?.destroy();
    this.pauseBox = undefined;
    if (!this.paused) { w.physics.resume(); w.controls.flush(); return; }
    w.physics.pause();
    w.persist();
    const shade = this.add.rectangle(0, 0, W, H, 0x07060a, 0.72).setOrigin(0).setInteractive();
    const title = this.add.text(W / 2, H * 0.28, 'PAUSED', { fontFamily: 'Cinzel, Georgia, serif', fontSize: `${28 * k}px`, color: '#f6dea0', fontStyle: 'bold' }).setOrigin(0.5).setLetterSpacing(8 * k);
    const s = w.save;
    const info = this.add.text(W / 2, H * 0.28 + 34 * k, `${w.room.name} · level ${s.level} · ${s.kills} foes fallen`, { fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: `${13 * k}px`, color: BONE }).setOrigin(0.5);
    const mk = (label: string, y: number, go: () => void, key: string) => {
      const t = this.add.text(W / 2, y, label, { fontFamily: 'Cinzel, Georgia, serif', fontSize: `${17 * k}px`, color: BONE, backgroundColor: 'rgba(30,22,34,0.9)', padding: { x: 20 * k, y: 9 * k } }).setOrigin(0.5).setInteractive({ useHandCursor: true });
      t.setName(key);
      t.on('pointerup', go);
      return t;
    };
    const resume = mk('Resume', H * 0.52, () => this.togglePause(), 'pause_resume');
    const title2 = mk('Save and quit to title', H * 0.52 + 52 * k, () => {
      this.paused = false;
      w.persist();
      this.scene.stop('hud');
      w.scene.start('title');
    }, 'pause_title');
    const note = this.add.text(W / 2, H * 0.88, 'Phaser rebuild · menus, gear, Echoes and story arrive in later parts', { fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: `${11 * k}px`, color: '#9b92a6' }).setOrigin(0.5);
    this.pauseBox = this.add.container(0, 0, [shade, title, info, resume, title2, note]).setDepth(100);
  }

  // ---------------------------------------------------------------- touch

  private buildTouch() {
    const k = this.k;
    this.input.addPointer(4);
    this.touchUi = this.add.container(0, 0).setDepth(50);
    const mk = (a: Action, label: string, r: number): Btn => {
      const g = this.add.circle(0, 0, r * k, 0x1a1420, 0.35).setStrokeStyle(1.5 * k, 0xe2b85a, 0.55);
      const t = this.add.text(0, 0, label, { fontFamily: 'Cinzel, Georgia, serif', fontSize: `${(r > 30 ? 13 : r < 20 ? 8 : 10) * k}px`, color: '#f6dea0' }).setOrigin(0.5).setAlpha(0.85);
      this.touchUi.add([g, t]);
      return { a, x: 0, y: 0, r: r * k, label, g, t, down: false };
    };
    this.btns = [
      mk('attack', 'STRIKE', 36), mk('jump', 'JUMP', 28), mk('dodge', 'DODGE', 24), mk('parry', 'PARRY', 24), mk('interact', '', 22),
      mk('heal', 'BALM', 19), ...SLOTS.map((id, i) => mk(`skill${i + 1}` as Action, SKILLS[id].short, 19)),
    ];
    this.cdG = this.add.graphics();
    this.touchUi.add(this.cdG);
    this.stick.base = this.add.circle(0, 0, 54 * k, 0x1a1420, 0.25).setStrokeStyle(1.5 * k, 0xe2b85a, 0.3).setVisible(false);
    this.stick.knob = this.add.circle(0, 0, 22 * k, 0xe2b85a, 0.35).setVisible(false);
    this.touchUi.add([this.stick.base, this.stick.knob]);
    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
    this.input.on('pointerupoutside', this.onUp, this);
  }

  private placeTouch() {
    const k = this.k, { width: W, height: H } = this.scale;
    const rx = W - (24 + safe.right) * k, by = H - (24 + Math.max(safe.bottom, 6)) * k;
    // Thumb reach: STRIKE in the corner, JUMP beside it, DODGE and PARRY above; skills in an arc over them.
    const pos: Record<string, [number, number]> = {
      attack: [rx - 42 * k, by - 40 * k],
      jump: [rx - 120 * k, by - 22 * k],
      dodge: [rx - 26 * k, by - 120 * k],
      parry: [rx - 100 * k, by - 98 * k],
      interact: [rx - 186 * k, by - 50 * k],
      heal: [rx - 174 * k, by - 112 * k],
      skill1: [rx - 140 * k, by - 162 * k],
      skill2: [rx - 86 * k, by - 172 * k],
      skill3: [rx - 32 * k, by - 182 * k],
    };
    for (const b of this.btns) {
      [b.x, b.y] = pos[b.a];
      b.g.setPosition(b.x, b.y);
      b.t.setPosition(b.x, b.y);
    }
  }

  private updateInteractBtn() {
    const b = this.btns.find((x) => x.a === 'interact')!;
    const on = !!this.interactLabel;
    b.g.setVisible(on);
    b.t.setVisible(on).setText((this.interactLabel ?? '').toUpperCase());
  }

  private btnAt(x: number, y: number) {
    for (const b of this.btns) {
      if (!b.g.visible) continue;
      // A forgiving target: a little larger than the drawn circle.
      if (Phaser.Math.Distance.Between(x, y, b.x, b.y) < b.r * 1.25) return b;
    }
    return null;
  }

  private onDown(p: Phaser.Input.Pointer) {
    if (this.paused || (!p.wasTouch && !this.touchUi.visible)) return;
    const c = this.world.controls;
    const b = this.btnAt(p.x, p.y);
    if (b) {
      b.down = true;
      b.g.setFillStyle(0xe2b85a, 0.35);
      b.g.setData('pid', p.id);
      c.setTouch(b.a, true);
      return;
    }
    // Anywhere else on the left half starts the stick where the thumb lands.
    if (p.x < this.scale.width * 0.5 && this.stick.id < 0) {
      this.stick.id = p.id;
      this.stick.ox = p.x;
      this.stick.oy = p.y;
      this.stick.base!.setPosition(p.x, p.y).setVisible(true);
      this.stick.knob!.setPosition(p.x, p.y).setVisible(true);
      c.setTouchAxis(0);
    }
  }

  private onMove(p: Phaser.Input.Pointer) {
    if (p.id !== this.stick.id) return;
    const k = this.k, c = this.world.controls;
    const dx = p.x - this.stick.ox, dy = p.y - this.stick.oy;
    const max = 46 * k, len = Math.hypot(dx, dy), m = Math.min(1, max / Math.max(1, len));
    this.stick.knob!.setPosition(this.stick.ox + dx * m, this.stick.oy + dy * m);
    // A small dead zone, then full speed quickly: thumbs are imprecise.
    const ax = Math.abs(dx) < 8 * k ? 0 : Phaser.Math.Clamp(dx / (max * 0.7), -1, 1);
    c.setTouchAxis(ax);
    c.setTouch('down', dy > max * 0.6);
    c.setTouch('up', dy < -max * 0.6);
  }

  private onUp(p: Phaser.Input.Pointer) {
    const c = this.world.controls;
    if (p.id === this.stick.id) {
      this.stick.id = -1;
      this.stick.base!.setVisible(false);
      this.stick.knob!.setVisible(false);
      c.setTouchAxis(0);
      c.setTouch('down', false);
      c.setTouch('up', false);
    }
    for (const b of this.btns) if (b.down && b.g.getData('pid') === p.id) {
      b.down = false;
      b.g.setFillStyle(0x1a1420, 0.35);
      c.setTouch(b.a, false);
    }
  }
}
