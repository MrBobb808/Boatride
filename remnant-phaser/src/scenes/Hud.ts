// The HUD and touch controls, drawn over the world in screen pixels (device
// pixels: `k` is CSS-to-device, so sizes below are written in CSS px × k).
// Top-left: level, health, experience, silver. Toasts under it, banners in the
// middle, the room name and hints top-right. On touch: a floating stick on the
// left half, attack / jump / dodge on the right, and a context button to talk,
// rest or open. Everything stays inside the iPhone's safe areas.

import Phaser from 'phaser';
import { STYLE_NAMES, STYLE_HELP, RANKS } from '../game/style';
import { xpToNext, type RoomDef } from '../shared';
import { SKILLS, SLOTS, skillSlots, ARCHER, ARCHER_IDS } from '../game/abilities';
import { bakeAbilityIcons, abilityIconKey } from '../game/abilityIcons';
import { dpr } from '../game/screen';
import { measureSafe, safe } from '../game/safe';
import type { Action } from '../game/controls';
import type { World } from './World';
import { openMenu, closeMenu, isMenuOpen } from '../../../remnant/src/ui/menus';
import { settings, onSettingsChange } from '../classic/shim/settings';
import { controlSpot } from '../../../remnant/src/ui/touch';
import { drawIsland, islandSide } from '../../../remnant/src/ui/island';
import { measureSafe as measureSharedSafe } from '../../../remnant/src/ui/safe';
import { haptic } from '../../../remnant/src/core/haptics';
import { icon } from '../../../remnant/src/ui/icons';
import { guidePoint } from '../../../remnant/src/game/guide';
import { G } from '../classic/shim/ctx';
import { audio } from '../classic/shim/audio';
import { input } from '../classic/shim/input';
import { songs } from '../../../remnant/src/audio/songs';

const GOLD = '#e2b85a', BONE = '#ddd4c6';

/** This frame's HUD boxes in screen pixels, [x, y, w, h] (zero when absent), for layout checks. */
export const hudBoxes = { column: [0, 0, 0, 0], boss: [0, 0, 0, 0] };
const box = (b: number[], x: number, y: number, w: number, h: number) => { b[0] = x; b[1] = y; b[2] = w; b[3] = h; };

interface Btn { a: Action; x: number; y: number; r: number; label: string; i: Phaser.GameObjects.Image; g: Phaser.GameObjects.Arc; t: Phaser.GameObjects.Text; down: boolean }

export class Hud extends Phaser.Scene {
  get paused() { return isMenuOpen(); }
  private k = 1;
  private bars!: Phaser.GameObjects.Graphics;
  private levelText!: Phaser.GameObjects.Text;
  private hpText!: Phaser.GameObjects.Text;
  private silverText!: Phaser.GameObjects.Text;
  private roomText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private bannerBox?: Phaser.GameObjects.Container;
  private toasts: Phaser.GameObjects.Text[] = [];
  private hpGhost = 1;
  btns: Btn[] = [];
  private stick = { id: -1, ox: 0, oy: 0, base: null as Phaser.GameObjects.Arc | null, knob: null as Phaser.GameObjects.Arc | null };
  private touchUi!: Phaser.GameObjects.Container;
  private interactLabel: string | null = null;
  private menuBtn!: Phaser.GameObjects.Text;
  private pausePointer = -1;
  private heroBtn!: Phaser.GameObjects.Text;
  private styleBtn!: Phaser.GameObjects.Text;
  private styleRank!: Phaser.GameObjects.Text;
  /** The keyboard and pad skill bar along the bottom (touch has its buttons). */
  private skillBar!: Phaser.GameObjects.Container;
  private skillG!: Phaser.GameObjects.Graphics;
  private skillTexts: Phaser.GameObjects.Text[] = [];
  /** The skill bar's ability icons, and the recharge shade drawn over them. */
  private skillIcons: Phaser.GameObjects.Image[] = [];
  private skillCdG!: Phaser.GameObjects.Graphics;
  /** Cooldown shading over the touch buttons. */
  private cdG!: Phaser.GameObjects.Graphics;
  private balmText!: Phaser.GameObjects.Text;
  private bossName: string | null = null;
  private bossSub = '';
  private bossGhost = 1;
  private bossG!: Phaser.GameObjects.Graphics;
  private bossTitle!: Phaser.GameObjects.Text;
  private bossSubText!: Phaser.GameObjects.Text;
  /** A boss's spoken line, along the bottom, and the letterbox of its entrance. */
  private captionText!: Phaser.GameObjects.Text;
  /** How many Echoes are out, under the silver. */
  private echoText!: Phaser.GameObjects.Text;
  private coachAction: string | null = null;
  private islandTex?: Phaser.Textures.CanvasTexture;
  private islandImg?: Phaser.GameObjects.Image;
  private guideText?: Phaser.GameObjects.Text;
  private powerText!: Phaser.GameObjects.Text;
  /** The Echo command wheel (the original's ui/ui.ts openWheel): open while it is shown, and the world waits. */
  wheelOpen = false;
  private wheelBox?: Phaser.GameObjects.Container;
  private wheelItems: { label: string; on?: boolean; page?: boolean; run: () => void; t: Phaser.GameObjects.Text }[] = [];
  private wheelSel = 0;
  private wheelNavT = 0;
  private barsG!: Phaser.GameObjects.Graphics;
  private barsAmt = 0;
  private barsOn = false;

  constructor() { super('hud'); }

  private get world() { return this.scene.get('world') as World; }

  create() {
    this.world.controls.flush();
    // Phaser reuses this scene after Continue and rotation, but destroys its objects.
    this.skillTexts = []; this.skillIcons = []; this.toasts = []; this.bannerBox = this.guideText = this.wheelBox = undefined;
    this.wheelItems = []; this.wheelOpen = false; this.wheelSel = this.wheelNavT = 0;
    this.interactLabel = this.coachAction = null;
    this.hpGhost = this.bossGhost = 1; this.barsAmt = 0; this.pausePointer = -1;
    this.stick.id = -1; this.stick.base = this.stick.knob = null;
    // Device pixels, times the original's HUD scale for the screen size.
    const cw = this.scale.width / dpr(), ch = this.scale.height / dpr();
    this.k = dpr() * Phaser.Math.Clamp(Math.min(ch / 430, cw / 900), 0.85, 1.6);
    measureSafe(); measureSharedSafe();
    const coach = (event: Event) => { this.coachAction = (event as CustomEvent).detail; };
    document.addEventListener('remnant-coach', coach);
    this.events.once('shutdown', () => { document.removeEventListener('remnant-coach', coach); if (this.islandTex) this.textures.remove(this.islandTex.key); this.islandTex = undefined; this.islandImg = undefined; });
    const k = this.k;
    const font = (px: number, color = BONE, bold = false) => ({ fontFamily: 'Cinzel, Georgia, serif', fontSize: `${px * k}px`, color, fontStyle: bold ? 'bold' : '', stroke: '#07050a', strokeThickness: 3 * k });
    this.bars = this.add.graphics();
    this.levelText = this.add.text(0, 0, '', font(12, '#f6dea0', true)).setOrigin(0.5);
    this.hpText = this.add.text(0, 0, '', font(8.5)).setOrigin(1, 0.5);
    this.silverText = this.add.text(0, 0, '', font(8.5)).setOrigin(0, 0.5);
    this.roomText = this.add.text(0, 0, '', font(9, GOLD)).setOrigin(1, 0).setAlpha(0);
    this.hintText = this.add.text(0, 0, '', { ...font(10), fontFamily: 'Georgia, serif', fontStyle: 'italic', wordWrap: { width: 260 * k }, align: 'center' }).setOrigin(0.5, 0).setAlpha(0);
    this.menuBtn = this.add.text(0, 0, '❚❚', font(14, BONE)).setOrigin(1, 0).setInteractive({ useHandCursor: true }).setPadding(10 * k, 6 * k, 10 * k, 6 * k);
    // DOM Resume can close its overlay before Phaser processes the release.
    // Only a press that began on this canvas button may activate it.
    this.menuBtn.on('pointerdown', (p: Phaser.Input.Pointer) => { if (!this.paused) this.pausePointer = p.id; });
    this.menuBtn.on('pointerout', () => { this.pausePointer = -1; });
    this.menuBtn.on('pointerup', (p: Phaser.Input.Pointer) => {
      const pressedHere = this.pausePointer === p.id;
      this.pausePointer = -1;
      if (pressedHere) this.togglePause();
    });
    // Small chips under Elior's column: they stay reachable without covering the fight.
    this.heroBtn = this.add.text(0,0,'',font(8,'#a6efdc',true)).setOrigin(0,0.5).setPadding(7*k,5*k).setBackgroundColor('rgba(16,35,41,0.82)').setInteractive({useHandCursor:true}).setName('hero_swap');
    this.styleBtn = this.add.text(0,0,'',font(8,'#f6dea0',true)).setOrigin(0,0.5).setPadding(7*k,5*k).setBackgroundColor('rgba(39,32,48,0.82)').setInteractive({useHandCursor:true}).setName('style_cycle');
    this.styleRank = this.add.text(0,0,'',font(16,'#e7c979',true)).setOrigin(1,0).setName('style_rank');
    for (const [button,run] of [[this.heroBtn,()=>{if(this.world.player.switchHero())this.world.persist();}], [this.styleBtn,()=>this.openWheel('heroes')]] as const) {
      button.on('pointerdown',(p:Phaser.Input.Pointer)=>{if(p.wasTouch)input.setDevice('touch');button.setData('pid',p.id);});
      button.on('pointerout',()=>button.setData('pid',-1));
      button.on('pointerup',(p:Phaser.Input.Pointer)=>{const ok=button.getData('pid')===p.id;button.setData('pid',-1);if(ok&&this.world.canUseKit)run();});
    }
    this.balmText = this.add.text(0, 0, '', font(8.5)).setOrigin(0, 0.5);
    this.echoText = this.add.text(0, 0, '', font(8, '#e2d6b8')).setOrigin(0, 0.5);
    this.bossG = this.add.graphics();
    this.bossTitle = this.add.text(0, 0, '', font(11, '#f6dea0', true)).setOrigin(0.5);
    this.bossSubText = this.add.text(0, 0, '', { ...font(9.5, '#9b92a6'), fontFamily: 'Georgia, serif', fontStyle: 'italic' }).setOrigin(0.5);
    this.barsG = this.add.graphics().setDepth(40);
    this.captionText = this.add.text(0, 0, '', { ...font(11), fontFamily: 'Georgia, serif', fontStyle: 'italic', align: 'center', wordWrap: { width: 520 * k } }).setOrigin(0.5, 1).setDepth(41).setAlpha(0);
    this.powerText = this.add.text(0, 0, '', font(8.5, '#b8bdff'));
    this.skillG = this.add.graphics();
    this.skillBar = this.add.container(0, 0, [this.skillG]);
    bakeAbilityIcons(this);
    SLOTS.forEach(() => { const i = this.add.image(0, 0, abilityIconKey('sword_word')).setVisible(false); this.skillIcons.push(i); this.skillBar.add(i); });
    this.skillCdG = this.add.graphics();
    this.skillBar.add(this.skillCdG);
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
    measureSafe(); measureSharedSafe();
    const k = this.k, { width: W, height: H } = this.scale;
    this.cameras.main.setSize(W, H);
    const x0 = (12 + safe.left) * k, y0 = (10 + safe.top) * k;
    this.levelText.setPosition(x0 + 15 * k, y0 + 15 * k);
    this.roomText.setPosition(W - (12 + safe.right + 44) * k, y0 + 4 * k);
    this.menuBtn.setPosition(W - (6 + safe.right) * k, y0 - 6 * k);
    this.hintText.setPosition(W / 2, H * 0.16).setWordWrapWidth(Math.min(W * 0.5, 320 * k));
    this.captionText.setPosition(W / 2, H - (Math.max(safe.bottom, 6) + 46) * k).setWordWrapWidth(Math.min(W * 0.7, 520 * k));
    this.styleRank.setPosition(W-(14+safe.right)*k,(78+safe.top)*k);
    this.placeTouch();
  }

  // ---------------------------------------------------------------- per frame

  sync(w: World) {
    const k = this.k, s = w.save, p = w.player;
    const keys = w.controls.device === 'keyboard';
    const heroLabel = `${keys ? 'N  ' : ''}⇄ ${p.hero === 'elior' ? 'TIRZAH' : 'ELIOR'}`, styleLabel = `${keys ? 'B  ' : ''}${STYLE_NAMES[p.combatStyle].toUpperCase()}`;
    if (this.heroBtn.text !== heroLabel) this.heroBtn.setText(heroLabel);
    if (this.styleBtn.text !== styleLabel) this.styleBtn.setText(styleLabel);
    const kitOn = w.canUseKit && !p.dead;
    this.heroBtn.setVisible(kitOn); this.styleBtn.setVisible(kitOn);
    this.styleRank.setText(p.styleMeter.score > 1 ? `${RANKS[p.styleMeter.rank]}  ·  ${p.comboHits} HITS` : '').setVisible(!G.inCutscene && !this.paused);
    const px = dpr(), cw = this.scale.width / px, ch = this.scale.height / px;
    const side = islandSide();
    if (side) {
      if (!this.islandTex) { const key = 'island-' + Date.now(); this.islandTex = this.textures.createCanvas(key, 180, Math.ceil(ch))!; this.islandImg = this.add.image(0, 0, key).setOrigin(0).setDepth(40); }
      if (this.islandTex.height !== Math.ceil(ch)) this.islandTex.setSize(180, Math.ceil(ch));
      const x = side === 'left' ? 0 : cw - 180, c = this.islandTex.getContext(); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, 180, ch); c.save(); c.translate(-x, 0); drawIsland(c, cw, ch, Math.min(this.game.loop.delta / 1000, 1 / 30)); c.restore(); this.islandTex.refresh(); this.islandImg!.setPosition(x * px, 0).setScale(px).setVisible(true);
    } else this.islandImg?.setVisible(false);
    if (!this.guideText) this.guideText = this.add.text(0, 0, '', { fontFamily: 'Georgia,serif', fontSize: `${10 * k}px`, color: GOLD, stroke: '#07060a', strokeThickness: 2 }).setDepth(5);
    const guide = settings.guide && !G.inCutscene && !w.classic.bossActive ? guidePoint() : null;
    const rounds = w.classic.story.ch3.rounds;
    if (rounds.active) this.guideText.setText(`${rounds.daily ? 'WAVE' : 'ROUND'} ${rounds.round || 1} · ${rounds.left} remaining${rounds.breakT > 0 ? ' · ' + Math.ceil(rounds.breakT) + 's' : ''}`).setPosition(12 * k, this.scale.height * 0.36);
    else if (guide) this.guideText.setText((guide.point.x > p.x ? '→ ' : '← ') + guide.target.label).setPosition((12 + safe.left) * k, 115 * k);
    else this.guideText.setText('');
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
    // The Echoes out, of the lineup (and the Switch's cooldown).
    const sq = w.classic.squad, total = s.echoes.length;
    if (total) {
      cy += 12 * k;
      const echo = `Echoes ${sq.echoes.length}/${Math.min(total, w.d.echoSlots)}${sq.switchCd > 0 ? ` · switch ${Math.ceil(sq.switchCd)}s` : ''}`;
      if (this.echoText.text !== echo) this.echoText.setText(echo);
      this.echoText.setPosition(hx, cy + 1 * k);
    }
    this.echoText.setVisible(total > 0);
    cy += 13 * k;
    const form = p.hero === 'tirzah' ? 'Wings' : 'Mantle';
    const power = `Super ${Math.floor(s.rally)}%${s.level >= 25 ? p.mantleT > 0 ? ` · ${form} ${Math.ceil(p.mantleT)}s` : ` · ${form} ${Math.floor(s.mantle ?? 0)}%` : ''}${s.sub ? ` · ${s.sub.replace('_', ' ')} ${s.hearts ?? 0}♥` : ''}`;
    this.powerText.setText(power).setPosition(hx, cy);
    const touch = w.controls.device === 'touch';
    box(hudBoxes.column, x0, y0, hx + hw - x0, cy - y0 + 8 * k);
    const chipY = cy + 22 * k;
    this.heroBtn.setPosition(hx, chipY);
    this.styleBtn.setPosition(hx + this.heroBtn.displayWidth + 6 * k, chipY);
    // Toasts stack below the column (and the chips), never over the stats.
    const toastY = chipY + (this.heroBtn.visible ? 18 : 0) * k;
    this.toasts.forEach((t, i) => t.setPosition(hx - 20 * k, toastY + i * 30 * k));
    this.drawBoss(w, touch, hx + hw);
    this.touchUi.setVisible(touch);
    // Hidden in story scenes, and until an ability is carried.
    this.skillBar.setVisible(!touch && !G.inCutscene && skillSlots(s).some(Boolean));
    for(const b of this.btns) { if(b.a==='attack')b.t.setText(p.hero==='tirzah'?'SHOOT':'STRIKE');if(b.a==='heavy')b.t.setText(p.hero==='tirzah'?'DRAW':'HEAVY'); }
    if (touch) this.drawTouchCooldowns(w); else this.drawSkillBar(w);
    this.updateInteractBtn();
    for (const b of this.btns) {
      b.i.setVisible(b.g.visible); b.t.setVisible(b.g.visible && settings.buttonLabels);
      b.g.setStrokeStyle(1.5 * k, 0xe2b85a, 0.55);
    }
    const coached = this.btns.find(b => b.a === this.coachAction);
    if (coached && !G.paused && !G.inCutscene) coached.g.setStrokeStyle(3 * k, 0xffe6a8, 0.55 + Math.sin(this.time.now / 140) * 0.4);
  }

  /** Keyboard and pad: the three skills along the bottom, with their key, cost and cooldown. */
  private drawSkillBar(w: World) {
    const k = this.k, { width: W, height: H } = this.scale, p = w.player;
    const size = 40 * k, gap = 8 * k, total = SLOTS.length * size + (SLOTS.length - 1) * gap;
    // The bottom-right corner: Elior stands near the bottom middle of the view.
    const x0 = W - (16 + safe.right) * k - total, y0 = H - (14 + safe.bottom) * k - size;
    const keys = w.controls.device === 'gamepad' ? ['R1', 'L2', 'R2'] : ['Q', 'E', 'R'];
    const g = this.skillG.clear(), cdG = this.skillCdG.clear();
    skillSlots(w.save).forEach((id, i) => {
      const x = x0 + i * (size + gap), icon = this.skillIcons[i], t = this.skillTexts[i];
      if (!id) {
        g.fillStyle(0x0c0910, 0.82).fillRect(x, y0, size, size);
        icon.setVisible(false);
        t.setText(`EMPTY\n${keys[i]}`).setPosition(x + size / 2, y0 + size / 2).setAlpha(0.4);
        return;
      }
      const def = SKILLS[id];
      const ready = p.cds[id] <= 0 && w.save.ce >= def.cost;
      g.fillStyle(0x0c0910, 0.82).fillRect(x, y0, size, size);
      g.lineStyle(1.2 * k, ready ? def.color : 0x5a5060, ready ? 0.9 : 0.6).strokeRect(x, y0, size, size);
      // The ability's own picture above its key and cost; the recharge darkens it from the top.
      icon.setTexture(abilityIconKey(id)).setPosition(x + size / 2, y0 + size * 0.4).setDisplaySize(size * 0.68, size * 0.68).setAlpha(ready ? 1 : 0.55).setVisible(true);
      const cd = p.cds[id] / def.cd;
      if (cd > 0) cdG.fillStyle(0x000000, 0.55).fillRect(x, y0 + size * (1 - cd), size, size * cd);
      const label = `${keys[i]} · ${def.cost}`;
      if (t.text !== label) t.setText(label);
      t.setPosition(x + size / 2, y0 + size * 0.84).setAlpha(ready ? 1 : 0.5);
    });
  }

  /** Touch: each skill button darkens from the top while it recharges, and dims without the energy. */
  private drawTouchCooldowns(w: World) {
    const g = this.cdG.clear(), p = w.player;
    for (const b of this.btns) {
      const slots = skillSlots(w.save);
      const slot = b.a === 'skill1' ? 0 : b.a === 'skill2' ? 1 : b.a === 'skill3' ? 2 : -1;
      const id = slot >= 0 ? slots[slot] : null;
      if (b.a === 'heal') {
        const label = `BALM ${w.save.balm}`;
        if (b.t.text !== label) b.t.setText(label);
        b.t.setAlpha(w.save.balm > 0 ? 0.85 : 0.35);
        continue;
      }
      if (b.a === 'ultimate' || b.a === 'transform') {
        const ready = b.a === 'ultimate' ? w.save.rally >= 100 : (w.save.mantle ?? 0) >= 100 && p.mantleT <= 0;
        b.t.setAlpha(ready ? 1 : 0.4); b.g.setStrokeStyle(1.5 * this.k, ready ? 0xb8bdff : 0xe2b85a, ready ? 1 : 0.4); continue;
      }
      if (b.a === 'sub') { b.t.setText(p.mantleT > 0 ? 'THROW' : 'SUB'); continue; }
      if (!id) { if (slot >= 0) b.t.setText('EMPTY').setAlpha(0.35); continue; }
      b.i.setTexture(abilityIconKey(id));
      const def = SKILLS[id], cd = p.cds[id] / def.cd;
      if (b.t.text !== def.short) b.t.setText(def.short);
      b.t.setAlpha(w.save.ce >= def.cost ? 0.9 : 0.4);
      if (cd > 0) g.fillStyle(0x000000, 0.5).slice(b.x, b.y, b.r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * cd, false).fillPath();
    }
  }

  /** Show (or with null, hide) the boss bar. */
  bossBar(name: string | null, sub = '') {
    this.bossName = name;
    this.bossSub = sub;
    if (name) this.bossGhost = 1;

  }

  /**
   * The boss bar. On a phone it takes its own lane along the top, between
   * Elior's column and the pause button, so the two health bars never cross
   * (as in the original's ui/hud.ts); on keyboard and pad it sits at the bottom.
   */
  private drawBoss(w: World, touch: boolean, colRight: number) {
    this.drawBars();
    const g = this.bossG.clear(), b = w.bossView, k = this.k, { width: W, height: H } = this.scale;
    const show = !!(this.bossName && b && b.alive && b.state !== 'dormant' && b.state !== 'intro');
    this.bossTitle.setVisible(show);
    this.bossSubText.setVisible(show && !touch);
    box(hudBoxes.boss, 0, 0, 0, 0);
    if (!show || !b) return;
    let bw = Math.min(W * 0.46, 460 * k), bx = (W - bw) / 2, by = H - (Math.max(safe.bottom, 6) + 84) * k;
    {
      // Its own lane along the top, between Elior's column and the pause button, on every device.
      const left = colRight + 18 * k, right = W - (safe.right + 12 + 52) * k;
      bw = Math.min(right - left, 460 * k);
      bx = left + (right - left - bw) / 2;
      by = (10 + safe.top + 16) * k;
      // The room name steps aside while the fight is on.
      this.roomText.setAlpha(0);
    }
    const f = Phaser.Math.Clamp(b.hp / b.maxHp, 0, 1);
    this.bossGhost = Phaser.Math.Linear(this.bossGhost, f, 0.05);
    const bh = 8 * k;
    g.fillStyle(0x0a070c, 0.85).fillRect(bx - k, by - k, bw + 2 * k, bh + 2 * k);
    g.fillStyle(0xf0d8c0, 0.45).fillRect(bx, by, bw * this.bossGhost, bh);
    g.fillStyle(b.ward ? 0x8a7a6a : 0xd8902a, 1).fillRect(bx, by, bw * f, bh);
    g.fillStyle(0xffd27a, 1).fillRect(bx, by, bw * f, 2 * k);
    g.lineStyle(k, 0xe2b85a, 0.8).strokeRect(bx - k, by - k, bw + 2 * k, bh + 2 * k);
    for (const m of b.phaseMarks) g.fillStyle(0x000000, 0.7).fillRect(bx + bw * m - k, by - 2 * k, 2 * k, bh + 4 * k);
    // Poise: when it empties, the boss kneels.
    if (b.state !== 'kneel') {
      g.fillStyle(0xffffff, 0.08).fillRect(bx, by + bh + 2 * k, bw, 2 * k);
      g.fillStyle(0xe8d8a8, 1).fillRect(bx, by + bh + 2 * k, bw * Phaser.Math.Clamp(b.poise / b.maxPoise, 0, 1), 2 * k);
    }
    const title = this.bossName!.toUpperCase();
    if (this.bossTitle.text !== title) this.bossTitle.setText(title);
    this.bossTitle.setPosition(bx + bw / 2, by - 8 * k);
    if (this.bossSubText.text !== this.bossSub) this.bossSubText.setText(this.bossSub);
    this.bossSubText.setPosition(bx + bw / 2, by + bh + 14 * k);
    box(hudBoxes.boss, bx, by - 15 * k, bw, bh + 21 * k);
  }

  /** A boss speaks (null to clear). */
  caption(text: string | null) {
    this.tweens.killTweensOf(this.captionText);
    if (text) this.captionText.setText(text).setAlpha(1);
    else this.tweens.add({ targets: this.captionText, alpha: 0, duration: 300 });
  }

  /** The letterbox bars of a boss's entrance. */
  cinematicBars(on: boolean) { this.barsOn = on; }

  private drawBars() {
    this.barsAmt = Phaser.Math.Clamp(this.barsAmt + (this.barsOn ? 0.08 : -0.08), 0, 1);
    const g = this.barsG.clear();
    if (this.barsAmt <= 0) return;
    const { width: W, height: H } = this.scale, h = H * 0.09 * this.barsAmt;
    g.fillStyle(0x000000, 1).fillRect(0, 0, W, h).fillRect(0, H - h, W, h);
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
    const namesOfSkills = skillSlots(this.world.save).map((id) => id ? SKILLS[id].short : 'EMPTY');
    const names: Record<string, [string, string, string]> = {
      move: ['the left stick', 'A / D or the arrows', 'the left stick'],
      attack: ['STRIKE', 'J', '□ / X'], jump: ['JUMP', 'Space', '✕ / A'], dodge: ['DODGE', 'L', '○ / B'], interact: ['the context button', 'F', 'D-pad ↑'],
      heavy: ['a held STRIKE', 'K', '△ / Y'], parry: ['PARRY', 'I', 'L1'], heal: ['BALM', 'H', 'D-pad ↓'],
      skill1: [namesOfSkills[0], 'Q', 'R1'], skill2: [namesOfSkills[1], 'E', 'L2'], skill3: [namesOfSkills[2], 'R', 'R2'],
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

  /** The pause menu: the original's sectioned menu (src/ui/menu.ts) over a held world. */
  togglePause() {
    const w = this.world;
    if (this.paused) { closeMenu(); return; }
    w.persist();
    openMenu();
  }

  // ---------------------------------------------------------------- touch

  private iconKey(name: string) {
    const key = 'phaser-touch-' + name;
    if (!this.textures.exists(key)) this.textures.addCanvas(key, icon(name, '#f6dea0', 64));
    return key;
  }
  private buildTouch() {
    const k = this.k;
    this.input.addPointer(4);
    this.touchUi = this.add.container(0, 0).setDepth(50);
    const mk = (a: Action, label: string, r: number): Btn => {
      const g = this.add.circle(0, 0, r * k, 0x1a1420, 0.35).setStrokeStyle(1.5 * k, 0xe2b85a, 0.55);
      const t = this.add.text(0, 0, label, { fontFamily: 'Cinzel, Georgia, serif', fontSize: `${(r > 30 ? 13 : r < 20 ? 8 : 10) * k}px`, color: '#f6dea0' }).setOrigin(0.5).setAlpha(0.85);
      const name = a === 'transform' ? 'mantle' : a === 'ultimate' ? 'rally' : a.startsWith('skill') ? 'arc' : a;
      const i = this.add.image(0, 0, this.iconKey(name));
      this.touchUi.add([g, i, t]);
      return { a, i, x: 0, y: 0, r: r * k, label, g, t, down: false };
    };
    this.btns = [
      mk('attack', 'STRIKE', 36), mk('jump', 'JUMP', 28), mk('dodge', 'DODGE', 24), mk('parry', 'PARRY', 24), mk('interact', '', 22),
      mk('heal', 'BALM', 19), ...SLOTS.map((_, i) => mk(`skill${i + 1}` as Action, '', 19)),
      mk('echo', 'ECHOES', 18), mk('switch', 'SWITCH', 18),
      mk('transform', 'MANTLE', 18), mk('ultimate', 'SUPER', 18), mk('sub', 'SUB', 18),
    ];
    this.cdG = this.add.graphics();
    this.touchUi.add(this.cdG);
    this.stick.base = this.add.circle(0, 0, 54 * k, 0x1a1420, 0.25).setStrokeStyle(1.5 * k, 0xe2b85a, 0.3).setVisible(false);
    this.stick.knob = this.add.circle(0, 0, 22 * k, 0xe2b85a, 0.35).setVisible(false);
    this.touchUi.add([this.stick.base, this.stick.knob]);
    onSettingsChange(() => { if (this.scene.isActive()) this.placeTouch(); });
    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
    this.input.on('pointerupoutside', this.onUp, this);
  }

  private placeTouch() {
    const px = dpr(), W = this.scale.width / px, H = this.scale.height / px;
    measureSharedSafe();
    for (const b of this.btns) {
      const id = b.a === 'ultimate' ? 'rally' : b.a === 'transform' ? 'mantle' : b.a;
      const p = controlSpot(id, W, H, settings.touchScale, settings.touchLayout ?? {}, settings.leftHanded);
      b.x = p.cx * px; b.y = p.cy * px; b.r = p.r * px;
      b.g.setPosition(b.x, b.y).setRadius(b.r).setAlpha(settings.touchOpacity);
      b.i.setPosition(b.x, b.y).setDisplaySize(b.r * 1.15, b.r * 1.15);
      b.t.setPosition(b.x, b.y + b.r + 7 * px);
    }
  }

  private updateInteractBtn() {
    const b = this.btns.find((x) => x.a === 'interact')!;
    const on = !!this.interactLabel;
    b.g.setVisible(on);
    b.t.setVisible(on).setText((this.interactLabel ?? '').toUpperCase());
    // The Echo buttons appear once there is an Echo to command.
    const echoes = this.world.save.echoes.length > 0;
    for (const x of this.btns) if (x.a === 'echo' || x.a === 'switch') { x.g.setVisible(echoes); x.t.setVisible(echoes); }
    for (const x of this.btns) {
      if (x.a === 'transform') { x.g.setVisible(this.world.save.level >= 25); x.t.setVisible(this.world.save.level >= 25); }
      if (x.a === 'ultimate') { x.g.setVisible(!!this.world.save.flags.relic_taken); x.t.setVisible(!!this.world.save.flags.relic_taken); }
      if (x.a === 'sub') { const on = !!this.world.save.sub || this.world.player.mantleT > 0; x.g.setVisible(on); x.t.setVisible(on); }
    }
  }

  // ---------------------------------------------------------------- the Echo wheel

  /** Open the Echo command wheel at a page; the world waits while it is up. */
  openWheel(page: 'main' | 'squad' | 'orders' | 'heroes' | 'archer' = 'main') {
    const w = this.world, s = w.save, sq = w.classic.squad;
    if (!s.echoes.length && page !== 'heroes' && page !== 'archer') page = 'heroes';
    this.closeWheel(false);
    this.wheelOpen = true;
    w.physics.pause();
    const cmd = (c: Parameters<typeof sq.echoCommand>[0]) => () => sq.echoCommand(c);
    type Item = { label: string; on?: boolean; page?: boolean; run: () => void };
    let title: string, sub: string, items: Item[];
    if (page === 'heroes') {
      title = 'Remnant fighters'; sub = 'Shared journey, health and equipment · N: tag · B: style';
      items = [
        {label:w.player.hero==='elior'?'Switch to Tirzah · bow':'Switch to Elior · blade',run:()=>{if(w.player.switchHero())w.persist();}},
        ...(['vanguard','wraith','sentinel'] as const).map(style=>({label:STYLE_NAMES[style],on:w.player.combatStyle===style,run:()=>{if(!['free','swim'].includes(w.player.state)){this.toast('Change style after the current move.');return;}s.combatStyle=style;this.toast(STYLE_HELP[style]);w.persist();}})),

        {label:"Tirzah's abilities…",page:true,run:()=>this.openWheel('archer')},
        {label:`Arrows: ${(s.arrowType??'standard')[0].toUpperCase()+(s.arrowType??'standard').slice(1)}`,run:()=>{w.player.bow.cycleArrows();w.persist();}},
        {label:'Bow help',run:()=>this.toast('Tap Strike: arrow · hold: piercing shot (6 CE), released at the gold glint: perfect shot · Up + Strike: spread (10 CE) · Down + Heavy: recall · Strike at arm\'s length: bash · Dodge then Strike: backflip · Down + Strike in the air: dive · hold Up: aim at the head · Down + Sub: arrow type')},
        {label:'Close',run:()=>{}},
      ];
    } else if (page === 'archer') {
      // Her own three slots: tap an ability to equip it (into the first empty slot, else the third) or to take it off.
      const slots = (s.archerSkills ??= [null, null, null]), keys = ['Q', 'E', 'R'];
      title = "Tirzah's abilities"; sub = 'Her three skill buttons while she fights';
      items = [
        ...ARCHER_IDS.map((id) => {
          const def = ARCHER[id], at = slots.indexOf(id), open = s.level >= def.level;
          return { label: `${def.short} · ${def.name}${open ? at >= 0 ? ` [${keys[at]}]` : '' : ` · Lv ${def.level}`}`, on: at >= 0, page: true, run: () => {
            if (!open) { this.toast(`${def.name} comes at level ${def.level}.`); return; }
            if (at >= 0) slots[at] = null;
            else { const free = slots.indexOf(null); slots[free >= 0 ? free : 2] = id; this.toast(`${def.name}: ${def.desc}${def.verse ? ' ' + def.verse : ''}`); }
            w.persist(); this.openWheel('archer');
          } };
        }),
        { label: 'Back', page: true, run: () => this.openWheel('heroes') },
      ];
    } else if (page === 'squad') {
      const pre = s.summonPreset ?? 'all';
      title = 'Summon'; sub = `${sq.echoes.length} of ${Math.min(s.echoes.length, w.d.echoSlots)} out`;
      items = [
        { label: 'One', on: pre === 'one', run: () => sq.setSummon('one') },
        { label: 'Two', on: pre === 'two', run: () => sq.setSummon('two') },
        { label: 'Squad', on: pre === 'squad', run: () => sq.setSummon('squad') },
        { label: 'All', on: pre === 'all', run: () => sq.setSummon('all') },
        { label: sq.echoes.length ? 'Dismiss' : 'Summon', run: cmd('toggle') },
        { label: 'Back', page: true, run: () => this.openWheel('main') },
      ];
    } else if (page === 'orders') {
      const all = sq.echoes.map((e) => e.order), same = all.length && all.every((o) => o === all[0]) ? all[0] ?? 'free' : null;
      const o = (order: Parameters<typeof sq.orderEchoes>[0], name: string) => () => { sq.orderEchoes(order); this.toast(`All Echoes: ${name}`); };
      title = 'Orders'; sub = 'for every Echo out';
      items = [
        { label: 'Guard', on: same === 'guard', run: o('guard', 'Guard Elior') },
        { label: 'Hunt', on: same === 'hunt', run: o('hunt', 'Hunt the nearest foe') },
        { label: 'Flank', on: same === 'flank', run: o('flank', 'Flank: strike from behind') },
        { label: 'Hold here', on: same === 'hold', run: o('hold', 'Hold this ground') },
        { label: 'Focus', on: same === 'focus', run: o('focus', 'Focus one foe') },
        { label: 'Free', on: same === 'free', run: o(undefined, 'free to follow the army\'s mode') },
        { label: 'Back', page: true, run: () => this.openWheel('main') },
      ];
    } else {
      title = 'Command the Remnant'; sub = `${sq.echoes.length} of ${s.echoes.length} present`;
      items = [
        { label: 'Heroes & styles…', page:true, run:()=>this.openWheel('heroes') },
        { label: 'Summon…', page: true, run: () => this.openWheel('squad') },
        { label: 'Orders…', page: true, run: () => this.openWheel('orders') },
        { label: 'Aggressive', on: s.echoMode === 'aggressive', run: cmd('aggressive') },
        { label: 'Defensive', on: s.echoMode === 'defensive', run: cmd('defensive') },
        { label: 'Follow', on: s.echoMode === 'follow', run: cmd('follow') },
        { label: 'Mark target', run: cmd('target') },
        { label: 'Recall', run: cmd('recall') },
        { label: sq.syncCd > 0 ? `Sync ${Math.ceil(sq.syncCd)}s` : 'Sync strike', run: cmd('sync') },
        { label: sq.switchCd > 0 ? `Switch ${Math.ceil(sq.switchCd)}s` : sq.benchReady() ? 'Switch in' : 'Swap', run: cmd('switch') },
      ];
    }
    const k = this.k, { width: W, height: H } = this.scale, cx = W / 2, cy = H / 2;
    const rad = Math.min(W, H) * 0.34;
    const shade = this.add.rectangle(0, 0, W, H, 0x07060a, 0.6).setOrigin(0).setInteractive();
    shade.on('pointerup', () => this.closeWheel());
    const head = this.add.text(cx, cy - 10 * k, title, { fontFamily: 'Cinzel, Georgia, serif', fontSize: `${16 * k}px`, color: '#f6dea0', fontStyle: 'bold' }).setOrigin(0.5);
    const foot = this.add.text(cx, cy + 12 * k, sub, { fontFamily: 'Georgia, serif', fontStyle: 'italic', fontSize: `${11 * k}px`, color: '#9b92a6' }).setOrigin(0.5);
    const box = (this.wheelBox = this.add.container(0, 0, [shade, head, foot]).setDepth(90));
    this.wheelItems = items.map((it, i) => {
      const a = -Math.PI / 2 + (i / items.length) * Math.PI * 2;
      const t = this.add.text(cx + Math.cos(a) * rad * 1.25, cy + Math.sin(a) * rad, it.label, { fontFamily: 'Cinzel, Georgia, serif', fontSize: `${12 * k}px`, color: it.on ? '#ffe6a8' : '#ddd4c6', backgroundColor: it.on ? 'rgba(90,64,24,0.92)' : 'rgba(26,20,32,0.92)', padding: { x: 10 * k, y: 6 * k } })
        .setOrigin(0.5).setInteractive({ useHandCursor: true });
      t.setName(`wheel_${it.label}`);
      t.on('pointerup', () => this.pickWheel(i));
      box.add(t);
      return { ...it, t };
    });
    this.wheelSel = 0;
    this.markWheel();
  }

  private markWheel() {
    // The keyboard and pad selection: a gold plate; a setting in force: amber.
    this.wheelItems.forEach((it, i) => {
      const sel = i === this.wheelSel;
      it.t.setBackgroundColor(sel ? 'rgba(226,184,90,0.95)' : it.on ? 'rgba(90,64,24,0.92)' : 'rgba(26,20,32,0.92)').setColor(sel ? '#1a1420' : it.on ? '#ffe6a8' : '#ddd4c6');
    });
  }

  private pickWheel(i: number) {
    const it = this.wheelItems[i];
    if (!it) return;
    // Pages swap in place; commands close the wheel.
    if (it.page) { it.run(); return; }
    this.closeWheel();
    it.run();
  }

  closeWheel(resume = true) {
    this.wheelBox?.destroy();
    this.wheelBox = undefined;
    this.wheelItems = [];
    if (!this.wheelOpen) return;
    this.wheelOpen = false;
    if (resume) { this.world.physics.resume(); this.world.controls.flush(); }
  }

  /** Keyboard and pad: the stick or arrows turn the selection; strike, jump or interact choose; the Echo button or menu closes. */
  wheelInput(dt: number) {
    const c = this.world.controls;
    this.wheelNavT -= dt;
    const turn = c.axis > 0.5 || c.down('down') ? 1 : c.axis < -0.5 || c.down('up') ? -1 : 0;
    if (turn && this.wheelNavT <= 0) {
      this.wheelSel = (this.wheelSel + turn + this.wheelItems.length) % this.wheelItems.length;
      this.wheelNavT = 0.18;
      this.markWheel();
    } else if (!turn) this.wheelNavT = 0;
    if (c.pressed('attack') || c.pressed('jump') || c.pressed('interact')) this.pickWheel(this.wheelSel);
    else if (c.pressed('echo') || c.pressed('menu') || c.pressed('dodge')) this.closeWheel();
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
    if(this.heroBtn.getBounds().contains(p.x,p.y)||this.styleBtn.getBounds().contains(p.x,p.y))return;
    const c = this.world.controls;
    const b = this.btnAt(p.x, p.y);
    if (b) {
      b.down = true;
      b.g.setFillStyle(0xe2b85a, 0.35);
      b.g.setData('pid', p.id);
      haptic('light'); c.setTouch(b.a, true);
      return;
    }
    // The stick follows the saved centre; a touch on its half can float it.
    const home = controlSpot("stick", this.scale.width / dpr(), this.scale.height / dpr(), settings.touchScale, settings.touchLayout ?? {}, settings.leftHanded);
    if ((settings.leftHanded ? p.x > this.scale.width * 0.5 : p.x < this.scale.width * 0.5) && this.stick.id < 0) {
      this.stick.id = p.id;
      this.stick.ox = settings.touchLayout?.stick ? home.cx * dpr() : p.x;
      this.stick.oy = settings.touchLayout?.stick ? home.cy * dpr() : p.y;
      this.stick.base!.setPosition(this.stick.ox, this.stick.oy).setVisible(true);
      this.stick.knob!.setPosition(this.stick.ox, this.stick.oy).setVisible(true);
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
    c.setTouchAxis(ax, Math.abs(dy) < 8 * k ? 0 : Phaser.Math.Clamp(dy / (max * 0.7), -1, 1));
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
