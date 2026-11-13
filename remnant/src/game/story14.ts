// Chapter XIV — The Day of Gog (Ezekiel 38–39, 47). The Remnant has come home to the hills and lives in villages
// without walls. Out of the north parts comes Gog, chief prince of Meshech and Tubal, with a host like a cloud, to
// take a spoil. Elior meets the host, and on the mountains the LORD answers with a great shaking, every man's sword
// against his brother, and hail, fire and brimstone. Elior only withstands; it is not his hand that ends Gog
// (38:22–23). Then the valley of Hamongog, and the waters that issue from under the threshold of the house and heal
// the sea (47). Scripture is quoted from the King James Version; the world and its people are fictional.
//
// Its three fights are arenas of the host for now (ARENAS); the princes of Meshech and Tubal, the engine of the
// north and Gog himself take their places in the next step of the chapter.

import { G, flag, setFlag, placeBanner, type DialogueLine } from './ctx';
import { fx } from '../render/fx';
import { sfx } from '../audio/audio';
import { music } from '../audio/music';
import { TILE, type EnemyKind } from './tiles';
import type { Npc } from './props';
import type { Enemy } from './enemies';
import { makeItem, addMaterial } from './state';
import { CH14_ROOM_IDS } from './rooms14';
import { FALLEN_CHAPTERS } from './fallenChapters';
import { chapterCurve } from './curve';
import { registerGuide } from './guide';
import { shakeScale } from '../core/settings';
import { input } from '../core/input';
import type { Story, QuestDef } from './story';

export const QUESTS14: QuestDef[] = [
  {
    id: 'm_gog', title: 'The Day of Gog', kind: 'main',
    stages: [
      'The Remnant is home, and the hills are at rest. Walk the olive terraces up to the watchtower hill.',
      'A cloud is coming out of the north. Go down to Ein Shalom and meet what comes.',
      'Gog\'s host is in the land. Fight through the vineyard road to the cave of refuge.',
      'Go up into the north parts, through the camps of the host, to the tents of the princes of Meshech and Tubal.',
      'The siege lines stand beyond the tents. Break the engine of the north on its hill.',
      'The land is shaking. Climb through the fallen walls, under the cloud, to the mountain of Gog.',
      'The host is fallen on the mountains. Go down through the valley of Hamongog to the house on its mount.',
      'Waters are issuing from under the threshold. Follow them to the sea.',
    ],
    done: 'The waters are healed, and everything shall live whither the river cometh.',
  },
  { id: 's_gog_words', title: 'Words of the Latter Days', kind: 'side', stages: ['Mara wants every inscription between Bethshalom and the river. Find all sixteen.', 'You have found all sixteen. Bring them to Mara.'], done: 'Mara has the words of the latter days.' },
  { id: 's_gog_caches', title: 'The Spoil of the Host', kind: 'side', stages: ['Gog came to take a spoil. Find the nineteen caches hidden between the hills and the sea before his host does.'], done: 'Every cache from the hills to the sea is found.' },
  { id: 's_bucklers', title: 'Captain of the Bucklers', kind: 'side', stages: ['A captain holds the field of bucklers behind his shield. Bring him to his knees and purify the shape of how he fought.'], done: 'The Captain of the Bucklers stands with you now.' },
];

/** The inscriptions Mara asks for (the others are read in the chapter's scenes). */
export const CH14_LORE = ['ezk3811', 'ezk389', 'ezk3815', 'ezk3816', 'ezk3819', 'ezk3820', 'ezk3821', 'ezk399', 'ezk3911', 'ezk3912', 'ezk3929', 'ezk473', 'ezk474', 'ezk475', 'ezk479', 'ezk3823'];
export const CH14_SECRETS = [
  'terrace_press', 'watchman_beacon', 'village_rafters', 'vintner_store', 'refuge_cache', 'pass_eyrie', 'paymaster_chest',
  'buckler_hoard', 'ford_wreck', 'sapper_cache', 'shaken_vault', 'scree_cache', 'fissure_hoard', 'brothers_cache',
  'summit_cache', 'hamongog_spoil', 'threshold_lintel', 'riverbed_cache', 'orchard_cache',
];

const wait = (sec: number) => new Promise<void>((r) => setTimeout(r, sec * 1000));
const inCh14 = () => CH14_ROOM_IDS.has(G.world.room.id);
const lore = async (id: string) => { const s = G.save; if (!s.lore.includes(id)) s.lore.push(id); await G.ui.lore(id); };

// ---------------------------------------------------------------- the arenas

type Wave = [EnemyKind, number, string?][];
interface Arena {
  room: string; trigger: string; flag: string; music: string; floor: number;
  waves: Wave[];
  intro: DialogueLine[];
}

const ARENAS: Arena[] = [
  {
    room: 'princes_tents', trigger: 'princes_start', flag: 'ch14_princes_done', music: 'duel', floor: 26,
    intro: [
      { who: 'gogherald', text: 'Here are the tents of the princes of Meshech and Tubal. Their captains have broken cities that had walls. You have not even a gate.' },
      { who: 'elior', text: '...', choices: [{ label: 'Then come through.' }, { label: 'Go home.' }] },
    ],
    waves: [
      [['knight', 20], ['knight', 64], ['archer', 40]],
      [['bulwark', 18], ['hound', 30], ['hound', 56], ['bulwark', 66]],
      [['knight', 24, 'meshech_captain'], ['bulwark', 60, 'tubal_captain'], ['archer', 41]],
    ],
  },
  {
    room: 'engine_hill', trigger: 'engine_start', flag: 'ch14_engine_done', music: 'tower', floor: 27,
    intro: [
      { who: 'narrator', text: 'On the hill the host has raised its engine: a tower on wheels, iron-shod, with a ram the length of a cedar. It is built for walls. There are no walls here.' },
      { who: 'gogherald', text: 'Then it will break the hills.' },
    ],
    waves: [
      [['brute', 22], ['brute', 70], ['archer', 44]],
      [['golem', 30], ['knight', 60], ['priest', 82]],
      [['golem', 48, 'engine_warden'], ['brute', 20], ['brute', 76]],
    ],
  },
  {
    room: 'gog_mountain', trigger: 'gog_start', flag: 'ch14_gog_done', music: 'persia', floor: 27,
    intro: [
      { who: 'narrator', text: 'On the top of the mountain the cloud is so low it touches the spears. Under it, a standard of black and a voice that has spoken to many nations.' },
      { who: 'gogherald', text: 'Gog, of the land of Magog, the chief prince of Meshech and Tubal, has come up to take a spoil. Every land he has gone up against has given him its silver. Give him yours.' },
      { who: 'elior', text: '...', choices: [{ label: 'I will stand.' }, { label: 'This land is not his.' }] },
    ],
    waves: [
      [['knight', 20], ['knight', 84], ['lion', 50], ['archer', 40]],
      [['bulwark', 24], ['golem', 52], ['gale', 70], ['knight', 80]],
      [['knight', 30, 'gog_standard'], ['lion', 74, 'gog_champion'], ['gale', 52], ['priest', 62]],
    ],
  },
];

registerGuide(() => {
  const s = G.save;
  if (!s) return null;
  const q = s.quests.m_gog;
  if (!q || q.done) return null;
  return [
    { room: 'watch_hill', at: 'trigger:gog_cloud', label: 'the watchtower on the hill, past the olive terraces' },
    { room: 'alarm_village', at: 'trigger:gog_herald', label: 'Ein Shalom, down the hill' },
    { room: 'refuge_cave', at: 'altar:refuge_cave', label: 'the cave of refuge, past the vineyard road' },
    { room: 'princes_tents', at: 'trigger:princes_start', label: 'the tents of Meshech and Tubal, through the camps of the host' },
    { room: 'engine_hill', at: 'trigger:engine_start', label: 'the engine of the north, past the siege lines' },
    { room: 'gog_mountain', at: 'trigger:gog_start', label: 'the mountain of Gog, under the cloud' },
    { room: 'temple_threshold', at: 'trigger:threshold', label: 'the threshold of the house, past the valley of Hamongog' },
    { room: 'healed_sea', at: 'trigger:river_end', label: 'the sea, following the river' },
  ][q.stage] ?? null;
}, () => {
  if (!flag('ch13_done') || flag('ch14_intro')) return null;
  const hub = FALLEN_CHAPTERS.find((c) => c.n === 13)?.hub ?? 'hiddekel_camp';
  return { room: hub, label: 'an altar: choose Journey on to Chapter XIV' };
});

export class Chapter14 {
  private epoch = 0;
  private arena: { def: Arena; wave: number; alive: Set<Enemy>; poll: number; next: boolean } | null = null;
  constructor(private st: Story) {}

  roomChanged() {
    this.epoch++;
    if (this.arena) { clearInterval(this.arena.poll); this.arena = null; }
  }

  /** From the end of Chapter XIII (or Journey on): the hills of Israel. */
  async begin() {
    await G.ui.fade(1, 1.0);
    G.world.load('gog_hub', 'start');
    await G.ui.fade(0, 1.0);
  }

  // ---------------------------------------------------------------- rooms
  onEnter(id: string, first: boolean): boolean {
    if (!CH14_ROOM_IDS.has(id)) return false;
    if (id === 'gog_hub' && !flag('ch14_intro')) {
      void this.opening();
      return true;
    }
    if (first) {
      const r = G.world.room;
      placeBanner(r, r.name.toUpperCase(), r.region);
    }
    const s = G.save;
    if (first && id === 'olive_terraces') this.caption('Olives older than the exile, and terraces rebuilt stone by stone. Nobody here has drawn a sword in a year.', 2400, 6400);
    if (id === 'refuge_cave') void this.refuge();
    if (first && id === 'north_pass') this.caption('The north parts. The road is cut to ribbons by wheels and hooves, and it all runs one way: south.', 2400, 6400);
    if (first && id === 'host_camp') this.caption('Fires to the horizon. Persia, Cush and Put; Gomer and all his bands; the house of Togarmah of the north quarters.', 2400, 6800);
    if (id === 'fallen_walls' && !flag('ch14_shaken')) void this.shaking();
    if (first && id === 'brothers_field') this.caption('The host has turned on itself. Every man\'s sword is against his brother, and none of them can say why.', 2400, 6800);
    if (id === 'hamongog') void this.hamongog();
    if (first && id === 'river_measure') this.caption('A thousand cubits, and the water is to the ankles. A thousand more, to the knees. Then the loins. Then a river to swim in.', 2400, 7200);
    if (first && id === 'river_trees') this.caption('Trees on both banks, heavy with fruit. A leaf falls into the water and does not wither.', 2400, 6400);
    if (id === 'shield_field' && first && !s.quests.s_bucklers) this.st.quest('s_bucklers', 0);
    for (const a of ARENAS) if (a.room === id && flag(a.flag)) G.world.closeGate(false);
    return true;
  }

  onTrigger(id: string): boolean {
    if (!inCh14()) return false;
    if (id === 'gog_cloud') { if (!flag('ch14_cloud')) void this.cloud(); return true; }
    if (id === 'gog_herald') { if (!flag('ch14_herald')) void this.herald(); return true; }
    if (id === 'threshold') { if (flag('ch14_gog_done') && !flag('ch14_threshold')) void this.threshold(); return true; }
    if (id === 'river_end') { if (flag('ch14_threshold') && !flag('ch14_done')) void this.ending(); return true; }
    const a = ARENAS.find((x) => x.trigger === id);
    if (a) { if (!flag(a.flag) && !this.arena) void this.arenaStart(a); return true; }
    return false;
  }

  private caption(text: string, at: number, until: number) {
    const token = this.epoch;
    setTimeout(() => { if (token === this.epoch) G.ui.caption(text); }, at);
    setTimeout(() => { if (token === this.epoch) G.ui.caption(null); }, until);
  }

  private reward(key: string, id: string | null, xp: number, silver: number) {
    if (flag(key)) return;
    setFlag(key);
    const s = G.save;
    if (id && !s.inventory.some((i) => i.id === id)) { const it = makeItem(id); s.inventory.push(it); G.ui.itemGet(it); }
    s.silver += silver;
    addMaterial(s, 'radiant_core', 6);
    addMaterial(s, 'covenant_fragment', 8);
    G.world.giveXp(xp);
    G.world.autosave(true);
  }

  // ---------------------------------------------------------------- Act I
  private async opening() {
    const st = this.st;
    const s = G.save;
    st.cine(true);
    setFlag('ch14_intro');
    if (!s.altarsLit.includes('gog_hub')) s.altarsLit.push('gog_hub');
    s.altar = { room: 'gog_hub', spawn: 'altar' };
    music.play('sanctuary');
    await wait(0.8);
    G.ui.banner('CHAPTER XIV', 'The Day of Gog', 'chapter');
    await wait(3.4);
    await st.say([
      { who: 'narrator', text: 'The people the king of Tyrus sold are home. The Remnant has come back to the mountains of Israel, and for a whole year no one has drawn a sword.' },
      { who: 'narrator', text: 'They built Bethshalom without a wall, without bars or gates. The olives are in. The flocks are fat. Children sleep on the roofs.' },
      { who: 'hanan', text: 'Seventy years they dragged us from river to river. And here we are, Elior. Dwelling safely. I keep waiting to be woken.' },
      { who: 'mara', text: 'Then do not sleep too deeply, Hanan. I have been reading Ezekiel again, and the word did not end with the bones.' },
    ]);
    await lore('ezk382');
    await st.say([
      { who: 'mara', text: '"In the latter years thou shalt come into the land that is brought back from the sword." That is this land. That is us.' },
      { who: 'tirzah', text: 'Gog. Magog. Names out of a scroll. I would rather watch the north road than read about it.' },
      { who: 'uri', text: 'Then watch it from the tower. Fire carries far on a clear night. If something comes, you will see it before it sees you.' },
      { who: 'elior', text: '...', choices: [{ label: 'I will go up to the watchtower.' }, { label: 'Let them come and find us at rest.' }] },
      { who: 'azriel', text: 'Up past the terraces, then. And Elior: we have no walls. That was the point. Do not let anyone make us sorry for it.' },
    ]);
    st.quest('m_gog', 0);
    st.quest('s_gog_words', 0);
    st.cine(false);
    G.world.autosave(true);
  }

  private async cloud() {
    const st = this.st;
    const token = this.epoch;
    setFlag('ch14_cloud');
    st.cine(true);
    music.stop(1.5);
    G.camera.focus = { x: G.world.player.x + 260, y: G.world.player.y - 120 };
    G.camera.viewMultTarget = 1.25;
    await wait(1.2);
    if (token !== this.epoch) return;
    sfx('thunder', { vol: 0.6 });
    G.camera.addTrauma(0.25 * shakeScale());
    await st.say([
      { who: 'narrator', text: 'From the top of the tower the north is a brown wall from one edge of the world to the other. It is not weather. It is moving south.' },
      { who: 'narrator', text: 'Dust. Spears in it like reeds. Horses beyond counting. And at its head a black standard, coming down the old road toward the villages without walls.' },
    ]);
    if (token !== this.epoch) return;
    await lore('ezk389');
    if (token !== this.epoch) return;
    await st.say([{ who: 'elior', text: 'Ein Shalom is closest. They will reach it before the beacon does.' }]);
    G.camera.focus = null;
    G.camera.viewMultTarget = 1;
    music.play('tower', 1.5);
    st.quest('m_gog', 1);
    st.cine(false);
    G.world.autosave(true);
  }

  private async herald() {
    const st = this.st;
    const token = this.epoch;
    st.cine(true);
    await st.walkPlayer(G.world.player.x + 20, 60);
    if (token !== this.epoch) return;
    sfx('princeHorn', { vol: 0.7 });
    await st.say([
      { who: 'gogherald', text: 'Hear the word of Gog, of the land of Magog, chief prince of Meshech and Tubal.' },
      { who: 'gogherald', text: 'He has looked on this land of unwalled villages, and on a people at rest, that dwell safely, all of them without walls, having neither bars nor gates.' },
      { who: 'gogherald', text: 'He has come to take a spoil, and to take a prey. Your silver, your cattle, your goods. Bring them out to the road and you may keep your lives.' },
      { who: 'elior', text: '...', choices: [{ label: 'He thought an evil thought.' }, { label: 'Tell him to go home.' }] },
      { who: 'gogherald', text: 'You have read the old scrolls too. So has he. He came anyway. Behind me there are more spears than there are stars over your hills.' },
    ]);
    if (token !== this.epoch) return;
    setFlag('ch14_herald');
    const h = this.st.npc('gogherald');
    if (h) { fx.dust(h.x, h.y, 12, 1.4); h.remove = true; }
    st.quest('m_gog', 2);
    st.cine(false);
    G.world.autosave(true);
    G.ui.toast('Lead the way to the cave of refuge, past the vineyard road.', 'info');
  }

  private async refuge() {
    const st = this.st;
    const s = G.save;
    if (!s.altarsLit.includes('refuge_cave')) s.altarsLit.push('refuge_cave');
    s.altar = { room: 'refuge_cave', spawn: 'altar' };
    if (flag('ch14_refuge')) return;
    setFlag('ch14_refuge');
    st.cine(true);
    await wait(0.6);
    await st.say([
      { who: 'mara', text: 'Everyone from Ein Shalom is inside. Bethshalom too. We counted twice.' },
      { who: 'micaiah', text: 'They burned the presses and drove off the flocks. They did not even want the villages. Only what was in them.' },
      { who: 'azriel', text: 'We cannot hold a cave against that host, and we will not leave the land to it. Elior, they came to us. Go up to them.' },
      { who: 'elior', text: '...', choices: [{ label: 'North, then. Into the host.' }, { label: 'Keep the fire low.' }] },
      { who: 'mara', text: 'Their princes are Meshech and Tubal. Their tents will be in the middle of the camp, where the standards are thickest. Go with God.' },
    ]);
    st.quest('m_gog', 3);
    st.cine(false);
    G.world.autosave(true);
  }

  // ---------------------------------------------------------------- the arenas
  private async arenaStart(a: Arena) {
    const W = G.world;
    const st = this.st;
    const token = this.epoch;
    st.cine(true);
    W.bossActive = true;
    W.closeGate(true);
    music.stop(1);
    await st.walkPlayer(W.player.x + 3 * TILE, 60);
    if (token !== this.epoch) return;
    await st.say(a.intro);
    if (token !== this.epoch) return;
    music.play(a.music, 0.5);
    st.cine(false);
    this.arena = { def: a, wave: -1, alive: new Set(), poll: 0, next: false };
    this.arena.poll = window.setInterval(() => this.checkArena(token), 800);
    this.nextWave(token);
  }

  private nextWave(token: number) {
    const ar = this.arena;
    if (!ar || token !== this.epoch) return;
    ar.wave++;
    if (ar.wave >= ar.def.waves.length) { void this.arenaWon(ar.def, token); return; }
    const W = G.world;
    const last = ar.wave === ar.def.waves.length - 1;
    G.ui.toast(last ? 'The captains come forward.' : `The host presses in (${ar.wave + 1}/${ar.def.waves.length})`, last ? 'warn' : 'info');
    for (const [k, x, elite] of ar.def.waves[ar.wave]) {
      const fly = k === 'gale';
      const y = (ar.def.floor - (fly ? 9 : 0)) * TILE;
      const e = W.spawnEnemy(k, x * TILE, y, elite ?? null);
      fx.dust(x * TILE, ar.def.floor * TILE, 10, 1.3);
      ar.alive.add(e);
    }
  }

  private checkArena(token: number) {
    const ar = this.arena;
    if (!ar || token !== this.epoch) return;
    for (const e of ar.alive) if (e.remove || e.dying) ar.alive.delete(e);
    if (ar.alive.size === 0 && !ar.next && !G.inCutscene) {
      ar.next = true;
      setTimeout(() => { if (this.arena === ar) { ar.next = false; this.nextWave(token); } }, 1200);
    }
  }

  onKill(e: Enemy) {
    const ar = this.arena;
    if (ar && ar.alive.has(e)) this.checkArena(this.epoch);
  }

  private async arenaWon(a: Arena, token: number) {
    const W = G.world;
    const st = this.st;
    if (this.arena) { clearInterval(this.arena.poll); this.arena = null; }
    st.cine(true);
    music.stop(1.2);
    await wait(1.0);
    if (token !== this.epoch) return;
    const xp = chapterCurve(14).clearXp ?? 60000;
    if (a.room === 'princes_tents') {
      await st.say([
        { who: 'narrator', text: 'The captains of Meshech and Tubal kneel in the trampled straw of their princes\' tents. Beyond them the camp roars on. It has not noticed yet.' },
        { who: 'elior', text: 'Bucklers and shields, all of them handling swords. And not one of them had a reason to be here.' },
      ]);
      this.reward('ch14_princes_rewarded', 'bucklers_of_meshech', Math.round(xp * 0.2), 2400);
      st.quest('m_gog', 4);
    } else if (a.room === 'engine_hill') {
      await st.say([
        { who: 'narrator', text: 'The engine\'s wardens fall. The great ram swings once more on its chains, and stops. Under your feet the ground hums like a struck bell.' },
        { who: 'elior', text: 'That is not the engine.' },
      ]);
      this.reward('ch14_engine_rewarded', null, Math.round(xp * 0.2), 3000);
      st.quest('m_gog', 5);
    } else {
      await this.hailAndFire(token);
      if (token !== this.epoch) return;
      this.reward('ch14_gog_rewarded', 'hailstone_maul', Math.round(xp * 0.3), 5000);
      st.quest('m_gog', 6);
    }
    if (token !== this.epoch) return;
    setFlag(a.flag);
    W.bossActive = false;
    W.closeGate(false);
    G.camera.focus = null;
    G.camera.viewMultTarget = 1;
    music.play(a.room === 'gog_mountain' ? 'revelation' : 'dura', 2);
    st.cine(false);
    W.autosave(true);
    G.ui.toast('The way on is open.', 'info');
  }

  /** The end of the day of Gog: hail, fire and brimstone (38:22). Elior only stood. */
  private async hailAndFire(token: number) {
    const st = this.st;
    await st.say([
      { who: 'gogherald', text: 'Enough. He comes himself. Kneel, little watchman, and you may yet carry his spear.' },
      { who: 'narrator', text: 'The cloud over the mountain splits. Not for Gog. Light pours through it like water through a broken dam.' },
    ]);
    if (token !== this.epoch) return;
    setFlag('ch14_hail');
    for (let i = 0; i < 6; i++) {
      sfx('thunder', { vol: 0.8 });
      fx.flash(i % 2 ? '#ffd8a0' : '#e8f0ff', 0.35);
      G.camera.addTrauma(0.5 * shakeScale());
      input.rumble(0.8, 0.8, 300);
      const x = G.world.player.x + (i % 2 ? 1 : -1) * (80 + i * 40);
      fx.column(x, 27 * TILE, 26, 260, i % 2 ? '#ffb060' : '#e8f0ff', 0.9);
      fx.embers(x, 27 * TILE, 18, '#ffb35c', 20);
      await wait(0.5);
      if (token !== this.epoch) return;
    }
    await lore('ezk3822');
    if (token !== this.epoch) return;
    await st.say([
      { who: 'narrator', text: 'When it is over there is no host on the mountain. Only spears, bucklers, bows and arrows, handstaves and spears, lying where the hail found them, and smoke going up from the brimstone.' },
      { who: 'elior', text: 'I did not throw him down. I only stood on the mountain until the LORD answered for His land.' },
    ]);
    G.save.flags.ch14_hail = false;
  }

  // ---------------------------------------------------------------- Act III and IV
  private async shaking() {
    const st = this.st;
    const token = this.epoch;
    setFlag('ch14_shaken');
    st.cine(true);
    for (let i = 0; i < 4; i++) {
      G.camera.addTrauma(0.6 * shakeScale());
      input.rumble(1, 1, 400);
      sfx('thunder', { vol: 0.5 });
      fx.dust(G.world.player.x + (i - 1.5) * 90, G.world.player.y, 16, 2);
      await wait(0.45);
      if (token !== this.epoch) return;
    }
    await st.say([
      { who: 'narrator', text: 'The ground under the host heaves like the sea. The walls of the north road come down in a breath. Up on the slopes, whole mountainsides slide away.' },
      { who: 'elior', text: 'Every wall they built to keep us out is on the ground. And the host is still between me and the mountain.' },
    ]);
    if (token !== this.epoch) return;
    st.cine(false);
  }

  private async hamongog() {
    const st = this.st;
    const s = G.save;
    if (!s.altarsLit.includes('hamongog')) s.altarsLit.push('hamongog');
    s.altar = { room: 'hamongog', spawn: 'altar' };
    if (flag('ch14_hamongog')) return;
    setFlag('ch14_hamongog');
    st.cine(true);
    await wait(0.6);
    await st.say([
      { who: 'azriel', text: 'They are calling this place Hamongog. The multitude of Gog. Seven months to bury them all, Mara says, and men set apart to search the land for the last bones.' },
      { who: 'tobiah', text: 'And the weapons. So many weapons. They say we will not need to cut wood in the forest for seven years. I have never been so happy to own a fire.' },
      { who: 'barak', text: 'Spoil those that spoiled us. That was written too. I am only taking it back, mind.' },
      { who: 'azriel', text: 'Someone came up from the house on the mount this morning. He says there is water running from under the door. Go and see it, Elior.' },
    ]);
    st.quest('m_gog', 6);
    st.cine(false);
    G.world.autosave(true);
  }

  // ---------------------------------------------------------------- Act V
  private async threshold() {
    const st = this.st;
    const token = this.epoch;
    setFlag('ch14_threshold');
    st.cine(true);
    G.camera.focus = { x: 45 * TILE, y: 15 * TILE };
    G.camera.viewMultTarget = 1.2;
    fx.holyBurst(45 * TILE, 19 * TILE, 24, 1.2);
    sfx('elemHoly', { vol: 0.7 });
    await wait(1.0);
    if (token !== this.epoch) return;
    await lore('ezk471');
    if (token !== this.epoch) return;
    await st.say([
      { who: 'narrator', text: 'It begins as a trickle along the stones. By the time it reaches the foot of the steps it is a stream, and it is running east, toward the dead sea.' },
      { who: 'elior', text: 'Down to the sea, then. Wherever it goes.' },
    ]);
    G.camera.focus = null;
    G.camera.viewMultTarget = 1;
    st.quest('m_gog', 7);
    st.cine(false);
    G.world.autosave(true);
  }

  private async ending() {
    const st = this.st;
    const s = G.save;
    const token = this.epoch;
    st.cine(true);
    music.play('revelation', 1.5);
    G.camera.focus = { x: 70 * TILE, y: 18 * TILE };
    G.camera.viewMultTarget = 1.2;
    await wait(1.0);
    if (token !== this.epoch) return;
    await st.say([
      { who: 'narrator', text: 'Where the river meets the sea the water has turned clear. Fish move in it, thick as the stars, of every kind. Fishermen are already spreading nets from En-gedi.' },
      { who: 'hanan', text: 'This was the sea where nothing lived. I swam in it as a boy and came out white with salt.' },
    ]);
    if (token !== this.epoch) return;
    await lore('ezk4712');
    if (token !== this.epoch) return;
    await st.say([
      { who: 'mara', text: 'The leaf for medicine. Not for a king, not for a feast. For whoever comes to the river.' },
      { who: 'shira', text: 'I kept the book of names in the Field of the Sleepers. I think I will write a new page tonight. It will be a short one: everyone came home.' },
      { who: 'elior', text: '...', choices: [{ label: 'Everyone came home.' }, { label: 'And no one needs a wall.' }] },
    ]);
    if (token !== this.epoch) return;
    const xp = chapterCurve(14).clearXp ?? 60000;
    if (!flag('ch14_final_rewarded')) {
      setFlag('ch14_final_rewarded');
      for (const id of ['line_of_the_measurer', 'leaf_for_medicine']) if (!s.inventory.some((i) => i.id === id)) { const it = makeItem(id); s.inventory.push(it); G.ui.itemGet(it); }
      s.silver += 8000;
      addMaterial(s, 'radiant_core', 14);
      addMaterial(s, 'covenant_fragment', 15);
      G.world.giveXp(Math.round(xp * 0.3));
    }
    st.quest('m_gog', 7, true);
    setFlag('ch14_done');
    G.camera.focus = null;
    G.camera.viewMultTarget = 1;
    G.world.autosave(true);
    st.cine(false);
    await G.ui.chapterEnd(14);
  }

  // ---------------------------------------------------------------- talk
  async talk(n: Npc): Promise<boolean> {
    if (!inCh14()) return false;
    const s = G.save;
    const st = this.st;
    const done = flag('ch14_gog_done');
    const line = (who: string, text: string) => st.say([{ who, text }]).then(() => true);
    switch (n.kind) {
      case 'mara': {
        const found = CH14_LORE.filter((l) => s.lore.includes(l)).length;
        const q = s.quests.s_gog_words;
        if (q && !q.done && found >= CH14_LORE.length) {
          await st.say([
            { who: 'mara', text: 'Sixteen. A prince out of the north, a land at rest, a shaking, fire on the mountains, seven years of burning, and a river.' },
            { who: 'mara', text: 'Ezekiel saw all of it, Elior, and the last thing he saw was water coming out from under a door. I think that is the point of the whole book.' },
          ]);
          addMaterial(s, 'radiant_core', 8);
          addMaterial(s, 'covenant_fragment', 8);
          G.world.giveXp(9000);
          st.quest('s_gog_words', 1, true);
          return true;
        }
        return line('mara', flag('ch14_done') ? 'I have stopped writing for a while. I want to look at the river.' : `${found} of the ${CH14_LORE.length} inscriptions from the hills to the river. Someone carved them before any of this happened, Elior. That still frightens me a little.`);
      }
      case 'hanan': return line('hanan', done ? 'An old man should not be able to run down a hill. I ran down a hill. Go and see the water.' : 'At rest. Dwelling safely. I said it like a prayer every night for a year. I did not think anyone else was listening.');
      case 'azriel': return line('azriel', done ? 'Seven months of burying. We will do it properly. Every one of them was someone\'s son.' : flag('ch14_refuge') ? 'The host is a cloud. You cannot fight a cloud. But you can stand in it, and you have done that before.' : 'No walls, Elior. I keep looking for them and remembering we chose this.');
      case 'tobiah': return line('tobiah', flag('ch14_done') ? 'I caught a fish. In the sea where nothing lives. It is a very confused fish.' : done ? 'Seven years of firewood. I will never be cold again. I am going to miss being cold.' : 'If there is a cloud coming, I would like to be inside something. A cave. A bigger cave. A cave inside a cave.');
      case 'keziah': return line('keziah', done ? 'I kept the tally of everything Tyrus sold. Tonight I am counting fish. It is a much better tally.' : 'Gog wants the spoil. Silver, cattle, goods. He has come a long way for a market. I know how that ends.');
      case 'shira': return line('shira', done ? 'Every name in my book is accounted for. I keep checking.' : 'The names in my book are home. I will not let anyone carry them off again.');
      case 'micaiah': return line('micaiah', 'In the valley of Hinnom they offered children to fire. Here the fire falls on the ones who came for children. I will remember the difference.');
      case 'barak': return line('barak', 'I have outlived a statue, a city and a storm prince. A host from the north is merely large.');
      case 'tirzah': return line('tirzah', done ? 'I did not loose a single arrow on the mountain. There was nothing left to aim at.' : 'The north road. I knew it. You can always tell when a road is waiting for something.');
      case 'uri': return line('uri', done ? 'I have called fire my whole life. I have never seen fire like that. I will call mine more carefully now.' : 'If they come at night, I will light the hills. Let them see how many of us are awake.');
      case 'gogherald': return line('gogherald', 'Bring out your silver. The chief prince is not patient.');
    }
    return false;
  }

  onLore(id: string) {
    const s = G.save;
    if (!CH14_LORE.includes(id)) return;
    const found = CH14_LORE.filter((l) => s.lore.includes(l)).length;
    G.ui.toast(`Words of the latter days found: ${found}/${CH14_LORE.length}`, 'info');
    const q = s.quests.s_gog_words;
    if (q && !q.done && found >= CH14_LORE.length && q.stage === 0) this.st.quest('s_gog_words', 1);
  }

  secret(id: string): boolean {
    if (!CH14_SECRETS.includes(id)) return false;
    const s = G.save;
    if (s.secrets.includes(id)) return true;
    s.secrets.push(id);
    const n = CH14_SECRETS.filter((x) => s.secrets.includes(x)).length;
    sfx('lootRare', { vol: 0.6 });
    G.ui.toast(`Hidden cache discovered (${n}/${CH14_SECRETS.length})`, 'good');
    if (!s.quests.s_gog_caches) this.st.quest('s_gog_caches', 0);
    if (n >= CH14_SECRETS.length) this.st.quest('s_gog_caches', 0, true);
    return true;
  }

  onPurified(elite: string | null) {
    if (elite === 'buckler_captain') {
      G.ui.toast('The Captain of the Bucklers joins your Echoes.', 'good');
      if (!G.save.quests.s_bucklers) this.st.quest('s_bucklers', 0);
      this.st.quest('s_bucklers', 0, true);
    }
  }
}
