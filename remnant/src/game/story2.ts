// Chapter II — The Tower of Shinar. The road east to the Valley of Bones
// crosses the Plain of Shinar, where a red tower has risen in a single
// month. Scripture is quoted from the King James Version; the world and its
// people are fictional.

import { G, flag, setFlag } from './ctx';
import { fx } from '../render/fx';
import { sfx } from '../audio/audio';
import { music } from '../audio/music';
import { TILE } from './tiles';
import { Npc, Altar } from './props';
import { Enemy } from './enemies';
import { Gatekeeper, Marshal } from './bosses2';
import { ECHO_SPECIES } from './data';
import { derive, makeItem, addMaterial } from './state';
import { CH2_ROOM_IDS } from './rooms2';
import { shakeScale } from '../core/settings';
import type { Story, QuestDef } from './story';

export const QUESTS2: QuestDef[] = [
  {
    id: 'm_tower', title: 'The Tower of Shinar', kind: 'main',
    stages: [
      'The road east runs across the Plain of Shinar. Follow it past the brickworks.',
      'The kiln yard beyond the brickworks is the only way through to the tower.',
      'Something is chained before the Tower Gate. Get past it.',
      'Climb the tower. Its commander waits at the top.',
      'Face the Crimson Marshal in his hall.',
    ],
    done: 'The Tower of Shinar has fallen.',
  },
  { id: 's_builders', title: 'The Builders\' Words', kind: 'side', stages: ['Azriel wants to know what the builders believed. Find the six inscriptions of Shinar.', 'You have found all six inscriptions. Tell Azriel what they said.'], done: 'Azriel knows what was built here, and why.' },
  { id: 's_courses', title: 'Hidden Courses', kind: 'side', stages: ['The plain and the tower hide three secret caches. Find them.'], done: 'Every hidden cache of Shinar has been found.' },
];

export const CH2_LORE = ['gen111', 'gen113', 'gen114', 'gen116', 'gen117', 'gen119'];
export const CH2_SECRETS = ['plain_ledge', 'kiln_loft', 'tower_alcove'];

const wait = (sec: number) => new Promise<void>((r) => setTimeout(r, sec * 1000));

export function inChapter2() {
  return CH2_ROOM_IDS.has(G.world.room.id);
}

export class Chapter2 {
  constructor(private st: Story) {}

  // ---------------------------------------------------------------- entering rooms
  onEnter(id: string, first: boolean): boolean {
    if (!CH2_ROOM_IDS.has(id)) return false;
    const s = G.save;
    if (id === 'shinar_camp' && !flag('ch2_intro')) {
      this.opening();
      return true;
    }
    if (id === 'shinar_camp' && flag('ch2_tower_down') && !flag('ch2_done')) {
      this.ending();
      return true;
    }
    if (first) {
      const r = G.world.room;
      setTimeout(() => G.ui.banner(r.name.toUpperCase(), r.region, 'area'), 400);
    }
    if (id === 'shinar_plain' && first) {
      setTimeout(() => G.ui.caption('On the horizon, a tower the colour of dried blood climbs into the cloud.'), 2600);
      setTimeout(() => G.ui.caption(null), 7200);
    }
    if (id === 'kiln_yard' && s.defeated.includes('kiln_overseer')) G.world.gateClosed = false;
    if (id === 'tower_gate' && s.defeated.includes('gatekeeper')) {
      music.play('tower');
      if (!flag('gate_open')) {
        setFlag('gate_open');
        s.storySlots = Math.max(s.storySlots, 3);
        G.d = derive(s);
      }
    }
    if (id === 'tower_lower' && first) this.st.quest('m_tower', 3);
    if (id === 'marshal_throne' && s.defeated.includes('marshal')) {
      music.play('tower');
      const chosen = flag('marshal_raised') || flag('marshal_rested');
      if (!chosen) {
        // Saved after the duel but before the choice: he is still kneeling.
        const m = new Marshal(44 * TILE, 20 * TILE);
        m.yieldNow();
        G.world.add(m);
        setTimeout(() => this.marshalDefeated(m), 900);
      } else if (!flag('ch2_tower_down')) {
        setTimeout(() => {
          this.st.cine(true);
          this.towerFalls();
        }, 900);
      }
    }
    return true;
  }

  // ---------------------------------------------------------------- triggers
  onTrigger(id: string): boolean {
    switch (id) {
      case 'overseer': if (!G.save.defeated.includes('kiln_overseer')) this.overseer(); return true;
      case 'gatekeeper_start': if (!G.save.defeated.includes('gatekeeper')) this.gatekeeperStart(); return true;
      case 'guard_wave': if (!flag('guard_cleared')) this.guardWave(); return true;
      case 'marshal_start': if (!G.save.defeated.includes('marshal')) this.marshalStart(); return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- opening
  async beginFromChapterOne() {
    await G.ui.fade(1, 1.0);
    G.world.load('shinar_camp', 'start');
    await G.ui.fade(0, 1.0);
  }

  async opening() {
    const st = this.st;
    st.cine(true);
    setFlag('ch2_intro');
    // The camp altar is kindled on arrival, so Shinar is always one step away.
    if (!G.save.altarsLit.includes('shinar_camp')) G.save.altarsLit.push('shinar_camp');
    G.save.altar = { room: 'shinar_camp', spawn: 'altar' };
    music.play('shinar');
    await wait(0.8);
    G.ui.banner('CHAPTER II', 'The Tower of Shinar', 'chapter');
    await wait(3.4);
    const c = await st.say([
      { who: 'azriel', text: 'Two days east of Hearthward, and the pass finally opens. That is the Plain of Shinar below us.' },
      { who: 'tobiah', text: 'And that is a tower. A very large, very red tower. Was that on Mara\'s map?' },
      { who: 'azriel', text: 'No. The traders say it rose in a single month. The brickmakers who worked the plain went to build it, and none of them came home.' },
      { who: 'azriel', text: 'The road to the Valley of Bones runs straight past its gate. We cannot go around it.' },
      { who: 'elior', text: '...', choices: [{ label: 'Then we go through it.' }, { label: 'What kind of people build a tower that fast?' }] },
    ]);
    if (c === 1) {
      await st.say([
        { who: 'azriel', text: 'Frightened ones. People who want a name so large that nothing can scatter them.' },
        { who: 'azriel', text: 'Mara would tell you this has happened before. She would also tell you how it ended.' },
      ]);
    } else {
      await st.say([{ who: 'azriel', text: 'Through it. Carefully. I want everyone who walks in to walk out.' }]);
    }
    await st.say([
      { who: 'tobiah', text: 'Ilan followed us all the way out here with his cart. Dov too. I think they like us. Or they like your silver.' },
      { who: 'azriel', text: 'Your Echoes have grown, Elior. Use them well. Rest at the altar here before you go down.' },
    ]);
    st.quest('m_tower', 0);
    st.quest('s_builders', 0);
    st.cine(false);
    G.world.autosave(true);
    if (G.save.echoes.length >= 2) {
      setTimeout(() => G.ui.hint(st.fmt('With more Echoes than slots, press {switch} in battle to tag in the next one. With none on the bench, you trade places instead.')), 1200);
      setTimeout(() => G.ui.hint(null), 9000);
    }
  }

  // ---------------------------------------------------------------- the Overseer
  async overseer() {
    const W = G.world;
    const st = this.st;
    st.cine(true);
    W.closeGate(true);
    music.play('boss', 0.5);
    music.phase = 0;
    sfx('roar', { pitch: 0.9 });
    G.camera.addTrauma(0.3 * shakeScale());
    G.ui.banner('OVERSEER OF THE KILNS', 'He counted every brick', 'boss');
    await wait(1.8);
    st.cine(false);
    st.quest('m_tower', 1);
    G.ui.hint(st.fmt('Break his poise and he falls Broken: launch him with {heavy} or a rising Comet, and keep him in the air.'));
    setTimeout(() => G.ui.hint(null), 8000);
  }

  // ---------------------------------------------------------------- the Gatekeeper
  async gatekeeperStart() {
    const W = G.world;
    const b = W.boss;
    if (!(b instanceof Gatekeeper)) return;
    const st = this.st;
    st.cine(true);
    W.bossActive = true;
    W.closeGate(true);
    music.stop(1);
    await st.walkPlayer(24 * TILE, 60);
    G.camera.viewMultTarget = 1.3;
    if (!flag('gatekeeper_seen')) {
      sfx('chains', { vol: 0.8 });
      G.ui.caption('Something enormous is chained before the door. It has been waiting a long time for someone to come close.');
      await wait(2.6);
      G.ui.caption(null);
    } else b.st = 0.9;
    setFlag('gatekeeper_seen');
    b.awaken();
  }

  async gatekeeperDefeated(b: Gatekeeper) {
    const W = G.world;
    const s = G.save;
    const st = this.st;
    st.cine(true);
    G.camera.viewMultTarget = 1;
    await wait(0.8);
    music.play('victory', 2);
    G.ui.banner('THE GATEKEEPER HAS FALLEN', '', 'boss');
    W.giveXp(900);
    W.spawnLoot(b.x, b.y - 40, [{ silver: 400 }, { mat: 'radiant_core', n: 1 }, { item: 'hound_fang' }, { mat: 'covenant_fragment', n: 2 }], true);
    await wait(3.0);
    s.storySlots = Math.max(s.storySlots, 3);
    G.d = derive(s);
    G.ui.banner('COMMANDER OF THE REMNANT', 'A third Echo may now fight beside you', 'level');
    W.summonEchoes();
    await wait(2.4);
    sfx('rumble');
    sfx('door');
    G.camera.addTrauma(0.5 * shakeScale());
    G.ui.caption('With a sound like a held breath let go, the tower door grinds open.');
    setFlag('gate_open');
    await wait(3.0);
    G.ui.caption(null);
    st.quest('m_tower', 3);
    st.cine(false);
    W.autosave();
  }

  // ---------------------------------------------------------------- the Crimson Guard
  async guardWave() {
    const W = G.world;
    const st = this.st;
    st.cine(true);
    W.closeGate(true);
    music.play('boss', 0.5);
    music.phase = 0;
    sfx('bell', { pitch: 0.6 });
    G.ui.banner('THE CRIMSON GUARD', 'Hold the hall', 'boss');
    await wait(1.4);
    st.cine(false);
    type K = 'knight' | 'bulwark' | 'archer';
    const waves: [K, number, string | null][][] = [
      [['knight', 46, null], ['knight', 52, null], ['knight', 14, null]],
      [['knight', 50, null], ['bulwark', 44, null], ['archer', 58, null], ['knight', 12, null]],
      [['knight', 48, 'knight_captain'], ['knight', 54, null], ['knight', 16, null]],
    ];
    let wave = 0;
    let foes: Enemy[] = [];
    const spawn = () => {
      foes = [];
      waves[wave].forEach(([k, x, elite], i) => setTimeout(() => {
        if (W.room.id !== 'tower_upper') return;
        if (elite && G.save.defeated.includes(elite)) elite = null;
        const e = W.spawnEnemy(k, x * TILE, 22 * TILE, elite);
        e.face = x < 37 ? 1 : -1;
        foes.push(e);
        fx.veilBurst(e.cx, e.cy, 14, 1);
        fx.column(e.x, e.y, 26, 120, '#ff3a4a', 0.6);
        sfx('summon', { pitch: 0.6, vol: 0.6 });
      }, 300 + i * 450));
      if (wave > 0) G.ui.toast(wave === 2 ? 'The Knight-Captain takes the field!' : 'More of the Guard pour in!', 'warn');
    };
    spawn();
    const check = setInterval(() => {
      if (W.room.id !== 'tower_upper' || W.player.state === 'dead') {
        clearInterval(check);
        return;
      }
      if (foes.length === waves[wave].length && foes.every((f) => f.dying)) {
        wave++;
        if (wave < waves.length) spawn();
        else {
          clearInterval(check);
          this.guardCleared();
        }
      }
    }, 300);
  }

  async guardCleared() {
    const W = G.world;
    setFlag('guard_cleared');
    music.play('tower', 2);
    G.ui.banner('THE HALL IS HELD', '', 'level');
    W.giveXp(300);
    // The gate stays shut while the Knight-Captain awaits purification.
    if (!W.ents.some((e) => e instanceof Enemy && e.awaitingPurify)) W.closeGate(false);
    const alt = new Altar(64 * TILE, 22 * TILE, 'tower_upper');
    W.add(alt);
    fx.column(alt.x, alt.y, 40, 200, '#fff3c4', 1.4);
    sfx('altar');
    this.st.quest('m_tower', 4);
    W.autosave(true);
  }

  // ---------------------------------------------------------------- the Marshal
  async marshalStart() {
    const W = G.world;
    const b = W.boss;
    if (!(b instanceof Marshal)) return;
    const st = this.st;
    st.cine(true);
    W.bossActive = true;
    W.closeGate(true);
    music.stop(1.5);
    await st.walkPlayer(30 * TILE, 50);
    // The Echoes kneel at the edge of the hall.
    if (W.echoes.length) {
      for (const e of W.echoes) fx.column(e.x, e.y, 20, 100, '#fff3c4', 0.6);
      W.dismissEchoes();
      G.save.flags.army_out = true;
    }
    G.camera.viewMultTarget = 1.15;
    if (!flag('marshal_met')) {
      setFlag('marshal_met');
      const c = await st.say([
        { who: 'marshal', text: 'You climbed my tower with an army of the remembered at your back. Leave them at the door.' },
        { who: 'elior', text: 'They\'re not dead. They are—' },
        { who: 'marshal', text: 'Courage that outlived its bearers. I know. I have stood guard over a great deal of remembering.' },
        { who: 'marshal', text: 'The builders wanted a name. I wanted only to keep my oath. I swore to hold this hall until a worthy blade came to take it.' },
        { who: 'marshal', text: 'None has. Show me yours. Alone.' },
        { who: 'elior', text: '...', choices: [{ label: 'Then we fight with honour.' }, { label: 'I don\'t need them to beat you.' }] },
      ]);
      if (c === 0) {
        setFlag('humble', Number(G.save.flags.humble ?? 0) + 1);
        await st.say([{ who: 'marshal', text: 'Good. Then so will I.' }]);
      } else {
        setFlag('pride', Number(G.save.flags.pride ?? 0) + 1);
        await st.say([{ who: 'marshal', text: 'Every builder in this tower said the same. Come, then.' }]);
      }
    } else b.st = 1.0;
    G.ui.toast('An honour duel: your Echoes kneel and watch.', 'info');
    b.awaken();
  }

  async marshalDefeated(m: Marshal) {
    const W = G.world;
    const s = G.save;
    const st = this.st;
    st.cine(true);
    G.camera.viewMultTarget = 1;
    G.camera.focus = { x: m.x, y: m.y - 30 };
    music.play('revelation', 2);
    await wait(0.6);
    await st.say([
      { who: 'marshal', text: 'Enough. The hall is yours.' },
      { who: 'marshal', text: 'I built nothing here. I only guarded what others built to make themselves a name. Every stone of it was pride, and I stood on it.' },
      { who: 'marshal', text: 'I have no more oath to keep. Do with me what you will, watchman.' },
    ]);
    const c = await G.ui.choice('The Crimson Marshal kneels', 'His sword is driven into the floor before him. The Veil is already leaving him, and the light of the covenant is waiting for your word.', [
      { label: 'Arise', sub: 'Raise him as an Echo, his oath renewed. The Marshal fights at your side as your strongest Warden.' },
      { label: 'Rest', sub: 'Let him lay down his sword at last. Receive the Oathblade.' },
    ]);
    W.giveXp(1200);
    if (c === 0) {
      setFlag('marshal_raised');
      W.player.face = m.x > W.player.x ? 1 : -1;
      W.player.anim.play('invoke', 0.15, true);
      await wait(0.4);
      G.ui.caption('"Arise."');
      sfx('purify');
      for (let i = 0; i < 6; i++) setTimeout(() => {
        fx.veilBurst(m.cx + (Math.random() - 0.5) * 20, m.cy + (Math.random() - 0.5) * 30, 10, 1.2);
        fx.holyBurst(m.cx, m.cy, 8, 0.8);
      }, i * 150);
      await wait(1.2);
      fx.column(m.x, m.y, 80, 360, '#fff3c4', 2.2);
      fx.flash('#ffffff', 0.8);
      fx.ring(m.x, m.y - 2, 8, 160, '#ffe6a8', 0.9, 5, 0.3);
      G.camera.addTrauma(0.6 * shakeScale());
      m.remove = true;
      const absorbed = W.absorb('marshal')!;
      const inst = absorbed.echo;
      G.d = derive(s);
      // The Marshal leads: he takes the first place in the line.
      s.active = [inst.uid, ...s.active.filter((u) => u !== inst.uid)].slice(0, G.d.echoSlots);
      s.flags.army_out = true;
      W.summonEchoes(true);
      const unit = W.echoes.find((u) => u.inst.uid === inst.uid);
      if (unit) {
        unit.x = m.x;
        unit.y = m.y;
        unit.face = W.player.x > m.x ? 1 : -1;
        unit.summonT = 1.2;
      }
      sfx('summon');
      G.ui.caption(null);
      const sp = ECHO_SPECIES.marshal;
      G.ui.banner(absorbed.evolved ? 'ECHO EVOLVED' : 'ECHO RAISED', `${sp.stages[inst.stage].name} · ${sp.cls}`, 'echo');
      await wait(2.6);
      if (!s.lore.includes('ruth116')) s.lore.push('ruth116');
      await G.ui.lore('ruth116');
      await st.say([
        { who: 'marshal', text: 'Whither thou goest, I will go. Lead well, watchman. I will be watching how you lead.' },
      ]);
    } else {
      setFlag('marshal_rested');
      sfx('altar');
      G.ui.caption('He sets the sword across his knees and bows his head. The red goes out of his armour like a tide.');
      await wait(3.2);
      fx.column(m.x, m.y, 60, 300, '#fff3c4', 2.0);
      fx.holyBurst(m.x, m.y - 30, 30, 1.6);
      sfx('purify');
      m.remove = true;
      G.ui.caption(null);
      const it = makeItem('oathblade');
      s.inventory.push(it);
      G.ui.itemGet(it);
      if (!s.lore.includes('tim47')) s.lore.push('tim47');
      await G.ui.lore('tim47');
      if (s.flags.army_out !== false) W.summonEchoes();
    }
    W.spawnLoot(m.x, m.y - 30, [{ silver: 500 }, { mat: 'radiant_core', n: 1 }, { mat: 'covenant_fragment', n: 3 }], true);
    addMaterial(s, 'sentinel_steel', 3);
    this.st.quest('m_tower', 4, true);
    await wait(1.5);
    await this.towerFalls();
  }

  async towerFalls() {
    const W = G.world;
    const st = this.st;
    G.camera.focus = null;
    sfx('rumble');
    G.camera.addTrauma(0.8 * shakeScale());
    await wait(0.8);
    // The Regent watches from the throne.
    const rg = new Npc('regent', 56 * TILE, 18 * TILE, -1);
    W.add(rg);
    fx.veilBurst(56 * TILE, 15 * TILE, 20, 1);
    sfx('wispHum', { pitch: 0.5 });
    await wait(0.6);
    await st.say([
      { who: 'regent', text: 'You keep breaking the things men build to save themselves, little watchman.' },
      { who: 'regent', text: 'Babel always falls. And they always build it again, a little higher. I will be there when they do. Will you?' },
      ...(flag('marshal_raised') ? [{ who: 'regent', text: 'And you took its commander for yourself. You see? You are learning.' }] : [{ who: 'regent', text: 'You even refused its commander. How very... humble.' }]),
    ]);
    fx.veilBurst(56 * TILE, 15 * TILE, 24, 1.2);
    rg.remove = true;
    sfx('wallBreak');
    G.camera.addTrauma(1 * shakeScale());
    G.ui.caption('Stone grinds against stone, far above. The tower has begun to fall.');
    for (let i = 0; i < 10; i++) setTimeout(() => fx.shards(W.player.x + (Math.random() - 0.5) * 300, W.player.y - 200, 6, '#6a4a3a', 1.4), i * 200);
    await wait(2.6);
    G.ui.caption(null);
    setFlag('ch2_tower_down');
    W.bossActive = false;
    await G.ui.fade(1, 1.2);
    st.cine(false);
    W.load('shinar_camp', 'start');
    await G.ui.fade(0, 1.0);
  }

  async ending() {
    const st = this.st;
    const s = G.save;
    st.cine(true);
    music.play('shinar');
    await wait(1.2);
    await st.say([
      { who: 'tobiah', text: 'It just... folded. Like a tent with the pole pulled out. There\'s dust on everything. There\'s dust in my ears, Elior.' },
      { who: 'azriel', text: 'The brickmakers are walking back across the plain. Dazed, but alive. Most of them do not remember the last month.' },
      ...(flag('marshal_raised')
        ? [{ who: 'azriel', text: 'And the knight who walks behind you now. Is that who I think it is?' }, { who: 'elior', text: 'He gave his oath again. I\'ll try to deserve it.' }, { who: 'azriel', text: 'See that you do. An army that follows you that far is a heavy thing to carry.' }]
        : [{ who: 'azriel', text: 'That sword. You did not take it from him, did you?' }, { who: 'elior', text: 'He gave it. Then he rested.' }, { who: 'azriel', text: 'Then carry it the way he did. Not for a name.' }]),
    ]);
    if (!s.lore.includes('isa211')) s.lore.push('isa211');
    await G.ui.lore('isa211');
    await st.say([
      { who: 'azriel', text: 'Mara\'s notes had that verse beside a drawing of a tower. She knew. She always knows.' },
      { who: 'azriel', text: 'The Valley of Bones is two days east. We go at first light.' },
      { who: 'tobiah', text: 'Bones. Wonderful. Can the next place be a nice orchard?' },
    ]);
    setFlag('ch2_done');
    G.world.autosave(true);
    st.cine(false);
    if ((await G.ui.chapterEnd(2)) === 'next') await this.st.ch3.beginFromChapterTwo();
  }

  // ---------------------------------------------------------------- talk
  async talk(n: Npc): Promise<boolean> {
    if (!inChapter2()) return false;
    const s = G.save;
    const st = this.st;
    switch (n.kind) {
      case 'azriel': {
        const found = CH2_LORE.filter((l) => s.lore.includes(l)).length;
        const q = s.quests.s_builders;
        if (q && !q.done && found >= CH2_LORE.length) {
          await st.say([
            { who: 'elior', text: 'Six inscriptions. Bricks, a name, one language, and a hall where no one could understand anyone else.' },
            { who: 'azriel', text: 'Then they built to keep from being scattered, and the building is what scattered them.' },
            { who: 'azriel', text: 'Take these. Dov forged them from the steel of the guards you set free. He says they are the best work he has done in years.' },
          ]);
          addMaterial(s, 'sentinel_steel', 3);
          addMaterial(s, 'covenant_fragment', 2);
          G.world.giveXp(250);
          G.ui.toast('Received 3 Sentinel Steel and 2 Covenant Fragments', 'loot');
          st.quest('s_builders', 1, true);
          return true;
        }
        const line = flag('ch2_done')
          ? 'Rest. First light comes early.'
          : found > 0 ? `You have found ${found} of the builders' inscriptions. Read them all, and tell me what this tower was for.` : 'Read whatever the builders left carved in the stone. I want to know what drove them to this.';
        await st.say([{ who: 'azriel', text: line }]);
        return true;
      }
      case 'tobiah': {
        const lines = [
          'I counted the bricks in one row of that tower. I stopped at four hundred. My eyes started counting on their own.',
          'You know what scares me most about the tower? The door. Doors that big are built for something big.',
          'If you see any brickmakers, tell them Hearthward is hiring. We have a lot of walls that need fixing.',
        ];
        await st.say([{ who: 'tobiah', text: flag('ch2_done') ? 'Valley of Bones. Valley. Of. Bones. Nobody names a nice place that.' : lines[Math.floor(G.time / 7) % lines.length] }]);
        return true;
      }
    }
    return false;
  }

  /** Inscriptions found in Chapter II. */
  onLore(id: string) {
    const s = G.save;
    if (!CH2_LORE.includes(id)) return;
    const found = CH2_LORE.filter((l) => s.lore.includes(l)).length;
    G.ui.toast(`Builders' inscriptions found: ${found}/${CH2_LORE.length}`, 'info');
    if (s.quests.s_builders && !s.quests.s_builders.done && found >= CH2_LORE.length && s.quests.s_builders.stage === 0) st_quest(this.st, 's_builders', 1);
  }

  /** Secret caches. Returns true if this was one of Chapter II's. */
  secret(id: string): boolean {
    if (!CH2_SECRETS.includes(id)) return false;
    const s = G.save;
    if (s.secrets.includes(id)) return true;
    s.secrets.push(id);
    const n = CH2_SECRETS.filter((x) => s.secrets.includes(x)).length;
    sfx('lootRare', { vol: 0.6 });
    G.ui.toast(`Hidden cache discovered (${n}/${CH2_SECRETS.length})`, 'good');
    if (!s.quests.s_courses) this.st.quest('s_courses', 0);
    if (n >= CH2_SECRETS.length) this.st.quest('s_courses', 0, true);
    return true;
  }

  /** Purified elites of Chapter II. */
  onPurified(elite: string | null) {
    if (elite === 'kiln_overseer') {
      const it = makeItem('overseer_sigil');
      G.save.inventory.push(it);
      G.ui.itemGet(it);
      this.st.quest('m_tower', 2);
    }
    if (elite === 'knight_captain' && flag('guard_cleared')) G.world.closeGate(false);
  }
}

function st_quest(st: Story, id: string, stage: number) {
  st.quest(id, stage);
}

export { Gatekeeper, Marshal };
