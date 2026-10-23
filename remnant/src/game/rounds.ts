// The Trial of the Remnant as an endless rounds mode, in the spirit of Call of
// Duty's Zombies. Foes pour in from both sides in rounds that never end; each
// round brings more of them, tougher and a little quicker. Every fifth round
// the Pack runs (hounds, later lions); every tenth a Champion comes with them.
// Now and then a foe drops a blessing. Falling ends the run: the Game Over card
// shows how many rounds you survived, and runs from round 1 go on the board.
// The Boss Rush runs here too: every boss this save has beaten, in story
// order, against the clock, with nothing earned and nothing lost.

import { G } from './ctx';
import { Entity } from './entity';
import { Enemy } from './enemies';
import { TILE, type EnemyKind } from './tiles';
import { xpToNext, ECHO_SPECIES, ITEMS, RARITY_NAMES, type ItemInst } from './data';
import { claimTrialMilestone, claimContractReward, derive, grantWaveLoot } from './state';
import { trialStrength, trialXpLevels } from './balance';
import { CONTRACTS, contractTier, isContract, type ContractId } from './progression';
import { BLESSINGS, runBlessings, type BlessingId } from './blessings';
import { rollGear } from './world';
import { moveBody } from './physics';
import { recordRun, bestRounds, loadBoard, rushClock, type RunEntry } from './board';
import { fx } from '../render/fx';
import { glow, type Ctx } from '../render/draw';
import { lighting } from '../render/lighting';
import { sfx } from '../audio/audio';
import { input } from '../core/input';
import { islandNotify } from '../ui/island';
import { icon } from '../ui/icons';
import { gameOver } from '../ui/leaderboard';
import { rand, choose, overlaps } from '../core/math';
import { gauntletBoss, gauntletImprint, originalForm, gauntletCount, rushBoss, rushName, rushRoster } from './gauntlet';
import { bossScale } from './difficulty';
import { beginDaily, rankedUsed, useRanked, recordDaily, dailyScore, claimDailyReward, loadDaily, DAILY_WAVES, DAILY_MODS, type DailyRun, type DailyEntry } from './daily';
import { valorTrack } from './valor';
import { settings } from '../core/settings';
import { dailyOver } from '../ui/daily';

const BREAK = 7;
/** The Boss Rush's breather between bosses (the clock keeps running). */
const RUSH_BREAK = 3;
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
  /** The Boss Rush: the beaten bosses' keys in story order, fought once each. */
  rush = false;
  rushKeys: string[] = [];
  /** Health, energy and Balm on entering the rush, given back on leaving so a run costs nothing. */
  private rushKeep: { hp: number; ce: number; balm: number } | null = null;
  /** The daily challenge's rules, while one is running. */
  daily: DailyRun | null = null;
  /** Whether this wave ends with a Champion. */
  private champ = false;
  /** The Boss Rush and the daily challenge earn nothing for the campaign. */
  get isolated() { return this.rush || !!this.daily; }
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
  lastWaveLoot: ItemInst | null = null;
  private waveXp = 0;
  contract: ContractId | null = null;
  contractComplete = false;
  contractReward: string | null = null;
  contractTier = 0;
  get contractCleared() { return Math.max(0, Math.min(5, this.completed - this.from + 1)); }
  get balmSealed() { return this.active && ((this.contract === 'vigil' && !this.contractComplete) || !!this.daily?.on.fasting); }
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

  start(from = 1, bossOnly = false, rush = false, daily: 'ranked' | 'practice' | null = null) {
    this.stop(false);
    // Switching from a rush to another run in the arena ends the rush's loan.
    if (!rush && !daily) this.restoreRush();
    this.rush = rush;
    this.rushKeys = rush ? rushRoster(G.save.defeated) : [];
    if (rush && !this.rushKeys.length) {
      this.rush = false;
      this.bossOnly = true;
      G.ui.toast('Defeat bosses in the story to fill the Boss Rush.', 'warn');
      return;
    }
    if (rush) {
      bossOnly = true;
      from = 1;
      this.rushKeep ??= { hp: G.save.hp, ce: G.save.ce, balm: G.save.balm };
      // Every run starts whole, so times compare fairly.
      G.world.rest();
    }
    // A ranked daily is spent the moment it begins; later runs that day are practice.
    this.daily = daily ? beginDaily(daily === 'ranked' && !rankedUsed()) : null;
    if (this.daily) {
      bossOnly = false;
      from = 1;
      if (this.daily.ranked) useRanked(this.daily.key);
      this.rushKeep ??= { hp: G.save.hp, ce: G.save.ce, balm: G.save.balm };
      G.world.rest();
    }
    this.active = true;
    this.bossOnly = bossOnly;
    this.lastWaveLoot = null;
    const chosen = G.save.flags.trial_contract;
    this.contract = !bossOnly && !this.daily && isContract(chosen) ? chosen : null;
    this.contractComplete = false;
    this.contractReward = null;
    this.contractTier = this.contract ? contractTier(G.save, this.contract) : 0;
    runBlessings.reset(!bossOnly);
    if (this.daily) {
      const on = this.daily.on, r = runBlessings.rule;
      r.weapon = (on.glass ? 2 : 1) * (on.commander ? 0.2 : 1);
      r.echoes = (on.glass ? 2 : 1) * (on.commander ? 2 : 1);
      r.incoming = on.glass ? 2 : 1;
    }
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
    if (this.daily) {
      const d = this.daily;
      G.ui.banner('THE DAILY CHALLENGE', `${d.key} · ${d.mods.map((m) => DAILY_MODS[m].name).join(' · ')} · ${DAILY_WAVES} waves · ${d.ranked ? 'ranked attempt' : 'practice (unranked)'}`, 'boss');
      return;
    }
    if (rush) {
      this.rematchSpecies = null;
      G.ui.banner('THE BOSS RUSH', `${this.rushKeys.length} bosses · against the clock · Boss 1/${this.rushKeys.length} · ${rushName(this.rushKeys[0])}`, 'boss');
      return;
    }
    G.ui.banner(this.rematchSpecies ? 'ORIGINAL-FORM REMATCH' : bossOnly ? 'THE BOSS GAUNTLET' : 'THE TRIAL OF THE REMNANT', this.rematchSpecies ? `${ECHO_SPECIES[this.rematchSpecies].stages[0].name} · earn its imprint each victory · unranked` : `${bossOnly ? 'Bosses only · escalating power' : 'Endless rounds'}${this.from > 1 ? ` from round ${this.from} (unranked)` : ''} · survive as long as you can`, 'boss');
    if (this.contract) G.ui.toast(`${CONTRACTS[this.contract].name} · clear waves ${this.from}–${this.from + 4} · unranked`, 'good');
  }

  /** End the run. Leaving mid-run still records how far it got. */
  stop(record = true) {
    if (this.active && record && this.round > 0) this.record();
    this.active = false;
    this.rush = false;
    this.daily = null;
    this.rushKeys = [];
    this.lastWaveLoot = null;
    this.contract = null;
    this.contractComplete = false;
    this.contractReward = null;
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
    // Fasting: health may fall but never rise.
    const day = this.daily;
    if (day?.on.fasting) { if (G.save.hp > day.hpCap) G.save.hp = day.hpCap; else day.hpCap = G.save.hp; }
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
      if (this.rush) {
        // The breather banner already named this boss.
        this.boss = rushBoss(this.rushKeys[n - 1], this.bossHp, this.bossDamage);
        return;
      }
      this.boss = this.rematchSpecies ? originalForm(this.rematchSpecies, n, this.bossHp, this.bossDamage) : gauntletBoss(n, this.bossHp, this.bossDamage);
      G.ui.banner(`BOSS ROUND ${n}`, `${this.boss.name} · cycle ${1 + Math.floor((n - 1) / gauntletCount())}`, 'boss');
      return;
    }
    const day = this.daily;
    if (day) {
      // Ten set waves: a Pack on the fourth and eighth, a Champion on the fifth and tenth.
      this.pack = n % 4 === 0;
      this.champ = n % 5 === 0 || day.on.champions;
      this.total = Math.min(36, 6 + n * 3) * (day.on.double ? 2 : 1);
    } else {
      this.pack = n % 5 === 0 && n % 10 !== 0;
      this.champ = n % 10 === 0;
      this.total = this.pack ? 6 + n : Math.min(70, 4 + n * 2 + (n > 10 ? n - 10 : 0));
    }
    this.spawned = 0;
    this.spawnT = 0.6;
    this.boonsThisRound = 0;
    this.changeT = 0;
    if (this.champ) this.total += 1; // the Champion
    this.waveXp = xpToNext(G.save.level) * trialXpLevels(n);
    sfx(this.pack ? 'horn' : 'bell', { pitch: this.pack ? 0.8 : 0.55 + Math.min(0.5, n * 0.015) });
    input.rumble(0.5, 0.5, 280);
    islandNotify(`ROUND ${n}`, this.pack ? '#ff6a5a' : '#ffe6a8', 'rally', 2);
    if (this.pack) G.ui.banner(`${day ? 'WAVE' : 'ROUND'} ${n}`, 'The Pack runs', 'boss');
    else if (this.champ) G.ui.banner(`${day ? 'WAVE' : 'ROUND'} ${n}`, 'A Champion of the Trial comes', 'boss');
  }

  private endRound() {
    const n = this.round;
    if (n <= this.completed) return;
    const s = G.save;
    this.completed = n;
    if (this.daily) { this.dailyWave(n); return; }
    this.lastWaveLoot = grantWaveLoot(s, n);
    sfx('lootRare', { vol: 0.55 });
    G.ui.toast(`${RARITY_NAMES[this.lastWaveLoot.rarity]} · ${ITEMS[this.lastWaveLoot.id].name} · Power ${this.lastWaveLoot.lootPower} → Equipment`, 'good');
    if (this.contract && !this.contractComplete && this.contractCleared >= 5) {
      this.contractComplete = true; // Claim once, before autosave or the next UI callback.
      const prize = claimContractReward(s, this.contract);
      this.contractReward = `${ITEMS[prize.id].name}${prize.plus ? ` +${prize.plus}` : ''}`;
      G.d = derive(s);
      for (const e of G.world.echoes) e.refreshStats();
      sfx('lootRare');
      G.ui.toast(`CONTRACT COMPLETE · ${this.contractReward} · Equipment. Contract restrictions lifted; keep fighting or leave.`, 'good');
    }
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
    const award = this.contractReward && this.completed === this.from + 4 ? `Contract complete! ${this.contractReward} is saved in Equipment. Restrictions are lifted; you can continue the waves or leave through Chapters. ` : '';
    const loot = this.lastWaveLoot;
    const drop = loot ? `${RARITY_NAMES[loot.rarity]} reward: ${ITEMS[loot.id].name} · Power ${loot.lootPower}. Saved in Equipment; equip it from the pause menu after choosing a blessing. ` : '';
    void G.ui.choice(`Wave ${this.completed} cleared`,
      `${award}${drop}Choose one blessing for this run. Bonuses stack up to rank 5 and reset when you leave or fall.${carried ? ` Carrying: ${carried}.` : ''}`,
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
    if (this.rush) return this.rushBossDown(b);
    const species = this.rematchSpecies ?? gauntletImprint(this.round);
    if (species) {
      s.echoImprints ??= {};
      s.echoImprints[species] = (s.echoImprints[species] ?? 0) + 1;
    }
    if (!this.rematchSpecies) s.flags.boss_trial_best = Math.max(Number(s.flags.boss_trial_best ?? 0), this.completed);
    this.releaseBoss(b);
    W.giveXp(Math.round(xpToNext(s.level) * (0.18 + Math.min(0.4, this.round * 0.02))));
    s.hp = Math.min(G.d.maxHp, s.hp + G.d.maxHp * 0.2);
    s.ce = G.d.maxCe;
    if (this.round % gauntletCount() === 0) { s.balm = Math.min(s.balmMax, s.balm + 1); this.reward(this.round); }
    this.breakT = BREAK;
    this.changeT = 0;
    G.ui.toast(species ? 'Original-form imprint earned — absorb it in Echoes.' : `Boss ${this.round} defeated. Next: +22% health, +10% damage.`, 'good');
    W.autosave(true);
    return true;
  }

  /** The boss is gone: free the camera and HUD, and clear its hazards and multipart hitboxes. */
  private releaseBoss(b: Entity) {
    const W = G.world;
    b.remove = true;
    this.boss = null;
    this.alive = 0;
    W.boss = null;
    W.bossActive = false;
    G.inCutscene = false;
    G.camera.focus = null;
    G.ui.cinematicBars(false);
    G.ui.bossBar(null);
    for (const e of W.ents) if (e.isFoe || e.team === 'enemy') e.remove = true;
  }

  /** A rush boss fell: no rewards, just a breather and the next name, or the finish. */
  private rushBossDown(b: Entity): boolean {
    const s = G.save, n = this.completed, total = this.rushKeys.length;
    this.releaseBoss(b);
    if (n >= total) {
      this.ending = true;
      valorTrack.rushDone(settings.bossDifficulty === 'merciless');
      sfx('rally', { vol: 0.7 });
      G.ui.banner('THE RUSH IS RUN', `${total}/${total} bosses · ${rushClock(this.time)}`, 'boss');
      G.world.after(1.6, async () => {
        // Walked out in the meantime: leaving already recorded the run.
        if (!this.rush || !this.active || G.world.room.id !== 'trial_arena') return;
        await G.world.afterRun(await this.rushCard(true));
      });
      return true;
    }
    s.hp = Math.min(G.d.maxHp, s.hp + G.d.maxHp * 0.35);
    s.ce = G.d.maxCe;
    s.balm = s.balmMax;
    G.ui.refreshHud();
    this.breakT = RUSH_BREAK;
    this.changeT = 0;
    sfx('rally', { vol: 0.5 });
    G.ui.banner(`BOSS ${n + 1}/${total}`, rushName(this.rushKeys[n]), 'boss');
    return true;
  }

  /** Leaving the arena: hand back what Elior had on entering the rush. */
  restoreRush() {
    const k = this.rushKeep;
    if (!k) return;
    this.rushKeep = null;
    const s = G.save;
    G.d = derive(s);
    s.hp = Math.min(G.d.maxHp, Math.max(1, k.hp));
    s.ce = Math.min(G.d.maxCe, k.ce);
    s.balm = Math.min(s.balmMax, k.balm);
  }

  /** The rush's result card: time, bosses beaten and the best before it. */
  private async rushCard(done: boolean): Promise<'again' | 'leave'> {
    this.ending = true;
    G.inCutscene = false;
    G.camera.focus = null;
    G.world.bossActive = false;
    G.ui.cinematicBars(false);
    const prev = loadBoard('rush')[0] ?? null;
    const res = this.record();
    const stats = { rounds: this.completed, kills: this.kills, time: this.time, level: G.save.level, levels: 0, from: 1, bossOnly: true, rush: { total: this.rushKeys.length, done, best: prev } };
    this.active = false;
    return gameOver(stats, res.entry, res.place, res.best);
  }

  /** A daily wave held: nothing for the campaign, only the breather, a blessing, or the finish. */
  private dailyWave(n: number) {
    if (n >= DAILY_WAVES) {
      this.ending = true;
      sfx('rally', { vol: 0.7 });
      G.ui.banner('TODAY\'S TRIAL IS WON', `${DAILY_WAVES} waves · score ${dailyScore(n, this.time)}`, 'boss');
      G.world.after(1.6, async () => {
        if (!this.daily || !this.active || G.world.room.id !== 'trial_arena') return;
        await G.world.afterRun(await this.dailyCard(true));
      });
      return;
    }
    this.breakT = BREAK;
    this.changeT = 0;
    sfx('rally', { vol: 0.5 });
    this.offerBlessing();
  }

  /** The daily's result card: score, the day's board, and the reward on a first clear. */
  private async dailyCard(done: boolean): Promise<'again' | 'leave'> {
    const d = this.daily!;
    this.ending = true;
    G.inCutscene = false;
    G.camera.focus = null;
    G.world.bossActive = false;
    G.ui.cinematicBars(false);
    for (const f of this.foes) f.aggro = false;
    const ranked = d.ranked;
    const res = this.recordDaily();
    const reward = done && claimDailyReward(G.save, d.key);
    const stats = { waves: this.completed, time: this.time, kills: this.kills, level: G.save.level, score: dailyScore(this.completed, this.time), done, ranked, reward, def: d };
    this.active = false;
    runBlessings.reset();
    G.d = derive(G.save);
    return dailyOver(stats, res.entry, res.place, res.best);
  }

  /** A ranked daily goes on its day's board once, whether it ends by falling, finishing or leaving. */
  private recordDaily(): { entry: DailyEntry | null; place: number; best: boolean } {
    const d = this.daily;
    if (!d?.ranked || this.round <= 0) return { entry: null, place: 0, best: false };
    d.ranked = false;
    const prev = loadDaily(d.key)[0]?.score ?? 0, score = dailyScore(this.completed, this.time);
    const { entry, place } = recordDaily({ score, waves: this.completed, time: this.time, level: G.save.level, date: d.key });
    return { entry, place, best: score > prev };
  }

  private spawnOne() {
    const W = G.world;
    const s = G.save;
    const n = this.round;
    this.spawned++;
    // The Trial's Champion closes every tenth round; the daily sets its own.
    const champion = (this.daily ? this.champ : n % 10 === 0) && this.spawned === this.total;
    // The daily draws from its own seeded stream and plays wave n as round 2n.
    const day = this.daily, rn = day ? n * 2 : n;
    const roll = day ? day.rng.next() : Math.random();
    let k: EnemyKind;
    if (champion) k = (['brute', 'knight', 'bulwark', 'soldier'] as EnemyKind[])[(day ? n - 1 : n / 10 - 1) % 4];
    else if (this.pack) k = rn >= 15 && roll < 0.35 ? 'lion' : 'hound';
    else k = day ? day.rng.pick(this.pool(rn)) : choose(this.pool(n));
    // Heavies are a seasoning, never the meal.
    if (!champion && (k === 'brute' || k === 'bulwark' || k === 'golem') && this.foes.filter((f) => !f.dying && (f.kind === 'brute' || f.kind === 'bulwark' || f.kind === 'golem')).length >= 2) k = 'soldier';
    const px = W.player.x / TILE;
    const lanes = LANES.filter((l) => Math.abs(l - px) > 7);
    const x = choose(lanes.length ? lanes : LANES) * TILE + rand(-12, 12);
    const flier = k === 'drone' || k === 'wisp' || k === 'vessel' || k === 'gale';
    const e = W.spawnEnemy(k, x, flier ? SKY_Y : FLOOR_Y, champion ? 'trial_champion' : null);
    const scale = trialStrength(rn);
    const hpMul = scale.hp * (champion ? 3 : 1);
    e.maxHp = e.hp = Math.round(e.maxHp * hpMul);
    e.dmg *= scale.damage;
    e.tempo = scale.tempo * (this.pack ? 1.1 : 1);
    if (this.contract && !this.contractComplete) {
      const c = CONTRACTS[this.contract], tier = this.contractTier;
      e.maxHp = e.hp = Math.round(e.maxHp * c.hp * (1 + tier * 0.1));
      e.dmg *= c.damage * (1 + tier * 0.05);
      e.tempo *= c.tempo;
    }
    if (day) {
      if (day.on.mighty) { e.maxHp = e.hp = Math.round(e.maxHp * 1.75); e.dmg *= 1.2; }
      if (day.on.swift) e.tempo *= 1.25;
    }
    e.xpOverride = Math.max(1, Math.round(this.waveXp / (this.total + (n % 10 === 0 ? 3 : 0)) * (champion ? 4 : 1) * (this.doubleT > 0 ? 2 : 1)));
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
    if (n <= 30) return ['soldier', 'knight', 'bulwark', 'brute', 'priest', 'lion', 'vessel', 'scribe', 'vessel', 'scribe'];
    // The fallen host joins from round 31: the Undying rise again unless finished.
    if (n <= 40) return ['knight', 'bulwark', 'brute', 'priest', 'lion', 'vessel', 'scribe', 'undying', 'undying', 'gale', 'gale'];
    // The Fallen Crowns' own hunters, hosts and constructs from round 41.
    return ['knight', 'bulwark', 'priest', 'lion', 'vessel', 'scribe', 'undying', 'gale', 'stalker', 'stalker', 'carrier', 'golem'];
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
    // No random boons in the daily: every player meets the same run.
    if (this.daily || this.boonsThisRound >= 4 || Math.random() > 0.035) return;
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
    if (this.daily) { this.recordDaily(); return { entry: null, place: 0, best: false }; }
    if (this.rush) {
      // A separate board, and no save flags: the rush leaves the campaign untouched.
      if (this.completed <= 0) return { entry: null, place: 0, best: false };
      const total = this.rushKeys.length;
      const { entry, place } = recordRun({ rounds: this.completed, kills: this.completed, time: this.time, level: G.save.level, total, done: this.completed >= total }, 'rush');
      return { entry, place, best: place === 1 };
    }
    const s = G.save;
    const prevBest = bestRounds(this.bossOnly);
    const rounds = this.bossOnly ? this.completed : this.round;
    const key = this.bossOnly ? 'boss_trial_best' : 'trial_best';
    if (rounds > Number(s.flags[key] ?? 0)) s.flags[key] = rounds;
    if (this.from > 1 || this.contract) return { entry: null, place: 0, best: false };
    const { entry, place } = recordRun({ rounds, kills: this.kills, time: this.time, level: s.level }, this.bossOnly);
    return { entry, place, best: rounds > prevBest };
  }

  /** Elior fell in the arena: show the Game Over card. Resolves when the player has chosen. */
  async onDeath(): Promise<'again' | 'leave'> {
    this.cancelBlessing();
    if (this.rush) return this.rushCard(false);
    if (this.daily) return this.dailyCard(false);
    this.ending = true;
    G.inCutscene = false;
    G.camera.focus = null;
    G.world.bossActive = false;
    G.ui.cinematicBars(false);
    for (const f of this.foes) f.aggro = false;
    const res = this.record();
    const stats = { rounds: this.bossOnly ? this.completed : this.round, kills: this.kills, time: this.time, level: G.save.level, levels: G.save.level - this.level0, from: this.from, bossOnly: this.bossOnly, rematch: !!this.rematchSpecies, contract: this.contract ? `${CONTRACTS[this.contract].name} · ${this.contractCleared}/5 waves${this.contractComplete ? ' · reward saved' : ' · incomplete'}` : undefined };
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
