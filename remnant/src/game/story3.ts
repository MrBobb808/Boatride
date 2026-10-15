// Chapter III — The Valley of Bones. East of Shinar lies Ezekiel's valley.
// A locust swarm has stripped it bare and grown a hive inside the bones of
// giants; its king waits in a cocoon in the brood chamber. Beaten, he is
// raised as an Echo. Also here: the Trial of the Remnant, an endless wave
// arena that keeps pace with Elior's level. Scripture is quoted from the
// King James Version; the world and its people are fictional.

import { G, flag, setFlag } from './ctx';
import { fx } from '../render/fx';
import { sfx } from '../audio/audio';
import { music } from '../audio/music';
import { TILE } from './tiles';
import { type Npc } from './props';
import { Enemy } from './enemies';
import { LocustKing } from './bosses3';
import { ECHO_SPECIES, xpToNext } from './data';
import { rollGear } from './world';
import { makeEcho, derive, makeItem, addMaterial } from './state';
import { CH3_ROOM_IDS } from './rooms3';
import { registerGuide } from './guide';
import { shakeScale } from '../core/settings';
import { rand, choose } from '../core/math';
import type { Story, QuestDef } from './story';
import type { EnemyKind } from './tiles';

export const QUESTS3: QuestDef[] = [
  {
    id: 'm_valley', title: 'Can These Bones Live?', kind: 'main',
    stages: [
      'Follow the Bone Road east across the Valley of Bones.',
      'Cross the Field of Giants. The swarm comes from a hive in the far hillside.',
      'Enter the hive and descend through the brood halls.',
      'Something is waiting to be born in the brood chamber. Face it.',
    ],
    done: 'The Locust King kneels to the covenant.',
  },
  { id: 's_valley_words', title: 'The Valley\'s Words', kind: 'side', stages: ['Mara wants every inscription in the valley and the hive. Find all six.', 'You have found all six. Bring them to Mara at the camp.'], done: 'Mara has the valley\'s words, and you have her trust.' },
  { id: 's_hive_caches', title: 'Hidden in the Bones', kind: 'side', stages: ['The valley and the hive hide two secret caches. Find them.'], done: 'Both caches of the valley found.' },
  { id: 's_trial', title: 'The Trial of the Remnant', kind: 'side', stages: ['Survive ten waves in the Trial of the Remnant. Enter it from any altar.'], done: 'Ten waves held. The Trial goes on as long as you do.' },
];

export const CH3_LORE = ['eze371', 'eze373', 'joel14', 'prov3027', 'exo1014', 'joel225'];
export const CH3_SECRETS = ['skull_cache', 'hive_cache'];

const wait = (sec: number) => new Promise<void>((r) => setTimeout(r, sec * 1000));
const inCh3 = () => CH3_ROOM_IDS.has(G.world.room.id);

// The guide knows this chapter's objectives.
registerGuide(() => {
  const s = G.save;
  if (!s) return null;
  const q = s.quests.m_valley;
  if (q && !q.done) {
    if (!s.defeated.includes('locust_king')) return { room: 'brood_chamber', at: 'trigger:brood_start', label: 'the brood chamber, deep in the hive' };
    return null;
  }
  if (flag('ch2_done') && !flag('ch3_intro')) {
    const here = G.world.room;
    const alt = here.ents.find((e) => e.t === 'altar');
    if (alt && alt.t === 'altar') return { room: here.id, at: 'altar:' + alt.id, label: 'an altar: rest and choose Journey on' };
  }
  return null;
});

export class Chapter3 {
  constructor(private st: Story) {}
  trialWave = 0;
  trialFoes: Enemy[] = [];
  trialTimer: number | null = null;
  trialWaiting = false;

  // ---------------------------------------------------------------- rooms
  onEnter(id: string, first: boolean): boolean {
    if (!CH3_ROOM_IDS.has(id)) {
      this.stopTrial();
      return false;
    }
    const s = G.save;
    if (id === 'valley_camp' && !flag('ch3_intro')) {
      this.opening();
      return true;
    }
    if (id === 'valley_camp' && flag('ch3_king_done') && !flag('ch3_done')) {
      this.ending();
      return true;
    }
    if (id !== 'trial_arena') this.stopTrial();
    if (first) {
      const r = G.world.room;
      setTimeout(() => G.ui.banner(r.name.toUpperCase(), r.region, 'area'), 400);
    }
    if (id === 'bone_road' && first) {
      this.st.quest('m_valley', 0);
      setTimeout(() => G.ui.caption('Bones as long as houses, bleached white. And above them, a sound like rain that is not rain.'), 2600);
      setTimeout(() => G.ui.caption(null), 7400);
    }
    if (id === 'bone_fields' && first) this.st.quest('m_valley', 1);
    if (id === 'hive_mouth' && first) this.st.quest('m_valley', 2);
    if (id === 'brood_chamber' && first) this.st.quest('m_valley', 3);
    if (id === 'brood_chamber' && s.defeated.includes('locust_king')) {
      music.play('hive');
      if (!flag('ch3_king_done')) {
        // Saved after the fight but before he rose: he is still kneeling.
        const k = new LocustKing(44 * TILE, 22 * TILE);
        k.yieldNow();
        G.world.add(k);
        setTimeout(() => this.kingDefeated(k), 900);
      }
    }
    if (id === 'trial_arena') this.startTrial();
    return true;
  }

  onTrigger(id: string): boolean {
    if (id === 'brood_start') {
      if (!G.save.defeated.includes('locust_king')) this.broodStart();
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- opening
  async beginFromChapterTwo() {
    await G.ui.fade(1, 1.0);
    G.world.load('valley_camp', 'start');
    await G.ui.fade(0, 1.0);
  }

  async opening() {
    const st = this.st;
    st.cine(true);
    setFlag('ch3_intro');
    const s = G.save;
    if (!s.altarsLit.includes('valley_camp')) s.altarsLit.push('valley_camp');
    s.altar = { room: 'valley_camp', spawn: 'altar' };
    music.play('valley');
    await wait(0.8);
    G.ui.banner('CHAPTER III', 'The Valley of Bones', 'chapter');
    await wait(3.4);
    await st.say([
      { who: 'mara', text: 'You made it. I came as soon as the pass was clear. I have waited my whole life to see this valley.' },
      { who: 'tobiah', text: 'Mara! You walked two days alone? Through husk country?' },
      { who: 'mara', text: 'I brought a very large book. Husks are afraid of reading.' },
      { who: 'azriel', text: 'Look at it. Bones like the hulls of ships. And not one blade of grass for a mile.' },
      { who: 'mara', text: 'Locusts. A swarm took the valley a season ago. The travellers I met said it moves like one creature, as if something were thinking for it.' },
      { who: 'elior', text: '...', choices: [{ label: 'Then something is.' }, { label: 'Where does it come from?' }] },
    ]);
    await st.say([
      { who: 'mara', text: 'There is a hive in the far hillside, inside the bones of the largest giant. The swarm goes in at dusk and comes out at dawn.' },
      { who: 'azriel', text: 'Then that is where we cut. Rest here first. And Elior, there is a ring of old stones by the altar. Mara says it is a proving ground.' },
      { who: 'mara', text: 'The Trial of the Remnant. The old watch fought there until they could fight no more, and then a little longer. It will test you as long as you can stand.' },
    ]);
    st.quest('m_valley', 0);
    st.quest('s_valley_words', 0);
    st.cine(false);
    G.world.autosave(true);
    setTimeout(() => G.ui.hint('Rest at the altar to enter the Trial of the Remnant: endless waves that grow with you. The way to level 100.'), 1500);
    setTimeout(() => G.ui.hint(null), 9000);
  }

  // ---------------------------------------------------------------- the brood chamber
  async broodStart() {
    const W = G.world;
    const k = W.boss;
    if (!(k instanceof LocustKing)) return;
    const st = this.st;
    st.cine(true);
    W.bossActive = true;
    W.closeGate(true);
    music.stop(1);
    await st.walkPlayer(24 * TILE, 60);
    sfx('buzz', { vol: 1, pitch: 0.7 });
    G.camera.focus = { x: 44 * TILE, y: 16 * TILE };
    G.ui.caption('The cocoon is beating like a heart. The walls begin to move.');
    await wait(2.4);
    G.ui.caption(null);
    G.camera.focus = null;
    st.cine(false);
    if (!flag('brood_cleared')) {
      music.play('swarm', 0.5);
      music.phase = 0;
      G.ui.banner('THE BROOD AWAKENS', 'Hold until the cocoon opens', 'boss');
      await this.waves([
        [['drone', 30], ['drone', 36], ['soldier', 52], ['drone', 20]],
        [['soldier', 14], ['soldier', 54], ['drone', 30], ['drone', 40], ['drone', 24]],
      ]);
      if (W.room.id !== 'brood_chamber' || W.player.state === 'dead') return;
      setFlag('brood_cleared');
      W.autosave(true);
    }
    await this.hatch(k);
  }

  /** Spawn waves of the swarm; resolves when all are down (or the room changes). */
  private waves(list: [EnemyKind, number][][]) {
    const W = G.world;
    return new Promise<void>((resolve) => {
      let i = 0;
      let foes: Enemy[] = [];
      const spawn = () => {
        foes = [];
        list[i].forEach(([k, x], n) => setTimeout(() => {
          if (W.room.id !== 'brood_chamber') return;
          const e = W.spawnEnemy(k, x * TILE, k === 'drone' ? 14 * TILE : 22 * TILE);
          foes.push(e);
          fx.veilBurst(e.cx, e.cy, 10, 1);
          sfx('chitter', { vol: 0.5 });
        }, 300 + n * 380));
      };
      spawn();
      const check = setInterval(() => {
        if (W.room.id !== 'brood_chamber' || W.player.state === 'dead') {
          clearInterval(check);
          resolve();
          return;
        }
        if (foes.length === list[i].length && foes.every((f) => f.dying)) {
          i++;
          if (i < list.length) {
            G.ui.toast('More pour from the walls!', 'warn');
            spawn();
          } else {
            clearInterval(check);
            resolve();
          }
        }
      }, 300);
    });
  }

  private async hatch(k: LocustKing) {
    const W = G.world;
    const st = this.st;
    st.cine(true);
    music.stop(0.6);
    G.camera.focus = { x: k.x, y: k.y - 50 };
    G.camera.viewMultTarget = 1.2;
    for (let i = 0; i < 6; i++) {
      setTimeout(() => {
        sfx('rumble', { vol: 0.5 });
        G.camera.addTrauma(0.25 * shakeScale());
        fx.hitSparks(k.x + rand(-20, 20), k.y - rand(30, 90), rand(-1, 1), '#ff3a4a', 6, 1);
      }, i * 280);
    }
    await wait(1.8);
    setFlag('king_hatched');
    W.cache?.invalidate();
    sfx('shatter', { pitch: 0.6 });
    sfx('screech', { vol: 0.6 });
    fx.flash('#ff3a4a', 0.4);
    fx.shards(k.x, k.y - 60, 40, '#6a3a20', 2);
    fx.shards(k.x, k.y - 60, 20, '#ffb347', 1.6);
    G.camera.addTrauma(0.8 * shakeScale());
    await wait(0.6);
    k.awaken();
    // His intro ends the cutscene and starts the fight.
  }

  async kingDefeated(k: LocustKing) {
    const W = G.world;
    const s = G.save;
    const st = this.st;
    st.cine(true);
    G.camera.viewMultTarget = 1;
    G.camera.focus = { x: k.x, y: k.y - 30 };
    music.play('revelation', 2);
    await wait(0.8);
    await st.say([
      { who: 'narrator', text: 'The Locust King kneels in the ruin of his cocoon. His wings are torn. His claws scrape the floor and do not rise.' },
      { who: 'elior', text: 'It is over. Your swarm is gone.' },
      { who: 'narrator', text: 'The King\'s mandibles move. The voice is dry as the valley: "Then finish it. There is nothing left to devour but me."' },
    ]);
    // Arise.
    W.player.face = k.x > W.player.x ? 1 : -1;
    W.player.anim.play('invoke', 0.15, true);
    await wait(0.5);
    G.ui.caption('"Arise."');
    sfx('arise');
    for (let i = 0; i < 8; i++) setTimeout(() => {
      fx.veilBurst(k.cx + rand(-14, 14), k.cy + rand(-20, 20), 10, 1.2);
      fx.holyBurst(k.cx, k.cy, 8, 0.8);
    }, i * 140);
    G.camera.addTrauma(0.4 * shakeScale());
    await wait(1.4);
    fx.column(k.x, k.y, 90, 420, '#c9a8ff', 2.4);
    fx.column(k.x, k.y, 50, 420, '#fff3c4', 2.2);
    fx.flash('#ffffff', 0.8);
    fx.ring(k.x, k.y - 2, 8, 200, '#ffe6a8', 1, 6, 0.3);
    G.camera.addTrauma(0.7 * shakeScale());
    k.remove = true;
    const inst = makeEcho('locust');
    s.echoes.push(inst);
    G.d = derive(s);
    s.active = [inst.uid, ...s.active.filter((u) => u !== inst.uid)].slice(0, G.d.echoSlots);
    s.flags.army_out = true;
    W.summonEchoes(true);
    const unit = W.echoes.find((u) => u.inst.uid === inst.uid);
    if (unit) {
      unit.x = k.x;
      unit.y = k.y;
      unit.face = W.player.x > k.x ? 1 : -1;
      unit.summonT = 1.4;
    }
    sfx('summon');
    G.ui.caption(null);
    const sp = ECHO_SPECIES.locust;
    G.ui.banner('ECHO RAISED', `${sp.stages[0].name} · ${sp.cls}`, 'echo');
    await wait(2.8);
    await st.say([
      { who: 'narrator', text: 'He rises. The red is gone from his eyes. They are white now, and they are watching you.' },
      { who: 'narrator', text: '"...My liege."' },
      { who: 'elior', text: 'I am nobody\'s liege. But if you will fight beside me, fight for something besides hunger.' },
      { who: 'narrator', text: '"Then I will learn what that is. Command me."' },
    ]);
    if (!s.lore.includes('joel225')) s.lore.push('joel225');
    await G.ui.lore('joel225');
    W.giveXp(2400);
    W.spawnLoot(W.player.x + W.player.face * 30, W.player.y - 30, [{ silver: 800 }, { mat: 'radiant_core', n: 2 }, { mat: 'covenant_fragment', n: 4 }, { item: 'umbral_fang' }], true);
    st.quest('m_valley', 3, true);
    setFlag('ch3_king_done');
    W.bossActive = false;
    W.closeGate(false);
    await wait(2.2);
    W.autosave();
    await G.ui.fade(1, 1.2);
    st.cine(false);
    W.load('valley_camp', 'start');
    await G.ui.fade(0, 1.0);
  }

  async ending() {
    const st = this.st;
    const s = G.save;
    st.cine(true);
    music.play('valley');
    await wait(1.2);
    await st.say([
      { who: 'tobiah', text: 'Elior. Elior, there is a giant bug standing behind you. Do not turn around.' },
      { who: 'elior', text: 'He is with us, Tobiah.' },
      { who: 'tobiah', text: '...Of course he is. Of course the giant bug is with us. Hello, giant bug.' },
      { who: 'mara', text: 'Listen. Do you hear that? Nothing. No wings. For the first time in a season, the valley is quiet.' },
    ]);
    if (!s.lore.includes('eze3710')) s.lore.push('eze3710');
    await G.ui.lore('eze3710');
    await st.say([
      { who: 'mara', text: 'An exceeding great army. Elior, I think this was always where the relic was leading you. Not to a weapon. To them.' },
      { who: 'azriel', text: 'An army that follows you out of love, or one that follows out of fear. Remember which one you are building.' },
      { who: 'dov', text: 'And an army needs a blade worth following. I worked it from the Locust King\'s shed carapace and the light that came off him when he rose. Take it.' },
    ]);
    const it = makeItem('dawnbreaker');
    s.inventory.push(it);
    G.ui.itemGet(it);
    await wait(1.2);
    setFlag('ch3_done');
    G.world.autosave(true);
    st.cine(false);
    await G.ui.chapterEnd(3);
  }

  // ---------------------------------------------------------------- talk
  async talk(n: Npc): Promise<boolean> {
    if (!inCh3()) return false;
    const s = G.save;
    const st = this.st;
    switch (n.kind) {
      case 'mara': {
        const found = CH3_LORE.filter((l) => s.lore.includes(l)).length;
        const q = s.quests.s_valley_words;
        if (q && !q.done && found >= CH3_LORE.length) {
          await st.say([
            { who: 'mara', text: 'All six. Joel\'s locusts, Ezekiel\'s question, and a wise man who thought locusts had no king.' },
            { who: 'mara', text: 'Take this. My grandmother\'s, from before the Veil. It belongs with someone who reads the walls.' },
          ]);
          const ring = makeItem('archivist_ring');
          s.inventory.push(ring);
          G.ui.itemGet(ring);
          addMaterial(s, 'covenant_fragment', 3);
          G.world.giveXp(600);
          st.quest('s_valley_words', 1, true);
          return true;
        }
        await st.say([{ who: 'mara', text: flag('ch3_done') ? 'I will be writing about this valley for the rest of my life. Possibly longer.' : `You have found ${found} of the valley's ${CH3_LORE.length} inscriptions. Every word counts.` }]);
        return true;
      }
      case 'azriel': {
        await st.say([{ who: 'azriel', text: flag('ch3_king_done') ? 'Ten Echoes, a king among them. Strength like that is a trust, not a trophy. You know that already. I will keep saying it.' : 'The hive is in the far hillside. Clear the road, cross the field, and take the swarm at its root.' }]);
        return true;
      }
      case 'tobiah': {
        const best = Number(s.flags.trial_best ?? 0);
        await st.say([{ who: 'tobiah', text: best > 0 ? `Wave ${best} in the Trial? I made it to wave two. Then I had a nap. A strategic nap.` : 'Have you tried the Trial? Mara says the old watch fought there for days. I tried it for a minute. It was a long minute.' }]);
        return true;
      }
    }
    return false;
  }

  onLore(id: string) {
    const s = G.save;
    if (!CH3_LORE.includes(id)) return;
    const found = CH3_LORE.filter((l) => s.lore.includes(l)).length;
    G.ui.toast(`Valley inscriptions found: ${found}/${CH3_LORE.length}`, 'info');
    if (s.quests.s_valley_words && !s.quests.s_valley_words.done && found >= CH3_LORE.length && s.quests.s_valley_words.stage === 0) this.st.quest('s_valley_words', 1);
  }

  secret(id: string): boolean {
    if (!CH3_SECRETS.includes(id)) return false;
    const s = G.save;
    if (s.secrets.includes(id)) return true;
    s.secrets.push(id);
    const n = CH3_SECRETS.filter((x) => s.secrets.includes(x)).length;
    sfx('lootRare', { vol: 0.6 });
    G.ui.toast(`Hidden cache discovered (${n}/${CH3_SECRETS.length})`, 'good');
    if (!s.quests.s_hive_caches) this.st.quest('s_hive_caches', 0);
    if (n >= CH3_SECRETS.length) this.st.quest('s_hive_caches', 0, true);
    return true;
  }

  onPurified(elite: string | null) {
    if (elite === 'bone_colossus') G.ui.toast('The Colossus of the Valley joins your Echoes.', 'good');
  }

  // ---------------------------------------------------------------- the Trial of the Remnant
  startTrial() {
    this.stopTrial();
    this.trialWave = 0;
    this.trialFoes = [];
    this.trialWaiting = true;
    G.ui.banner('THE TRIAL OF THE REMNANT', 'Endless waves · leave by the west door at any time', 'boss');
    if (!G.save.quests.s_trial) this.st.quest('s_trial', 0);
    this.trialTimer = window.setInterval(() => this.tickTrial(), 300);
    setTimeout(() => this.nextWave(), 2500);
  }

  stopTrial() {
    if (this.trialTimer !== null) clearInterval(this.trialTimer);
    this.trialTimer = null;
    this.trialFoes = [];
  }

  private nextWave() {
    const W = G.world;
    if (W.room.id !== 'trial_arena' || this.trialTimer === null) return;
    const s = G.save;
    this.trialWave++;
    this.trialWaiting = false;
    this.trialFoes = [];
    const n = this.trialWave;
    if (n > 1 && (n - 1) % 5 === 0) this.trialReward(n - 1);
    G.ui.toast(`Wave ${n}`, 'warn');
    sfx('bell', { pitch: 0.6 + Math.min(0.6, n * 0.02) });
    const pool: EnemyKind[] = n < 3 ? ['husk', 'hound', 'drone'] : n < 6 ? ['husk', 'hound', 'archer', 'drone', 'soldier'] : n < 10 ? ['archer', 'drone', 'soldier', 'knight', 'bulwark'] : ['drone', 'soldier', 'knight', 'bulwark', 'brute'];
    const count = Math.min(12, 3 + Math.floor(n * 0.8));
    // The Trial keeps pace with Elior.
    const lvScale = 1 + Math.max(0, s.level - 12) * 0.05;
    const hpMul = (1 + n * 0.14) * lvScale;
    const dmgMul = (1 + n * 0.05) * Math.pow(lvScale, 0.8);
    const xpEach = Math.max(10, Math.round(xpToNext(s.level) / 26));
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        if (W.room.id !== 'trial_arena' || this.trialTimer === null) return;
        const k = choose(pool);
        const x = (i % 2 ? 44 : 12) * TILE + rand(-30, 30);
        const e = W.spawnEnemy(k, x, k === 'drone' ? 10 * TILE : 18 * TILE);
        e.maxHp = e.hp = Math.round(e.maxHp * hpMul);
        e.dmg *= dmgMul;
        e.xpOverride = xpEach;
        this.trialFoes.push(e);
        fx.column(e.x, e.y, 20, 120, '#ffe6a8', 0.6);
      }, 200 + i * 350);
    }
  }

  private tickTrial() {
    const W = G.world;
    if (W.room.id !== 'trial_arena') return this.stopTrial();
    if (W.player.state === 'dead') return;
    const n = this.trialWave;
    if (n === 0 || this.trialWaiting) return;
    const expected = Math.min(12, 3 + Math.floor(n * 0.8));
    if (this.trialFoes.length >= expected && this.trialFoes.every((f) => f.dying)) {
      this.trialWaiting = true;
      const s = G.save;
      if (n > Number(s.flags.trial_best ?? 0)) s.flags.trial_best = n;
      if (n >= 10 && s.quests.s_trial && !s.quests.s_trial.done) this.st.quest('s_trial', 0, true);
      setTimeout(() => this.nextWave(), 1800);
    }
  }

  private trialReward(n: number) {
    const W = G.world;
    W.spawnLoot(28 * TILE, 16 * TILE, [{ silver: 60 * n }, { mat: 'covenant_fragment', n: 1 + Math.floor(n / 10) }, { mat: n >= 15 ? 'radiant_core' : 'sentinel_steel', n: 1 }, rollGear(Math.min(3, 1 + Math.floor(n / 10)))], true);
    G.ui.toast(`Wave ${n} held: the Trial rewards you.`, 'good');
    fx.column(28 * TILE, 18 * TILE, 40, 240, '#ffe6a8', 1.2);
  }
}

export { LocustKing };
