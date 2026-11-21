// Uri on the journey: the flame-caller and his orc shaman. Every move is fire, and every cast finds its own mark:
// a fireball flies at the nearest foe in reach, in any direction. His fire answers prayer; he stays human.
//   Strike: a fireball at the nearest foe (a foe in reach: a burst of flame from the open hand that throws it back).
//     The third cast in a quick chain is a searing bolt that passes through the line.
//   Up + Strike: the ground under the nearest foe takes fire.
//   Down + Strike in the air: Meteor. He drops wrapped in flame and bursts where he lands.
//   Heavy: a wave of flame toward the nearest foe that passes through every foe in its path.
//   Down + Heavy: the shaman's Geyser (while he is out). Fire bursts up under the three nearest foes.
//   Dodge: the Flame Dash. He streaks through foes, scorching them, and leaves a trail of fire.
//   Abilities (his own): Pillar of Flame, Ring of Fire, Firestorm (game/abilities.ts, URI_SKILLS).
//   The transformation: the Fusion. The shaman steps into him, and they fight as one fire: larger, harder flame,
//     the shaman's chant from his own hand, every fireball sets the ground burning, a longer dash.
// The shaman (a cleansed battle-imprint, like the Echoes) is called with the Echo button and stays at his side, chanting
// fire at the nearest foe, until the button sends him away. The Fusion calls him if he is not out, and he runs into Uri.
// Uri calls no Echoes and raises no shadows: the two of them are enough.
// The overhaul (the fire builds on itself):
//   Heat: every blow that lands warms him (Warm 35, Hot 70, Blazing 100). Each tier makes his fire stronger; Hot
//     fireballs leave the ground burning where they burst; Blazing, every second cast is a bolt. It cools when he stops.
//   Scorch: each blow marks a foe; the fourth mark Combusts it, a blast that catches the foes around it, and the orc
//     answers at once with a chant.
//   Hold Heavy: the Great Fireball, a slow orb that grows while he holds and explodes where it lands (a tap is still
//     the wave). At Blazing, Heavy is the Supernova: all his Heat at once, a ring of fire around him.
//   Strike during or just after the Flame Dash: the Comet Fan, three fireballs at once.
//   Hold Jump while falling: the Updraft, a jet of fire under his feet that slows the fall and burns what is below.
// His numbers are his own (game/horde/uri.ts: his level, measured against Elior's), in Elior's gear.
import Phaser from 'phaser';
import { TILE, isSolid, T } from '../shared';
import type { WorldApi, FoeLike } from './types';
import type { Player } from './player';
import { actionAtlas, actionFrame, ACTION_CELL, ACTION_FOOT } from './actionArt';
import { URI_SKILLS, URI_SKILL_IDS, uriSkillOpen, type UriSkillId } from './abilities';
import { shadowGate } from '../../../remnant/src/game/finishers';
import { G } from '../../../remnant/src/game/ctx';

// No shadows rise while he fights.
shadowGate.allowed = () => (G.save as { playableHero?: string } | undefined)?.playableHero !== 'uri';

/** The rows of V10 (vfx-uri-fire, 6 frames of 128 px a row). */
const ROW = { ball: 0, burst: 6, ground: 12, wave: 18 } as const;
interface Shot { x: number; y: number; vx: number; vy: number; life: number; dmg: number; kind: 'ball' | 'bolt' | 'wave' | 'great'; big: boolean; pow: number; hits: Set<FoeLike>; img: Phaser.GameObjects.Sprite }
interface Ground { x: number; y: number; t: number; tick: number; dmg: number; r: number; img: Phaser.GameObjects.Sprite }
/** Casts: the clip, its length, and where in it the fire leaves his hand. */
const CAST = {
  ball: { clip: 'b1', t: 0.26, at: 0.45 },
  bolt: { clip: 'b3', t: 0.34, at: 0.45 },
  ground: { clip: 'b2', t: 0.34, at: 0.5 },
  palm: { clip: 'b3', t: 0.32, at: 0.4 },
  wave: { clip: 'heavy', t: 0.5, at: 0.5 },
  geyser: { clip: 'invoke', t: 0.5, at: 0.55 },
  skill: { clip: 'cast', t: 0.4, at: 0.45 },
  dash: { clip: 'airdash', t: 0.22, at: 0 },
  meteor: { clip: 'airdash', t: 1.2, at: 0 },
  // Held: the Great Fireball gathering in his hands (its length is how long Heavy is held).
  charge: { clip: 'invoke', t: 99, at: 1 },
  great: { clip: 'heavy', t: 0.42, at: 0.4 },
  nova: { clip: 'invoke', t: 0.7, at: 0.5 },
  comet: { clip: 'b3', t: 0.3, at: 0.35 },
} as const;
type Cast = keyof typeof CAST;
/** How far past a foe's edge the open hand reaches; how far his fire looks for a mark. */
const REACH = 30, SIGHT = 340;
export const GEYSER_CD = 9, DASH_CD = 0.5, DASH_V = 560;
/** Heat: its tiers, how long he must stop before it cools, and how fast it cools. */
export const HEAT_TIERS = [35, 70, 100] as const;
const HEAT_NAMES = ['', 'WARM', 'HOT', 'BLAZING'], HEAT_COLORS = [0xffb347, 0xffb347, 0xff7a2a, 0xffe08a];
const HEAT_REST = 2.2, HEAT_COOL = 12;
/** Heavy held past TAP (action seconds) is a Great Fireball; full at CHARGE_T. */
const TAP = 0.3, CHARGE_T = 1.1;
/** Scorch marks to Combust, and how long a mark lasts. */
export const SCORCH_MAX = 4;
const SCORCH_T = 4;
/** The Updraft's breath of flame per jump (fused, longer). */
const UPDRAFT_T = 1.4;

export class UriKit {
  private shots: Shot[];
  private grounds: Ground[];
  private bursts: Phaser.GameObjects.Sprite[];
  /** The cast under way (state 'flame'), its time, and whether its fire has left his hand. */
  cast: Cast | null = null;
  t = 0;
  private fired = false;
  private queued: Cast | null = null;
  /** Casts in a quick chain: the third is a searing bolt. */
  private chain = 0;
  private chainT = 0;
  private skillId: UriSkillId | null = null;
  private dir = 1;
  private dashCd = 0;
  private airDash = 1;
  private trailX = 0;
  private dashHit = new Set<FoeLike>();
  /** Firestorm: seconds left and the next fall. */
  private stormT = 0;
  private stormTick = 0;
  /** The orc shaman always at his side (hidden while they are fused): the next chant, his order's cooldown. */
  geyserCd = 0;
  private chantT = 1;
  private shaman: Phaser.GameObjects.Sprite;
  private ghost: Phaser.GameObjects.Sprite;
  private shamanX = 0;
  /** The merge into Uri during the transformation (0 none, then 0..1), and where the orc began it. */
  mergeU = 0;
  private mergeFrom = 0;
  private mergeSpark = 0;
  private shamanClip = 'idle';
  private shamanClipT = 0;
  /** Heat (0..100), and how long since a blow last landed. */
  heat = 0;
  private heatRest = 0;
  private heatBar: Phaser.GameObjects.Graphics;
  private heatDrawn = -1;
  private auraT = 0;
  /** Scorch marks on foes: how many, and how long until they fade. */
  private scorch = new Map<FoeLike, { n: number; t: number }>();
  /** The Great Fireball in his hands: how full (0..1), the orb, its sparks. */
  charge = 0;
  private orb: Phaser.GameObjects.Sprite;
  private orbSpark = 0;
  private chargeFull = false;
  /** The Comet Fan: Strike in the dash (queued) or in this window after it. */
  private cometQueued = false;
  private cometT = 0;
  /** The Updraft left this jump, the next jet, the next burn below. */
  private updraft = UPDRAFT_T;
  private jetT = 0;
  private jetBurn = 0;
  /** For tests: what his fire has done. */
  readonly tally = { balls: 0, bolts: 0, waves: 0, grounds: 0, palms: 0, hits: 0, geysers: 0, chants: 0, dashes: 0, trail: 0, meteors: 0, pillars: 0, rings: 0, storms: 0, aimed: 0, greats: 0, explosions: 0, novas: 0, combusts: 0, comets: 0, updraft: 0, heatPeak: 0, tierUps: 0 };

  constructor(private w: WorldApi, private p: Player) {
    const sc = w.sc, anim = (key: string, start: number, rate: number, repeat: number) => {
      if (!sc.anims.exists(key)) sc.anims.create({ key, frames: sc.anims.generateFrameNumbers('vfx-uri-fire', { start, end: start + 5 }), frameRate: rate, repeat });
    };
    anim('uri-ball', ROW.ball, 18, -1); anim('uri-burst', ROW.burst, 22, 0); anim('uri-ground', ROW.ground, 12, -1); anim('uri-wave', ROW.wave, 16, -1);
    const sprite = () => sc.add.sprite(0, 0, 'vfx-uri-fire', 0).setDepth(12).setVisible(false).setBlendMode(Phaser.BlendModes.ADD);
    this.shots = Array.from({ length: 28 }, () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0, dmg: 0, kind: 'ball' as Shot['kind'], big: false, pow: 0, hits: new Set<FoeLike>(), img: sprite() }));
    this.grounds = Array.from({ length: 28 }, () => ({ x: 0, y: 0, t: 0, tick: 0, dmg: 0, r: 30, img: sprite().setOrigin(0.5, 0.82) }));
    this.bursts = Array.from({ length: 44 }, () => sprite());
    this.orb = sprite().setDepth(13);
    this.heatBar = sc.add.graphics().setDepth(14).setVisible(false);
    this.shaman = sc.add.sprite(0, 0, 'vfx-uri-fire', 0).setOrigin(0.5, ACTION_FOOT / ACTION_CELL).setDepth(9).setVisible(false);
    // The shaman's fire-shape inside Uri while they are fused.
    this.ghost = sc.add.sprite(0, 0, 'vfx-uri-fire', 0).setOrigin(0.5, ACTION_FOOT / ACTION_CELL).setDepth(9).setVisible(false)
      .setBlendMode(Phaser.BlendModes.ADD).setTint(0xff8a3a);
  }

  /** Fused with the shaman, his fire is larger and every fireball leaves the ground burning. */
  get fused() { return this.p.mantleT > 0; }
  /** Is the orc standing with him? (Kept in the save, so he is still there after a room or a reload.) */
  get out() { return !!this.w.save.flags.uri_orc; }

  /** The orc's sprite (hidden while fused), for the dynamic lights. */
  get shamanSprite() { return this.shaman; }

  /** His fire as lights in the frame's list: it lifts the dark around it and lights what it passes. */
  lights(list: { add(x: number, y: number, r: number, c: string, a?: number, bloom?: number): void }) {
    if (!this.here) return;
    for (const s of this.shots) if (s.life > 0) list.add(s.x, s.y, s.kind === 'great' ? 90 + 70 * s.pow : s.kind === 'wave' ? 84 : s.kind === 'bolt' ? 64 : 54, s.kind === 'bolt' ? '#ffd27a' : '#ff8a3a', 0.9, 0.65);
    for (const g of this.grounds) if (g.t > 0) list.add(g.x, g.y - 10, g.r * 1.9, '#ff7a2a', Math.min(0.75, g.t), 0.5);
    if (this.cast === 'charge' && this.charge > 0) list.add(this.p.x + this.p.face * 14, this.p.feet - 34, 40 + this.charge * 70, '#ffb347', 0.95, 0.8);
    if (this.heatTier === 3) list.add(this.p.x, this.p.feet - 26, 70, '#ffb347', 0.5, 0.45);
  }

  /** Heat haze: where his fire burns, and how strongly (for the distortion map in visuals.ts). */
  hazeSources(add: (x: number, y: number, r: number, k: number) => void) {
    if (!this.here) return;
    for (const s of this.shots) if (s.life > 0 && s.kind !== 'wave') add(s.x, s.y, s.kind === 'great' ? 40 + 30 * s.pow : 20, s.kind === 'great' ? 1 : 0.6);
    for (const g of this.grounds) if (g.t > 0) add(g.x, g.y - 14, g.r * 0.9, Math.min(1, g.t));
    if (this.cast === 'charge' && this.charge > 0) add(this.p.x + this.p.face * 14, this.p.feet - 34, 14 + this.charge * 26, this.charge);
  }

  /** The Echo button for Uri: call the orc, or send him away. */
  toggleOrc(on = !this.out, quiet = false) {
    const p = this.p;
    if (on === this.out) return;
    if (this.fused && !on) { this.w.toast('The orc is in him now: he steps out when the fire fades.'); return; }
    this.w.save.flags.uri_orc = on;
    this.shamanX = p.x - p.face * 26;
    this.burst(this.shamanX, p.feet - 22, 0.7);
    this.w.playEffect(on ? 'summon' : 'elemFire', { x: p.x, vol: 0.7 });
    this.chantT = 0.8;
    if (!quiet) this.w.toast(on ? 'The orc stands with Uri: press again to send him away' : 'The orc withdraws');
  }

  /** The transformation under way (0..1 of the gathering): the orc runs into Uri, and they are one fire. */
  merge(u: number) {
    if (!this.out) this.toggleOrc(true, true);
    if (this.mergeU <= 0) { this.mergeFrom = this.shamanX || this.p.x - this.p.face * 26; this.mergeSpark = 0; }
    this.mergeU = Math.max(0.001, Math.min(1, u));
  }
  private get here() { return this.w.save.playableHero === 'uri' && !this.p.dead; }
  private power(mult: number) {
    const d = this.w.d, crit = Math.random() < d.crit;
    return { dmg: d.atk * mult * (this.fused ? 1.5 : 1) * (1 + 0.15 * this.heatTier) * (crit ? d.critDmg : 1), crit };
  }

  // ---------------------------------------------------------------- heat
  /** 0 cold, 1 Warm, 2 Hot, 3 Blazing. */
  get heatTier() { return this.heat >= HEAT_TIERS[2] ? 3 : this.heat >= HEAT_TIERS[1] ? 2 : this.heat >= HEAT_TIERS[0] ? 1 : 0; }
  /** `rest`: the blow counts as him still fighting (burning ground ticking on its own does not keep him warm). */
  addHeat(n: number, rest = true) {
    const before = this.heatTier, p = this.p;
    this.heat = Math.min(100, this.heat + n * (this.fused ? 1.5 : 1));
    if (rest) this.heatRest = 0;
    this.tally.heatPeak = Math.max(this.tally.heatPeak, this.heat);
    const now = this.heatTier;
    if (now > before) {
      this.tally.tierUps++;
      this.w.floatText(p.x, p.body.top - 16, HEAT_NAMES[now], '#' + HEAT_COLORS[now].toString(16), now === 3);
      this.w.playEffect(now === 3 ? 'fireBurst' : 'elemFire', { x: p.x, vol: 0.5 + now * 0.12, pitch: 0.8 + now * 0.15 });
      this.burst(p.x, p.feet - 24, 0.4 + now * 0.12);
      if (now === 3) { this.w.flashLight?.(p.x, p.feet - 30, 200, '#ffd27a', 0.5); this.w.toast('Blazing: Heavy is the Supernova'); }
    }
  }

  // ---------------------------------------------------------------- aim
  /** The nearest living foe within `range` of a point, ahead of him preferred (a foe behind counts a third farther). */
  target(range = SIGHT, x = this.p.x, y = this.p.feet - 26, face = this.p.face, skip?: FoeLike | null): FoeLike | null {
    let best: FoeLike | null = null, bd = range;
    for (const f of this.w.foes()) {
      if (!f.alive || f === skip) continue;
      const dx = f.x - x, dy = f.box.centerY - y, d = Math.hypot(dx, dy) * (dx * face < -8 ? 1.33 : 1);
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }
  /** The foes nearest him, up to n. */
  private nearest(n: number, range = SIGHT) {
    const p = this.p;
    return this.w.foes().filter((f) => f.alive && Math.hypot(f.x - p.x, f.box.centerY - p.feet) < range)
      .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x)).slice(0, n);
  }

  // ---------------------------------------------------------------- input
  /** Input while he plays. True when his kit took the frame (the player's own moves wait). */
  control(dt: number) {
    const p = this.p, c = this.w.controls;
    if (p.state === 'flame' && this.cast) {
      if (this.cast === 'dash') return this.dashing(dt);
      if (this.cast === 'meteor') return this.falling(dt);
      if (this.cast === 'charge') return this.charging(dt);
      const k = CAST[this.cast];
      p.body.setVelocityX(p.body.velocity.x * Math.exp(-14 * dt));
      this.t += dt;
      if (!this.fired && this.t >= k.t * k.at) { this.fired = true; this.release(this.cast); }
      if (c.pressed('attack')) this.queued = this.attackKind();
      if (c.pressed('heavy')) this.queued = this.heavyKind();
      if (this.t >= k.t) {
        this.cast = null; p.releaseState();
        if (this.queued) { const q = this.queued; this.queued = null; this.begin(q); }
      }
      return true;
    }
    if (p.state !== 'free' && p.state !== 'swim') return false;
    const n = c.pressed('skill1') ? 0 : c.pressed('skill2') ? 1 : c.pressed('skill3') ? 2 : -1;
    if (n >= 0) { this.skill(n); return true; }
    if (c.pressed('heavy')) { this.begin(this.heavyKind()); return true; }
    if (c.pressed('attack')) { this.begin(this.attackKind()); return true; }
    return false;
  }

  /** Heavy: the Geyser with Down, the Supernova when Blazing, else the gathering (a tap of it is the wave). */
  private heavyKind(): Cast {
    const c = this.w.controls;
    if (c.down('down')) return 'geyser';
    return this.heatTier === 3 ? 'nova' : 'charge';
  }

  private attackKind(): Cast {
    const c = this.w.controls, p = this.p;
    if (this.cometT > 0) return 'comet';
    if (!p.onGround && c.down('down') && !p.water.swimming) return 'meteor';
    if (c.down('up')) return 'ground';
    if (this.reach()) return 'palm';
    // Blazing, every second cast in a chain is a bolt.
    return this.chainT > 0 && this.chain >= (this.heatTier === 3 ? 1 : 2) ? 'bolt' : 'ball';
  }

  private begin(kind: Cast) {
    const p = this.p;
    if (kind === 'geyser' && !this.out) { this.w.toast('Call the orc first (the Echo button).'); return; }
    if (kind === 'geyser' && this.geyserCd > 0) { this.w.toast(`The shaman's Geyser is ready in ${Math.ceil(this.geyserCd)} s.`); return; }
    if (kind === 'ball' || kind === 'bolt' || kind === 'palm') { this.chain = kind === 'bolt' ? 0 : this.chain + 1; this.chainT = 0.9; }
    // Every cast turns toward its mark.
    const f = this.target();
    p.face = f ? (Math.sign(f.x - p.x) || p.face) : p.swingFacing();
    this.cast = kind; this.t = 0; this.fired = false; p.state = 'flame';
    if (kind === 'comet') this.cometT = 0;
    if (kind === 'charge') { this.charge = 0; this.chargeFull = false; this.orbSpark = 0; return; }
    if (kind === 'meteor') {
      this.tally.meteors++;
      p.body.setVelocity(0, 520); p.grantInvuln(0.3);
      this.w.playEffect('fireball', { x: p.x, vol: 0.7, pitch: 0.7 });
      return;
    }
    this.w.playEffect(kind === 'geyser' ? 'chant' : 'elemFire', { x: p.x, vol: 0.5, pitch: 0.9 + Math.random() * 0.2 });
  }

  /** The Flame Dash, from Dodge (player.ts's defence()). True when it went. */
  dodge() {
    const p = this.p, c = this.w.controls;
    if (this.dashCd > 0 || p.water.swimming) return false;
    if (!p.onGround && this.airDash <= 0) return false;
    if (!p.onGround) this.airDash--;
    const ax = c.axis;
    this.dir = Math.abs(ax) > 0.2 ? Math.sign(ax) : p.face;
    this.cancel();
    p.face = this.dir;
    this.cast = 'dash'; this.t = 0; p.state = 'flame';
    this.dashCd = DASH_CD; this.trailX = p.x; this.dashHit.clear();
    p.grantInvuln(this.fused ? 0.3 : 0.24);
    this.tally.dashes++;
    this.w.playEffect('dash'); this.w.playEffect('flame', { x: p.x, vol: 0.6 });
    this.w.legends?.onDodge();
    this.burst(p.x, p.feet - 18, 0.45);
    return true;
  }

  private dashing(dt: number) {
    const p = this.p, len = this.fused ? 0.3 : CAST.dash.t;
    this.t += dt;
    if (this.w.controls.pressed('attack')) this.cometQueued = true;
    p.body.setVelocity(this.dir * DASH_V * (this.fused ? 1.1 : 1), 0);
    // Scorch every foe he passes through, once.
    for (const f of this.w.foes()) if (f.alive && !this.dashHit.has(f) && Math.abs(f.x - p.x) < f.box.width / 2 + 10 && f.box.top < p.feet && f.box.bottom > p.feet - 40) {
      this.dashHit.add(f); this.strike(f, 0.6, this.dir, 1, false, 40);
    }
    // A flame every so often along the way.
    if (Math.abs(p.x - this.trailX) >= 22) { this.trailX = p.x; this.tally.trail++; this.ignite(p.x, p.feet, this.fused ? 3.5 : 2.5, 0.22, 18, 0.32); }
    if (this.t >= len) {
      this.cast = null; p.body.setVelocityX(this.dir * 140); p.releaseState();
      // Strike in the dash (or just after it): the Comet Fan.
      this.cometT = 0.35;
      if (this.cometQueued) { this.cometQueued = false; this.begin('comet'); }
    }
    return true;
  }

  /** Heavy held: the Great Fireball gathers in his hands. Let go early and it is the wave. */
  private charging(dt: number) {
    const p = this.p, c = this.w.controls;
    this.t += dt;
    this.charge = Math.max(0, Math.min(1, (this.t - TAP) / (CHARGE_T - TAP)));
    p.body.setVelocityX(c.axis * 46);
    if (Math.abs(c.axis) > 0.2) p.face = Math.sign(c.axis);
    const hx = p.x + p.face * 14, hy = p.feet - 34;
    if (this.t > TAP) {
      if (!this.orb.visible) this.orb.play('uri-ball').setVisible(true);
      this.orb.setPosition(hx, hy + Math.sin(this.t * 18) * 1.5).setScale(0.18 + this.charge * 0.3).setAlpha(0.75 + this.charge * 0.25);
      // Sparks wind in to the orb, faster as it fills.
      this.orbSpark -= dt;
      if (this.orbSpark <= 0) {
        this.orbSpark = 0.09 - this.charge * 0.05;
        const a = this.t * 9, r = 30 - this.charge * 14;
        this.w.spark(hx + Math.cos(a) * r, hy + Math.sin(a) * r * 0.7, this.charge >= 1 ? 0xffe08a : 0xff8a3a, 1);
      }
      if (this.charge >= 1 && !this.chargeFull) {
        this.chargeFull = true;
        this.w.playEffect('elemFire', { x: p.x, vol: 0.8, pitch: 1.5 });
        this.w.flashLight?.(hx, hy, 120, '#ffd27a', 0.3);
        this.burst(hx, hy, 0.35);
      }
    }
    if (!c.down('heavy')) {
      this.orb.setVisible(false).stop();
      this.cast = null;
      this.begin(this.t < TAP ? 'wave' : 'great');
    }
    return true;
  }

  private falling(dt: number) {
    const p = this.p;
    this.t += dt;
    p.body.setVelocity(p.body.velocity.x * 0.9, 560);
    if (p.onGround || this.t >= CAST.meteor.t) {
      this.cast = null; p.releaseState();
      // He lands in a burst of fire, and the ground keeps burning.
      const r = this.fused ? 96 : 76;
      this.burst(p.x, p.feet - 20, this.fused ? 1.0 : 0.8);
      this.w.shake(0.006, 160);
      this.w.playEffect('fireBurst', { x: p.x, vol: 0.9 });
      for (const f of this.w.foes()) if (f.alive && Math.abs(f.x - p.x) < r && Math.abs(f.box.bottom - p.feet) < 50) this.strike(f, 2.0, Math.sign(f.x - p.x) || p.face, 3, true, 220);
      this.ignite(p.x - 26, p.feet, 2.5); this.ignite(p.x + 26, p.feet, 2.5);
      p.grantInvuln(0.15);
    }
    return true;
  }

  /** One of his three abilities. */
  private skill(n: number) {
    const p = this.p, s = this.w.save, id = URI_SKILL_IDS[n], def = URI_SKILLS[id];
    if (!uriSkillOpen(s, id)) { this.w.toast(`${def.name} opens at Uri's level ${def.level}.`); return; }
    if (p.cds[id] > 0) return;
    if (s.ce < def.cost) { this.w.floatText(p.x, p.body.top - 8, 'Not enough Covenant Energy', '#9fc4ff'); return; }
    if (id === 'uri_pillar' && !this.target(SIGHT + 40)) { this.w.toast('No foe in sight for the pillar.'); return; }
    s.ce -= def.cost; p.cds[id] = def.cd;
    this.skillId = id;
    this.w.flashLight?.(p.x, p.feet - 30, 160, '#' + def.color.toString(16).padStart(6, '0'), 0.45);
    this.begin('skill');
  }

  // ---------------------------------------------------------------- the fire
  /** The art clip and its progress while a cast plays. */
  get clip() { return this.cast ? CAST[this.cast].clip : 'cast'; }
  get u() {
    if (!this.cast) return 0;
    if (this.cast === 'charge') return Math.min(0.999, this.t < 0.3 ? this.t / 0.6 : 0.5 + ((this.t * 1.2) % 0.45));
    return Math.min(0.999, this.t / (this.cast === 'dash' && this.fused ? 0.3 : CAST[this.cast].t));
  }

  /** The nearest foe in reach of his open hand, on either side. */
  private reach(): FoeLike | null {
    const p = this.p;
    for (const f of this.w.foes()) { const dx = f.x - p.x; if (f.alive && Math.abs(dx) - f.box.width / 2 < REACH && Math.abs(f.box.centerY - (p.feet - 24)) < f.box.height / 2 + 20) return f; }
    return null;
  }

  private release(kind: Cast) {
    const p = this.p, hx = p.x + p.face * 16, hy = p.feet - 30;
    if (kind === 'ball' || kind === 'bolt') {
      this.tally[kind === 'ball' ? 'balls' : 'bolts']++;
      const f = this.target(SIGHT, hx, hy);
      this.aimShot(hx, hy, kind, f);
      // Fused, a second fireball finds the next foe.
      if (this.fused) { const f2 = this.target(SIGHT, hx, hy, p.face, f); if (f2) this.aimShot(hx, hy - 6, 'ball', f2, 0.6); }
      this.w.playEffect('fireball', { x: p.x, vol: 0.7, pitch: kind === 'bolt' ? 0.8 : 1 });
    } else if (kind === 'wave') {
      this.tally.waves++;
      this.shoot(hx, p.feet - 24, 'wave', p.face * 300, 0);
      this.w.playEffect('pillarFire', { x: p.x, vol: 0.6 });
    } else if (kind === 'ground') {
      this.tally.grounds++;
      const f = this.target(260);
      this.ignite(f ? f.x : p.x + p.face * 70, f ? f.box.bottom : p.feet, 3, 0.3, this.fused ? 40 : 30);
    } else if (kind === 'palm') {
      this.tally.palms++;
      const f = this.reach(), x = f ? f.x : hx, y = f ? f.box.centerY : hy;
      this.burst(x, y, 0.6);
      this.w.playEffect('fireBurst', { x, vol: 0.8 });
      if (f) this.strike(f, 1.15, Math.sign(f.x - p.x) || p.face, 3, true, 240);
    } else if (kind === 'geyser') {
      this.tally.geysers++;
      this.geyserCd = GEYSER_CD;
      this.shamanClip = 'cast'; this.shamanClipT = 0;
      this.burst(this.fused ? p.x : this.shamanX, p.feet - 22, 0.5);
      const marks = this.nearest(3, 360);
      if (!marks.length) this.erupt(p.x + p.face * 60, p.feet, 1.8);
      for (const [i, f] of marks.entries()) this.w.sc.time.delayedCall(i * 120, () => { if (this.here && f.alive) this.erupt(f.x, f.box.bottom, 1.8); });
      this.w.playEffect('summon', { x: p.x, vol: 0.7 });
    } else if (kind === 'great') {
      // The Great Fireball: slow and heavy, and it explodes where it lands.
      this.tally.greats++;
      const f = this.target(SIGHT + 80, hx, hy), ch = this.charge, speed = 300;
      let vx = p.face * speed, vy = 0;
      if (f) { const dx = f.x - hx, dy = f.box.centerY - hy, d = Math.hypot(dx, dy) || 1; vx = (dx / d) * speed; vy = (dy / d) * speed; }
      this.shoot(hx, hy, 'great', vx, vy, 1, ch);
      this.w.playEffect('fireball', { x: p.x, vol: 0.9, pitch: 0.6 });
      this.w.shake(0.003 + ch * 0.004, 120);
      this.charge = 0;
    } else if (kind === 'nova') this.supernova();
    else if (kind === 'comet') {
      // The Comet Fan: three fireballs, each at its own foe (or spread, when fewer are near).
      this.tally.comets++;
      const marks = this.nearest(3, SIGHT + 40);
      for (let i = 0; i < 3; i++) {
        const f = marks[i];
        if (f) this.aimShot(hx, hy - 4 + i * 4, i === 1 ? 'bolt' : 'ball', f, 0.9);
        else { const a = (i - 1) * 0.28; this.shoot(hx, hy, 'ball', Math.cos(a) * 460 * p.face, Math.sin(a) * 460, 0.9); }
      }
      this.burst(hx, hy, 0.4);
      this.w.playEffect('fireball', { x: p.x, vol: 0.9, pitch: 1.2 });
    } else if (kind === 'skill' && this.skillId) this.ability(this.skillId);
  }

  /** Blazing, Heavy spends all his Heat at once: a ring of fire around him, and the orc's geysers under the nearest. */
  private supernova() {
    const p = this.p, x = p.x, y = p.feet - 26;
    this.tally.novas++;
    this.heat = 0; this.heatDrawn = -1;
    p.grantInvuln(0.5);
    if (p.onGround) p.body.setVelocityY(-180);
    this.w.hitstop(0.08);
    this.w.shake(0.012, 380);
    this.w.flashLight?.(x, y, 280, '#ffb347', 0.7);
    this.w.playEffect('fireBurst', { x, vol: 1, pitch: 0.7 });
    this.w.playEffect('thunder', { x, vol: 0.5, pitch: 1.3 });
    this.w.floatText(x, p.body.top - 18, 'SUPERNOVA', '#ffd27a', true);
    this.w.shockwave?.(x, y, 230, 0.7);
    this.burst(x, y, 1.2);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; this.w.sc.time.delayedCall(30 + i * 12, () => this.burst(x + Math.cos(a) * 90, y + Math.sin(a) * 50, 0.6)); }
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2 + 0.2; this.w.sc.time.delayedCall(140 + i * 10, () => this.burst(x + Math.cos(a) * 160, y + Math.sin(a) * 80, 0.5)); }
    for (const f of this.w.foes()) if (f.alive && Math.hypot(f.x - x, (f.box.centerY - y) * 1.4) < 200) this.strike(f, 4, Math.sign(f.x - x) || p.face, 6, true, 380, -260, false);
    for (const dx of [-150, -100, -50, 50, 100, 150]) this.ignite(x + dx, p.feet, 3.5, 0.32, 30);
    // The orc answers with his geysers under the two nearest.
    if (this.out && !this.fused) for (const [i, f] of this.nearest(2, 380).entries()) this.w.sc.time.delayedCall(220 + i * 140, () => { if (this.here && f.alive) this.erupt(f.x, f.box.bottom, 1.6); });
  }

  /** A blast of fire at a point: everything within `r` takes `mult` (no Scorch: a blast does not mark). */
  private explode(x: number, y: number, r: number, mult: number, scale: number) {
    this.tally.explosions++;
    this.burst(x, y, scale);
    this.burst(x - r * 0.4, y + 6, scale * 0.6); this.burst(x + r * 0.4, y + 6, scale * 0.6);
    this.w.shake(0.004 + scale * 0.004, 160);
    this.w.flashLight?.(x, y, r * 2, '#ff9a3a', 0.4);
    this.w.playEffect('fireBurst', { x, vol: 0.9, pitch: 0.8 });
    for (const f of this.w.foes()) if (f.alive && Math.hypot(f.x - x, f.box.centerY - y) < r + f.box.width / 2) this.strike(f, mult, Math.sign(f.x - x) || this.p.face, 4, true, 260, -200, false);
  }

  /** The fourth Scorch mark: the foe Combusts, and the orc answers at once. */
  private combust(f: FoeLike) {
    this.tally.combusts++;
    const x = f.x, y = f.box.centerY;
    this.w.floatText(x, f.box.top - 10, 'COMBUST', '#ff9a3a', true);
    this.w.hitstop(0.04);
    this.explode(x, y, 64, 1.6, 0.7);
    this.ignite(x, f.box.bottom, 2.5, 0.3, 34);
    this.addHeat(10);
    if (this.out) this.chantT = 0;
  }

  private ability(id: UriSkillId) {
    const p = this.p;
    if (id === 'uri_pillar') {
      // A pillar of flame stands up under the nearest foe and throws it into the air.
      this.tally.pillars++;
      const f = this.target(SIGHT + 40);
      const x = f ? f.x : p.x + p.face * 80, y = f ? f.box.bottom : p.feet;
      for (let i = 0; i < 4; i++) this.w.sc.time.delayedCall(i * 60, () => this.burst(x, y - 14 - i * 34, 0.75 - i * 0.08));
      this.w.shake(0.005, 140);
      this.w.playEffect('pillarFire', { x, vol: 0.9 });
      for (const o of this.w.foes()) if (o.alive && Math.abs(o.x - x) < 40 && Math.abs(o.box.bottom - y) < 60) this.strike(o, 2.6, Math.sign(o.x - p.x) || p.face, 4, true, 40, -420);
      this.ignite(x, y, 3, 0.35, 36);
    } else if (id === 'uri_ring') {
      // A ring of fire bursts out of him: it burns and throws back everything near, and leaves the ground alight.
      this.tally.rings++;
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; this.burst(p.x + Math.cos(a) * 54, p.feet - 24 + Math.sin(a) * 30, 0.55); }
      this.w.playEffect('fireBurst', { x: p.x, vol: 1 });
      this.w.shake(0.006, 160);
      p.grantInvuln(0.25);
      for (const f of this.w.foes()) if (f.alive && Math.hypot(f.x - p.x, f.box.centerY - (p.feet - 24)) < 120) this.strike(f, 1.9, Math.sign(f.x - p.x) || p.face, 4, true, 320);
      for (const dx of [-60, -24, 24, 60]) this.ignite(p.x + dx, p.feet, 3);
    } else {
      // Firestorm: for three seconds fire falls on the foes around him.
      this.tally.storms++;
      this.stormT = 3; this.stormTick = 0;
      this.w.playEffect('thunder', { x: p.x, vol: 0.5 });
    }
  }

  /** A fireball aimed at a foe (or straight ahead when none is in sight). */
  private aimShot(x: number, y: number, kind: 'ball' | 'bolt', f: FoeLike | null, dmgMult = 1) {
    const speed = kind === 'bolt' ? 520 : 440;
    let vx = this.p.face * speed, vy = 0;
    if (f) { const dx = f.x - x, dy = f.box.centerY - y, d = Math.hypot(dx, dy) || 1; vx = (dx / d) * speed; vy = (dy / d) * speed; this.tally.aimed++; }
    this.shoot(x, y, kind, vx, vy, dmgMult);
  }

  private shoot(x: number, y: number, kind: Shot['kind'], vx: number, vy: number, dmgMult = 1, pow = 0) {
    const s = this.shots.find((o) => o.life <= 0);
    if (!s) return;
    const big = this.fused, wave = kind === 'wave', great = kind === 'great';
    s.x = x; s.y = y; s.vx = vx; s.vy = vy; s.life = wave ? 0.85 : great ? 1.6 : 1.1; s.kind = kind; s.big = big; s.pow = pow; s.hits.clear();
    s.dmg = (wave ? 1.6 : kind === 'bolt' ? 1.5 : great ? 2 + 2.5 * pow : 0.9) * dmgMult;
    // Heat makes the fire itself larger.
    const heat = 1 + this.heatTier * 0.12;
    s.img.play(wave ? 'uri-wave' : 'uri-ball').setPosition(x, y).setFlipX(vx < 0).setRotation(wave ? 0 : Math.atan2(vy, Math.abs(vx) || 1) * (vx < 0 ? -1 : 1))
      .setScale((wave ? (big ? 0.62 : 0.5) : great ? 0.42 + 0.34 * pow : kind === 'bolt' ? (big ? 0.46 : 0.38) : big ? 0.38 : 0.28) * heat).setVisible(true).setAlpha(1);
  }

  /** Burning ground: `secs` long, `dmg` a tick, `r` wide. */
  private ignite(x: number, y: number, secs: number, dmg = 0.3, r = 30, scale = this.fused ? 0.62 : 0.5) {
    const g = this.grounds.find((o) => o.t <= 0) ?? this.grounds.reduce((a, b) => (a.t < b.t ? a : b));
    g.x = x; g.y = y; g.t = secs; g.tick = 0; g.dmg = dmg; g.r = r;
    g.img.play('uri-ground').setPosition(x, y + 4).setScale(scale).setVisible(true).setAlpha(1);
    if (scale > 0.4) this.w.playEffect('flame', { x, vol: 0.4 });
  }

  /** A geyser of fire up out of the ground. */
  private erupt(x: number, y: number, mult: number) {
    this.burst(x, y - 16, 0.7); this.burst(x, y - 46, 0.55);
    this.w.playEffect('fireBurst', { x, vol: 0.6 });
    for (const f of this.w.foes()) if (f.alive && Math.abs(f.x - x) < 34 && Math.abs(f.box.bottom - y) < 50) this.strike(f, mult, 0, 3, true, 0, -300);
    this.ignite(x, y, 2);
  }

  private burst(x: number, y: number, scale: number) {
    const b = this.bursts.find((o) => !o.visible);
    if (!b) return;
    b.setPosition(x, y).setScale(scale).setVisible(true).setAlpha(1).play('uri-burst');
    b.once('animationcomplete', () => b.setVisible(false));
  }

  /** One blow of his fire on a foe. True when it landed. */
  private strike(f: FoeLike, mult: number, dir: number, force: number, heavy: boolean, kx = 60, ky = heavy ? -120 : 0, mark = true) {
    const { dmg, crit } = this.power(mult), hp = f.hp;
    if (!f.hit(Math.max(1, Math.round(dmg)), dir, force, crit, { kind: 'proj', kx: dir * kx, ky, poise: heavy ? 30 : 10 })) return false;
    this.tally.hits++;
    // Burning ground and other light ticks warm him a little and leave no mark.
    const light = mult < 0.5;
    this.addHeat(light ? 0.6 : heavy ? 5 : 3, !light);
    if (mark && !light && f.alive) {
      let sc = this.scorch.get(f);
      if (!sc) { sc = { n: 0, t: 0 }; this.scorch.set(f, sc); }
      sc.n++; sc.t = SCORCH_T;
      this.w.spark(f.x, f.box.top + 4, 0xff6a2a, sc.n + 1);
      if (sc.n >= SCORCH_MAX) { this.scorch.delete(f); this.combust(f); }
    }
    this.w.heroHit(f, hp !== undefined && f.hp !== undefined ? Math.max(0, hp - f.hp) : dmg, heavy, crit);
    this.p.noteStyle(heavy ? 'flame_heavy' : 'flame');
    this.p.comboHits++;
    this.w.save.ce = Math.min(this.p.maxCe, this.w.save.ce + 1);
    this.w.spark(f.x, f.box.centerY, crit ? 0xffe08a : 0xff8a3a, crit ? 8 : 5);
    return true;
  }

  // ---------------------------------------------------------------- the frame
  update(dt: number) {
    this.geyserCd = Math.max(0, this.geyserCd - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.chainT = Math.max(0, this.chainT - dt);
    if (!this.chainT) this.chain = 0;
    if (this.p.onGround) { this.airDash = 1; this.updraft = this.fused ? UPDRAFT_T * 1.7 : UPDRAFT_T; }
    this.cometT = Math.max(0, this.cometT - dt);
    // Heat cools once he stops landing blows.
    this.heatRest += dt;
    if (this.heatRest > HEAT_REST && this.heat > 0) this.heat = Math.max(0, this.heat - HEAT_COOL * dt * (this.heatTier === 3 ? 0.5 : 1));
    for (const [f, sc] of this.scorch) { sc.t -= dt; if (sc.t <= 0 || !f.alive) this.scorch.delete(f); }
    this.updateUpdraft(dt);
    this.drawHeat(dt);
    for (const s of this.shots) {
      if (s.life <= 0) continue;
      s.life -= dt;
      const nx = s.x + s.vx * dt, ny = s.y + s.vy * dt, wave = s.kind === 'wave', pierce = wave || s.kind === 'bolt';
      // A fireball bursts on the first wall or foe; a wave or a bolt passes through foes and breaks on walls.
      const t = this.w.tileAt(Math.floor(nx / TILE), Math.floor(ny / TILE));
      let end = s.life <= 0 || isSolid(t as T);
      if (!end) for (const f of this.w.foes()) {
        if (!f.alive || s.hits.has(f)) continue;
        const b = f.box, r = wave ? 18 : 8;
        if (nx + r < b.left || nx - r > b.right || ny + (wave ? 22 : 8) < b.top || ny - (wave ? 22 : 8) > b.bottom) continue;
        s.hits.add(f);
        if (s.kind === 'great') { end = true; break; }
        this.strike(f, s.dmg, Math.sign(s.vx) || this.p.face, wave ? 2.5 : s.kind === 'bolt' ? 2 : 1, pierce, wave ? 160 : 60);
        // Fused or Hot, a fireball leaves the ground burning where it struck.
        if ((s.big || this.heatTier >= 2) && !wave) this.ignite(f.x, f.box.bottom, 2, 0.3, 26, 0.42);
        if (!pierce) { end = true; this.burst(nx, ny, s.big ? 0.5 : 0.38); this.w.playEffect('fireBurst', { x: nx, vol: 0.5 }); break; }
      }
      s.x = nx; s.y = ny;
      if (end) {
        s.life = 0; s.img.setVisible(false).stop();
        if (s.kind === 'great') { this.explode(s.x, s.y, 60 + 60 * s.pow, s.dmg, 0.7 + 0.5 * s.pow); if (s.pow > 0.5) this.w.shockwave?.(s.x, s.y, 90 + 80 * s.pow, 0.45); this.ignite(s.x - 24, s.y + 20, 3, 0.3, 30); this.ignite(s.x + 24, s.y + 20, 3, 0.3, 30); }
        else if (!wave && !s.hits.size) this.burst(s.x, s.y, 0.32);
        continue;
      }
      s.img.setPosition(s.x, s.y + (wave ? 0 : Math.sin(s.life * 30) * 0.8));
      if (wave && s.life < 0.2) s.img.setAlpha(s.life / 0.2);
    }
    for (const g of this.grounds) {
      if (g.t <= 0) continue;
      g.t -= dt; g.tick -= dt;
      if (g.t <= 0) { g.img.setVisible(false).stop(); continue; }
      if (g.t < 0.4) g.img.setAlpha(g.t / 0.4);
      // It burns whatever stands in it, a few times a second.
      if (g.tick <= 0) { g.tick = 0.33; for (const f of this.w.foes()) if (f.alive && Math.abs(f.x - g.x) < g.r && Math.abs(f.box.bottom - g.y) < 24) this.strike(f, g.dmg, 0, 0.2, false, 0); }
    }
    if (this.stormT > 0) {
      this.stormT -= dt; this.stormTick -= dt;
      if (this.stormTick <= 0 && this.here) {
        this.stormTick = 0.28;
        const marks = this.nearest(5, 380), f = marks[Math.floor(Math.random() * marks.length)];
        if (f) this.aimShot(f.x - 50, f.box.centerY - 170, 'ball', f, 1.1);
      }
    }
    this.updateShaman(dt);
  }

  /** Hold Jump while falling: a jet of fire under his feet slows the fall and burns what is below. */
  private updateUpdraft(dt: number) {
    const p = this.p, c = this.w.controls;
    const on = this.here && p.state === 'free' && !p.onGround && !p.water.swimming && c.down('jump') && p.body.velocity.y > 40 && this.updraft > 0;
    if (!on) return;
    this.updraft -= dt;
    this.tally.updraft += dt;
    p.body.setVelocityY(Math.min(p.body.velocity.y, 70));
    this.jetT -= dt; this.jetBurn -= dt;
    if (this.jetT <= 0) { this.jetT = 0.06; this.w.spark(p.x + (Math.random() - 0.5) * 8, p.feet + 4, Math.random() < 0.5 ? 0xff8a3a : 0xffd27a, 2); }
    if (this.jetBurn <= 0) {
      this.jetBurn = 0.3;
      this.burst(p.x, p.feet + 14, 0.22);
      for (const f of this.w.foes()) if (f.alive && Math.abs(f.x - p.x) < f.box.width / 2 + 14 && f.box.top > p.feet - 10 && f.box.top < p.feet + 130) this.strike(f, 0.45, 0, 0.5, false, 0, 60, false);
    }
  }

  /** His Heat, as a small bar over his head, and embers about him while he is Blazing. */
  private drawHeat(dt: number) {
    const p = this.p, g = this.heatBar, show = this.here && this.heat > 0.5;
    if (!g.scene) return;
    if (!show) { if (g.visible) g.setVisible(false); this.heatDrawn = -1; return; }
    const tier = this.heatTier, w = 28;
    // Redrawn only when it has moved a little (or flickers while Blazing).
    const key = Math.round(this.heat) + tier * 1000 + (tier === 3 ? Math.floor(this.w.sc.time.now / 120) % 2 : 0) * 10000;
    if (key !== this.heatDrawn) {
      this.heatDrawn = key;
      g.clear();
      g.fillStyle(0x140a06, 0.7).fillRect(-w / 2 - 1, -1, w + 2, 5);
      const col = tier === 3 && key >= 10000 ? 0xffffff : HEAT_COLORS[tier];
      g.fillStyle(col, 1).fillRect(-w / 2, 0, (w * this.heat) / 100, 3);
      for (const m of HEAT_TIERS.slice(0, 2)) g.fillStyle(0x140a06, 0.9).fillRect(-w / 2 + (w * m) / 100, 0, 1, 3);
    }
    g.setPosition(Math.round(p.x), Math.round(p.body.top - 16)).setVisible(true);
    if (tier === 3) {
      this.auraT -= dt;
      if (this.auraT <= 0) { this.auraT = 0.07; this.w.spark(p.x + (Math.random() - 0.5) * 24, p.feet - Math.random() * 40, 0xffb347, 1); }
    }
  }

  /** The shaman keeps at his back and chants fire at the nearest foe; fused, the chant comes from Uri's own hand. */
  private updateShaman(dt: number) {
    const p = this.p, here = this.here;
    if (p.state !== 'transform' && this.mergeU > 0) this.mergeU = 0;
    // The merge: the orc runs into Uri on a curve, shrinking, his fire drawn in after him.
    if (here && this.mergeU > 0 && p.state === 'transform') {
      const u = this.mergeU, e = u * u * (3 - 2 * u), key = actionAtlas(this.w.sc, 'shaman', 'blade');
      this.shamanX = this.mergeFrom + (p.x - this.mergeFrom) * e;
      this.shamanClipT += dt;
      this.shaman.setTexture(key, actionFrame(this.w.sc, key, 'run', (this.shamanClipT * 2.4) % 0.999)).setScale(1.05 * (1 - 0.5 * e))
        .setPosition(Math.round(this.shamanX), Math.round(p.feet - Math.sin(u * Math.PI) * 26)).setFlipX(p.x < this.mergeFrom).setVisible(true)
        .setAlpha(1 - 0.45 * e).setTint(Phaser.Display.Color.GetColor(255, 255 - Math.round(150 * e), 255 - Math.round(255 * e)));
      // A spiral of sparks winds in from the orc to Uri.
      this.mergeSpark -= dt;
      if (this.mergeSpark <= 0) {
        this.mergeSpark = 0.04;
        const a = u * 14, r = (1 - e) * 46;
        this.w.spark(p.x + Math.cos(a) * r, p.feet - 24 + Math.sin(a) * r * 0.6, u > 0.7 ? 0xffe08a : 0xff8a3a, 2);
        this.w.spark(p.x - Math.cos(a) * r, p.feet - 24 - Math.sin(a) * r * 0.6, 0xff8a3a, 1);
      }
      if (u >= 1) { this.burst(p.x, p.feet - 26, 1.1); this.shaman.setVisible(false).clearTint(); this.mergeU = 0; }
      return;
    }
    this.shaman.clearTint();
    if (!here || this.fused || !this.out) {
      if (this.shaman.visible) { if (here && this.out) this.burst(this.shamanX, p.feet - 20, 0.6); this.shaman.setVisible(false); }
      if (here && this.fused) this.chant(dt, p.x + p.face * 12, 1.0);
      return;
    }
    if (!this.shaman.visible) { this.shamanX = p.x - p.face * 26; this.burst(this.shamanX, p.feet - 20, 0.6); }
    const want = p.x - p.face * 26;
    this.shamanX += (want - this.shamanX) * Math.min(1, dt * 4);
    this.shamanClipT += dt;
    this.chant(dt, this.shamanX, 1.4);
    if (this.shamanClip === 'cast' && this.shamanClipT > 0.4) this.shamanClip = 'idle';
    const key = actionAtlas(this.w.sc, 'shaman', 'blade');
    const u = this.shamanClip === 'cast' ? this.shamanClipT / 0.4 : (this.shamanClipT / 3) % 1;
    this.shaman.setTexture(key, actionFrame(this.w.sc, key, this.shamanClip, Math.min(0.999, u))).setScale(1.05)
      .setPosition(Math.round(this.shamanX), Math.round(p.feet)).setFlipX(p.face < 0).setVisible(true).setAlpha(0.95);
  }

  private chant(dt: number, x: number, every: number) {
    this.chantT -= dt;
    if (this.chantT > 0) return;
    this.chantT = every;
    const y = this.p.feet - 34, f = this.target(300, x, y);
    if (!f) return;
    this.tally.chants++;
    this.aimShot(x + (Math.sign(f.x - x) || this.p.face) * 14, y, 'ball', f, 0.7);
    this.shamanClip = 'cast'; this.shamanClipT = 0;
  }

  /** Fused: Uri stands larger, and the shaman's shape burns inside him. Called after the player's sprite is posed. */
  dress(sprite: Phaser.GameObjects.Sprite, clip: string, u: number) {
    if (!this.fused || this.p.dead || this.w.save.playableHero !== 'uri') { if (this.ghost.visible) this.ghost.setVisible(false); return; }
    sprite.setScale(sprite.scaleX * 1.14, sprite.scaleY * 1.14);
    const key = actionAtlas(this.w.sc, 'shaman', 'blade'), time = this.w.sc.time.now / 1000;
    this.ghost.setTexture(key, actionFrame(this.w.sc, key, clip, Math.min(0.999, Math.max(0, u))))
      .setPosition(sprite.x - this.p.face * 3, sprite.y).setFlipX(sprite.flipX).setScale(1.3 + Math.sin(time * 7) * 0.03)
      .setAlpha(0.42 + Math.sin(time * 11) * 0.08).setDepth(sprite.depth - 0.5).setVisible(sprite.visible);
  }

  /** Leaving him (a switch, a blow): the cast under way is dropped. */
  cancel() {
    if (this.p.state === 'flame') this.p.releaseState();
    this.cast = null; this.queued = null; this.cometQueued = false;
    if (this.orb.scene) this.orb.setVisible(false).stop();
    this.charge = 0;
  }
  /** A new room: his fire in flight and on the ground stays behind. */
  clearRoom() {
    // The world clears a room before its new player exists, so this kit may belong to a scene run already torn down:
    // its sprites are destroyed then, and only the numbers need resetting.
    const hide = (o: Phaser.GameObjects.Sprite) => { if (o.scene) o.setVisible(false).stop(); };
    for (const s of this.shots) { s.life = 0; hide(s.img); }
    for (const g of this.grounds) { g.t = 0; hide(g.img); }
    for (const b of this.bursts) hide(b);
    hide(this.shaman); hide(this.ghost); hide(this.orb);
    if (this.heatBar.scene) this.heatBar.setVisible(false);
    this.stormT = 0; this.scorch.clear(); this.charge = 0; this.cometT = 0; this.cometQueued = false;
  }
}
