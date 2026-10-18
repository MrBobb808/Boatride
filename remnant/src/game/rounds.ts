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
import { xpToNext, ECHO_SPECIES, ITEMS } from './data';
import { claimTrialMilestone, derive } from './state';
import { BLESSINGS, runBlessings, type BlessingId } from './blessings';
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
import { gauntletBoss, gauntletImprint, originalForm, BOSS_COUNT } from './gauntlet';
import { bossScale } from './difficulty';

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
  bossOnly = false;
  completed = 0;
  rematchSpecies: string | null = null;
  private boss: Entity | null = null;
  private bossHp = 1800;
  private bossDamage = 12;
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
  /** Foes standing, as of the last update (the HUD reads it every frame). */
  private alive = 0;
  private ending = false;
  pendingBlessings: BlessingId[] = [];
  private blessingEpoch = 0;
  private blessingAbort: AbortController | null = null;
  get awaitingBlessing() { return this.pendingBlessings.length > 0; }
  cancelBlessing() {
    this.blessingEpoch++;
    this.pendingBlessings = [];
    this.blessingAbort?.abort(); this.blessingAbort = null;
  }

  /** Foes still to beat this round (spawned or not). */
  get left() {
    return this.total - this.spawned + this.alive;
  }

  start(from = 1, bossOnly = false) {
    this.stop(false);
    this.active = true;
    this.bossOnly = bossOnly;
    runBlessings.reset(!bossOnly);
    G.d = derive(G.save);
    const original = String(G.save.flags.echo_trial_species ?? '');
    this.rematchSpecies = bossOnly && ECHO_SPECIES[original] && G.save.echoes.some((e) => e.species === original) ? original : null;
    this.boss = null;
    // Snapshot entry strength so leveling during a run never changes its rules.
    this.bossHp = Math.max(1800, G.d.atk * G.d.meleeMult * 65) * bossScale().hp;
    this.bossDamage = Math.max(10, G.d.maxHp * 0.1) * bossScale().dmg;
    this.ending = false;
    this.from = Math.max(1, Math.floor(Number(from) || 1));
    this.completed = this.from - 1;
    this.round = this.from - 1;
    this.kills = 0;
    this.time = 0;
    this.level0 = G.save.level;
    this.wrathT = this.doubleT = 0;
    this.total = this.spawned = this.alive = 0;
    this.pack = false;
    this.foes = [];
    this.breakT = 3.2;
    if (!bossOnly) G.world.configureTrial(this.from);
    G.ui.banner(this.rematchSpecies ? 'ORIGINAL-FORM REMATCH' : bossOnly ? 'THE BOSS GAUNTLET' : 'THE TRIAL OF THE REMNANT', this.rematchSpecies ? `${ECHO_SPECIES[this.rematchSpecies].stages[0].name} · earn its imprint each victory · unranked` : `${bossOnly ? 'Bosses only · escalating power' : 'Endless rounds'}${this.from > 1 ? ` from round ${this.from} (unranked)` : ''} · survive as long as you can`, 'boss');
  }

  /** End the run. Leaving mid-run still records how far it got. */
  stop(record = true) {
    if (this.active && record && this.round > 0) this.record();
    this.active = false;
    this.cancelBlessing();
    runBlessings.reset();
    if (G.save) G.d = derive(G.save);
    this.boss = null;
    this.foes = [];
    this.round = 0;
  }

  update(dt: number) {
    if (!this.active || this.ending || this.awaitingBlessing) return;
    const W = G.world;
    if (W.player.state === 'dead') return;
    this.time += dt;
    this.changeT += dt;
    if (this.bossOnly) {
      if (this.rematchSpecies && this.boss instanceof Enemy && this.boss.remove) this.bossDefeated(this.boss);
      if (this.breakT > 0) {
        this.breakT = Math.max(0, this.breakT - dt);
        if (this.breakT === 0) this.beginRound();
      }
      return;
    }
    this.wrathT = Math.max(0, this.wrathT - dt);
    this.doubleT = Math.max(0, this.doubleT - dt);
    // Count the fallen, drop the removed and count the living in one pass,
    // in place: this runs every logic step, so it must not allocate.
    let n = 0, alive = 0;
    for (let i = 0; i < this.foes.length; i++) {
      const f = this.foes[i];
      if (f.dying && !(f as Enemy & { _counted?: boolean })._counted) {
        (f as Enemy & { _counted?: boolean })._counted = true;
        this.kills++;
        this.maybeBoon(f);
      }
      if (this.wrathT > 0 && !f.dying) f.hp = Math.min(f.hp, 1);
      if (f.remove) continue;
      if (!f.dying) alive++;
      this.foes[n++] = f;
    }
    this.foes.length = n;
    this.alive = alive;
    if (this.breakT > 0) {
      this.breakT -= dt;
      if (this.breakT <= 0) this.beginRound();
      return;
    }
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
    if (!this.bossOnly) G.world.configureTrial(n);
    if (this.bossOnly) {
      this.changeT = 0;
      this.total = this.spawned = this.alive = 1;
      const p = G.world.player;
      p.x = 14 * TILE; p.y = FLOOR_Y;
      p.body.vx = p.body.vy = 0;
      p.face = 1;
      p.revive();
      p.lastSafe = { x: p.x, y: p.y };
      this.boss = this.rematchSpecies ? originalForm(this.rematchSpecies, n, this.bossHp, this.bossDamage) : gauntletBoss(n, this.bossHp, this.bossDamage);
      G.ui.banner(`BOSS ROUND ${n}`, `${this.boss.name} · cycle ${1 + Math.floor((n - 1) / BOSS_COUNT)}`, 'boss');
      return;
    }
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
    this.completed = n;
    if (n > Number(s.flags.trial_best ?? 0)) s.flags.trial_best = n;
    if (n >= 10 && s.quests.s_trial && !s.quests.s_trial.done) G.world.story.quest('s_trial', 0, true);
    if (n % 5 === 0) this.reward(n);
    if (n % 10 === 0) G.world.configureTrial(n + 1);
    this.breakT = BREAK;
    this.changeT = 0;
    sfx('rally', { vol: 0.5 });
    G.world.autosave(true);
    this.offerBlessing();
  }

  private offerBlessing() {
    this.pendingBlessings = runBlessings.offer();
    const epoch = ++this.blessingEpoch;
    this.blessingAbort = new AbortController();
    const carried = runBlessings.summary();
    void G.ui.choice(`Wave ${this.completed} cleared`,
      `Choose one blessing for this run. Bonuses stack up to rank 5 and reset when you leave or fall.${carried ? ` Carrying: ${carried}.` : ''}`,
      this.pendingBlessings.map(id => ({ label: BLESSINGS[id].name + (BLESSINGS[id].cap ? ` · Rank ${runBlessings.rank(id) + 1}` : ''), sub: BLESSINGS[id].desc, icon: BLESSINGS[id].icon, risk: id === 'bloodprice' })),
      'blessing', this.blessingAbort.signal).then(index => {
        if (epoch !== this.blessingEpoch || !this.active) return;
        if (index < 0) { this.pendingBlessings = []; this.blessingEpoch++; this.blessingAbort = null; return; }
        this.chooseBlessing(this.pendingBlessings[index]);
      });
  }

  chooseBlessing(id: BlessingId): boolean {
    if (!this.active || this.bossOnly || !this.pendingBlessings.includes(id) || !runBlessings.take(id)) return false;
    this.pendingBlessings = [];
    this.blessingEpoch++;
    this.blessingAbort?.abort(); this.blessingAbort = null;
    G.d = derive(G.save);
    if (id === 'health') G.save.hp = Math.min(G.d.maxHp, G.save.hp + G.d.maxHp * 0.3);
    if (id === 'energy') G.save.ce = G.d.maxCe;
    if (id === 'balm') G.save.balm = Math.min(G.save.balmMax, G.save.balm + 1);
    sfx('lootRare', { vol: 0.55 });
    G.ui.toast(`${BLESSINGS[id].name}${BLESSINGS[id].cap ? ` ${runBlessings.rank(id)}` : ''} · this run`, 'good');
    G.ui.refreshHud();
    return true;
  }

  /** Called after the boss's real defeat animation, before any chapter logic. */
  bossDefeated(b: Entity): boolean {
    if (!this.active || !this.bossOnly || this.boss !== b) return false;
    const W = G.world, s = G.save;
    this.kills++;
    this.completed = this.round;
    const species = this.rematchSpecies ?? gauntletImprint(this.round);
    if (species) {
      s.echoImprints ??= {};
      s.echoImprints[species] = (s.echoImprints[species] ?? 0) + 1;
    }
    if (!this.rematchSpecies) s.flags.boss_trial_best = Math.max(Number(s.flags.boss_trial_best ?? 0), this.completed);
    b.remove = true;
    this.boss = null;
    this.alive = 0;
    W.boss = null;
    W.bossActive = false;
    G.inCutscene = false;
    G.camera.focus = null;
    G.ui.cinematicBars(false);
    G.ui.bossBar(null);
    W.giveXp(Math.round(xpToNext(s.level) * (0.18 + Math.min(0.4, this.round * 0.02))));
    // Clear hostile hazards and multipart hitboxes before the recovery break.
    for (const e of W.ents) if (e.isFoe || e.team === 'enemy') e.remove = true;
    s.hp = Math.min(G.d.maxHp, s.hp + G.d.maxHp * 0.2);
    s.ce = G.d.maxCe;
    if (this.round % BOSS_COUNT === 0) { s.balm = Math.min(s.balmMax, s.balm + 1); this.reward(this.round); }
    this.breakT = BREAK;
    this.changeT = 0;
    G.ui.toast(species ? 'Original-form imprint earned — absorb it in Echoes.' : `Boss ${this.round} defeated. Next: +22% health, +10% damage.`, 'good');
    W.autosave(true);
    return true;
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
    const trophy = !this.bossOnly ? claimTrialMilestone(G.save, n) : null;
    if (trophy) {
      sfx('lootRare');
      G.ui.toast(`WAVE ${n}: ${ITEMS[trophy.id].name}${trophy.trialTier ? ` · Ascension ${trophy.trialTier}` : ''} added to Equipment`, 'good');
    }
    W.spawnLoot(28 * TILE, 16 * TILE, [{ silver: 60 * n }, { mat: 'covenant_fragment', n: 1 + Math.floor(n / 10) }, { mat: n >= 15 ? 'radiant_core' : 'sentinel_steel', n: 1 }, rollGear(Math.min(3, 1 + Math.floor(n / 10)))], true);
    if (!trophy) G.ui.toast(`Round ${n} held: the Trial rewards you.`, 'good');
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
    if (this.rematchSpecies) return { entry: null, place: 0, best: false };
    const s = G.save;
    const prevBest = bestRounds(this.bossOnly);
    const rounds = this.bossOnly ? this.completed : this.round;
    const key = this.bossOnly ? 'boss_trial_best' : 'trial_best';
    if (rounds > Number(s.flags[key] ?? 0)) s.flags[key] = rounds;
    if (this.from > 1) return { entry: null, place: 0, best: false };
    const { entry, place } = recordRun({ rounds, kills: this.kills, time: this.time, level: s.level }, this.bossOnly);
    return { entry, place, best: rounds > prevBest };
  }

  /** Elior fell in the arena: show the Game Over card. Resolves when the player has chosen. */
  async onDeath(): Promise<'again' | 'leave'> {
    this.cancelBlessing();
    this.ending = true;
    G.inCutscene = false;
    G.camera.focus = null;
    G.world.bossActive = false;
    G.ui.cinematicBars(false);
    for (const f of this.foes) f.aggro = false;
    const res = this.record();
    const stats = { rounds: this.bossOnly ? this.completed : this.round, kills: this.kills, time: this.time, level: G.save.level, levels: G.save.level - this.level0, from: this.from, bossOnly: this.bossOnly, rematch: !!this.rematchSpecies };
    this.active = false;
    runBlessings.reset();
    G.d = derive(G.save);
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
