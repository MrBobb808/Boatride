// Chapter VI — The Prince of Persia. Babylon has fallen and the exiles may go
// home, but by the great river Hiddekel old Hanan has fasted three full weeks
// for understanding and heard nothing. The Veil's masters show themselves at
// last: fallen princes, each over a kingdom and a domain. Elior climbs from
// Shushan into the high places, throws down the Prince of the Storm, and
// stands against the prince of the kingdom of Persia until help comes.
// Scripture is quoted from the King James Version; the world and its people
// are fictional. The princes are fallen angels: Elior can withstand them, but
// it is not his hand that casts the great prince down.

import { G, flag, setFlag, placeBanner } from './ctx';
import { fx } from '../render/fx';
import { sfx } from '../audio/audio';
import { music } from '../audio/music';
import { TILE } from './tiles';
import { Npc } from './props';
import { makeItem, addMaterial } from './state';
import { CH6_ROOM_IDS } from './rooms6';
import { registerGuide } from './guide';
import { shakeScale } from '../core/settings';
import { input } from '../core/input';
import { cinema } from './cinema';
import type { Story, QuestDef } from './story';

export const QUESTS6: QuestDef[] = [
  {
    id: 'm_persia', title: 'The Prince of Persia', kind: 'main',
    stages: [
      'Hanan has fasted three full weeks by the great river and no answer has come. Find what stands in the way: cross the marshes of Ulai.',
      'Follow the royal road to Shushan the palace.',
      'A storm sits over Shushan that does not move with the wind. Climb to the high place of the winds.',
      'The heavens have opened above the ziggurat. Climb the high places to the throne of the prince.',
    ],
    done: 'The prince of the kingdom of Persia is cast down. The answer has come.',
  },
  { id: 's_persia_words', title: 'Words of the High Places', kind: 'side', stages: ['Mara wants every inscription between the river and the throne of the prince. Find all eight.', 'You have found all eight. Bring them to Mara at the camp by the great river.'], done: 'Mara has the words of the high places.' },
  { id: 's_persia_caches', title: 'Treasures of Elam', kind: 'side', stages: ['Three caches are hidden between the royal road and the high places. Find them.'], done: 'All three caches of Elam found.' },
  { id: 's_undying', title: 'Captain of the Undying', kind: 'side', stages: ['An Undying captain holds the hall of a hundred columns. Bring it to its knees and purify the shape of how it fought.'], done: 'The Captain of the Undying fights beside you now, and does not rise against you again.' },
];

export const CH6_LORE = ['dan104', 'dan82', 'deu3217', 'ps827', 'isa1412', 'eph22', 'jude16', 'ezek2817'];
export const CH6_SECRETS = ['waystation_cache', 'apadana_cache', 'chain_cache'];

/** What the story needs from the Prince of the Storm (game/bosses6.ts). */
export interface StormBoss {
  x: number; y: number; cx: number; cy: number;
  remove: boolean;
  awaken(): void;
  fall(): Promise<void>;
  yieldNow(): void;
}

/** What the story needs from the Prince of the Kingdom of Persia (game/bosses6.ts). */
export interface PersiaBoss {
  x: number; y: number; cx: number; cy: number;
  remove: boolean;
  awaken(): void;
  /** Michael comes: a column of light from above, and the prince is cast down. */
  castDown(): Promise<void>;
  yieldNow(): void;
}

const wait = (sec: number) => new Promise<void>((r) => setTimeout(r, sec * 1000));
const inCh6 = () => CH6_ROOM_IDS.has(G.world.room.id);

registerGuide(() => {
  const s = G.save;
  if (!s) return null;
  const q = s.quests.m_persia;
  if (q && !q.done) {
    if (!s.defeated.includes('storm_prince')) return { room: 'storm_ziggurat', at: 'trigger:storm_start', label: 'the high place of the winds, past the hall of a hundred columns' };
    if (!s.defeated.includes('persia_prince')) return { room: 'prince_throne', at: 'trigger:persia_start', label: 'the throne of the prince, at the top of the high places' };
    return null;
  }
  return null;
}, () => {
  if (!flag('ch5_done') || flag('ch6_intro')) return null;
  const here = G.world.room;
  const alt = here.ents.find((e) => e.t === 'altar');
  return alt && alt.t === 'altar' ? { room: here.id, at: 'altar:' + alt.id, label: 'an altar: rest and choose Journey on' } : null;
});

export class Chapter6 {
  private epoch = 0;
  roomChanged() { this.epoch++; }
  private bossReward(key: string, id: string, xp: number, silver: number, cores: number, fragments: number) {
    if (flag(key)) return;
    setFlag(key);
    const s = G.save;
    if (!s.inventory.some(i => i.id === id)) { const it = makeItem(id); s.inventory.push(it); G.ui.itemGet(it); }
    s.silver += silver; addMaterial(s, 'radiant_core', cores); addMaterial(s, 'covenant_fragment', fragments);
    G.world.giveXp(xp); G.world.autosave(true);
  }
  constructor(private st: Story) {}

  // ---------------------------------------------------------------- rooms
  onEnter(id: string, first: boolean): boolean {
    if (!CH6_ROOM_IDS.has(id)) return false;
    const s = G.save;
    if (id === 'hiddekel_camp' && !flag('ch6_intro')) {
      this.opening();
      return true;
    }
    if (id === 'hiddekel_camp' && flag('ch6_prince_done') && !flag('ch6_done')) {
      this.ending();
      return true;
    }
    if (first) {
      const r = G.world.room;
      placeBanner(r, r.name.toUpperCase(), r.region);
    }
    if (id === 'ulai_marsh' && first) {
      this.st.quest('m_persia', 0);
      this.caption('Reeds as tall as a man, and herons that will not fly. They are all watching the sky.', 2600, 6000);
    }
    if (id === 'shushan_road' && first) {
      this.st.quest('m_persia', 1);
      this.caption('The king\'s road, straight as a spear. Persian riders pass and never see what walks beside them.', 2600, 6200);
    }
    if (id === 'shushan_gate' && first) this.caption('Winged bulls guard the gate, bearded and crowned. Above the palace, the storm turns like a wheel.', 2400, 6000);
    if (id === 'apadana' && first) {
      if (!s.quests.s_undying) this.st.quest('s_undying', 0);
      this.caption('A hundred columns, every capital a pair of kneeling bulls. Every face carved on these walls is bringing tribute to someone.', 2400, 6200);
    }
    if (id === 'storm_ziggurat' && first) this.st.quest('m_persia', 2);
    if (id === 'high_places' && first) {
      this.st.quest('m_persia', 3);
      if (!s.altarsLit.includes('high_places')) s.altarsLit.push('high_places');
      this.caption('There is no ground here. Only what you are given to stand on.', 1800, 5200);
    }
    if (id === 'storm_ziggurat' && s.defeated.includes('storm_prince') && !flag('ch6_storm_done')) {
      const b = G.world.boss as unknown as StormBoss | null;
      if (b) {
        b.yieldNow();
        const token = this.epoch;
        setTimeout(() => { if (token === this.epoch && (G.world.boss as unknown) === b) void this.stormDefeated(b); }, 900);
      }
    }
    if (id === 'prince_throne' && s.defeated.includes('persia_prince') && !flag('ch6_prince_done')) {
      const b = G.world.boss as unknown as PersiaBoss | null;
      if (b) {
        b.yieldNow();
        const token = this.epoch;
        setTimeout(() => { if (token === this.epoch && (G.world.boss as unknown) === b) void this.princeDefeated(b); }, 900);
      }
    }
    return true;
  }

  onTrigger(id: string): boolean {
    if (id === 'storm_start') {
      if (!G.save.defeated.includes('storm_prince')) this.stormStart();
      return true;
    }
    if (id === 'persia_start') {
      if (!G.save.defeated.includes('persia_prince')) this.persiaStart();
      return true;
    }
    return false;
  }

  private caption(text: string, at: number, until: number) {
    setTimeout(() => G.ui.caption(text), at);
    setTimeout(() => G.ui.caption(null), until);
  }

  // ---------------------------------------------------------------- opening
  async beginFromChapterFive() {
    await G.ui.fade(1, 1.0);
    G.world.load('hiddekel_camp', 'start');
    await G.ui.fade(0, 1.0);
  }

  async opening() {
    const st = this.st;
    st.cine(true);
    setFlag('ch6_intro');
    const s = G.save;
    if (!s.altarsLit.includes('hiddekel_camp')) s.altarsLit.push('hiddekel_camp');
    s.altar = { room: 'hiddekel_camp', spawn: 'altar' };
    music.play('hiddekel');
    await wait(0.8);
    G.ui.banner('CHAPTER VI', 'The Prince of Persia', 'chapter');
    await wait(3.4);
    await st.say([
      { who: 'narrator', text: 'Babylon has fallen. Persia rules from Shushan now, and the exiles are free to go home. Hanan has not eaten in three weeks.' },
      { who: 'hanan', text: 'Three full weeks I have asked for understanding by this river. No pleasant bread. No wine. Nothing has come back to me.' },
    ]);
    if (!s.lore.includes('dan104')) s.lore.push('dan104');
    await G.ui.lore('dan104');
    await st.say([
      { who: 'azriel', text: 'The Veil did not die with the feast, Elior. The storms over Shushan do not move with the wind. Something sits in them.' },
      { who: 'mara', text: 'The prophets wrote of princes. Not kings. Princes over kingdoms, and not of flesh and blood. Everything we have fought was only their reach.' },
      { who: 'elior', text: '...', choices: [{ label: 'Then I will go and see.' }, { label: 'What stands in the way?' }] },
      { who: 'hanan', text: 'Whatever holds my answer back sits higher than any palace. Go to Shushan, watchman. Find the way up.' },
      { who: 'tobiah', text: 'Up. Into the sky. Where the angry princes live. I will hold the camp. Very firmly. From here.' },
    ]);
    st.quest('m_persia', 0);
    st.quest('s_persia_words', 0);
    st.cine(false);
    G.world.autosave(true);
  }

  // ---------------------------------------------------------------- the Prince of the Storm
  private async stormStart() {
    const W = G.world;
    const b = W.boss as unknown as StormBoss | null;
    if (!b) return;
    const st = this.st;
    st.cine(true);
    W.bossActive = true;
    W.closeGate(true);
    music.stop(1);
    await st.walkPlayer(26 * TILE, 60);
    // Up from the stair to the prince in the cloud, held close as the thunder breaks.
    await cinema.run(async (k) => {
      await k.pan(b.x, b.y - 110, 1.6);
      sfx('thunder', { vol: 0.9 });
      fx.flash('#cfe0ff', 0.25);
      G.camera.addTrauma(0.4 * shakeScale());
      await k.zoom(0.82, 0.9);
    }, () => G.world.boss === (b as unknown));
    if (G.world.boss !== (b as unknown)) return;
    G.camera.focus = { x: b.x - 40, y: b.y - 90 };
    G.camera.viewMultTarget = 1.2;
    await wait(0.4);
    await st.say([
      { who: 'storm_prince', text: 'A son of dust, climbing to the high places. Do you know whose air you breathe, little watchman?' },
      { who: 'elior', text: '...', choices: [{ label: 'Not yours.' }, { label: 'Let the answer through.' }] },
      { who: 'storm_prince', text: 'Every wind over Elam bends to me. Every storm is my throne. Bend.' },
    ]);
    music.play('storm', 0.5);
    music.phase = 0;
    b.awaken();
  }

  async stormDefeated(b: StormBoss) {
    const token = this.epoch;
    const W = G.world;
    const s = G.save;
    const st = this.st;
    st.cine(true);
    G.camera.viewMultTarget = 1.15;
    G.camera.focus = { x: b.x - 30, y: b.y - 80 };
    music.stop(1.5);
    await wait(0.8);
    if (token !== this.epoch) return;
    await b.fall();
    if (token !== this.epoch) return;
    input.rumble(1, 1, 600);
    if (!s.lore.includes('pet24')) s.lore.push('pet24');
    await G.ui.lore('pet24');
    if (token !== this.epoch) return;
    await st.say([
      { who: 'narrator', text: 'The Prince of the Storm is thrown down onto the stones of the ziggurat. The wind he rode tears loose from him and goes back to being only wind.' },
      { who: 'narrator', text: 'Above the summit the clouds do not close again. Through them, impossibly, there are steps.' },
    ]);
    if (token !== this.epoch) return;
    this.bossReward('ch6_storm_rewarded', 'stormglass', 5200, 1200, 4, 5);
    setFlag('ch6_storm_done');
    st.quest('m_persia', 3);
    W.bossActive = false;
    W.closeGate(false);
    G.camera.focus = null;
    G.camera.viewMultTarget = 1;
    music.play('highplaces', 2);
    W.autosave(true);
    st.cine(false);
    G.ui.toast('The way into the high places is open, east of the summit.', 'info');
  }

  // ---------------------------------------------------------------- the Prince of the Kingdom of Persia
  private async persiaStart() {
    const W = G.world;
    const b = W.boss as unknown as PersiaBoss | null;
    if (!b) return;
    const st = this.st;
    const s = G.save;
    st.cine(true);
    W.bossActive = true;
    W.closeGate(true);
    music.stop(1);
    await st.walkPlayer(28 * TILE, 60);
    G.camera.focus = { x: b.x - 40, y: b.y - 100 };
    G.camera.viewMultTarget = 1.25;
    sfx('princeHorn', { vol: 0.9 });
    await wait(1.0);
    await st.say([
      { who: 'persia_prince', text: 'Twenty days I have stood in the way of the messenger, and twenty days he has not passed. The old man by the river will starve before his answer reaches him.' },
      { who: 'persia_prince', text: 'And on the twenty-first day, they send me a watchman of dust.' },
    ]);
    if (!s.lore.includes('eph613')) s.lore.push('eph613');
    await G.ui.lore('eph613');
    await st.say([
      { who: 'elior', text: '...', choices: [{ label: 'I only have to stand.' }, { label: 'Let him pass.' }] },
      { who: 'persia_prince', text: 'Then stand, and be broken standing. Undying! Rise with me!' },
    ]);
    music.play('persia', 0.5);
    music.phase = 0;
    b.awaken();
  }

  async princeDefeated(b: PersiaBoss) {
    const token = this.epoch;
    const W = G.world;
    const s = G.save;
    const st = this.st;
    st.cine(true);
    G.camera.viewMultTarget = 1.2;
    G.camera.focus = { x: b.x - 30, y: b.y - 100 };
    music.stop(1.5);
    await wait(1.0);
    if (token !== this.epoch) return;
    await st.say([
      { who: 'narrator', text: 'The prince of Persia staggers. The host around him gutters like lamps in wind. He lifts his spear again, and it is aimed past you, at the light gathering above.' },
      { who: 'persia_prince', text: 'No. Not him. Not now.' },
    ]);
    if (token !== this.epoch) return;
    if (!s.lore.includes('dan1013')) s.lore.push('dan1013');
    await G.ui.lore('dan1013');
    if (token !== this.epoch) return;
    await b.castDown();
    if (token !== this.epoch) return;
    input.rumble(1, 1, 900);
    music.play('revelation', 2);
    if (!s.lore.includes('col215')) s.lore.push('col215');
    await G.ui.lore('col215');
    if (token !== this.epoch) return;
    await st.say([
      { who: 'narrator', text: 'Where the throne stood, there is only light, and a sword lying on the clouds as if someone set it down for you.' },
      { who: 'elior', text: 'I did not throw him down. I only had to stand until help came.' },
    ]);
    if (token !== this.epoch) return;
    this.bossReward('ch6_prince_rewarded', 'twentyfirst_day', 7600, 2000, 6, 8);
    st.quest('m_persia', 3, true);
    setFlag('ch6_prince_done');
    W.bossActive = false;
    W.closeGate(false);
    G.camera.focus = null;
    G.camera.viewMultTarget = 1;
    await wait(2.4);
    if (token !== this.epoch) return;
    W.autosave();
    await G.ui.fade(1, 1.2);
    if (token !== this.epoch) return;
    st.cine(false);
    W.load('hiddekel_camp', 'start');
    await G.ui.fade(0, 1.0);
    if (token !== this.epoch) return;
  }

  async ending() {
    const st = this.st;
    const s = G.save;
    st.cine(true);
    music.play('hiddekel');
    await wait(1.2);
    await st.say([
      { who: 'narrator', text: 'By the great river, Hanan is on his knees. Then he is on his face. The whole camp has gone silent, and no one can say what they are hearing.' },
    ]);
    G.camera.focus = { x: 40 * TILE, y: 12 * TILE };
    fx.column(40 * TILE, 18 * TILE, 30, 220, '#fff6dc', 4);
    fx.holyBurst(40 * TILE, 12 * TILE, 30, 1.4);
    sfx('elemHoly', { vol: 0.8 });
    if (!s.lore.includes('dan1056')) s.lore.push('dan1056');
    await G.ui.lore('dan1056');
    if (!s.lore.includes('dan1012')) s.lore.push('dan1012');
    await G.ui.lore('dan1012');
    G.camera.focus = null;
    await st.say([
      { who: 'hanan', text: 'My words were heard on the first day. The first day, watchman. Twenty-one days the answer was held back, and you were standing in that fight.' },
    ]);
    if (!s.lore.includes('dan1019')) s.lore.push('dan1019');
    await G.ui.lore('dan1019');
    await st.say([
      { who: 'hanan', text: 'And there was more. He is going back to fight. And when he goes forth...' },
    ]);
    if (!s.lore.includes('dan1020')) s.lore.push('dan1020');
    await G.ui.lore('dan1020');
    await st.say([
      { who: 'azriel', text: 'Another prince, another kingdom. Then we have another road ahead of us.' },
      { who: 'mara', text: 'The road toward Grecia still lies ahead. First, the northern watch has sent word: a horned king named Varkhos is driving villages into his hunting grounds. We cannot leave them there.' },
      { who: 'dov', text: 'Then you will walk it in better iron than that. A breastplate, for standing in. That is what it is for.' },
    ]);
    if (!flag('ch6_final_rewarded')) {
      setFlag('ch6_final_rewarded');
      const plate = makeItem('watch_breastplate');
      s.inventory.push(plate); G.ui.itemGet(plate); G.world.autosave(true);
    }
    await wait(1.2);
    setFlag('ch6_done');
    G.world.autosave(true);
    st.cine(false);
    if ((await G.ui.chapterEnd(6)) === 'next') await this.st.fallen.begin(7);
  }

  // ---------------------------------------------------------------- talk
  async talk(n: Npc): Promise<boolean> {
    if (!inCh6()) return false;
    const s = G.save;
    const st = this.st;
    switch (n.kind) {
      case 'mara': {
        const found = CH6_LORE.filter((l) => s.lore.includes(l)).length;
        const q = s.quests.s_persia_words;
        if (q && !q.done && found >= CH6_LORE.length) {
          await st.say([
            { who: 'mara', text: 'All eight. A river, a vision, gods that are not gods, a morning star that fell, and chains under darkness.' },
            { who: 'mara', text: 'They were never kings, Elior. They were princes that left their first estate, and every idol we broke was their face on a stone.' },
          ]);
          addMaterial(s, 'radiant_core', 4);
          addMaterial(s, 'covenant_fragment', 4);
          G.world.giveXp(1800);
          st.quest('s_persia_words', 1, true);
          return true;
        }
        await st.say([{ who: 'mara', text: flag('ch6_done') ? 'Grecia. I have started a new book already. I have a feeling it is going to be a long one.' : `You have found ${found} of the ${CH6_LORE.length} inscriptions between here and the high places. Somebody wrote all this down before us, Elior. Somebody always does.` }]);
        return true;
      }
      case 'hanan': {
        await st.say([{ who: 'hanan', text: flag('ch6_prince_done') ? 'Strong. Be strong, he said. Yea, be strong. I am an old man and I have never felt so young.' : flag('ch6_storm_done') ? 'The storm has broken over Shushan. But my answer has still not come. Higher, watchman. It is higher.' : 'Three weeks. Not hunger that troubles me, watchman. Silence.' }]);
        return true;
      }
      case 'arshan': {
        await st.say([{ who: 'arshan', text: flag('ch6_prince_done') ? 'The king\'s seers say the sky over Shushan has never been so clear. I know who to thank. I do not know how.' : flag('ch6_storm_done') ? 'My men saw lightning strike the ziggurat for an hour, and no rain fell. Then you came down the steps. Who are you, Judean?' : 'Captain Arshan of the king\'s guard. The road is open to you, exile. Mind the storm over the palace. My men will not go near it.' }]);
        return true;
      }
      case 'azriel': {
        await st.say([{ who: 'azriel', text: flag('ch6_storm_done') ? 'Steps into the sky. I have followed you up a tower and into a hive, Elior. I cannot follow you there. Go well.' : 'Shushan is east, past the marshes. Whatever sits in that storm, do not fight it the way you fought a man.' }]);
        return true;
      }
      case 'tobiah': {
        await st.say([{ who: 'tobiah', text: flag('ch6_done') ? 'You fought an angel. A fallen one. In the sky. I fought a heron this morning. It won.' : 'If the princes are not flesh and blood, what are they made of? No. Do not tell me. I want to sleep tonight.' }]);
        return true;
      }
      case 'ezra': {
        await st.say([{ who: 'ezra', text: 'We used to think the enemy was the king who threw us in the fire. The king was only the hand.' }]);
        return true;
      }
      case 'talia': {
        await st.say([{ who: 'talia', text: 'Hanan prays and the sky goes to war. I will never pray carelessly again.' }]);
        return true;
      }
      case 'barak': {
        await st.say([{ who: 'barak', text: 'Princes of the air, is it? I have outlived a statue and a city. Let us see about a prince.' }]);
        return true;
      }
    }
    return false;
  }

  onLore(id: string) {
    const s = G.save;
    if (!CH6_LORE.includes(id)) return;
    const found = CH6_LORE.filter((l) => s.lore.includes(l)).length;
    G.ui.toast(`Inscriptions of the high places found: ${found}/${CH6_LORE.length}`, 'info');
    const q = s.quests.s_persia_words;
    if (q && !q.done && found >= CH6_LORE.length && q.stage === 0) this.st.quest('s_persia_words', 1);
  }

  secret(id: string): boolean {
    if (!CH6_SECRETS.includes(id)) return false;
    const s = G.save;
    if (s.secrets.includes(id)) return true;
    s.secrets.push(id);
    const n = CH6_SECRETS.filter((x) => s.secrets.includes(x)).length;
    sfx('lootRare', { vol: 0.6 });
    G.ui.toast(`Hidden cache discovered (${n}/${CH6_SECRETS.length})`, 'good');
    if (!s.quests.s_persia_caches) this.st.quest('s_persia_caches', 0);
    if (n >= CH6_SECRETS.length) this.st.quest('s_persia_caches', 0, true);
    return true;
  }

  onPurified(elite: string | null) {
    if (elite === 'undying_captain') {
      G.ui.toast('The Captain of the Undying joins your Echoes. It will not rise against you again.', 'good');
      if (!G.save.quests.s_undying) this.st.quest('s_undying', 0);
      this.st.quest('s_undying', 0, true);
    }
  }
}
