// Chapter V — The Writing on the Wall. The river has been turned aside and
// Babylon feasts. The Remnant walks in along the dry riverbed, through the
// streets and the hanging gardens, to the banquet hall where the Lord of the
// Feast drinks from the vessels of the temple. A hand writes on the plaster,
// an old exile reads it, and the Lord of the Feast gives himself to the Veil
// to become the Weigher. Scripture is quoted from the King James Version; the
// world and its people are fictional.

import { G, flag, setFlag, placeBanner } from './ctx';
import { fx } from '../render/fx';
import { sfx } from '../audio/audio';
import { music } from '../audio/music';
import { TILE } from './tiles';
import { Npc } from './props';
import { Enemy } from './enemies';
import { makeItem, addMaterial } from './state';
import { CH5_ROOM_IDS } from './rooms5';
import { registerGuide } from './guide';
import { WRITING } from './writing';
import { shakeScale } from '../core/settings';
import { input } from '../core/input';
import type { Story, QuestDef } from './story';
import type { EnemyKind } from './tiles';

export const QUESTS5: QuestDef[] = [
  {
    id: 'm_feast', title: 'The Writing on the Wall', kind: 'main',
    stages: [
      'An army from the east has turned the river aside. Follow the dry riverbed under the walls into Babylon.',
      'The whole city is feasting. Cross the streets and climb the hanging gardens to the palace.',
      'Reach the banquet hall, where the Lord of the Feast drinks from the vessels of the temple.',
      'The Lord of the Feast has fled up the palace stair to the Hall of Scales. Follow him.',
    ],
    done: 'The Weigher is found wanting. In that night, the city fell.',
  },
  { id: 's_feast_words', title: 'Words Before the Fall', kind: 'side', stages: ['Mara wants every inscription between the reeds and the Hall of Scales. Find all eight.', 'You have found all eight. Bring them to Mara at the camp in the reeds.'], done: 'Mara has the words of Babylon\'s last night.' },
  { id: 's_vessels', title: 'The Vessels of the House', kind: 'side', stages: ['Three vessels of the temple were carried off to the palace for the feast. Find them: two in the treasury below the gardens, one high in the banquet hall.', 'You have all three vessels. Bring them to Hanan at the camp in the reeds.'], done: 'The vessels of the house of God are in safe hands again.' },
  { id: 's_feast_caches', title: 'Treasures of the Feast', kind: 'side', stages: ['Two caches are hidden in the city tonight. Find them.'], done: 'Both caches of the feast found.' },
];

export const CH5_LORE = ['jer5136', 'jer5038', 'isa219', 'ps629', 'dan52', 'dan54', 'isa451', 'prov1611'];
const CACHES = ['lantern_cache', 'terrace_cache'];
const VESSELS = ['vessel_cup', 'vessel_bowl', 'vessel_censer'];
/** Everything hidden in the chapter (the chapter-end screen counts these). */
export const CH5_SECRETS = [...CACHES, ...VESSELS];

/** What the story needs from the Weigher (game/bosses5.ts). */
export interface WeigherBoss {
  x: number; y: number; cx: number; cy: number;
  remove: boolean;
  awaken(): void;
  fall(): Promise<void>;
  yieldNow(): void;
}

const wait = (sec: number) => new Promise<void>((r) => setTimeout(r, sec * 1000));
const inCh5 = () => CH5_ROOM_IDS.has(G.world.room.id);

registerGuide(() => {
  const s = G.save;
  if (!s) return null;
  const q = s.quests.m_feast;
  if (q && !q.done) {
    if (!flag('ch5_writing')) return { room: 'banquet_hall', at: 'trigger:feast_writing', label: 'the banquet hall, above the hanging gardens' };
    if (!s.defeated.includes('weigher')) return { room: 'hall_of_scales', at: 'trigger:weigher_start', label: 'the Hall of Scales, at the top of the palace stair' };
    return null;
  }
  if (flag('ch4_done') && !flag('ch5_intro')) {
    const here = G.world.room;
    const alt = here.ents.find((e) => e.t === 'altar');
    if (alt && alt.t === 'altar') return { room: here.id, at: 'altar:' + alt.id, label: 'an altar: rest and choose Journey on' };
  }
  return null;
});

export class Chapter5 {
  constructor(private st: Story) {}

  // ---------------------------------------------------------------- rooms
  onEnter(id: string, first: boolean): boolean {
    if (!CH5_ROOM_IDS.has(id)) return false;
    const s = G.save;
    if (id === 'reed_camp' && !flag('ch5_intro')) {
      this.opening();
      return true;
    }
    if (id === 'reed_camp' && flag('ch5_weigher_done') && !flag('ch5_done')) {
      this.ending();
      return true;
    }
    if (first) {
      const r = G.world.room;
      placeBanner(r, r.name.toUpperCase(), r.region);
    }
    if (id === 'dry_riverbed' && first) {
      this.st.quest('m_feast', 0);
      this.caption('The river is gone. Boats lie on their sides in the mud, and the last fish have not yet understood.', 2600, 6200);
    }
    if (id === 'feast_streets' && first) {
      this.st.quest('m_feast', 1);
      this.caption('Every door open, every lamp lit, music on every roof. No one in Babylon is watching the river.', 2600, 6000);
    }
    if (id === 'hanging_gardens' && first) this.caption('Gardens stacked on gardens, climbing into the night like a green mountain.', 2400, 5600);
    if (id === 'treasury' && first) {
      if (!s.quests.s_vessels) this.st.quest('s_vessels', 0);
      this.caption('Shelves of gold and silver, and empty places where the vessels of the temple stood until tonight.', 900, 5000);
    }
    if (id === 'banquet_hall' && !flag('ch5_writing')) {
      if (first) this.st.quest('m_feast', 2);
      music.play('feast');
    }
    if (id === 'palace_stair' && first) this.st.quest('m_feast', 3);
    if (id === 'hall_of_scales' && s.defeated.includes('weigher') && !flag('ch5_weigher_done')) {
      // Saved after the fight but before the scales fell: finish it now.
      const w = G.world.boss as unknown as WeigherBoss | null;
      if (w) {
        w.yieldNow();
        setTimeout(() => this.weigherDefeated(w), 900);
      }
    }
    return true;
  }

  onTrigger(id: string): boolean {
    if (id === 'feast_writing') {
      if (!flag('ch5_writing')) this.writing();
      return true;
    }
    if (id === 'armies_east') {
      if (!flag('horns_heard5')) this.armies();
      return true;
    }
    if (id === 'weigher_start') {
      if (!G.save.defeated.includes('weigher')) this.weigherStart();
      return true;
    }
    return false;
  }

  private caption(text: string, at: number, until: number) {
    setTimeout(() => G.ui.caption(text), at);
    setTimeout(() => G.ui.caption(null), until);
  }

  // ---------------------------------------------------------------- opening
  async beginFromChapterFour() {
    await G.ui.fade(1, 1.0);
    G.world.load('reed_camp', 'start');
    await G.ui.fade(0, 1.0);
  }

  async opening() {
    const st = this.st;
    st.cine(true);
    setFlag('ch5_intro');
    const s = G.save;
    if (!s.altarsLit.includes('reed_camp')) s.altarsLit.push('reed_camp');
    s.altar = { room: 'reed_camp', spawn: 'altar' };
    music.play('riverbed');
    await wait(0.8);
    G.ui.banner('CHAPTER V', 'The Writing on the Wall', 'chapter');
    await wait(3.4);
    await st.say([
      { who: 'azriel', text: 'Look at the river.' },
      { who: 'tobiah', text: 'What river?' },
      { who: 'barak', text: 'That is the point, boy. Yesterday the river ran under these walls deep enough to drown a horse. Tonight you could walk it in sandals.' },
      { who: 'ezra', text: 'An army from the east has dug channels upstream and turned the water aside. They are waiting in the dark for it to fall.' },
      { who: 'mara', text: 'Someone carved this on a mooring post, years ago. I think they knew this night would come.' },
    ]);
    if (!s.lore.includes('jer5136')) s.lore.push('jer5136');
    await G.ui.lore('jer5136');
    await st.say([
      { who: 'talia', text: 'And Babylon has not noticed. The whole city is at a feast: a thousand lords, and the Lord of the Feast at their head.' },
      { who: 'talia', text: 'Our people inside say worse. He has sent to the treasury for the vessels taken from the house of God. Tonight they drink from them, and praise gods of gold and stone.' },
      { who: 'elior', text: '...', choices: [{ label: 'Then we go in tonight.' }, { label: 'How do we get past the walls?' }] },
      { who: 'azriel', text: 'Under them. Along the dry riverbed and in through the river gate. Someone has left it open.' },
      { who: 'azriel', text: 'The Veil is thick at that feast, Elior. Whatever it has been building, from the idol to the Image, it means to finish it tonight.' },
      { who: 'mara', text: 'And if you find the vessels, bring them home. They were never Babylon\'s to drink from.' },
    ]);
    st.quest('m_feast', 0);
    st.quest('s_feast_words', 0);
    st.quest('s_vessels', 0);
    st.cine(false);
    G.world.autosave(true);
  }

  // ---------------------------------------------------------------- the writing on the wall
  private async writing() {
    const W = G.world;
    const st = this.st;
    const s = G.save;
    if (!flag('ch5_hand')) {
      st.cine(true);
      W.bossActive = true;
      await st.walkPlayer(32 * TILE, 60);
      const lord = new Npc('feastlord', 56 * TILE, 22 * TILE, -1);
      W.add(lord);
      G.camera.focus = { x: 48 * TILE, y: 16 * TILE };
      G.camera.viewMultTarget = 1.1;
      await st.say([
        { who: 'feastlord', text: 'A guest! Late, and dressed for a funeral. Come in, watchman. Drink with us. The cups are very old, and very holy.' },
        { who: 'elior', text: '...', choices: [{ label: 'Those are not yours.' }, { label: 'Put them down.' }] },
        { who: 'feastlord', text: 'Not mine? I am the Lord of the Feast. Tonight everything in Babylon is mine. To the gods of gold and of silver, of brass and of iron, of wood and of stone!' },
      ]);
      // The hand.
      music.stop(1.2);
      fx.flash('#000000', 0.25);
      G.ui.caption('The lamps gutter. Over against the great lampstand, on the white plaster of the wall, something moves.');
      await wait(2.6);
      G.camera.focus = { x: 54 * TILE, y: 13 * TILE };
      G.camera.viewMultTarget = 1.25;
      music.play('writing', 0.8);
      WRITING.hand = true;
      WRITING.p = 0;
      const t0 = performance.now();
      await new Promise<void>((done) => {
        const step = () => {
          const k = Math.min(1, (performance.now() - t0) / 6500);
          // Four words, each written in its turn with a breath between.
          WRITING.p = k;
          if (Math.random() < 0.3) sfx('handWrite', { vol: 0.5, pitch: 0.9 + Math.random() * 0.2 });
          if (k < 1) setTimeout(step, 140);
          else done();
        };
        step();
      });
      WRITING.hand = false;
      G.ui.caption(null);
      sfx('glyphBurn', { vol: 0.7 });
      input.rumble(0.4, 0.6, 400);
      if (!s.lore.includes('dan55')) s.lore.push('dan55');
      await G.ui.lore('dan55');
      G.camera.focus = { x: lord.x, y: lord.y - 30 };
      await st.say([
        { who: 'feastlord', text: 'What is it? WHAT IS IT? Scribes! Chaldeans! Whoever reads that writing shall wear scarlet and a chain of gold about his neck!' },
        { who: 'narrator', text: 'Not one of the wise men of Babylon can read the writing, or tell what it means. The Lord of the Feast is shaking so hard his cup spills.' },
      ]);
      const hanan = new Npc('hanan', 4 * TILE, 22 * TILE, 1);
      hanan.walkTo = 40 * TILE;
      W.add(hanan);
      await wait(2.4);
      await st.say([
        { who: 'hanan', text: 'Your servants fetched me from the exiles\' quarter, my lord. Your house sent for me once, long ago, and then forgot me. I can read it.' },
      ]);
      if (!s.lore.includes('dan525')) s.lore.push('dan525');
      await G.ui.lore('dan525');
      await st.say([
        { who: 'hanan', text: 'Keep your scarlet and your gold. I will read it anyway. You will not like what it says.' },
      ]);
      if (!s.lore.includes('dan526')) s.lore.push('dan526');
      await G.ui.lore('dan526');
      await st.say([
        { who: 'feastlord', text: 'Numbered? Weighed? I am the scales of Babylon! I weigh the nations and I find THEM wanting!' },
        { who: 'feastlord', text: 'Veil! You promised me the world on a plate of gold. Take whatever you want of me. Make me heavier than any writing!' },
      ]);
      // He gives himself to the Veil and flees up the palace stair.
      for (let i = 0; i < 10; i++) {
        setTimeout(() => {
          fx.veilBurst(lord.x, lord.y - 20 - i * 4, 10, 1);
          sfx('wispHum', { pitch: 0.4 + i * 0.05, vol: 0.4 });
        }, i * 130);
      }
      await wait(1.6);
      sfx('veilTear', { vol: 0.9 });
      fx.veilBurst(lord.x, lord.y - 30, 30, 1.4);
      G.camera.addTrauma(0.6 * shakeScale());
      lord.remove = true;
      await st.say([
        { who: 'narrator', text: 'Something vast tears free of the Lord of the Feast and drags him up through the curtains, toward the roof of the palace. The cups fall from every hand.' },
        { who: 'hanan', text: 'He has gone up to the Hall of Scales. Go after him, watchman. I will gather what vessels are left on these tables and take them to your camp.' },
      ]);
      hanan.walkTo = 2 * TILE;
      setTimeout(() => (hanan.remove = true), 4000);
      setFlag('ch5_hand');
      G.camera.focus = null;
      G.camera.viewMultTarget = 1;
      st.cine(false);
    }
    // The feast turns on the one who would not drink.
    music.play('palace', 0.5);
    G.ui.banner('THE FEAST TURNS', 'The Veil takes the revelers', 'boss');
    await this.waves('banquet_hall', [
      [['scribe', 70], ['vessel', 60], ['husk', 20], ['husk', 76], ['vessel', 30]],
      [['knight', 74], ['scribe', 18], ['vessel', 50], ['priest', 64], ['husk', 30], ['vessel', 80]],
    ], 22);
    if (W.room.id !== 'banquet_hall' || W.player.state === 'dead') {
      W.bossActive = false;
      return;
    }
    W.bossActive = false;
    WRITING.p = 1;
    setFlag('ch5_writing');
    W.giveXp(1800);
    st.quest('m_feast', 3);
    music.play('palace');
    W.autosave(true);
    G.ui.toast('The way up the palace stair is open.', 'info');
  }

  /** Spawn waves of foes in a room; resolves when all are down (or the room changes). */
  private waves(room: string, list: [EnemyKind, number][][], row: number) {
    const W = G.world;
    return new Promise<void>((resolve) => {
      let i = 0;
      let foes: Enemy[] = [];
      const spawn = () => {
        foes = [];
        list[i].forEach(([k, x], n) => setTimeout(() => {
          if (W.room.id !== room) return;
          const flier = k === 'vessel';
          const e = W.spawnEnemy(k, x * TILE, (flier ? row - 8 : row) * TILE);
          foes.push(e);
          fx.veilBurst(e.cx, e.cy, 10, 1);
          sfx('veilTear', { vol: 0.35 });
        }, 300 + n * 380));
      };
      spawn();
      const check = setInterval(() => {
        if (W.room.id !== room || W.player.state === 'dead') {
          clearInterval(check);
          resolve();
          return;
        }
        if (foes.length === list[i].length && foes.every((f) => f.dying)) {
          i++;
          if (i < list.length) {
            G.ui.toast('More of the feast rise against you!', 'warn');
            spawn();
          } else {
            clearInterval(check);
            resolve();
          }
        }
      }, 300);
    });
  }

  // ---------------------------------------------------------------- the roof
  private async armies() {
    const st = this.st;
    setFlag('horns_heard5');
    st.cine(true);
    sfx('armyHorns', { vol: 0.8 });
    G.ui.caption('From the palace roof you can see the whole city: lamps on every street, music on every roof.');
    await wait(3.4);
    G.ui.caption('And below the walls, in the dry riverbed, an army walks up the mud in silence. The river gate stands open. No one shuts it.');
    sfx('gatesOpen', { vol: 0.6 });
    await wait(4.2);
    G.ui.caption(null);
    if (!G.save.lore.includes('isa451')) {
      await st.say([{ who: 'elior', text: '...', choices: [{ label: 'The two-leaved gates.' }] }]);
    }
    st.cine(false);
  }

  // ---------------------------------------------------------------- the Hall of Scales
  private async weigherStart() {
    const W = G.world;
    const w = W.boss as unknown as WeigherBoss | null;
    if (!w) return;
    const st = this.st;
    st.cine(true);
    W.bossActive = true;
    W.closeGate(true);
    music.stop(1);
    await st.walkPlayer(26 * TILE, 60);
    G.camera.focus = { x: w.x - 50, y: w.y - 80 };
    G.camera.viewMultTarget = 1.2;
    sfx('chainRattle', { vol: 0.8 });
    await wait(1.0);
    await st.say([
      { who: 'feastlord', text: 'Numbered. Weighed. Divided. Words on a wall! I will write my own words, watchman, and I will write them on you.' },
      { who: 'feastlord', text: 'Step onto the scale. Let us see what a Remnant weighs.' },
      { who: 'elior', text: '...', choices: [{ label: 'You have already been weighed.' }, { label: 'Put down the vessels.' }] },
    ]);
    music.play('weigher', 0.5);
    music.phase = 0;
    w.awaken();
    // Its intro ends the cutscene and starts the fight.
  }

  async weigherDefeated(w: WeigherBoss) {
    const W = G.world;
    const s = G.save;
    const st = this.st;
    st.cine(true);
    G.camera.viewMultTarget = 1.15;
    G.camera.focus = { x: w.x - 40, y: w.y - 80 };
    music.stop(1.5);
    await wait(1.0);
    await st.say([
      { who: 'narrator', text: 'The beam of the great scales cracks across. One pan strikes the floor, empty. The other rises, and keeps rising.' },
    ]);
    await w.fall();
    input.rumble(1, 1, 700);
    sfx('armyHorns', { vol: 0.9 });
    if (!s.lore.includes('dan530')) s.lore.push('dan530');
    await G.ui.lore('dan530');
    music.play('revelation', 2);
    await st.say([
      { who: 'narrator', text: 'Below, the doors of the palace give way. Soldiers of the east fill the halls without a fight, and the feast is over.' },
      { who: 'elior', text: 'Weighed, and found wanting. All of it. The idol, the tower, the swarm, the Image. And now this.' },
      { who: 'narrator', text: 'Where the scales stood, a sword lies across the broken beam, perfectly level.' },
    ]);
    W.giveXp(4200);
    W.spawnLoot(W.player.x + W.player.face * 40, W.player.y - 30, [{ silver: 1400 }, { mat: 'radiant_core', n: 4 }, { mat: 'covenant_fragment', n: 6 }, { item: 'even_balance' }], true);
    st.quest('m_feast', 3, true);
    setFlag('ch5_weigher_done');
    W.bossActive = false;
    W.closeGate(false);
    G.camera.focus = null;
    G.camera.viewMultTarget = 1;
    await wait(2.4);
    W.autosave();
    await G.ui.fade(1, 1.2);
    st.cine(false);
    W.load('reed_camp', 'start');
    await G.ui.fade(0, 1.0);
  }

  async ending() {
    const st = this.st;
    const s = G.save;
    st.cine(true);
    music.play('riverbed');
    await wait(1.2);
    await st.say([
      { who: 'tobiah', text: 'They let us walk out through the front gate. The front gate, Elior! Soldiers stood aside for us. One of them bowed. To me!' },
      { who: 'barak', text: 'He was bowing to the boy behind you, Tobiah.' },
      { who: 'hanan', text: 'Seventy years I waited in that city. I read the writing for a king who never wanted to hear it. I am glad I lived to read it for you.' },
    ]);
    if (!s.lore.includes('dan221')) s.lore.push('dan221');
    await G.ui.lore('dan221');
    await st.say([
      { who: 'mara', text: 'Kings set up, kings removed. And every time, the Veil was behind the throne, whispering that gold was god. Every time it lost.' },
      { who: 'azriel', text: 'The road home is open now, Elior. But the Veil did not die with the feast. It only lost its city.' },
      { who: 'dov', text: 'Then he will want a better hood for the road. Cut it from a palace curtain myself. Do not ask whose palace.' },
    ]);
    const hood = makeItem('night_watch_hood');
    s.inventory.push(hood);
    G.ui.itemGet(hood);
    await wait(1.2);
    setFlag('ch5_done');
    G.world.autosave(true);
    st.cine(false);
    if ((await G.ui.chapterEnd(5)) === 'next') await this.st.ch6.beginFromChapterFive();
  }

  // ---------------------------------------------------------------- talk
  async talk(n: Npc): Promise<boolean> {
    if (!inCh5()) return false;
    const s = G.save;
    const st = this.st;
    switch (n.kind) {
      case 'mara': {
        const found = CH5_LORE.filter((l) => s.lore.includes(l)).length;
        const q = s.quests.s_feast_words;
        if (q && !q.done && found >= CH5_LORE.length) {
          await st.say([
            { who: 'mara', text: 'All eight. A dry river, a drunken toast, a garden that weighs the great, and two gates that would not shut.' },
            { who: 'mara', text: 'Babylon was warned on its own walls, in its own streets, at its own table. I will write that down first.' },
          ]);
          addMaterial(s, 'radiant_core', 3);
          addMaterial(s, 'covenant_fragment', 3);
          G.world.giveXp(1200);
          st.quest('s_feast_words', 1, true);
          return true;
        }
        await st.say([{ who: 'mara', text: flag('ch5_done') ? 'Hanan has been correcting my Aramaic all morning. I have never been so happy to be wrong.' : `You have found ${found} of the ${CH5_LORE.length} inscriptions of this night. The city is writing its own ending, Elior. Read it.` }]);
        return true;
      }
      case 'hanan': {
        const have = VESSELS.filter((v) => s.secrets.includes(v)).length;
        const q = s.quests.s_vessels;
        if (q && !q.done && have >= VESSELS.length) {
          await st.say([
            { who: 'hanan', text: 'The cup. The bowl. The censer. I polished these as a boy, in the house of God, before Babylon came.' },
            { who: 'hanan', text: 'They go home with us. And this goes with you: I wore it in the temple when the vessels were still in their places. Your turn to keep watch over holy things.' },
          ]);
          const m = makeItem('vessel_keepers_mantle');
          s.inventory.push(m);
          G.ui.itemGet(m);
          G.world.giveXp(1400);
          setFlag('vessels_returned');
          st.quest('s_vessels', 1, true);
          return true;
        }
        await st.say([{ who: 'hanan', text: flag('vessels_returned') ? 'Seventy years of exile, and the cups came home before I did. There is a joke in that somewhere.' : `${have ? `You have found ${have} of the three vessels. ` : ''}Three of the temple vessels were carried off for the feast and never came back to the tables: two to the treasury below the gardens, and a censer high in the banquet hall.` }]);
        return true;
      }
      case 'azriel': {
        await st.say([{ who: 'azriel', text: flag('ch5_writing') ? 'Weighed and found wanting. Go up the palace stair and see the sentence carried out.' : 'The riverbed, the streets, the gardens, the palace. Quietly if you can, Elior. Quickly if you cannot.' }]);
        return true;
      }
      case 'tobiah': {
        await st.say([{ who: 'tobiah', text: flag('ch5_weigher_done') ? 'A hand. Writing on a wall. By itself. I am going to have that dream every night now, and I am going to enjoy it.' : 'Walking into Babylon through the river. Under the walls. In the dark. I have done braver things. I cannot think of one, but I am sure I have.' }]);
        return true;
      }
      case 'ezra': {
        await st.say([{ who: 'ezra', text: 'They feast because they think the walls are high enough. Walls never are.' }]);
        return true;
      }
      case 'talia': {
        await st.say([{ who: 'talia', text: flag('ch5_writing') ? 'Hanan read it to his face. Seventy years old and his voice did not shake once.' : 'Those vessels held the offerings of our fathers. Tonight they hold wine for idols. Bring them out, Elior.' }]);
        return true;
      }
      case 'barak': {
        await st.say([{ who: 'barak', text: 'I have outlived an image of gold. Let us see if I can outlive a whole city.' }]);
        return true;
      }
    }
    return false;
  }

  onLore(id: string) {
    const s = G.save;
    if (!CH5_LORE.includes(id)) return;
    const found = CH5_LORE.filter((l) => s.lore.includes(l)).length;
    G.ui.toast(`Inscriptions of the feast found: ${found}/${CH5_LORE.length}`, 'info');
    const q = s.quests.s_feast_words;
    if (q && !q.done && found >= CH5_LORE.length && q.stage === 0) this.st.quest('s_feast_words', 1);
  }

  secret(id: string): boolean {
    if (!CH5_SECRETS.includes(id)) return false;
    const s = G.save;
    if (s.secrets.includes(id)) return true;
    s.secrets.push(id);
    sfx('lootRare', { vol: 0.6 });
    if (VESSELS.includes(id)) {
      const n = VESSELS.filter((x) => s.secrets.includes(x)).length;
      G.ui.toast(`A vessel of the temple (${n}/${VESSELS.length})`, 'good');
      if (!s.quests.s_vessels) this.st.quest('s_vessels', 0);
      if (n >= VESSELS.length && !s.quests.s_vessels.done) this.st.quest('s_vessels', 1);
      return true;
    }
    const n = CACHES.filter((x) => s.secrets.includes(x)).length;
    G.ui.toast(`Hidden cache discovered (${n}/${CACHES.length})`, 'good');
    if (!s.quests.s_feast_caches) this.st.quest('s_feast_caches', 0);
    if (n >= CACHES.length) this.st.quest('s_feast_caches', 0, true);
    return true;
  }

  onPurified(elite: string | null) {
    if (elite === 'garden_keeper') G.ui.toast('The Keeper of the Gardens joins your Echoes.', 'good');
    if (elite === 'treasury_captain') G.ui.toast('The Captain of the Treasury joins your Echoes.', 'good');
  }
}
