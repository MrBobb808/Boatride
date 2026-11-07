// The Watch's shadows (POLISH_PLAN §18): the main game's nine Echoes, earned here and not given. Elite foes and gates'
// bosses leave essence of a species; enough of it raises that shadow, and more levels it. A team of them (the slots open
// with his Watch level) fights beside him, each in the role the main game gives it (game/data.ts ECHO_ROLES), its
// ability growing through the species' three stages: guardians shield him, fighters and ninjas cut, rangers and mages
// strike from behind, healers mend. This file is their data and their part of the fight.
import Phaser from 'phaser';
import { ECHO_SPECIES, ECHO_ROLES, defaultEchoRole, type EchoRole } from '../../../../remnant/src/game/data';
import { sfx } from '../../../../remnant/src/audio/audio';
import type { WatchSave } from './defs';
import { clamp01, within, soft, weigh, compensate, STICK } from '../../../../remnant/src/game/utility';

export type ShadowId = 'sentinel' | 'archer' | 'knight' | 'brute' | 'bulwark' | 'lion' | 'undying' | 'marshal' | 'locust';
export const SHADOW_ORDER: ShadowId[] = ['sentinel', 'archer', 'knight', 'brute', 'bulwark', 'lion', 'undying', 'marshal', 'locust'];
export const ROLE_ORDER: EchoRole[] = ['guardian', 'fighter', 'ninja', 'ranger', 'mage', 'herald'];

/** The main game's Echo sheets (render/creatureSprites.ts; four keyframes a row, feet on 88). The Undying Captain has no
 * Echo sheet there (it is painted), so it wears the veil sheet's armoured spearman. */
export const SHADOW_ART: Record<ShadowId, { sheet: string; row: number; ox: number; scale: number }> = {
  sentinel: { sheet: 'echo-vanguard', row: 0, ox: 34, scale: 0.8 },
  archer: { sheet: 'echo-vanguard', row: 1, ox: 36, scale: 0.8 },
  brute: { sheet: 'echo-vanguard', row: 2, ox: 36, scale: 0.86 },
  bulwark: { sheet: 'echo-vanguard', row: 3, ox: 35, scale: 0.84 },
  knight: { sheet: 'echo-sovereign', row: 0, ox: 35, scale: 0.8 },
  marshal: { sheet: 'echo-sovereign', row: 1, ox: 29, scale: 0.84 },
  locust: { sheet: 'echo-sovereign', row: 2, ox: 35, scale: 0.86 },
  lion: { sheet: 'echo-sovereign', row: 3, ox: 62, scale: 0.86 },
  undying: { sheet: 'foes-veil', row: 3, ox: 35, scale: 0.84 },
};

/** Essence to raise each, and to take it a level further (to 30). */
export const UNLOCK_COST: Record<ShadowId, number> = { sentinel: 5, archer: 5, knight: 5, brute: 8, bulwark: 8, lion: 8, undying: 10, marshal: 12, locust: 15 };
export const SHADOW_MAX = 30;
export const levelCost = (lv: number) => Math.ceil(2 + lv * 1.25);
/** The species' stage (the main game's three): II from level 10, III from 20. */
export const tierOf = (lv: number) => (lv >= 20 ? 3 : lv >= 10 ? 2 : 1);
export const shadowName = (id: ShadowId, lv: number) => ECHO_SPECIES[id].stages[tierOf(lv) - 1].name;
export const shadowRole = (w: WatchSave, id: ShadowId): EchoRole => w.shadows?.[id]?.role ?? defaultEchoRole(id);

/** Which shadow's essence a major foe leaves: the kind it is, or the nearest in spirit. */
export const ESSENCE_OF: Record<string, ShadowId> = {
  husk: 'sentinel', sentinel: 'sentinel', archer: 'archer', knight: 'knight', brute: 'brute', bulwark: 'bulwark', priest: 'archer', scribe: 'archer',
  hound: 'lion', lion: 'lion', drone: 'locust', soldier: 'knight', wisp: 'archer', vessel: 'undying',
  skeleton: 'undying', hellcat: 'lion', lantern: 'archer', wraith: 'undying', hellhound: 'lion', hellbeast: 'brute', wizard: 'archer',
  ghoul: 'knight', spider: 'locust', swampthing: 'brute', bogghost: 'undying', wolf: 'lion', nightmare: 'knight', fireskull: 'locust',
};
/** And a gate's holder (game/watch/scenes.ts WATCH_BOSSES keys), with a measure of the Marshal's besides. */
export const BOSS_ESSENCE: Record<string, ShadowId> = { shade: 'undying', varkhos: 'lion', morvane: 'locust', azkar: 'brute', mare: 'knight', brimstone: 'bulwark' };

export const owned = (w: WatchSave, id: ShadowId) => (w.shadows?.[id]?.lv ?? 0) > 0;

// ---------------------------------------------------------------- in the fight

/** What the band needs of the wall. */
export interface BandFoe { x: number; alive: boolean; boss: string | null; atkT: number; chill: number; hp: number; max: number; elite: boolean }
export interface BandHost {
  hx: number;
  foesAlive(): BandFoe[];
  hit(f: BandFoe, dmg: number, big: boolean): void;
  heal(frac: number): void;
  flare(x: number, y: number, tint: number, scale: number): void;
}
interface Member { id: ShadowId; role: EchoRole; lv: number; img: Phaser.GameObjects.Image; cd: number; cd2: number; hits: number; strikeT: number; lunge: number; blinkT: number; blinkX: number;
  /** The foe it last chose (kept on a near-tie: game/utility.ts). */
  aim: BandFoe | null }
interface Bolt { img: Phaser.GameObjects.Image; t: number; dur: number; x0: number; y0: number; f: BandFoe | null; dmg: number }

/** How each role weighs a foe when it chooses (POLISH_PLAN §19 phase 4; game/utility.ts): [the foe's nearness to him,
 * its wounds, its blow about to fall, a gold elite or the holder, a foe not chilled yet, a foe other than the one
 * before him]. The guardian and the fighter keep to the foe before him. */
const PICK: Partial<Record<EchoRole, readonly [number, number, number, number, number, number]>> = {
  ninja: [0.3, 1, 0.3, 1, 0, 1.2],
  ranger: [0, 0.8, 1, 0.8, 0, 0.5],
  mage: [1, 0.3, 0.5, 0.5, 1.5, 0],
};
/** The foe a role would choose now: each one scored by its weights, the last one chosen kept on a near-tie. */
export function pickFoe(role: EchoRole, foes: BandFoe[], hx: number, front: BandFoe | null, last: BandFoe | null): BandFoe | null {
  const w = PICK[role];
  if (!w) return front;
  let best: BandFoe | null = null, bs = 0;
  for (const f of foes) {
    if (!f.alive) continue;
    const s = weigh(soft(within(Math.abs(f.x - hx), 420), 0.2), w[0])
      * weigh(soft(1 - f.hp / Math.max(1, f.max), 0.4), w[1])
      * weigh(soft(1 - clamp01(f.atkT / 2), 0.3), w[2])
      * weigh(f.boss || f.elite ? 1 : 0.6, w[3])
      * weigh(f.chill > 0 ? 0.3 : 1, w[4])
      * weigh(f === front ? 0.55 : 1, w[5]);
    const v = compensate(s, 6) * (f === last ? STICK : 1);
    if (v > bs) { bs = v; best = f; }
  }
  return best;
}

const COLOR = (r: EchoRole) => Phaser.Display.Color.HexStringToColor(ECHO_ROLES[r].color).color;

export class ShadowBand {
  members: Member[] = [];
  private bolts: Bolt[] = [];
  private g: Phaser.GameObjects.Graphics;
  private zapT = 0;
  private zap: number[] = [];
  private loopT = 0;

  constructor(private sc: Phaser.Scene, private host: BandHost, private ground: number) {
    this.g = sc.add.graphics().setDepth(8.5);
    for (let i = 0; i < 16; i++) this.bolts.push({ img: sc.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setVisible(false).setDepth(8), t: -1, dur: 0, x0: 0, y0: 0, f: null, dmg: 0 });
  }

  /** The team as the save holds it (called when it changes). */
  rebuild(w: WatchSave) {
    for (const m of this.members) m.img.destroy();
    this.members = (w.team ?? []).filter((id) => owned(w, id)).map((id, i) => {
      const a = SHADOW_ART[id];
      const img = this.sc.add.image(0, this.ground, a.sheet, a.row * 4).setOrigin(a.ox / 96, 88 / 96).setScale(a.scale).setDepth(3 - i * 0.01);
      return { id, role: shadowRole(w, id), lv: w.shadows![id]!.lv, img, cd: 0.8 + i * 0.3, cd2: 4 + i, hits: 0, strikeT: 0, lunge: 0, blinkT: 0, blinkX: 0, aim: null };
    });
  }

  /** The share of each blow on him that the guardians take (their Aegis), at most 60%. */
  aegis() {
    let a = 0;
    for (const m of this.members) if (m.role === 'guardian') a += [0.12, 0.18, 0.25][tierOf(m.lv) - 1];
    return Math.min(0.6, a);
  }

  /** One step: each shadow acts by its role. `atk` is his blow; `live` is false while he is down or a combo plays. */
  tick(dt: number, atk: number, running: boolean, live: boolean, reach: number) {
    this.loopT += dt;
    const foes = this.host.foesAlive(), hx = this.host.hx;
    const front = foes.reduce<BandFoe | null>((b, f) => (!b || f.x < b.x ? f : b), null);
    const far = foes.reduce<BandFoe | null>((b, f) => (!b || f.x > b.x ? f : b), null);
    // A Marshal or the Locust King in the band makes the others fight harder (the main game's command auras).
    const lead = this.members.some((m) => m.id === 'locust') ? 1.2 : this.members.some((m) => m.id === 'marshal') ? 1.15 : 1;
    const g = this.g.clear();
    this.members.forEach((m, i) => {
      const tier = tierOf(m.lv), base = ECHO_SPECIES[m.id].baseAtk;
      const power = atk * (0.16 + 0.012 * m.lv) * Math.sqrt(base / 20) * (1 + 0.25 * (tier - 1)) * (m.id === 'locust' || m.id === 'marshal' ? 1 : lead);
      m.cd -= dt; m.cd2 -= dt; m.strikeT = Math.max(0, m.strikeT - dt); m.lunge = Math.max(0, m.lunge - dt * 40); m.blinkT = Math.max(0, m.blinkT - dt);
      const near = !!front && front.x <= hx + reach + 26;
      if (live && foes.length) this.act(m, tier, power, front, far, foes, near);
      // Drawn in a line behind him; a lunge steps forward, a blink is beside its foe.
      const x = m.blinkT > 0 ? m.blinkX : hx - 24 - i * 16 + m.lunge;
      const a = SHADOW_ART[m.id];
      const frame = m.strikeT > 0 ? 3 : running ? 1 + (Math.floor(this.loopT * 8 + i) % 2) : Math.floor(this.loopT * 2 + i) % 2;
      m.img.setFrame(a.row * 4 + frame).setPosition(x, this.ground).setVisible(live || !foes.length).setFlipX(false);
      // The role's mark over its head.
      g.fillStyle(COLOR(m.role), 0.9).fillTriangle(x - 2, this.ground - 50, x + 2, this.ground - 50, x, this.ground - 47);
    });
    for (const b of this.bolts) {
      if (b.t < 0) continue;
      b.t += dt;
      const tx = b.f && b.f.alive ? b.f.x : b.x0 + 120, ty = this.ground - 20, u = Math.min(1, b.t / b.dur);
      b.img.setPosition(b.x0 + (tx - b.x0) * u, b.y0 + (ty - b.y0) * u - Math.sin(u * Math.PI) * 6);
      if (u >= 1) { b.t = -1; b.img.setVisible(false); if (b.f && b.f.alive) this.host.hit(b.f, b.dmg, false); }
    }
    if (this.zapT > 0) {
      this.zapT -= dt;
      g.lineStyle(1.2, 0xc9c4ff, Math.min(1, this.zapT * 8));
      for (let k = 0; k + 3 < this.zap.length; k += 2) g.lineBetween(this.zap[k], this.zap[k + 1], this.zap[k + 2], this.zap[k + 3]);
    }
  }

  private act(m: Member, tier: number, power: number, front: BandFoe | null, far: BandFoe | null, foes: BandFoe[], near: boolean) {
    const hx = this.host.hx;
    switch (m.role) {
      case 'guardian':
        // Aegis is passive (aegis()); it strikes when close, and bashes the foe before him to stop its blow.
        if (near && m.cd <= 0 && front) { m.cd = 2.2; m.strikeT = 0.25; m.lunge = 8; this.host.hit(front, power * 0.7, false); }
        if (near && m.cd2 <= 0 && front) { m.cd2 = 6; front.atkT += 1; this.host.flare(front.x - 8, this.ground - 24, COLOR('guardian'), 0.35); sfx('shieldBash', { vol: 0.3 }); }
        break;
      case 'fighter':
        if (near && m.cd <= 0 && front) {
          m.cd = 1.3; m.strikeT = 0.22; m.lunge = 12; m.hits++;
          // Every fourth blow is a Breaker Rush; from stage II its seismic finish takes the whole line near him.
          const rush = m.hits % 4 === 0;
          if (rush && tier >= 2) for (const f of foes) { if (f.x <= hx + 80) this.host.hit(f, power * 1.5, true); }
          else this.host.hit(front, power * (rush ? 3 : 1), rush);
          if (tier >= 3) this.host.heal(0.004);
        }
        break;
      case 'ninja':
        if (m.cd <= 0 && (front || far)) {
          // Mirage Rush: a blink to a foe and a cut, and a star thrown at another; doubles from stage II.
          const t = (m.aim = pickFoe('ninja', foes, hx, front, m.aim)) ?? front ?? far!;
          m.cd = 2.4; m.strikeT = 0.25; m.blinkT = 0.35; m.blinkX = t.x - 12;
          this.host.hit(t, power * 1.4, false);
          const other = foes.find((f) => f !== t);
          if (other) this.shoot(m.blinkX, other, power * 0.6, COLOR('ninja'));
          if (tier >= 2) { this.host.hit(t, power * 0.5, false); this.host.hit(t, power * 0.5, false); }
          if (tier >= 3) this.host.hit(t, power * 2, true);
          sfx('slice', { vol: 0.25, pitch: 1.2 });
        }
        break;
      case 'ranger':
        if (m.cd <= 0 && far) {
          m.cd = 1.1; m.strikeT = 0.2; m.hits++;
          // The foe whose blow is about to fall, a wounded one, an elite: chosen, not merely the last in line.
          const t = (m.aim = pickFoe('ranger', foes, hx, front, m.aim)) ?? far;
          this.shoot(m.img.x + 6, t, power * 0.8, COLOR('ranger'));
          // From stage II every third arrow goes through to the next foe.
          if (tier >= 2 && m.hits % 3 === 0) { const next = foes.filter((f) => f !== t).sort((a, b) => b.x - a.x)[0]; if (next) this.shoot(m.img.x + 6, next, power * 0.8, COLOR('ranger')); }
        }
        if (tier >= 3 && m.cd2 <= 0) { m.cd2 = 10; for (let k = 0; k < 6; k++) this.shoot(m.img.x + 6, foes[k % foes.length], power * 0.8, 0xfff1c4); }
        break;
      case 'mage':
        if (m.cd <= 0 && front) {
          // Arcane Volley: three bolts that chill; Starfire (II) on the same foe; Chain Lightning (III) through three.
          // It chills a near foe its frost is not on yet.
          m.cd = 3; m.strikeT = 0.3;
          const t = (m.aim = pickFoe('mage', foes, hx, front, m.aim)) ?? front;
          for (let k = 0; k < 3; k++) this.shoot(m.img.x + 6, t, power * 0.6, COLOR('mage'), k * 0.07);
          t.chill = 3;
          if (tier >= 2) { this.host.hit(t, power * 1.5, true); this.host.flare(t.x, this.ground - 30, 0xfff1c4, 0.5); }
          if (tier >= 3) {
            const chain = [...foes].sort((a, b) => a.x - b.x).slice(0, 3);
            this.zap = [m.img.x + 6, this.ground - 30];
            for (const f of chain) { this.host.hit(f, power * 0.8, false); this.zap.push(f.x, this.ground - 22 - Math.random() * 10); }
            this.zapT = 0.18; sfx('galeBolt', { vol: 0.25 });
          }
        }
        break;
      case 'herald':
        // Mending: a pulse of health for him (more at each stage), and a light bolt between.
        if (m.cd2 <= 0) { m.cd2 = 8; this.host.heal([0.1, 0.14, 0.18][tier - 1]); this.host.flare(hx, this.ground - 24, COLOR('herald'), 0.5); sfx('heal', { vol: 0.3 }); }
        if (m.cd <= 0 && front) { m.cd = 1.6; m.strikeT = 0.2; this.shoot(m.img.x + 6, front, power * 0.5, COLOR('herald')); }
        break;
    }
  }

  private shoot(x: number, f: BandFoe, dmg: number, tint: number, delay = 0) {
    const b = this.bolts.find((o) => o.t < 0);
    if (!b) { this.host.hit(f, dmg, false); return; }
    b.t = -delay; b.dur = 0.22 + Math.abs(f.x - x) / 900; b.x0 = x; b.y0 = this.ground - 30; b.f = f; b.dmg = dmg;
    b.img.setPosition(x, b.y0).setTint(tint).setScale(0.12).setVisible(true);
  }

  destroy() { for (const m of this.members) m.img.destroy(); this.g.destroy(); for (const b of this.bolts) b.img.destroy(); }
}
