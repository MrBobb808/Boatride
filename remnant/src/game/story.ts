// Narrative: cutscenes, conversations, choices, quests, purification and the
// chapter's ending. Scripture is quoted from the King James Version; the world
// and its people are fictional.

import { G, flag, setFlag, type DialogueLine } from './ctx';
import { input } from '../core/input';
import { fx } from '../render/fx';
import { sfx } from '../audio/audio';
import { music } from '../audio/music';
import { TILE, T } from './tiles';
import { Npc, Shrine, Altar } from './props';
import { Enemy } from './enemies';
import { Idol } from './boss';
import { Chapter2, QUESTS2, type Gatekeeper, type Marshal } from './story2';
import { Chapter3, QUESTS3, type LocustKing } from './story3';
import { Chapter4, QUESTS4 } from './story4';
import { Chapter5, QUESTS5 } from './story5';
import { LORE, ITEMS, ECHO_SPECIES } from './data';
import { setQuest, grantAbility, derive, makeItem, addMaterial, hasMaterials, payMaterials, getItem, MAX_PLUS } from './state';
import { rand } from '../core/math';
import { shakeScale } from '../core/settings';
import type { Entity } from './entity';
import { islandNotify } from '../ui/island';

export interface QuestDef {
  id: string;
  title: string;
  kind: 'main' | 'side';
  stages: string[];
  done: string;
}

export const QUESTS: QuestDef[] = [
  { id: 'm_expedition', title: 'The Expedition', kind: 'main', stages: ['Follow the Ashen Road east to the Temple of the First Lamp, where Azriel and Tobiah wait.'], done: 'The temple floor gave way beneath you.' },
  {
    id: 'm_dark', title: 'Into the Dark', kind: 'main',
    stages: [
      'Find a way out of the ruined temple. A golden light glows beyond the nave, to the east.',
      'The relic has awakened something in you. Search the ossuary below the nave, to the west, for the lower gate.',
      'With the Eagle Plume you can leap twice. Climb from the nave to the high gallery.',
      'Sound the Ram\'s Horn before the golden seal on the nave\'s western wall.',
      'The seal is broken. Confront what waits in the sanctum beyond.',
    ],
    done: 'The Gilded Idol has fallen.',
  },
  { id: 'm_return', title: 'Return to Hearthward', kind: 'main', stages: ['Return to Hearthward with Azriel.'], done: 'Hearthward eats tonight.' },
  { id: 's_mara', title: 'Mara\'s Inscriptions', kind: 'side', stages: ['Mara asked you to remember any inscriptions you find in the temple. Bring her four.', 'You have found enough inscriptions. Return to Mara in Hearthward.'], done: 'Mara has her inscriptions — and gave you her family\'s signet.' },
  { id: 's_ledger', title: 'The Archive Ledger', kind: 'side', stages: ['Bring the Archive Ledger to Mara.'], done: 'Mara will read the ledger by lamplight for a week.' },
  { id: 's_dov', title: 'The Smith\'s Request', kind: 'side', stages: ['Dov needs 6 Iron Scrap to repair the watch\'s blades. Salvage it from the ruins.'], done: 'Dov repaid the scrap with a free tempering.' },
  { id: 's_tobiah', title: 'Tobiah\'s Courage', kind: 'side', stages: ['Tobiah followed you into the dark. Find him.'], done: 'Tobiah is safe.' },
  { id: 's_secrets', title: 'Hidden Chambers', kind: 'side', stages: ['The village and temple hide secret places. Find all five.'], done: 'Every hidden chamber of the First Lamp has been found.' },
  ...QUESTS2,
  ...QUESTS3,
  ...QUESTS4,
  ...QUESTS5,
];

const TEMPLE_LORE = ['eph610', 'eph612', 'cor104', 'isa4031', 'josh620'];
const SECRET_IDS = ['sanct_loft', 'cistern_chest', 'crypt_high', 'hall_ledge', 'vault_chest'];

const wait = (sec: number) => new Promise<void>((r) => setTimeout(r, sec * 1000));

export class Story {
  ch2 = new Chapter2(this);
  ch3 = new Chapter3(this);
  ch4 = new Chapter4(this);
  ch5 = new Chapter5(this);
  // ---------------------------------------------------------------- helpers
  fmt(text: string) {
    const L = (a: Parameters<typeof input.label>[0]) => {
      if (input.lastDevice === 'touch') {
        const names: Record<string, string> = {
          move: 'the left stick', jump: 'JUMP', attack: 'ATTACK', dodge: 'DODGE', parry: 'PARRY', heal: 'BALM', skill1: 'the first skill button',
          interact: 'the action button', echo: 'the ECHO button', ultimate: 'RALLY', down: 'down on the stick', heavy: 'ATTACK (hold)', switch: 'SWITCH',
        };
        return names[a] ?? a;
      }
      const l = input.label(a);
      return l ? `[${l}]` : a;
    };
    return text
      .replace('{move}', input.lastDevice === 'touch' ? 'the left stick' : input.lastDevice === 'gamepad' ? 'the left stick' : '[A]/[D] or arrows')
      .replace(/\{(jump|attack|dodge|parry|heal|skill1|interact|echo|ultimate|down|heavy|switch)\}/g, (_, a) => L(a));
  }

  async say(lines: DialogueLine[]) {
    const was = G.inCutscene;
    G.inCutscene = true;
    const r = await G.ui.dialogue(lines);
    G.inCutscene = was;
    input.flush();
    return r;
  }

  cine(on: boolean) {
    G.inCutscene = on;
    G.ui.cinematicBars(on);
    if (!on) input.flush();
  }

  quest(id: string, stage: number, done = false) {
    const s = G.save;
    const before = s.quests[id];
    if (setQuest(s, id, stage, done)) {
      const q = QUESTS.find((x) => x.id === id);
      if (!q) return;
      if (done) {
        G.ui.toast(`Quest complete — ${q.title}`, 'good');
        islandNotify('QUEST COMPLETE', '#9fe39a', 'journal', 2.6);
      }
      else if (!before) G.ui.toast(`New quest — ${q.title}`, 'info');
      else G.ui.toast(`Quest updated — ${q.title}`, 'info');
    }
  }

  npc(kind: string): Npc | undefined {
    return G.world.ents.find((e) => e instanceof Npc && e.kind === kind) as Npc | undefined;
  }

  async walkPlayer(x: number, speed = 70) {
    const p = G.world.player;
    p.scriptX = x;
    p.scriptSpeed = speed;
    for (let i = 0; i < 200 && p.scriptX !== null; i++) await wait(0.05);
  }

  // ---------------------------------------------------------------- room entry
  onEnter(id: string, first: boolean) {
    const s = G.save;
    if (this.ch3.onEnter(id, first)) return;
    if (this.ch4.onEnter(id, first)) return;
    if (this.ch5.onEnter(id, first)) return;
    if (this.ch2.onEnter(id, first)) return;
    if (id === 'sanctuary' && !flag('intro_done')) {
      this.opening();
      return;
    }
    if (id === 'sanctuary' && flag('ch1_done') && !flag('ending_done')) {
      this.ending();
      return;
    }
    if (first) {
      const r = G.world.room;
      setTimeout(() => G.ui.banner(r.name.toUpperCase(), r.region, 'area'), 400);
    }
    if (id === 'temple_hall' && !flag('hall_arrived')) {
      setFlag('hall_arrived');
      this.quest('m_expedition', 0, true);
      this.quest('m_dark', 0);
      setTimeout(() => G.ui.caption('Alone. Somewhere above, Azriel is shouting your name.'), 1200);
      setTimeout(() => G.ui.caption(null), 5200);
    }
    if (id === 'covenant_chamber' && flag('relic_taken')) music.play('revelation');
    if (id === 'idol_sanctum' && s.defeated.includes('idol')) music.play('victory');
  }

  // ---------------------------------------------------------------- opening
  async opening() {
    this.cine(true);
    music.play('sanctuary');
    await wait(1.0);
    G.ui.banner('HEARTHWARD SANCTUARY', 'The Ashen Village', 'area');
    await wait(1.6);
    const choice = await this.say([
      { who: 'azriel', text: 'Elior. You\'re on the expedition.' },
      { who: 'elior', text: 'Me, Captain? I lost the sparring ring to Tobiah. Twice.' },
      { who: 'azriel', text: 'Three times. I was counting.' },
      { who: 'azriel', text: 'The scouts we sent to the Temple of the First Lamp have not come back. Our stores are nearly gone. The temple vaults may still hold grain — and oil for the lamps.' },
      { who: 'azriel', text: 'Tobiah and I go ahead to the temple steps. You follow the road and keep it clear behind us. If the husks gather, we need a way home.' },
      { who: 'elior', text: '...', choices: [{ label: 'I\'ll hold the road.' }, { label: 'Why me? I\'m the weakest of the watch.' }] },
    ]);
    if (choice === 1) {
      await this.say([
        { who: 'azriel', text: 'That is exactly why. The strong ones stop watching their footing.' },
        { who: 'azriel', text: 'Strength is a tool, Elior. Discipline decides what it builds.' },
      ]);
      s_aff('azriel', 1);
    } else {
      await this.say([{ who: 'azriel', text: 'Good. Hold it like your family sleeps behind it. They do.' }]);
      s_aff('azriel', 1);
    }
    await this.say([
      { who: 'tobiah', text: 'Don\'t worry, Elior. I\'ll protect you. Probably. Most likely.' },
      { who: 'azriel', text: 'Speak with Mara before you go. Dov has kept your blade sharp, and Ilan will trade if you have silver. Then follow us east.' },
    ]);
    setFlag('expedition');
    setFlag('intro_done');
    this.quest('m_expedition', 0);
    const az = this.npc('azriel'), tb = this.npc('tobiah');
    if (az) az.walkTo = 60 * TILE;
    if (tb) tb.walkTo = 61 * TILE;
    this.cine(false);
    setTimeout(() => {
      az && (az.remove = true);
      tb && (tb.remove = true);
    }, 5000);
    G.world.autosave(true);
    setTimeout(() => G.ui.hint(this.fmt('Move with {move}. Talk to people with {interact}.')), 600);
    setTimeout(() => G.ui.hint(null), 7000);
  }

  // ---------------------------------------------------------------- triggers
  onTrigger(id: string) {
    if (this.ch3.onTrigger(id)) return;
    if (this.ch4.onTrigger(id)) return;
    if (this.ch5.onTrigger(id)) return;
    if (this.ch2.onTrigger(id)) return;
    switch (id) {
      case 'steps_cutscene': if (!flag('collapsed')) this.collapse(); break;
      case 'relic': if (!flag('relic_taken')) this.relic(); break;
      case 'tobiah': if (!flag('tobiah_resolved')) this.tobiah(); break;
      case 'regent': if (!flag('regent_met')) this.regent(); break;
      case 'boss_start': if (!G.save.defeated.includes('idol')) this.bossStart(); break;
    }
  }

  async collapse() {
    this.cine(true);
    const W = G.world;
    await this.walkPlayer(46 * TILE);
    await this.say([
      { who: 'tobiah', text: 'Elior! You made it! Captain, he made it!' },
      { who: 'azriel', text: 'The doors are barred from the inside. Someone sealed themselves in.' },
      { who: 'azriel', text: 'Or something.' },
      { who: 'tobiah', text: 'Is the floor supposed to hum like that?' },
    ]);
    sfx('rumble');
    G.camera.addTrauma(0.6 * shakeScale());
    await wait(0.6);
    await this.say([{ who: 'azriel', text: 'Back! Everyone off the—' }]);
    // The porch gives way.
    const g = W.grid;
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (g.get(x, y) === T.Collapse) {
      g.set(x, y, T.Empty);
      fx.shards(x * TILE + 8, y * TILE + 8, 3, '#6a6070', 1.2);
      fx.dust(x * TILE + 8, y * TILE + 8, 2, 1);
    }
    W.cache?.invalidate();
    sfx('wallBreak');
    G.camera.addTrauma(0.8 * shakeScale());
    setFlag('collapsed');
    W.player.x = 49 * TILE;
    W.player.body.vy = 50;
    G.ui.caption('Azriel: "ELIOR! Find the lower gate — we\'ll come for you!"');
    this.cine(false);
    G.inCutscene = true;
    setTimeout(() => { G.inCutscene = false; }, 1200);
    setTimeout(() => G.ui.caption(null), 3500);
  }

  async relic() {
    const W = G.world;
    this.cine(true);
    music.stop(2);
    await this.walkPlayer(30 * TILE, 50);
    sfx('inscription');
    G.ui.caption('Letters older than Hearthward begin to burn with light.');
    await wait(1.6);
    G.ui.caption(null);
    await G.ui.lore('eph612');
    if (!G.save.lore.includes('eph612')) G.save.lore.push('eph612');
    this.checkMara();
    await this.say([
      { who: 'elior', text: '"...not against flesh and blood." The husks were people once. Then what have we been fighting?' },
    ]);
    await this.walkPlayer(33 * TILE, 40);
    W.player.anim.play('invoke', 0.2, true);
    await wait(0.4);
    sfx('purify');
    fx.column(34.5 * TILE, 20 * TILE, 70, 300, '#fff3c4', 2.4);
    fx.holyBurst(34.5 * TILE, 18 * TILE, 40, 2);
    fx.flash('#fff6dc', 0.8);
    G.camera.addTrauma(0.5 * shakeScale());
    music.play('revelation', 1);
    await wait(1.2);
    G.ui.caption('"...My grace is sufficient for thee: for my strength is made perfect in weakness..."', '2 Corinthians 12:9 (KJV) — written along the relic\'s broken edge');
    await wait(5.0);
    G.ui.caption(null);
    await this.say([
      { who: 'elior', text: 'I\'m no one\'s champion. But if there is work here that the weak can do —' },
      { who: 'elior', text: 'Here am I.' },
    ]);
    setFlag('relic_taken');
    setFlag('phantom');
    G.save.keyItems.push('relic_shard');
    grantAbility(G.save, 'sword_word');
    G.d = derive(G.save);
    G.save.ce = G.d.maxCe;
    W.player.styleKey = '';
    G.ui.banner('COVENANT AWAKENED', 'Covenant Energy · Sword of the Word · Phantom Step · Rally the Remnant', 'ability');
    G.ui.refreshHud();
    await wait(2.8);
    // The guardian of the chamber arrives.
    sfx('rumble');
    G.camera.addTrauma(0.6 * shakeScale());
    await wait(0.8);
    sfx('wallBreak');
    fx.shards(44 * TILE, 18 * TILE, 30, '#5a5060', 2);
    fx.dust(44 * TILE, 21 * TILE, 20, 2);
    const sent = W.spawnEnemy('sentinel', 42 * TILE, 21 * TILE, 'chamber_sentinel');
    sent.face = -1;
    W.closeGate(true);
    music.play('boss', 0.5);
    music.phase = 0;
    G.ui.banner('FALLEN SENTINEL', 'Last Warden of the First Lamp', 'boss');
    await wait(1.2);
    this.cine(false);
    G.ui.hint(this.fmt('Its shield turns aside light blows. Land a hit, then press {dodge} to Phantom Step behind it — or charge a heavy attack, or press {skill1}.'));
    setTimeout(() => G.ui.hint(null), 9000);
    this.quest('m_dark', 1);
  }

  async tobiah() {
    const W = G.world;
    this.cine(true);
    await this.walkPlayer(70 * TILE, 70);
    const c = await this.say([
      { who: 'tobiah', text: 'Elior?! Oh thank— I came down after you. Through the well shaft. Then the stairs collapsed. Then my leg collapsed.' },
      { who: 'tobiah', text: 'There are more of them coming. I can hear them breathing. Go — find the way out. I\'ll hold them off with this spear and my excellent attitude.' },
      { who: 'elior', text: '...', choices: [{ label: 'I\'m not leaving you.' }, { label: 'Hold on. I\'ll find the gate and bring Azriel.' }] },
    ]);
    if (c === 0) {
      setFlag('tobiah_choice_stay');
      await this.say([{ who: 'tobiah', text: 'You\'re— okay. Okay! Then watch the left. They always come from the left.' }]);
      this.cine(false);
      // A wave comes for Tobiah.
      const spawn: [Parameters<typeof W.spawnEnemy>[0], number][] = [['husk', 52], ['husk', 56], ['hound', 48], ['husk', 86]];
      const foes: Enemy[] = [];
      spawn.forEach(([k, x], i) => setTimeout(() => {
        const e = W.spawnEnemy(k, x * TILE, 22 * TILE);
        e.face = x < 64 ? 1 : -1;
        foes.push(e);
        fx.veilBurst(e.cx, e.cy, 12, 1);
      }, 400 + i * 700));
      music.setIntensity(1);
      const check = setInterval(() => {
        if (foes.length === 4 && foes.every((f) => f.dying)) {
          clearInterval(check);
          this.tobiahSaved();
        }
        if (W.room.id !== 'crypt') clearInterval(check);
      }, 300);
    } else {
      setFlag('tobiah_left');
      setFlag('tobiah_resolved');
      s_aff('tobiah', -1);
      await this.say([
        { who: 'tobiah', text: 'Right. Good plan. Very sensible. The Captain would approve.' },
        { who: 'tobiah', text: '...Go on. I\'ll still be here. Probably.' },
      ]);
      this.quest('s_tobiah', 0);
      this.cine(false);
    }
  }

  async tobiahSaved() {
    this.cine(true);
    await wait(0.8);
    await this.say([
      { who: 'elior', text: 'Can you stand?' },
      { who: 'tobiah', text: 'You came back for me. ...Don\'t tell the Captain I cried. It was dust. Holy dust.' },
      { who: 'tobiah', text: 'I\'ll limp back toward the nave and find somewhere high to hide. If you need me — I owe you one. A big one.' },
    ]);
    setFlag('tobiah_saved');
    setFlag('tobiah_resolved');
    s_aff('tobiah', 2);
    this.quest('s_tobiah', 0, true);
    const t = this.npc('tobiah');
    if (t) {
      t.walkTo = 124 * TILE;
      setTimeout(() => (t.remove = true), 6000);
    }
    G.world.giveXp(40);
    this.cine(false);
  }

  async regent() {
    const W = G.world;
    this.cine(true);
    await this.walkPlayer(26 * TILE, 50);
    sfx('wispHum', { pitch: 0.5 });
    const rg = new Npc('regent', 20 * TILE, 18 * TILE - 6, 1);
    W.add(rg);
    fx.veilBurst(20 * TILE, 15 * TILE, 20, 1);
    await wait(0.8);
    const c = await this.say([
      { who: 'regent', text: 'So the lamp chose a watchman. How ordinary. How... fitting.' },
      { who: 'elior', text: 'Who are you?' },
      { who: 'regent', text: 'One who watched seven kingdoms tear themselves apart for want of a firm hand. I serve the Sovereign\'s peace. It is the only peace left.' },
      { who: 'regent', text: 'That relic will make you strong. Stronger than your captain. When Hearthward is hungry and afraid, who do you think they will follow?' },
      { who: 'elior', text: '...', choices: [
        { label: 'Whoever serves them. Not whoever rules them.' },
        { label: '...What would you have me do?' },
        { label: 'Get out of my head.' },
      ] },
    ]);
    G.save.choices.regent = String(c);
    if (c === 0) {
      setFlag('humble', Number(G.save.flags.humble ?? 0) + 1);
      await this.say([{ who: 'regent', text: 'Spoken like someone who has never had to decide who goes hungry. You will.' }]);
    } else if (c === 1) {
      setFlag('pride', Number(G.save.flags.pride ?? 0) + 1);
      await this.say([{ who: 'regent', text: 'Nothing yet. Only notice how your Echoes obey. How easy it is. Remember that ease.' }]);
    } else {
      await this.say([{ who: 'regent', text: 'I was never in it. Only in the mirror. You looked.' }]);
    }
    await this.say([
      { who: 'regent', text: 'Beyond that door kneels a king\'s gift to himself. Break it, if you can.' },
      { who: 'regent', text: 'And when you hold its crown, ask yourself why your hands are shaking.' },
    ]);
    sfx('shatter', { vol: 0.5 });
    fx.shards(20 * TILE, 15 * TILE, 20, '#4a3a5a', 1.2);
    fx.veilBurst(20 * TILE, 15 * TILE, 24, 1.2);
    rg.remove = true;
    setFlag('regent_met');
    this.cine(false);
  }

  async bossStart() {
    const W = G.world;
    const idol = W.boss;
    if (!idol) return;
    this.cine(true);
    W.bossActive = true;
    W.closeGate(true);
    music.stop(1);
    await this.walkPlayer(46 * TILE, 60);
    G.camera.viewMultTarget = 1.28;
    if (flag('idol_seen')) idol.st = 2.6;
    idol.awaken();
    setFlag('idol_seen');
    // the idol's intro ends the cutscene and starts the fight
  }

  // ---------------------------------------------------------------- talk
  async talk(n: Npc) {
    const s = G.save;
    n.talkT = 4;
    if (await this.ch3.talk(n)) return;
    if (await this.ch4.talk(n)) return;
    if (await this.ch5.talk(n)) return;
    if (await this.ch2.talk(n)) return;
    switch (n.kind) {
      case 'mara': return this.talkMara();
      case 'ilan': {
        if (!flag('met_ilan')) {
          setFlag('met_ilan');
          await this.say([{ who: 'ilan', text: 'A watchman with silver in his purse? The world is ending, but business never sleeps. Take a look.' }]);
        }
        G.ui.openShop('merchant');
        return;
      }
      case 'dov': return this.talkDov();
      case 'azriel': {
        if (flag('ch1_done')) {
          await this.say([{ who: 'azriel', text: flag('crown_laid') ? 'Rest while you can. The valley will not wait forever, and neither will the Sovereign.' : 'You carry yourself differently since the sanctum. Watch that it\'s the weight of duty, and not of gold.' }]);
        } else await this.say([{ who: 'azriel', text: 'Hold the road, Elior. We\'ll meet at the temple steps.' }]);
        return;
      }
      case 'tobiah': {
        if (flag('ch1_done')) await this.say([{ who: 'tobiah', text: flag('tobiah_saved') ? 'I\'m telling everyone you carried me out. I\'m leaving out the crying. It was dust.' : 'Next time you go into a collapsing temple, maybe take me with you instead of leaving me in one? Just a thought.' }]);
        else await this.say([{ who: 'tobiah', text: 'The Captain says I talk too much when I\'m nervous. I am not nervous. I am extremely calm. See? Calm.' }]);
        return;
      }
    }
    void s;
  }

  async talkMara() {
    const s = G.save;
    if (!flag('met_mara')) {
      setFlag('met_mara');
      await this.say([
        { who: 'mara', text: 'Elior. If you find inscriptions in the temple, remember them for me — word for word, if you can.' },
        { who: 'mara', text: 'The old kingdoms carved their warnings into stone and then lived as if they had never read them.' },
        { who: 'mara', text: 'And there\'s an old cistern beneath the market well. My grandmother swore someone scratched a prayer into its pillars during the first night of the Veil.' },
      ]);
      this.quest('s_mara', 0);
      return;
    }
    const found = TEMPLE_LORE.filter((l) => s.lore.includes(l)).length;
    if (s.keyItems.includes('ledger') && !flag('ledger_given')) {
      setFlag('ledger_given');
      s.keyItems = s.keyItems.filter((k) => k !== 'ledger');
      addMaterial(s, 'covenant_fragment', 2);
      s.silver += 60;
      await this.say([
        { who: 'mara', text: 'The archive ledger! Water-stained, half the ink gone — it\'s perfect.' },
        { who: 'mara', text: 'These are the temple\'s grain records. The priests were hoarding while the village starved. Before the Veil ever came.' },
        { who: 'mara', text: 'Take these. I found them pressed between the pages. I think they were meant for someone braver than a librarian.' },
      ]);
      G.ui.toast('Received 2 Covenant Fragments and 60 silver', 'loot');
      this.quest('s_ledger', 0, true);
      s_aff('mara', 1);
      return;
    }
    if (found >= 4 && !s.quests.s_mara?.done) {
      await this.say([
        { who: 'mara', text: `You remembered ${found} of them. Word for word.` },
        { who: 'mara', text: '"For the weapons of our warfare are not carnal..." My teachers made us copy that one before every lesson. I never understood why, until now.' },
        { who: 'mara', text: 'Take my family\'s signet. Archivists were meant to carry it into places too dangerous for books. You\'re the closest thing to a book I have left.' },
      ]);
      const it = makeItem('archivist_ring');
      s.inventory.push(it);
      G.ui.itemGet(it);
      s.skillPoints += 1;
      G.ui.toast('Mara\'s teaching: +1 skill point', 'good');
      this.quest('s_mara', 1, true);
      s_aff('mara', 2);
      return;
    }
    if (flag('ch1_done')) {
      await this.say([{ who: 'mara', text: 'The relic\'s edge points east. Ezekiel\'s valley. I\'ve read the passage a hundred times tonight, and I still don\'t know if it\'s a promise or a warning.' }]);
      return;
    }
    await this.say([{ who: 'mara', text: found ? `You've remembered ${found} of the old inscriptions. Bring me four, and I'll tell you what they meant to the people who carved them.` : 'Remember the inscriptions, Elior. Word for word.' }]);
  }

  async talkDov() {
    const s = G.save;
    const q = s.quests.s_dov;
    if (!q) {
      await this.say([
        { who: 'dov', text: 'Blade\'s sharp. Edge will hold. Won\'t hold forever.' },
        { who: 'dov', text: 'Bring me iron from the ruins — six good pieces of scrap — and I\'ll temper your weapon for nothing. Otherwise, silver.' },
      ]);
      this.quest('s_dov', 0);
    } else if (!q.done && (s.materials.iron_scrap ?? 0) >= 6) {
      payMaterials(s, { iron_scrap: 6 });
      const w = getItem(s, s.equipment.weapon);
      let line = 'Your blade is already as tempered as I can make it.';
      if (w && w.plus < MAX_PLUS) {
        w.plus++;
        line = `There. ${ITEMS[w.id].name} +${w.plus}. Feel the balance?`;
      }
      const g = makeItem('greaves');
      s.inventory.push(g);
      await this.say([
        { who: 'dov', text: 'Six pieces. Good iron, too. The old kingdom built things to last.' },
        { who: 'dov', text: line },
        { who: 'dov', text: 'And take these greaves. Made them for a watchman who didn\'t come back from the first scouting party. He\'d want them walking.' },
      ]);
      G.ui.itemGet(g);
      G.d = derive(s);
      G.world.player.styleKey = '';
      this.quest('s_dov', 0, true);
    }
    G.ui.openShop('smith');
  }

  // ---------------------------------------------------------------- lore, shrines, secrets
  async readLore(id: string) {
    const s = G.save;
    G.inCutscene = true;
    sfx('inscription', { vol: 0.7 });
    await G.ui.lore(id);
    G.inCutscene = false;
    input.flush();
    if (!s.lore.includes(id)) {
      s.lore.push(id);
      G.world.giveXp(15);
      if (id === 'eph610') this.secret('cistern_chest_area');
      this.ch2.onLore(id);
      this.ch3.onLore(id);
      this.ch4.onLore(id);
      this.ch5.onLore(id);
    }
    this.checkMara();
  }

  checkMara() {
    const s = G.save;
    const found = TEMPLE_LORE.filter((l) => s.lore.includes(l)).length;
    if (s.quests.s_mara && !s.quests.s_mara.done && found >= 4 && s.quests.s_mara.stage === 0) this.quest('s_mara', 1);
  }

  async shrine(sh: Shrine) {
    const s = G.save;
    const W = G.world;
    this.cine(true);
    await this.walkPlayer(sh.x - 12, 50);
    W.player.anim.play('invoke', 0.15, true);
    sfx('purify');
    fx.column(sh.x, sh.y, 50, 220, '#fff3c4', 1.6);
    fx.holyBurst(sh.x, sh.y - 24, 24, 1.2);
    fx.flash('#fff6dc', 0.4);
    await wait(1.0);
    s.keyItems.push(sh.grants);
    if (sh.grants === 'eagle_wings') {
      setFlag('plume');
      await G.ui.lore('isa4031');
      if (!s.lore.includes('isa4031')) s.lore.push('isa4031');
      G.ui.banner('EAGLE PLUME', 'Press jump again in mid-air to leap a second time', 'ability');
      this.quest('m_dark', 2);
    } else if (sh.grants === 'ram_horn') {
      setFlag('horn');
      await G.ui.lore('josh620');
      if (!s.lore.includes('josh620')) s.lore.push('josh620');
      grantAbility(s, 'trumpet');
      G.ui.banner('TRUMPET OF VICTORY', 'Shatter cracked walls and seals · stagger nearby foes', 'ability');
      this.quest('m_dark', 3);
      setTimeout(() => G.ui.hint(this.fmt('Cracked walls veined with gold fall to the Trumpet of Victory. Equip it in the Skills menu if your slots are full.')), 3000);
      setTimeout(() => G.ui.hint(null), 11000);
    }
    this.checkMara();
    W.giveXp(30);
    G.ui.refreshHud();
    W.autosave();
    this.cine(false);
  }

  secret(id: string) {
    const s = G.save;
    const key = id === 'cistern_chest_area' ? 'cistern_chest' : id;
    if (this.ch2.secret(key)) return;
    if (this.ch3.secret(key)) return;
    if (this.ch4.secret(key)) return;
    if (this.ch5.secret(key)) return;
    if (!SECRET_IDS.includes(key) || s.secrets.includes(key)) return;
    s.secrets.push(key);
    sfx('lootRare', { vol: 0.6 });
    G.ui.toast(`Hidden chamber discovered (${s.secrets.length}/${SECRET_IDS.length})`, 'good');
    if (!s.quests.s_secrets) this.quest('s_secrets', 0);
    if (s.secrets.length >= SECRET_IDS.length) this.quest('s_secrets', 0, true);
  }

  ledgerFound() {
    this.quest('s_ledger', 0);
  }

  onWallBroken(room: string, tiles: [number, number][]) {
    if (room === 'temple_hall') {
      if (tiles.some(([x]) => x <= 3)) {
        setFlag('seal_broken');
        this.quest('m_dark', 4);
        G.ui.toast('The golden seal shatters.', 'good');
      } else {
        setFlag('shortcut');
        G.ui.toast('A passage back to the temple steps — and to Hearthward.', 'good');
      }
    }
    if (room === 'upper_gallery') {
      setFlag('vault_open');
      this.secret('vault_chest');
    }
    G.world.autosave(true);
  }

  onKill(_e: Enemy) {}

  // ---------------------------------------------------------------- purification
  async purify(e: Enemy) {
    const W = G.world;
    const s = G.save;
    const species = ({ archer: 'archer', brute: 'brute', bulwark: 'bulwark', knight: 'knight', lion: 'lion' } as Record<string, string>)[e.kind] ?? 'sentinel';
    const first = s.echoes.length === 0;
    this.cine(true);
    W.player.anim.play('invoke', 0.15, true);
    sfx('purify');
    music.play('revelation', 1);
    G.camera.focus = { x: e.x, y: e.y - 30 };
    G.camera.zoomTarget = 1.25;
    await wait(0.3);
    if (first) {
      G.ui.caption('The Sentinel\'s last stand still trembles in the air — not its soul, but the shape of how it fought, stained through by the Veil.');
      await wait(3.4);
    }
    // violet burns away into white fire
    for (let i = 0; i < 6; i++) {
      setTimeout(() => {
        fx.veilBurst(e.cx + rand(-10, 10), e.cy + rand(-14, 14), 10, 1.2);
        fx.holyBurst(e.cx, e.cy, 8, 0.8);
      }, i * 160);
    }
    await wait(1.0);
    fx.column(e.x, e.y, 70, 320, '#fff3c4', 2.0);
    fx.flash('#ffffff', 0.7);
    fx.ring(e.x, e.y - 2, 8, 120, '#ffe6a8', 0.8, 4, 0.3);
    G.camera.addTrauma(0.5 * shakeScale());
    e.remove = true;
    if (e.elite) s.defeated.push(e.elite);
    const absorbed = W.absorb(species)!;
    const inst = absorbed.echo;
    G.d = derive(s);
    W.summonEchoes(true);
    const unit = W.echoes.find((u) => u.inst.uid === inst.uid);
    if (unit) {
      unit.x = e.x;
      unit.y = e.y;
      unit.face = W.player.x > e.x ? 1 : -1;
      unit.summonT = 1.1;
    }
    sfx('summon');
    const sp = ECHO_SPECIES[species];
    G.ui.banner(absorbed.evolved ? 'ECHO EVOLVED' : absorbed.created ? 'ECHO PURIFIED' : 'ECHO REINFORCED', `${sp.stages[inst.stage].name} · ${sp.cls}`, 'echo');
    await wait(2.4);
    G.camera.focus = null;
    G.camera.zoomTarget = 1;
    if (first) {
      G.ui.caption('Not a soul. A memory of its courage, cleansed of the Veil and bound to the covenant. It will stand with you.');
      await wait(4.2);
      G.ui.caption(null);
    }
    W.giveXp(60);
    this.cine(false);
    if (W.gateClosed && !W.bossActive && !(W.room.id === 'tower_upper' && !flag('guard_cleared'))) W.closeGate(false);
    this.ch2.onPurified(e.elite);
    this.ch3.onPurified(e.elite);
    this.ch4.onPurified(e.elite);
    this.ch5.onPurified(e.elite);
    if (e.elite === 'chamber_sentinel') {
      setFlag('chamber_done');
      setFlag('has_echo');
      W.add(new Altar(12 * TILE, 21 * TILE, 'chamber'));
      music.play('revelation');
      setTimeout(() => G.ui.hint(this.fmt('Command your Echoes with {echo}: summon, change stance, mark a target, recall, or strike together.')), 800);
      setTimeout(() => G.ui.hint(null), 10000);
    } else if (s.active.length >= G.d.echoSlots && !s.active.includes(inst.uid)) {
      G.ui.toast('Your Echo slots are full. Choose who fights in the Echoes menu.', 'info');
    }
    G.ui.refreshHud();
    W.autosave();
  }

  gatekeeperDefeated(b: Gatekeeper) {
    return this.ch2.gatekeeperDefeated(b);
  }
  marshalDefeated(m: Marshal) {
    return this.ch2.marshalDefeated(m);
  }
  kingDefeated(k: LocustKing) {
    return this.ch3.kingDefeated(k);
  }

  // ---------------------------------------------------------------- the Idol falls
  async bossDefeated(_idol: Idol) {
    const W = G.world;
    const s = G.save;
    this.cine(true);
    G.camera.viewMultTarget = 1;
    await wait(1.0);
    music.play('victory', 2);
    G.ui.banner('THE GILDED IDOL HAS FALLEN', '', 'boss');
    W.giveXp(600);
    W.spawnLoot(_idol.x, _idol.y - 30, [{ silver: 300 }, { mat: 'radiant_core', n: 1 }, { item: 'judgment_greatsword' }, { mat: 'covenant_fragment', n: 2 }], true);
    await wait(3.0);
    // The crown.
    const cx = W.player.x + W.player.face * 30;
    fx.holyBurst(cx, W.player.y - 10, 16, 0.8);
    sfx('loot');
    G.ui.caption('The Idol\'s crown rolls to your feet, still warm. It hums with a promise: strength, certainty, command.');
    await wait(3.2);
    G.ui.caption(null);
    const c = await G.ui.choice('The Gilded Crown', 'It would fit. It would make you stronger than anyone in Hearthward. No one would have to know where it came from.', [
      { label: 'Take up the crown', sub: 'Gain the Gilded Crown — a Legendary helm of raw power.' },
      { label: 'Lay it down', sub: 'Leave it where the Idol fell. The covenant remembers.' },
    ]);
    if (c === 0) {
      setFlag('crown_taken');
      const it = makeItem('gilded_crown');
      s.inventory.push(it);
      G.ui.itemGet(it);
      G.ui.caption('Somewhere very far away, a mask smiles.');
      await wait(3);
      G.ui.caption(null);
    } else {
      setFlag('crown_laid');
      sfx('altar');
      fx.column(cx, W.player.y, 40, 200, '#fff3c4', 1.4);
      for (const e of W.echoes) fx.holyBurst(e.x, e.y - 20, 12, 0.8);
      G.ui.caption('You set the crown down. Behind you, your Echoes lower their blades in salute.');
      await wait(3.4);
      G.ui.caption(null);
    }
    // A second banner for the Remnant.
    s.storySlots = Math.max(s.storySlots, 2);
    G.d = derive(s);
    G.ui.banner('COMMANDER OF THE REMNANT', 'A second Echo may now fight beside you', 'level');
    W.summonEchoes();
    await wait(2.6);
    this.quest('m_dark', 4, true);
    // Azriel finds you.
    const az = new Npc('azriel', 62 * TILE, 23 * TILE, -1);
    az.walkTo = W.player.x + 60;
    W.add(az);
    sfx('door');
    await wait(2.2);
    await this.say([
      { who: 'azriel', text: 'Elior! ...You did this?' },
      { who: 'elior', text: W.echoes.length ? 'Not alone.' : 'I had help. It\'s hard to explain.' },
      ...(W.echoes.length ? [
        { who: 'azriel', text: 'Those are the Sentinels of the First Lamp. I trained under their banners as a boy. They died at this temple\'s gate.' },
        { who: 'elior', text: 'They\'re not them, Captain. Just how they fought — their courage, without the Veil.' },
        { who: 'azriel', text: 'Then honor it. Strength like that is a trust, not a trophy.' },
      ] : []),
      ...(flag('crown_taken') ? [
        { who: 'azriel', text: 'And that crown on your belt?' },
        { who: 'elior', text: '...It\'s only gold.' },
        { who: 'azriel', text: 'So was the Idol.' },
      ] : [
        { who: 'azriel', text: 'You left the crown.' },
        { who: 'elior', text: 'It wasn\'t mine.' },
        { who: 'azriel', text: 'No. It wasn\'t.' },
        { who: 'azriel', text: 'Here. My captain gave me this signet the day I swore to the watch. She told me what it meant. I think you already know.' },
      ]),
    ]);
    if (flag('crown_laid')) {
      const ring = makeItem('covenant_signet');
      s.inventory.push(ring);
      G.ui.itemGet(ring);
      if (!s.lore.includes('mark1043')) s.lore.push('mark1043');
      await G.ui.lore('mark1043');
    }
    await this.say([{ who: 'azriel', text: 'Come. Hearthward has waited long enough for good news.' }]);
    this.quest('m_return', 0);
    setFlag('ch1_done');
    await G.ui.fade(1, 1.2);
    this.cine(false);
    W.load('sanctuary', 'start');
    await G.ui.fade(0, 1.0);
  }

  async ending() {
    const s = G.save;
    this.cine(true);
    music.play('sanctuary');
    await wait(1.2);
    await this.say([
      { who: 'mara', text: 'You\'re back. All of you. ...Elior, your hands. They\'re glowing.' },
      { who: 'elior', text: 'It doesn\'t hurt. It feels like being reminded of something I forgot.' },
      { who: 'mara', text: 'Let me see the relic. There — writing along the break. Old script.' },
    ]);
    await G.ui.lore('eze374');
    if (!s.lore.includes('eze374')) s.lore.push('eze374');
    await this.say([
      { who: 'mara', text: 'Ezekiel. The old maps mark a valley east of the pass, where the armies of the second kingdom fell. They called it the Valley of Bones.' },
      { who: 'mara', text: 'If more of the relic survives, it\'s there.' },
      { who: 'azriel', text: 'Then we go east. Not tonight. Tonight Hearthward eats.' },
      flag('tobiah_saved')
        ? { who: 'tobiah', text: 'And sleeps! Some of us were pinned under a statue today. Heroically.' }
        : { who: 'tobiah', text: 'I found my own way out, by the way. Through a drain. Don\'t ask what was in the drain.' },
      ...(flag('crown_laid')
        ? [{ who: 'azriel', text: 'You could have worn that crown. No one would have stopped you.' }, { who: 'elior', text: 'That\'s why I didn\'t.' }]
        : [{ who: 'azriel', text: 'Keep your eyes open, Elior. Crowns are heavier than they look.' }]),
    ]);
    setFlag('ending_done');
    this.quest('m_return', 0, true);
    W_autosave();
    this.cine(false);
    if ((await G.ui.chapterEnd(1)) === 'next') await this.ch2.beginFromChapterOne();
  }
}

function s_aff(who: 'mara' | 'azriel' | 'tobiah', n: number) {
  G.save.affinity[who] += n;
}
function W_autosave() {
  G.world.autosave(true);
}

export const LORE_IDS = Object.keys(LORE);
export { SECRET_IDS, TEMPLE_LORE, hasMaterials };
export type { Entity };
