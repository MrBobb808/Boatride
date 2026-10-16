// The Trial of the Remnant as an endless rounds mode, in the spirit of Call of
// Duty's Zombies. Foes pour in from both sides in rounds that never end; each
// round brings more of them, tougher and a little quicker. Every fifth round
// the Pack runs (hounds, later lions); every tenth a Champion comes with them.
// Now and then a foe drops a blessing. Falling ends the run: the Game Over card
// shows how many rounds you survived, and runs from round 1 go on the board.

import { G } from './ctx';
import { Entity } from './entity';
import { Enemy } from './enemies';
import { TILE, type EnemyKind } from './tiles';
import { xpToNext } from './data';
import { rollGear } from './world';
import { moveBody } from './physics';
import { recordRun, bestRounds, type RunEntry } from './board';
import { fx } from '../render/fx';
import { glow, type Ctx } from '../render/draw';
import { lighting } from '../render/lighting';
import { sfx } from '../audio/audio';
import { input } from '../core/input';
import { islandNotify } from '../ui/island';
import { icon } from '../ui/icons';
import { gameOver } from '../ui/leaderboard';
import { rand, choose, overlaps } from '../core/math';

const BREAK = 7;
const FLOOR_Y = 18 * TILE;
const SKY_Y = 10 * TILE;
const LANES = [8, 14, 22, 34, 42, 48];

type Boon = 'judgment' | 'wrath' | 'double' | 'manna';
const BOONS: Record<Boon, { name: string; sub: string; icon: string; color: string; time: number }> = {
  judgment: { name: 'JUDGMENT', sub: 'Fire falls on every foe in the arena', icon: 'sigil', color: '#ffb35a', time: 0 },
  wrath: { name: 'WRATH', sub: 'Every foe falls to one blow', icon: 'sword', color: '#ff5a4a', time: 18 },
  double: { name: 'DOUBLE PORTION', sub: 'Twice the experience from every foe', icon: 'echo', color: '#9fd8ff', time: 25 },
  manna: { name: 'MANNA', sub: 'Health, Balm, energy and hearts restored', icon: 'heal', color: '#f6dea0', time: 0 },
};

export class Rounds {
  active = false;
  /** The round in play (0 before the first). */
  round = 0;
  /** The round the run began at; only runs from round 1 are ranked. */
  from = 1;
  kills = 0;
  time = 0;
  /** Seconds left in the pause between rounds (0 while a round is on). */
  breakT = 0;
  /** Seconds since the round counter last changed (for its flash). */
  changeT = 9;
  level0 = 1;
  pack = false;
  wrathT = 0;
  doubleT = 0;
  private total = 0;
  private spawned = 0;
  private spawnT = 0;
  private boonsThisRound = 0;
  private foes: Enemy[] = [];
  private ending = false;

  /** Foes still to beat this round (spawned or not). */
  get left() {
    return this.total - this.spawned + this.foes.filter((f) => !f.dying && !f.remove).length;
  }

  start(from = 1) {
    this.stop(false);
    this.active = true;
    this.ending = false;
    this.from = Math.max(1, from);
    this.round = this.from - 1;
    this.kills = 0;
    this.time = 0;
    this.level0 = G.save.level;
    this.wrathT = this.doubleT = 0;
    this.total = this.spawned = 0;
    this.pack = false;
    this.foes = [];
    this.breakT = 3.2;
    G.ui.banner('THE TRIAL OF THE REMNANT', `Endless rounds${this.from > 1 ? ` from round ${this.from} (unranked)` : ''} · survive as long as you can`, 'boss');
  }

  /** End the run. Leaving mid-run still records how far it got. */
  stop(record = true) {
    if (this.active && record && this.round > 0) this.record();
    this.active = false;
    this.foes = [];
    this.round = 0;
  }

  update(dt: number) {
    if (!this.active || this.ending) return;
    const W = G.world;
    if (W.player.state === 'dead') return;
    this.time += dt;
    this.changeT += dt;
    this.wrathT = Math.max(0, this.wrathT - dt);
    this.doubleT = Math.max(0, this.doubleT - dt);
    // Count the fallen.
    for (const f of this.foes) {
      if (f.dying && !(f as Enemy & { _counted?: boolean })._counted) {
        (f as Enemy & { _counted?: boolean })._counted = true;
        this.kills++;
        this.maybeBoon(f);
      }
      if (this.wrathT > 0 && !f.dying) f.hp = Math.min(f.hp, 1);
    }
    this.foes = this.foes.filter((f) => !f.remove);
    if (this.breakT > 0) {
      this.breakT -= dt;
      if (this.breakT <= 0) this.beginRound();
      return;
    }
    const alive = this.foes.filter((f) => !f.dying).length;
    if (this.spawned < this.total) {
      this.spawnT -= dt;
      if (this.spawnT <= 0 && alive < this.maxAlive()) {
        this.spawnOne();
        this.spawnT = Math.max(0.35, 1.5 - this.round * 0.05) * (this.pack ? 0.6 : 1);
      }
    } else if (alive === 0) this.endRound();
  }

  private maxAlive() {
    return this.pack ? Math.min(10, 5 + Math.floor(this.round / 4)) : Math.min(12, 4 + Math.floor(this.round / 2));
  }

  private beginRound() {
    const n = ++this.round;
    this.pack = n % 5 === 0 && n % 10 !== 0;
    this.total = this.pack ? 6 + n : Math.min(70, 4 + n * 2 + (n > 10 ? n - 10 : 0));
    this.spawned = 0;
    this.spawnT = 0.6;
    this.boonsThisRound = 0;
    this.changeT = 0;
    if (n % 10 === 0) this.total += 1; // the Champion
    sfx(this.pack ? 'horn' : 'bell', { pitch: this.pack ? 0.8 : 0.55 + Math.min(0.5, n * 0.015) });
    input.rumble(0.5, 0.5, 280);
    islandNotify(`ROUND ${n}`, this.pack ? '#ff6a5a' : '#ffe6a8', 'rally', 2);
    if (this.pack) G.ui.banner(`ROUND ${n}`, 'The Pack runs', 'boss');
    else if (n % 10 === 0) G.ui.banner(`ROUND ${n}`, 'A Champion of the Trial comes', 'boss');
  }

  private endRound() {
    const n = this.round;
    const s = G.save;
    if (n > Number(s.flags.trial_best ?? 0)) s.flags.trial_best = n;
    if (n >= 10 && s.quests.s_trial && !s.quests.s_trial.done) G.world.story.quest('s_trial', 0, true);
    if (n % 5 === 0) this.reward(n);
    this.breakT = BREAK;
    this.changeT = 0;
    sfx('rally', { vol: 0.5 });
  }

  private spawnOne() {
    const W = G.world;
    const s = G.save;
    const n = this.round;
    this.spawned++;
    const champion = n % 10 === 0 && this.spawned === this.total;
    let k: EnemyKind;
    if (champion) k = (['brute', 'knight', 'bulwark', 'soldier'] as EnemyKind[])[(n / 10 - 1) % 4];
    else if (this.pack) k = n >= 15 && Math.random() < 0.35 ? 'lion' : 'hound';
    else k = choose(this.pool(n));
    // Heavies are a seasoning, never the meal.
    if (!champion && (k === 'brute' || k === 'bulwark') && this.foes.filter((f) => !f.dying && (f.kind === 'brute' || f.kind === 'bulwark')).length >= 2) k = 'soldier';
    const px = W.player.x / TILE;
    const lanes = LANES.filter((l) => Math.abs(l - px) > 7);
    const x = choose(lanes.length ? lanes : LANES) * TILE + rand(-12, 12);
    const flier = k === 'drone' || k === 'wisp' || k === 'vessel';
    const e = W.spawnEnemy(k, x, flier ? SKY_Y : FLOOR_Y, champion ? 'trial_champion' : null);
    const lvScale = 1 + Math.max(0, s.level - 12) * 0.05;
    const hpMul = (n < 10 ? 1 + 0.18 * (n - 1) : 2.62 * Math.pow(1.09, n - 10)) * lvScale * (champion ? 3 : 1);
    e.maxHp = e.hp = Math.round(e.maxHp * hpMul);
    e.dmg *= Math.min(5, 1 + (n - 1) * 0.07) * Math.pow(lvScale, 0.8);
    e.tempo = Math.min(1.4, 1 + (n - 1) * 0.012) * (this.pack ? 1.1 : 1);
    e.xpOverride = Math.max(10, Math.round((xpToNext(s.level) / 26) * (1 + n * 0.03) * (champion ? 8 : 1) * (this.doubleT > 0 ? 2 : 1)));
    if (champion) {
      e.purifiable = false;
      e.name = 'Champion of the Trial';
    }
    this.foes.push(e);
    fx.column(e.x, e.y, 20, 120, this.pack ? '#ff6a5a' : '#ffe6a8', 0.6);
  }

  private pool(n: number): EnemyKind[] {
    if (n <= 2) return ['husk', 'husk', 'hound'];
    if (n <= 5) return ['husk', 'hound', 'archer', 'drone', 'wisp'];
    if (n <= 9) return ['husk', 'archer', 'drone', 'soldier', 'knight', 'priest'];
    if (n <= 15) return ['archer', 'drone', 'soldier', 'knight', 'bulwark', 'priest', 'lion', 'sentinel'];
    if (n <= 22) return ['drone', 'soldier', 'knight', 'bulwark', 'brute', 'priest', 'lion', 'sentinel'];
    return ['soldier', 'knight', 'bulwark', 'brute', 'priest', 'lion', 'vessel', 'scribe', 'vessel', 'scribe'];
  }

  private reward(n: number) {
    const W = G.world;
    W.spawnLoot(28 * TILE, 16 * TILE, [{ silver: 60 * n }, { mat: 'covenant_fragment', n: 1 + Math.floor(n / 10) }, { mat: n >= 15 ? 'radiant_core' : 'sentinel_steel', n: 1 }, rollGear(Math.min(3, 1 + Math.floor(n / 10)))], true);
    G.ui.toast(`Round ${n} held: the Trial rewards you.`, 'good');
    fx.column(28 * TILE, 18 * TILE, 40, 240, '#ffe6a8', 1.2);
  }

  // ---------------------------------------------------------------- blessings
  private maybeBoon(f: Enemy) {
    if (this.boonsThisRound >= 4 || Math.random() > 0.035) return;
    this.boonsThisRound++;
    const b: Boon = choose(['judgment', 'wrath', 'double', 'manna'] as Boon[]);
    G.world.add(new BoonDrop(b, f.cx, f.cy));
  }

  grant(b: Boon) {
    const W = G.world;
    const s = G.save;
    const def = BOONS[b];
    G.ui.banner(def.name, def.sub, 'ability');
    islandNotify(def.name, def.color, def.icon, 2.2);
    input.rumble(0.6, 0.8, 260);
    sfx('lootRare', { vol: 0.7 });
    if (b === 'judgment') {
      fx.flash('#ffd27a', 0.5);
      for (const e of this.foes) if (!e.dying) {
        e.hp = 0;
        e.die();
        fx.column(e.x, e.y, 24, 160, '#ffb35a', 0.7);
      }
      sfx('pillarFire', { vol: 0.7 });
    } else if (b === 'wrath') this.wrathT = def.time;
    else if (b === 'double') {
      this.doubleT = def.time;
      for (const e of this.foes) if (!e.dying && e.xpOverride) e.xpOverride *= 2;
    } else {
      W.rest();
      s.hearts = Math.min(99, (s.hearts ?? 0) + 10);
      G.ui.refreshHud();
    }
  }

  // ---------------------------------------------------------------- the end of a run
  private record(): { entry: RunEntry | null; place: number; best: boolean } {
    const s = G.save;
    const prevBest = bestRounds();
    if (this.round > Number(s.flags.trial_best ?? 0)) s.flags.trial_best = this.round;
    if (this.from > 1) return { entry: null, place: 0, best: false };
    const { entry, place } = recordRun({ rounds: this.round, kills: this.kills, time: this.time, level: s.level });
    return { entry, place, best: this.round > prevBest };
  }

  /** Elior fell in the arena: show the Game Over card. Resolves when the player has chosen. */
  async onDeath(): Promise<'again' | 'leave'> {
    this.ending = true;
    for (const f of this.foes) f.aggro = false;
    const res = this.record();
    const stats = { rounds: this.round, kills: this.kills, time: this.time, level: G.save.level, levels: G.save.level - this.level0, from: this.from };
    this.active = false;
    const choice = await gameOver(stats, res.entry, res.place, res.best);
    return choice;
  }

  /** Clear the arena after a run (before starting again or leaving). */
  clearArena() {
    for (const e of G.world.ents) if ((e as Enemy).isFoe || e instanceof BoonDrop) e.remove = true;
    this.foes = [];
  }
}

/** A blessing dropped by a fallen foe. Touch it to take it. */
class BoonDrop extends Entity {
  t = 0;
  life = 22;
  boon: Boon;

  constructor(b: Boon, x: number, y: number) {
    super(x, y, 14, 14);
    this.boon = b;
    this.body.vy = -160;
    this.layer = 7;
  }

  update(dt: number) {
    const W = G.world;
    const b = this.body;
    this.t += dt;
    this.life -= dt;
    if (this.life <= 0) { this.remove = true; return; }
    b.vy = Math.min(b.vy + 700 * dt, 300);
    moveBody(b, dt, W.grid, W.solid);
    if (this.t > 0.3 && overlaps(this.hurtbox(), W.player.hurtbox())) {
      this.remove = true;
      W.story.ch3.rounds.grant(this.boon);
    }
  }

  draw(ctx: Ctx) {
    if (this.life < 5 && Math.floor(this.life * (this.life < 2 ? 10 : 5)) % 2 === 0) return;
    const def = BOONS[this.boon];
    const y = this.y - 12 + Math.sin(this.t * 3) * 2;
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, this.x, y, 22, def.color, 0.55 + Math.sin(this.t * 6) * 0.15);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(icon(def.icon, def.color, 32), this.x - 8, y - 8, 16, 16);
  }

  lights() {
    lighting.add(this.x, this.y - 12, 60, BOONS[this.boon].color, 0.7, 0.5);
  }
}
