// Chapter IV — The Plain of Dura. By the rivers of Babylon the Remnant
// learns that a satrap has raised an image of gold and commands every captive
// to bow; three who would not are bound for the furnace. Elior crosses the
// blue gate and the Processional Way, reaches the furnace too late to stop
// it and sees the three walk unhurt with a fourth in the fire, then faces the
// Image on the plain. Scripture is quoted from the King James Version; the
// world and its people are fictional.

import { G, flag, setFlag, placeBanner } from './ctx';
import { fx } from '../render/fx';
import { sfx } from '../audio/audio';
import { music } from '../audio/music';
import { TILE } from './tiles';
import { Npc } from './props';
import { Enemy } from './enemies';
import { makeItem, addMaterial } from './state';
import { CH4_ROOM_IDS } from './rooms4';
import { registerGuide } from './guide';
import { shakeScale } from '../core/settings';
import type { Story, QuestDef } from './story';
import type { EnemyKind } from './tiles';

export const QUESTS4: QuestDef[] = [
  {
    id: 'm_dura', title: 'The Burning Fiery Furnace', kind: 'main',
    stages: [
      'Three captives who would not bow are bound for the furnace. Pass through the Gate of Babylon.',
      'Follow the Processional Way to the furnace halls at its far end.',
      'Reach the mouth of the furnace before the captives burn.',
      'The satrap has fled to the plain of Dura to wake the Image. Stop him.',
    ],
    done: 'The Image of Gold is broken to pieces.',
  },
  { id: 's_dura_words', title: 'Writing on the Walls of Babylon', kind: 'side', stages: ['Mara wants every inscription between the river and the Image. Find all eight.', 'You have found all eight. Bring them to Mara at the river camp.'], done: 'Mara has Babylon\'s words.' },
  { id: 's_dura_caches', title: 'Treasures of Babylon', kind: 'side', stages: ['The city hides two secret caches. Find them.'], done: 'Both caches of Babylon found.' },
  { id: 's_den', title: 'The Lions\' Den', kind: 'side', stages: ['Something lairs in the pit beneath the Processional Way. Find the Lion of the Den and purify it.'], done: 'The Lion of the Den walks with you now.' },
];

export const CH4_LORE = ['ps1371', 'dan31', 'dan35', 'dan622', 'dan317', 'dan318', 'dan232', 'dan234'];
export const CH4_SECRETS = ['rooftop_cache', 'den_cache'];

/** What the story needs from the Image of Gold (game/bosses4.ts). */
interface ImageBoss {
  x: number; y: number; cx: number; cy: number;
  remove: boolean;
  awaken(): void;
  shatter(): Promise<void>;
  yieldNow(): void;
}

const wait = (sec: number) => new Promise<void>((r) => setTimeout(r, sec * 1000));
const inCh4 = () => CH4_ROOM_IDS.has(G.world.room.id);

// The guide knows this chapter's objectives.
registerGuide(() => {
  const s = G.save;
  if (!s) return null;
  const q = s.quests.m_dura;
  if (q && !q.done) {
    if (!flag('captives_freed')) return { room: 'furnace_mouth', at: 'trigger:furnace_rescue', label: 'the furnace, at the far end of the Processional Way' };
    if (!s.defeated.includes('golden_image')) return { room: 'image_base', at: 'trigger:image_start', label: 'the Image of Gold on the plain of Dura' };
    return null;
  }
  if (flag('ch3_done') && !flag('ch4_intro')) {
    const here = G.world.room;
    const alt = here.ents.find((e) => e.t === 'altar');
    if (alt && alt.t === 'altar') return { room: here.id, at: 'altar:' + alt.id, label: 'an altar: rest and choose Journey on' };
  }
  return null;
});

export class Chapter4 {
  constructor(private st: Story) {}

  // ---------------------------------------------------------------- rooms
  onEnter(id: string, first: boolean): boolean {
    if (!CH4_ROOM_IDS.has(id)) return false;
    const s = G.save;
    if (id === 'river_camp' && !flag('ch4_intro')) {
      this.opening();
      return true;
    }
    if (id === 'river_camp' && flag('ch4_image_done') && !flag('ch4_done')) {
      this.ending();
      return true;
    }
    if (first) {
      const r = G.world.room;
      placeBanner(r, r.name.toUpperCase(), r.region);
    }
    if (id === 'babylon_gate' && first) {
      this.st.quest('m_dura', 0);
      this.caption('Blue brick and gold, as high as a cliff. Lions forty feet long walk along the walls, and every one of them is looking at you.', 2600, 5200);
    }
    if (id === 'processional_way' && first) {
      this.st.quest('m_dura', 1);
      this.caption('Somewhere far ahead, a hundred instruments are tuning at once.', 2600, 4600);
    }
    if (id === 'lions_den' && first) {
      if (!s.quests.s_den) this.st.quest('s_den', 0);
      this.caption('Straw, old bones, and a breath in the dark that is far too large.', 900, 4200);
    }
    if (id === 'furnace_halls' && first) this.st.quest('m_dura', 2);
    if (id === 'furnace_mouth' && !flag('captives_freed')) music.play('furnace');
    if (id === 'dura_plain' && first) {
      if (flag('captives_freed')) this.st.quest('m_dura', 3);
      if (!s.altarsLit.includes('dura_plain')) s.altarsLit.push('dura_plain');
    }
    if (id === 'image_base' && s.defeated.includes('golden_image') && !flag('ch4_image_done')) {
      // Saved after the fight but before the stone fell: finish it now.
      const img = G.world.boss as unknown as ImageBoss | null;
      if (img) {
        img.yieldNow();
        setTimeout(() => this.imageDefeated(img), 900);
      }
    }
    return true;
  }

  onTrigger(id: string): boolean {
    if (id === 'furnace_rescue') {
      if (!flag('captives_freed')) this.rescue();
      return true;
    }
    if (id === 'herald_horn') {
      if (!flag('horn_heard')) this.herald();
      return true;
    }
    if (id === 'image_start') {
      if (!G.save.defeated.includes('golden_image')) this.imageStart();
      return true;
    }
    return false;
  }

  private caption(text: string, at: number, until: number) {
    setTimeout(() => G.ui.caption(text), at);
    setTimeout(() => G.ui.caption(null), until);
  }

  // ---------------------------------------------------------------- opening
  async beginFromChapterThree() {
    await G.ui.fade(1, 1.0);
    G.world.load('river_camp', 'start');
    await G.ui.fade(0, 1.0);
  }

  async opening() {
    const st = this.st;
    st.cine(true);
    setFlag('ch4_intro');
    const s = G.save;
    if (!s.altarsLit.includes('river_camp')) s.altarsLit.push('river_camp');
    s.altar = { room: 'river_camp', spawn: 'altar' };
    music.play('dura');
    await wait(0.8);
    G.ui.banner('CHAPTER IV', 'The Plain of Dura', 'chapter');
    await wait(3.4);
    await st.say([
      { who: 'mara', text: 'The rivers of Babylon. I used to read the old song about this place to my apprentices, and think it was only sad.' },
    ]);
    if (!s.lore.includes('ps1371')) s.lore.push('ps1371');
    await G.ui.lore('ps1371');
    await st.say([
      { who: 'azriel', text: 'We did not come here to weep. Our scouts are back. A satrap rules the plain of Dura now, and he has raised an image of gold sixty cubits high.' },
      { who: 'azriel', text: 'When his musicians play, every captive in Babylon must fall down before it. Those who will not are thrown into a furnace.' },
      { who: 'tobiah', text: 'And... has anyone not?' },
      { who: 'azriel', text: 'Three of ours. Ezra, Talia, and old Barak. They stood up in the square this morning while the whole city knelt. They burn at dusk.' },
      { who: 'elior', text: '...', choices: [{ label: 'Then we go now.' }, { label: 'Where is the furnace?' }] },
    ]);
    await st.say([
      { who: 'mara', text: 'Through the Gate of Babylon and along the Processional Way. The furnace halls are at its far end.' },
      { who: 'mara', text: 'And Elior, the scouts say something else. They say the Image moves when the music plays.' },
      { who: 'azriel', text: 'Go. We will hold the camp. Bring them home.' },
    ]);
    st.quest('m_dura', 0);
    st.quest('s_dura_words', 0);
    st.cine(false);
    G.world.autosave(true);
  }

  // ---------------------------------------------------------------- the furnace
  private async rescue() {
    const W = G.world;
    const st = this.st;
    const s = G.save;
    st.cine(true);
    W.bossActive = true;
    music.stop(1);
    await st.walkPlayer(22 * TILE, 60);
    const fxX = 46 * TILE, fxY = 16 * TILE;
    G.camera.focus = { x: 34 * TILE, y: 16 * TILE };
    sfx('furnaceBlast', { vol: 0.9 });
    G.camera.addTrauma(0.5 * shakeScale());
    G.ui.caption('The furnace roars, seven times hotter than it was ever meant to burn. The guards who fed it lie where the heat struck them down.');
    await wait(3.2);
    G.ui.caption(null);
    const sat = new Npc('satrap', 36 * TILE, 22 * TILE, -1);
    W.add(sat);
    fx.veilBurst(sat.x, sat.y - 20, 14, 1);
    await st.say([
      { who: 'satrap', text: 'A watchman of the Remnant. You are too late. They would not bow. Now they burn.' },
      { who: 'elior', text: '...', choices: [{ label: 'Look again.' }, { label: 'Let them go.' }] },
    ]);
    // Inside the fire: three walking, and a fourth.
    G.camera.focus = { x: fxX, y: fxY };
    G.camera.viewMultTarget = 0.9;
    for (let i = 0; i < 4; i++) {
      const x = fxX - 18 + i * 12;
      setTimeout(() => {
        fx.column(x, 22 * TILE, i === 3 ? 26 : 14, 120, i === 3 ? '#fff6dc' : '#ffcf8a', 3.5);
        if (i === 3) fx.holyBurst(x, 18 * TILE, 24, 1.2);
      }, 600 + i * 500);
    }
    await wait(2.8);
    await st.say([
      { who: 'satrap', text: 'Did we not cast three men bound into the fire? Why are they walking? Who is that with them?' },
    ]);
    if (!s.lore.includes('dan325')) s.lore.push('dan325');
    await G.ui.lore('dan325');
    G.camera.viewMultTarget = 1;
    G.camera.focus = { x: sat.x, y: sat.y - 30 };
    await st.say([
      { who: 'satrap', text: 'No. NO. Guards! Lions! Kill the watchman. Let the fire keep its own!' },
    ]);
    fx.veilBurst(sat.x, sat.y - 20, 20, 1.2);
    sfx('fireBurst', { vol: 0.8 });
    sat.remove = true;
    G.ui.caption('The satrap vanishes into the smoke, toward the plain.');
    setTimeout(() => G.ui.caption(null), 3000);
    G.camera.focus = null;
    st.cine(false);
    if (!flag('furnace_waves')) {
      music.play('furnace', 0.5);
      G.ui.banner('THE FURNACE GUARD', 'Hold the furnace mouth', 'boss');
      await this.waves('furnace_mouth', [
        [['knight', 30], ['priest', 12], ['lion', 40], ['lion', 8]],
        [['knight', 10], ['knight', 36], ['priest', 26], ['lion', 44], ['priest', 6]],
      ], 22);
      if (W.room.id !== 'furnace_mouth' || W.player.state === 'dead') {
        W.bossActive = false;
        return;
      }
      setFlag('furnace_waves');
      W.autosave(true);
    }
    await this.freed();
  }

  private async freed() {
    const W = G.world;
    const st = this.st;
    const s = G.save;
    st.cine(true);
    music.play('revelation', 1.5);
    const fxX = 46 * TILE;
    sfx('furnaceBlast', { vol: 0.6, pitch: 0.8 });
    fx.flash('#fff6dc', 0.5);
    const three: Npc[] = [];
    (['ezra', 'talia', 'barak'] as const).forEach((k, i) => {
      const n = new Npc(k, fxX - 6 + i * 8, 22 * TILE, -1);
      n.walkTo = W.player.x + 30 + i * 18;
      W.add(n);
      three.push(n);
      fx.holyBurst(n.x, n.y - 20, 10, 0.8);
    });
    await wait(2.6);
    await st.say([
      { who: 'barak', text: 'Not a hair singed, boy. The ropes burned off our hands and we did not.' },
      { who: 'talia', text: 'There were four of us in there. I will not say more than that. I could not if I tried.' },
      { who: 'ezra', text: 'We told the satrap our God could deliver us. And if not, we still would not bow. It seems the first answer was the true one.' },
      { who: 'ezra', text: 'He has gone to the plain to wake the Image. If it walks, all Babylon kneels to it forever.' },
    ]);
    if (!s.lore.includes('isa432')) s.lore.push('isa432');
    await G.ui.lore('isa432');
    await st.say([
      { who: 'barak', text: 'Take this. I wore it into the fire and out again. It does not even smell of smoke.' },
    ]);
    const robe = makeItem('unsinged_robe');
    s.inventory.push(robe);
    G.ui.itemGet(robe);
    setFlag('captives_freed');
    W.giveXp(1500);
    st.quest('m_dura', 3);
    for (const n of three) n.walkTo = 2 * TILE;
    W.bossActive = false;
    await wait(1.4);
    for (const n of three) n.remove = true;
    st.cine(false);
    music.play('furnace');
    W.autosave(true);
    G.ui.toast('The way east to the plain of Dura is open.', 'info');
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
          const e = W.spawnEnemy(k, x * TILE, row * TILE);
          foes.push(e);
          fx.column(e.x, e.y, 18, 110, '#ff8a3a', 0.6);
          sfx('fireBurst', { vol: 0.4 });
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
            G.ui.toast('More pour in through the smoke!', 'warn');
            spawn();
          } else {
            clearInterval(check);
            resolve();
          }
        }
      }, 300);
    });
  }

  // ---------------------------------------------------------------- the plain
  private async herald() {
    const W = G.world;
    const st = this.st;
    setFlag('horn_heard');
    st.cine(true);
    sfx('horn', { vol: 1 });
    G.camera.addTrauma(0.3 * shakeScale());
    G.ui.caption('Cornet, flute, harp, sackbut, psaltery, dulcimer: every instrument at once. Across the plain, thousands fall on their faces.');
    await wait(3.4);
    G.ui.caption('The air presses down on your shoulders like a hand. You do not bow.');
    W.player.anim.play('invoke', 0.15, true);
    fx.holyBurst(W.player.x, W.player.y - 24, 18, 1);
    sfx('elemHoly');
    await wait(2.6);
    G.ui.caption(null);
    st.cine(false);
    G.ui.toast('The satrap\'s priests come for the one who stands.', 'warn');
    for (const [k, x, y] of [['priest', 72, 19], ['lion', 80, 21], ['priest', 54, 21], ['lion', 50, 21]] as [EnemyKind, number, number][]) {
      const e = W.spawnEnemy(k, x * TILE, y * TILE);
      fx.column(e.x, e.y, 18, 110, '#ffcf6b', 0.6);
    }
  }

  private async imageStart() {
    const W = G.world;
    const img = W.boss as unknown as ImageBoss | null;
    if (!img) return;
    const st = this.st;
    st.cine(true);
    W.bossActive = true;
    W.closeGate(true);
    music.stop(1);
    await st.walkPlayer(26 * TILE, 60);
    G.camera.focus = { x: img.x - 60, y: img.y - 90 };
    G.camera.viewMultTarget = 1.25;
    const sat = new Npc('satrap', 40 * TILE, 26 * TILE, -1);
    W.add(sat);
    fx.veilBurst(sat.x, sat.y - 20, 14, 1);
    sfx('goldGong', { vol: 0.8 });
    await wait(1.0);
    await st.say([
      { who: 'satrap', text: 'Sixty cubits of gold. Every knee in Babylon. And you, one small watchman, still will not bend?' },
      { who: 'elior', text: '...', choices: [{ label: 'I bow to One only.' }, { label: 'Your god is metal and fear.' }] },
      { who: 'satrap', text: 'Then let the Image teach you to kneel.' },
    ]);
    // The satrap pours the Veil into the Image, and the Veil takes him too.
    sat.anim.play('talk', 0.1, true);
    for (let i = 0; i < 10; i++) {
      setTimeout(() => {
        fx.veilBurst(sat.x + (img.x - sat.x) * (i / 10), sat.y - 30 - i * 6, 8, 1);
        sfx('wispHum', { pitch: 0.4 + i * 0.05, vol: 0.4 });
      }, i * 140);
    }
    await wait(1.6);
    fx.veilBurst(sat.x, sat.y - 20, 28, 1.4);
    sat.remove = true;
    fx.flash('#ffcf6b', 0.5);
    sfx('stoneCrack', { vol: 0.9 });
    G.camera.addTrauma(0.8 * shakeScale());
    await wait(0.8);
    music.play('image', 0.5);
    music.phase = 0;
    img.awaken();
    // Its intro ends the cutscene and starts the fight.
  }

  async imageDefeated(img: ImageBoss) {
    const W = G.world;
    const s = G.save;
    const st = this.st;
    st.cine(true);
    G.camera.viewMultTarget = 1.15;
    G.camera.focus = { x: img.x - 40, y: img.y - 80 };
    music.stop(1.5);
    await wait(1.0);
    await st.say([
      { who: 'narrator', text: 'The Image sinks onto its broken feet. Gold runs from its crown like wax. Above the plain, the sky goes very still.' },
    ]);
    if (!s.lore.includes('dan234')) s.lore.push('dan234');
    await G.ui.lore('dan234');
    await img.shatter();
    music.play('revelation', 2);
    if (!s.lore.includes('dan235')) s.lore.push('dan235');
    await G.ui.lore('dan235');
    await st.say([
      { who: 'elior', text: 'Nothing left. Not even the dust.' },
      { who: 'narrator', text: 'Where the Image stood, a single stone sits in the sand, too smooth to have been cut by any hand you know.' },
    ]);
    W.giveXp(3200);
    W.spawnLoot(W.player.x + W.player.face * 40, W.player.y - 30, [{ silver: 1000 }, { mat: 'radiant_core', n: 3 }, { mat: 'covenant_fragment', n: 5 }, { item: 'stonecutter' }], true);
    st.quest('m_dura', 3, true);
    setFlag('ch4_image_done');
    W.bossActive = false;
    W.closeGate(false);
    G.camera.focus = null;
    G.camera.viewMultTarget = 1;
    await wait(2.4);
    W.autosave();
    await G.ui.fade(1, 1.2);
    st.cine(false);
    W.load('river_camp', 'start');
    await G.ui.fade(0, 1.0);
  }

  async ending() {
    const st = this.st;
    const s = G.save;
    st.cine(true);
    music.play('dura');
    await wait(1.2);
    await st.say([
      { who: 'tobiah', text: 'They are singing. Elior, the whole camp is singing. I do not know half the words and I am singing.' },
      { who: 'talia', text: 'They are old words. You will learn them.' },
      { who: 'barak', text: 'Sit, boy. Let an old man say what was said of this city long ago.' },
    ]);
    if (!s.lore.includes('dan244')) s.lore.push('dan244');
    await G.ui.lore('dan244');
    await st.say([
      { who: 'mara', text: 'A kingdom that is never destroyed. Not built of gold, or of brick, or of fear. I think we have been walking toward it this whole time.' },
      { who: 'azriel', text: 'Babylon still stands, Elior. But it does not kneel today. That is enough for one day.' },
      { who: 'dov', text: 'And you will not walk into the next one bareheaded. I beat this from a brazen lion\'s mane. Mind the roar.' },
    ]);
    const helm = makeItem('lion_mane_helm');
    s.inventory.push(helm);
    G.ui.itemGet(helm);
    await wait(1.2);
    setFlag('ch4_done');
    G.world.autosave(true);
    st.cine(false);
    if ((await G.ui.chapterEnd(4)) === 'next') await this.st.ch5.beginFromChapterFour();
  }

  // ---------------------------------------------------------------- talk
  async talk(n: Npc): Promise<boolean> {
    if (!inCh4()) return false;
    const s = G.save;
    const st = this.st;
    switch (n.kind) {
      case 'mara': {
        const found = CH4_LORE.filter((l) => s.lore.includes(l)).length;
        const q = s.quests.s_dura_words;
        if (q && !q.done && found >= CH4_LORE.length) {
          await st.say([
            { who: 'mara', text: 'All eight. A song by the river, a decree, a dream of a statue, and a den where lions forgot how to bite.' },
            { who: 'mara', text: 'Babylon wrote down its own undoing and nailed it to its walls. I will never stop finding that funny.' },
          ]);
          addMaterial(s, 'radiant_core', 2);
          addMaterial(s, 'covenant_fragment', 3);
          G.world.giveXp(900);
          st.quest('s_dura_words', 1, true);
          return true;
        }
        await st.say([{ who: 'mara', text: flag('ch4_done') ? 'I have filled three books in this camp. Barak keeps correcting my spelling of Nebuchadnezzar.' : `You have found ${found} of Babylon's ${CH4_LORE.length} inscriptions. Read the walls; this city cannot help confessing.` }]);
        return true;
      }
      case 'azriel': {
        await st.say([{ who: 'azriel', text: flag('captives_freed') ? 'You brought them out of the fire. Now finish it. The Image stands on the plain of Dura, east past the furnace.' : 'The gate, the Processional Way, the furnace halls. Go, Elior. Dusk does not wait.' }]);
        return true;
      }
      case 'tobiah': {
        await st.say([{ who: 'tobiah', text: flag('ch4_image_done') ? 'A statue the size of a tower, and it just... blew away? I am telling everyone I saw it. I did not see it. I am telling them anyway.' : 'Babylon has lions on its walls. Big ones. I would like it noted that I am not afraid of lions. I am only cautious about them.' }]);
        return true;
      }
      case 'ezra': {
        await st.say([{ who: 'ezra', text: 'We would not bow. That was all we did. The rest was done for us.' }]);
        return true;
      }
      case 'talia': {
        await st.say([{ who: 'talia', text: 'People ask me what the fourth one looked like. I tell them: like someone who had been waiting for us there.' }]);
        return true;
      }
      case 'barak': {
        await st.say([{ who: 'barak', text: 'Eighty-one years old and thrown into a furnace. And still I outlived the statue. Ha!' }]);
        return true;
      }
    }
    return false;
  }

  onLore(id: string) {
    const s = G.save;
    if (!CH4_LORE.includes(id)) return;
    const found = CH4_LORE.filter((l) => s.lore.includes(l)).length;
    G.ui.toast(`Babylon's inscriptions found: ${found}/${CH4_LORE.length}`, 'info');
    const q = s.quests.s_dura_words;
    if (q && !q.done && found >= CH4_LORE.length && q.stage === 0) this.st.quest('s_dura_words', 1);
  }

  secret(id: string): boolean {
    if (!CH4_SECRETS.includes(id)) return false;
    const s = G.save;
    if (s.secrets.includes(id)) return true;
    s.secrets.push(id);
    const n = CH4_SECRETS.filter((x) => s.secrets.includes(x)).length;
    sfx('lootRare', { vol: 0.6 });
    G.ui.toast(`Hidden cache discovered (${n}/${CH4_SECRETS.length})`, 'good');
    if (!s.quests.s_dura_caches) this.st.quest('s_dura_caches', 0);
    if (n >= CH4_SECRETS.length) this.st.quest('s_dura_caches', 0, true);
    return true;
  }

  onPurified(elite: string | null) {
    if (elite === 'den_lion') {
      G.ui.toast('The Lion of the Den joins your Echoes. Its mouth stays shut to you.', 'good');
      if (!G.save.quests.s_den) this.st.quest('s_den', 0);
      this.st.quest('s_den', 0, true);
    }
    if (elite === 'furnace_warden') G.ui.toast('The Furnace Warden joins your Echoes.', 'good');
  }
}
