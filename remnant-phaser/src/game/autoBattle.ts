// AUTO: in the survival modes (the Trial, Extreme, the Gauntlet, the Rush and the Daily Challenge, all in the Trial's
// arena) the hero in play can fight on his or her own. The pilot presses the same buttons a player would, through
// Controls (game/controls.ts), so every kit, tree and form works as it does by hand; a real stick or key still wins.
// It goes to the nearest foe, turns to it, strings blows at each hero's reach, uses the heavy where it pays (Barak's
// Chain Lightning on a pack, Uri's flame wave up close), casts abilities that are ready, transforms and spends the
// super when the gauges are full, steps away when struck, and drinks Balm when low.
import type { Action } from './controls';
import type { FoeLike } from './types';
import type { PhaserSave } from './save';
import { skillSlots, SKILLS, ARCHER, URI_SKILLS, archerUnlocked, isArcherSkill, type AnySkillId } from './abilities';
import { formLevel } from './archer';

/** What the pilot reads of the hero (kept narrow, so it never reaches into the Player's internals). */
export interface PilotHero {
  hero: string; x: number; y: number; feet: number; face: number; onGround: boolean; state: string; dead: boolean;
  hp: number; maxHp: number; mantleT: number; cds: Record<string, number>;
  flame: { out: boolean };
}

/** Each hero's fighting distance: how near he goes, and (for the ranged two) how near he lets a foe come. */
const REACH: Record<string, { reach: number; keep: number }> = {
  elior: { reach: 34, keep: 0 },
  barak: { reach: 40, keep: 0 },
  uri: { reach: 150, keep: 46 },
  tirzah: { reach: 190, keep: 70 },
};

/** States in which a press would be lost or would break something under way. */
const BUSY = new Set(['dodge', 'airdash', 'hurt', 'transform', 'scripted', 'bolt', 'dead', 'heal', 'execute', 'phantom', 'swim']);

const skillDef = (id: AnySkillId) => (URI_SKILLS as Record<string, { cost: number }>)[id] ?? (ARCHER as Record<string, { cost: number }>)[id] ?? (SKILLS as Record<string, { cost: number }>)[id];

export class AutoPilot {
  on = false;
  /** This step's held buttons and fresh presses, and the stick. Read by Controls. */
  readonly downs = new Set<Action>();
  readonly presses = new Set<Action>();
  axis = 0;
  private swingT = 0;
  private skillT = 0;
  private healT = 0;
  private dodgeT = 0;
  private formT = 0;
  private holdT = 0;
  private stuckT = 0;
  private lastX = 0;
  private lastHp = 0;
  private fresh = true;

  private blessT = 0;
  /** True once a blessing on offer has been up long enough to be read. */
  bless(dt: number) { this.blessT += dt; if (this.blessT < 1.4) return false; this.blessT = 0; return true; }

  toggle() { this.on = !this.on; this.clear(); this.fresh = true; return this.on; }

  clear() { this.downs.clear(); this.presses.clear(); this.axis = 0; this.holdT = 0; }

  /** One step of the pilot: choose this step's buttons. */
  think(dt: number, p: PilotHero, s: PhaserSave, foes: readonly FoeLike[]) {
    this.presses.clear();
    if (!this.on || p.dead) { this.downs.clear(); this.axis = 0; return; }
    if (this.fresh) { this.fresh = false; this.lastX = p.x; this.lastHp = p.hp; }
    for (const k of ['swingT', 'skillT', 'healT', 'dodgeT', 'formT'] as const) this[k] = Math.max(0, this[k] - dt);
    const hurt = p.hp < this.lastHp - 0.5;
    this.lastHp = p.hp;
    // A held heavy (Barak's Thunderhead) runs out its time, then lets go.
    if (this.holdT > 0) { this.holdT -= dt; this.axis = 0; if (this.holdT <= 0) this.downs.delete('heavy'); return; }
    this.downs.clear(); this.axis = 0;

    // The nearest foe that can be struck, and how many stand near.
    let foe: FoeLike | null = null, best = Infinity, near = 0;
    for (const f of foes) {
      const ph = f as FoeLike & { fighting?: boolean; ward?: boolean };
      if (!f.alive || f.removed || ph.fighting === false || ph.ward) continue;
      const dx = f.box.centerX - p.x, dy = f.box.centerY - (p.feet - 20), d = Math.abs(dx) + Math.abs(dy) * 0.6;
      if (Math.abs(dx) < 120 && Math.abs(dy) < 70) near++;
      if (d < best) { best = d; foe = f; }
    }
    // Uri fights with his orc at his side.
    if (p.hero === 'uri' && !p.flame.out && !s.flags.uri_orc) this.presses.add('echo');
    const free = !BUSY.has(p.state);
    if (!foe) { this.idle(dt, p); return; }

    const r = REACH[p.hero] ?? REACH.elior;
    const dx = foe.box.centerX - p.x, ax = Math.abs(dx), dir = Math.sign(dx) || p.face;
    const above = foe.box.bottom < p.feet - 36 && ax < 90;
    const edge = Math.max(0, ax - foe.box.width / 2);

    // Low on health and nothing at hand: Balm.
    if (p.hp < p.maxHp * 0.35 && (s.balm ?? 0) > 0 && this.healT <= 0 && edge > 60 && p.onGround) { this.healT = 4; this.presses.add('heal'); return; }
    // Struck at close quarters: a step away (the dodge goes the way he is pushed).
    if (hurt && edge < 60 && this.dodgeT <= 0) { this.dodgeT = 1.4; this.axis = -dir; this.presses.add('dodge'); return; }
    // The form and the super when their gauges are full and there is a fight to spend them on.
    if (this.formT <= 0 && p.mantleT <= 0 && (s.mantle ?? 0) >= 100 && formLevel(s) >= 25 && (near >= 2 || edge < 120)) { this.formT = 3; this.presses.add('transform'); return; }
    if (this.formT <= 0 && s.flags.relic_taken && (s.rally ?? 0) >= 100 && edge < 140) { this.formT = 3; this.presses.add('ultimate'); return; }

    // Move: in to his reach, or (for the ranged) back out to keep a foe off.
    if (edge > r.reach) this.axis = dir;
    // Backed against a wall, the ranged stand and fight.
    else if (r.keep && edge < r.keep && this.stuckT < 0.3) this.axis = -dir;
    // Stuck against something while walking: jump it. A foe above: jump to it.
    if (this.axis && Math.abs(p.x - this.lastX) < 0.4 * dt * 60) this.stuckT += dt; else this.stuckT = 0;
    this.lastX = p.x;
    if (p.onGround && ((this.axis === dir && this.stuckT > 0.35) || (above && edge < r.reach + 20))) { this.presses.add('jump'); this.downs.add('jump'); this.stuckT = 0; }
    if (edge > r.reach + 40 || !free) return;

    // Face the foe before striking (a tap of the stick toward it).
    if (p.face !== dir && !this.axis) { this.axis = dir; return; }
    // Abilities that are ready and paid for.
    if (this.skillT <= 0 && this.castReady(p, s, edge)) { this.skillT = 1.2; return; }
    // The heavy where it pays, else the string.
    if (this.swingT > 0) return;
    if (p.hero === 'barak' && near >= 2 && edge < 100 && p.onGround) {
      this.presses.add('heavy'); this.downs.add('heavy');
      // On a pack of three or more he gathers the Thunderhead.
      if (near >= 3) this.holdT = 0.6;
      this.swingT = 0.7; return;
    }
    if (p.hero === 'uri' && edge < 70 && Math.random() < 0.25) { this.presses.add('heavy'); this.swingT = 0.6; return; }
    if (p.hero === 'elior' && near >= 3 && Math.random() < 0.15) { this.presses.add('heavy'); this.swingT = 0.5; return; }
    this.presses.add('attack');
    this.swingT = p.hero === 'tirzah' ? 0.28 : p.hero === 'uri' ? 0.2 : 0.12;
  }

  /** Nothing to fight: stand easy (a stuck stick would walk him into a wall). */
  private idle(_dt: number, p: PilotHero) { this.stuckT = 0; this.lastX = p.x; }

  private castReady(p: PilotHero, s: PhaserSave, edge: number) {
    if (edge > 170 || (!s.flags.relic_taken && p.hero !== 'uri' && p.hero !== 'barak')) return false;
    const slots = skillSlots(s);
    for (let i = 0; i < 3; i++) {
      const id = slots[i];
      if (!id) continue;
      if (p.hero === 'elior' && !s.abilities.includes(id as (typeof s.abilities)[number])) continue;
      if (isArcherSkill(id) && !archerUnlocked(s, id)) continue;
      const def = skillDef(id);
      if (!def || (p.cds[id] ?? 0) > 0 || s.ce < def.cost) continue;
      this.presses.add((['skill1', 'skill2', 'skill3'] as const)[i]);
      return true;
    }
    return false;
  }
}
