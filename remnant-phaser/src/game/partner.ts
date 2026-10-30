// The AI partner (POLISH_PLAN §11a): the hero you are not playing, fighting
// beside you. The owner's choices: optional and off by default, aggressive,
// the partner or the Echoes (never both), joint finishers, a revive once a
// room, playful banter, and the partner's own level and gear.
//
// Underneath it is an Echo (remnant/src/game/echoes.ts): footing, chasing
// foes, being struck, following through doors and falling come from there.
// It carries the partner hero's own numbers (`power`, `maxHealth`) and is
// drawn as that hero from the same action atlases as the player.
import Phaser from 'phaser';
import { EchoUnit } from '../../../remnant/src/game/echoes';
import { ECHO_LEVEL_CAP, type EchoInst } from '../../../remnant/src/game/data';
import type { Derived } from '../../../remnant/src/game/state';
import type { Entity } from '../../../remnant/src/game/entity';
import { G } from '../classic/shim/ctx';
import { settings } from '../classic/shim/settings';
import { actionAtlas, actionFrame, ACTION_CELL, ACTION_FOOT } from './actionArt';
import { archerStats } from './archer';
import type { PlayableHero } from './style';
import type { PhaserSave } from './save';
import { wears } from './psalms';

/** What the partner world needs from the scene. */
interface Host {
  sc: Phaser.Scene;
  save: PhaserSave;
  eliorD: Derived;
  player: { hero: PlayableHero; x: number; feet: number; face: number; dead: boolean; hp: number; maxHp: number; grantInvuln(t: number): void };
  classic: { squad: { echoes: EchoUnit[] }; dismissEchoes(): void };
  toast(text: string): void;
  floatText(x: number, y: number, text: string, color: string): void;
  spark(x: number, y: number, color: number, n?: number): void;
  playEffect(name: string, o?: { x?: number; vol?: number; pitch?: number }): void;
  finale(x: number, y: number, power?: number): void;
}

const NAME: Record<PlayableHero, string> = { elior: 'Elior', tirzah: 'Tirzah' };
const DOWN_T = 20;

/** The partner as an Echo: the hero's numbers, an aggressive kit, and no canvas drawing (Phaser draws the hero). */
class PartnerUnit extends EchoUnit {
  constructor(readonly hero: PlayableHero, inst: EchoInst, x: number, y: number, private stats: () => Derived) {
    super(inst, x, y, 0);
    // The Echo constructor sizes health before `stats` is set; size it now.
    this.maxHp = this.hp = this.maxHealth();
    this.name = NAME[hero];
    // Aggressive: it goes for the nearest foe rather than staying at heel.
    this.inst.order = 'hunt';
  }
  power(): number {
    const d = this.stats?.();
    return d ? d.atk * d.meleeMult * 0.85 : 1;
  }
  maxHealth() {
    return this.stats?.().maxHp ?? 1;
  }
  /** Aggressive whatever stance the Echoes keep: it goes for foes anywhere near, not only at your side. */
  update(dt: number) {
    const s = G.save, mode = s.echoMode;
    s.echoMode = 'aggressive';
    try { super.update(dt); } finally { s.echoMode = mode; }
  }
  draw() {}
}

export class Partner {
  unit: PartnerUnit | null = null;
  private sprite: Phaser.GameObjects.Sprite;
  private bar: Phaser.GameObjects.Graphics;
  /** Seconds until a fallen partner returns. */
  private downT = 0;
  /** The revive is spent until the next room. */
  /** Pulls this room: one, or two with the Psalm of the Watch. */
  private revived = 0;
  private lastRoom = '';
  private stride = 0;
  private lastShots = 0;
  private releaseT = 0;
  private swing = 0;
  private lastMove: unknown = null;
  private herD: Derived | null = null;
  private herFor: Derived | null = null;
  private chatT = 6;

  constructor(private h: Host) {
    this.sprite = h.sc.add.sprite(0, 0, 'elior', 0).setDepth(9.5).setVisible(false);
    this.bar = h.sc.add.graphics().setDepth(9.6);
  }

  get out() { return !!this.h.save.partnerOut; }
  /** The hero the partner plays: always the one you are not. */
  get hero(): PlayableHero { return this.h.player.hero === 'tirzah' ? 'elior' : 'tirzah'; }

  /** The partner hero's own stats: Elior's as derived, or Tirzah's from her level, gear and tree. */
  private stats(hero: PlayableHero): Derived {
    const base = this.h.eliorD;
    if (hero === 'elior' || !this.h.save.archer) return base;
    if (this.herFor !== base) { this.herD = archerStats(this.h.save, base); this.herFor = base; }
    return this.herD!;
  }

  /** Call the partner out (the Echoes step back), or send it back. */
  toggle() {
    const s = this.h.save;
    if (s.partnerOut) { s.partnerOut = false; this.unit?.dismiss(); this.h.toast(`${NAME[this.hero]} steps back.`); return; }
    s.partnerOut = true;
    this.downT = 0;
    if (s.flags.army_out === true) { this.h.classic.dismissEchoes(); this.h.toast(`The Echoes step back; ${NAME[this.hero]} fights beside you.`); }
    else this.h.toast(`${NAME[this.hero]} fights beside you.`);
    this.spawn();
  }

  private spawn(x = this.h.player.x - this.h.player.face * 24, y = this.h.player.feet) {
    const hero = this.hero, d = this.stats(hero);
    const inst: EchoInst = { uid: 'partner', species: hero === 'tirzah' ? 'archer' : 'knight', role: hero === 'tirzah' ? 'ranger' : 'fighter', level: ECHO_LEVEL_CAP, xp: 0, stage: 2, hp: d.maxHp, absorptions: 1 };
    const u = new PartnerUnit(hero, inst, x, y, () => this.stats(hero));
    u.face = this.h.player.face;
    this.h.classic.squad.echoes.push(u);
    this.unit = u;
    this.lastShots = 0;
    this.h.spark(x, y - 24, hero === 'tirzah' ? 0xa6efdc : 0xffd27a, 10);
  }

  /** Once a room, the partner pulls the player back up instead of letting them fall. */
  revive(): boolean {
    const u = this.unit, p = this.h.player;
    if (!this.out || this.revived >= (wears(this.h.save, 'watch') ? 2 : 1) || !u || u.remove || u.despawn > 0 || u.hp <= 0) return false;
    this.revived++;
    p.hp = Math.round(p.maxHp * 0.35);
    p.grantInvuln(2);
    this.h.floatText(p.x, p.feet - 64, `${NAME[u.hero].toUpperCase()} PULLS YOU UP`, '#a6efdc');
    this.h.spark(p.x, p.feet - 24, 0xfff1c4, 16);
    this.h.playEffect('heal', { x: p.x });
    this.say('revive');
    return true;
  }

  /** A finisher on a foe the partner can reach: it strikes the same foe for a joint blow. */
  joinFinisher(e: Entity) {
    const u = this.unit;
    if (!u || u.remove || u.despawn > 0 || Math.abs(u.x - e.x) > 320) return;
    const side = Math.sign(u.x - e.x) || -this.h.player.face;
    u.x = e.x + side * 26; u.y = e.y; u.face = -side;
    u.body.vx = u.body.vy = 0;
    this.h.spark(u.x, u.y - 24, 0xfff1c4, 12);
    this.h.sc.time.delayedCall(260, () => {
      if (e.remove || e.dying) return;
      e.takeHit({ dmg: u.power() * 3, poise: 120, kx: -side * 160, ky: -160, dir: -side, kind: 'echo', src: u, stop: 0.05 });
      this.h.finale(e.x, e.cy, 1.15);
      this.h.floatText(e.x, e.y - 70, 'TOGETHER', '#ffd27a');
    });
  }

  // ---------------------------------------------------------------- banter (playful rivalry)

  private static LINES: Record<PlayableHero, Record<string, string[]>> = {
    elior: {
      kill: ['That one was mine.', 'Keep counting, archer.', 'Another for the blade.'],
      join: ['Together, then!', 'Hold it still for me!'],
      revive: ['Up. I am not carrying you.', 'On your feet, Tirzah.'],
      idle: ['My count is higher.', 'Is that bow for show?'],
    },
    tirzah: {
      kill: ['Mine. Write it down.', 'Too slow, swordsman.', 'One more for the bow.'],
      join: ['Together!', 'I had it, but fine.'],
      revive: ['Up you get, Elior.', 'Not yet. Stand.'],
      idle: ['Watch my count, not my back.', 'Keep up.'],
    },
  };
  private say(kind: 'kill' | 'join' | 'revive' | 'idle') {
    const u = this.unit;
    if (!u || settings.reduceFlashes && kind === 'idle') return;
    const lines = Partner.LINES[u.hero][kind];
    this.h.floatText(u.x, u.y - 72, lines[Math.floor(Math.random() * lines.length)], u.hero === 'tirzah' ? '#a6efdc' : '#ffd27a');
    this.chatT = 9 + Math.random() * 6;
  }
  /** A foe the partner felled: a line now and then. */
  onKill() { if (Math.random() < 0.35) this.say('kill'); }

  update(dt: number, roomId: string) {
    const s = this.h.save;
    if (roomId !== this.lastRoom) { this.lastRoom = roomId; this.revived = 0; this.unit = null; }
    // Echoes called out: the partner steps back (one or the other).
    if (s.partnerOut && s.flags.army_out === true) { s.partnerOut = false; this.unit?.dismiss(); }
    const u = this.unit;
    if (u && (u.remove || !this.h.classic.squad.echoes.includes(u))) {
      // Fell, or the room changed under it.
      if (s.partnerOut && u.inst.downFor) { this.downT = DOWN_T; this.h.toast(`${NAME[u.hero]} will be back in ${DOWN_T} seconds.`); }
      this.unit = null;
    }
    if (s.partnerOut && this.downT > 0 && (this.downT -= dt) <= 0) { this.downT = 0; this.h.toast(`${NAME[this.hero]} is back.`); }
    // The player switched heroes: the partner becomes the other one, where it stood.
    if (this.unit && this.unit.hero !== this.hero && this.unit.despawn <= 0) {
      const { x, y } = this.unit;
      this.unit.remove = true; this.unit = null;
      this.spawn(x, y);
    }
    if (s.partnerOut && !this.unit && this.downT <= 0 && !this.h.player.dead) this.spawn();
    this.chatT -= dt;
    if (this.unit && this.chatT <= 0 && this.unit.target) this.say('idle');
    this.draw(dt);
  }

  /** The partner hero's sprite from the action atlas, posed from the Echo underneath. */
  private draw(dt: number) {
    const u = this.unit;
    this.bar.clear();
    if (!u) { this.sprite.setVisible(false); return; }
    const hero = u.hero, sc = this.h.sc, b = u.body;
    const key = actionAtlas(sc, hero, hero === 'tirzah' ? 'blade' : this.h.eliorD.family, false, true, hero === 'elior' ? this.h.save.valor?.cape ?? null : null);
    let clip = 'idle', t = 0;
    if (u.move) {
      if (u.move !== this.lastMove) { this.lastMove = u.move; this.swing = (this.swing + 1) % 3; }
      clip = hero === 'tirzah' ? 'dagger' + (this.swing + 1) : ['b1', 'b2', 'b3'][this.swing];
      t = u.st / u.move.T;
    } else {
      this.lastMove = null;
      if (u.shots !== this.lastShots) { this.lastShots = u.shots; this.releaseT = 0.28; }
      this.releaseT = Math.max(0, this.releaseT - dt);
      if (u.state === 'draw') { clip = 'bowDraw'; t = u.bowDraw; }
      else if (this.releaseT > 0) { clip = 'bowRelease'; t = 1 - this.releaseT / 0.28; }
      else if (u.flash > 0) { clip = 'hurt'; t = 0.4; }
      else if (!b.onGround) { clip = b.vy < 0 ? 'jump' : 'fall'; t = 0.5; }
      else if (Math.abs(b.vx) > 20) { this.stride = (this.stride + Math.abs(b.vx) * dt / 64) % 1; clip = 'run'; t = this.stride; }
      else { clip = 'idle'; t = (sc.time.now / 3000) % 1; }
    }
    const frame = actionFrame(sc, key, clip, Phaser.Math.Clamp(t, 0, 0.999));
    this.sprite.setTexture(key, frame).setOrigin(0.5, ACTION_FOOT / ACTION_CELL).setPosition(Math.round(u.x), Math.round(u.y))
      .setFlipX(u.face < 0).setAlpha(u.despawn > 0 ? Math.max(0, u.despawn * 2) : u.flash > 0 ? 0.6 : 1).setVisible(true);
    // A slim health bar over the partner, in their colour.
    const f = Phaser.Math.Clamp(u.hp / Math.max(1, u.maxHp), 0, 1), w = 26, x = u.x - w / 2, y = u.y - 62;
    this.bar.fillStyle(0x0a070c, 0.8).fillRect(x - 1, y - 1, w + 2, 4).fillStyle(hero === 'tirzah' ? 0x6fd6b8 : 0xe2b85a, 1).fillRect(x, y, w * f, 2);
  }

  destroy() { this.sprite.destroy(); this.bar.destroy(); }
}
