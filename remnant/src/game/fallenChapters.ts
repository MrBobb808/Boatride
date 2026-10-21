// Original fiction: each Fallen Crown commands a distinct domain.
import { MapBuilder, type RoomDef, type EntDef, type EnemyKind, type NpcKind } from './tiles';
export interface FallenChapter {
  n: 7 | 8 | 9; roman: string; title: string; name: string; boss: 'beast_monarch' | 'plague_monarch' | 'cinder_monarch'; biome: 'hunt' | 'plague' | 'cinders';
  hub: string; trail: string; depths: string; side: string; ridge: string; arena: string; rescue: NpcKind;
  objectives: {id: string; flag: string; room: string; name: string}[];
  rewards: string[]; optional: string; caches: string[]; record: string; intro: string[]; challenge: string[]; ending: string[]; tips: string;
  /** What Tobiah and the rescued survivor say at camp: before the crown falls, and after. */
  voices: { tobiah: [string, string]; rescued: [string, string] };
}
export const FALLEN_CHAPTERS: FallenChapter[] = [
  { n:7, roman:'VII', title:'The Crown of the Hunt', name:'Varkhos', boss:'beast_monarch', biome:'hunt', hub:'thaw_outpost', trail:'riftwood_trail', depths:'fang_pits', side:'moonlit_grove', ridge:'claw_ridge', arena:'hunt_throne', rescue:'barak',
    objectives:[{id:'fang_warden',flag:'hunt_fang_warden',room:'riftwood_trail',name:'Fang Warden'},{id:'redmaw_alpha',flag:'hunt_redmaw_alpha',room:'fang_pits',name:'Redmaw Alpha'}],
    rewards:['fangbreak_greatsword','oath_of_the_pack'], optional:'grove_lantern', caches:['hunt_trail_cache','hunt_grove_cache','hunt_ridge_cache'], record:'hunt_plague',
    intro:['The thaw reveals no spring. Claw marks score the trees higher than a man. Hunting horns answer through the mist.', 'Varkhos calls pursuit the only honest law. His Fang Warden and Redmaw Alpha bind the boundary to his throne. Defeat both and the road will open.', 'Barak sheltered survivors in the grove above the Fang Pits. Find them before the packs do. No one here belongs to the hunt.'],
    challenge:['You broke the princes’ hold. Good. Prey that stands its ground makes a better chase.', 'Your commanders are beaten. Your boundary is broken. These people are going home.', 'Tell me, keeper of echoes: which of them will you abandon when you tire?', 'They stand with me by mercy. They are not a pack I own.', 'Understanding comes after the running.'],
    ending:['The antler crown breaks against its own throne. The horns fall silent. Somewhere in the woods, a small creature moves without being chased.', 'Open the road. Bring the survivors home.', 'Green dust drifts from the north. Morvane, Crown of Pestilence, is stirring. The next army will not arrive on feet.'],
    tips:'Parry the claws. Dodge out of amber landing marks. Cut down his Hunt Shades: each strengthens his attacks. During the Great Hunt, evade three pounces, then punish the recovery.',
    voices:{tobiah:['The packs circle the outpost at dusk. They never charge. They wait to see who runs first.','Listen. No horns tonight. Only the meltwater in the trees.'],rescued:['The children are asleep by the fire. It is the first night in a month they have not slept in their boots.','In spring we plant the grove again. Nothing that lives in it will be hunted.']},
  },
  { n:8, roman:'VIII', title:'The Crown of Pestilence', name:'Morvane', boss:'plague_monarch', biome:'plague', hub:'lantern_quarantine', trail:'greenfall_marsh', depths:'sporeworks', side:'silent_infirmary', ridge:'pestilent_causeway', arena:'plague_throne', rescue:'ezra',
    objectives:[{id:'plague_source_a',flag:'plague_source_a',room:'greenfall_marsh',name:'Marsh Spore Heart'},{id:'plague_source_b',flag:'plague_source_b',room:'sporeworks',name:'Foundry Spore Heart'}],
    rewards:['thorn_of_dawn','covenant_of_breath'], optional:'infirmary_lantern', caches:['plague_marsh_cache','plague_infirmary_cache','plague_causeway_cache'], record:'plague_cinders',
    intro:['Every leaf wears the same green dust. Lanterns burn beside sealed doors. From the north comes the sound of rain, though the sky is clear.', 'Morvane commands pestilence and the living swarm. Two Spore Hearts feed the veil over her throne. Clear their guards, then cleanse both hearts.', 'Ezra kept an infirmary above the sporeworks. Find its survivors. When the queen calls the Great Miasma, gold light marks clean air.'],
    challenge:['Winter kept them still. The hunt kept them running. I can make them one.', 'You have turned their breath against them.', 'No hunger. No loneliness. One will, carried on a million wings.', 'A thousand voices are still worth hearing separately.', 'Then let us see how long your last breath lasts.'],
    ending:['The queen’s wings scatter into dust that no longer glows. Under the dead green crust, the first untouched leaf opens.', 'Unseal the doors. Let them breathe.', 'Ash lies beyond the marsh. Azkar, Crown of Cinders, has lit the furnaces. The freed causeway now leads to his foundries.'],
    tips:'Move out of green spore zones before they bloom. Destroy Brood Cocoons to stop Morvane healing. During the Great Miasma, stand inside the active gold beacon; strike when the veil breaks.',
    voices:{tobiah:['Keep a cloth over your mouth in the marsh. The dust settles in the chest before you feel it.','The lanterns can go out now. Clean air does not need a watchman.'],rescued:['I kept them breathing one at a time, one night at a time. I think I can sleep now.','Open every window. Let these rooms forget what they held.']},
  },
  { n:9, roman:'IX', title:'The Crown of Cinders', name:'Azkar', boss:'cinder_monarch', biome:'cinders', hub:'ashwatch_refuge', trail:'slag_procession', depths:'bellows_foundry', side:'last_smithy', ridge:'ember_aqueduct', arena:'cinder_throne', rescue:'talia',
    objectives:[{id:'cinder_valve_a',flag:'cinder_valve_a',room:'slag_procession',name:'Slag Pressure Wheel'},{id:'cinder_valve_b',flag:'cinder_valve_b',room:'bellows_foundry',name:'Bellows Pressure Wheel'}],
    rewards:['cinderbreak','oath_of_the_unburnt'], optional:'smiths_lantern', caches:['cinder_slag_cache','cinder_smithy_cache','cinder_aqueduct_cache'], record:'cinder_testament',
    intro:['Beyond the cleared marsh, ash falls like snow. The foundries ring without pause. Every hammer stroke has the rhythm of a marching army.', 'Azkar forges obedience in the furnaces. Two pressure wheels feed the seal around his throne. Clear their guards and release both wheels to vent the heat.', 'Talia led the last smiths to a workshop above the bellows. Bring them home. Azkar’s hammer can be parried; the glowing cracks in the floor cannot.'],
    challenge:['Everything breaks. I offer the mercy of choosing its next shape.', 'These people are not iron for your furnace.', 'Your echoes obey. Your blade obeys. Why should the living be different?', 'They choose to stand with me. Even a broken thing may choose what it becomes.', 'Then stand upon my anvil. Let us hear the strength of that choice.'],
    ending:['Azkar’s hammer splits. Molten seams cool across the broken crown. For the first time in years, the foundry workers hear their own breathing between the strokes.', 'Open the sluices. Let these fires warm homes again.', 'The crowns of Hunt, Pestilence and Cinders lie broken. For now, the road is quiet. Return to the survivors, explore the foundries, or challenge Azkar again in the boss gauntlet.'],
    tips:'Parry the hammer or dodge behind Azkar. Leave orange cracks before they erupt; jump over low fire waves. In phase II, parry to shatter his armor and expose him. During the Last Bellows, evade three marked eruptions, then punish his long recovery.',
    voices:{tobiah:['The hammers missed a stroke when you passed the procession. Every forge in the valley heard it.','Quiet, is it not? I keep waiting for the next stroke.'],rescued:['Our hands remember ploughs and hinges. Give us a quiet week and we will prove it.','The first thing we forged free was a cradle. Then a gate hinge. Then a hook for this lantern.']},
  },
];
export const chapterForRoom = (id: string) => FALLEN_CHAPTERS.find(c => [c.hub,c.trail,c.depths,c.side,c.ridge,c.arena].includes(id));
export const fallenObjective = (id: string) => FALLEN_CHAPTERS.flatMap(c => c.objectives).find(o => o.id === id);
const foe = (k: EnemyKind,x:number,y:number,elite?:string,ncond?:string):EntDef => ({t:'enemy',k,x,y,face:-1,elite,ncond});

// Each room is shaped and dressed by hand: raised ground, pits (stakes, thorns, bog,
// bile, slag), rock hanging from interior ceilings, then props and the light they cast.
// Ground features stay clear of exits, spawns, altars and objectives.
type Feat = [kind: 'mound' | 'pit' | 'hang', x: number, w: number, n: number, fill?: '^' | '~' | 'w'];
type Prop = [k: string, x: number, o?: { v?: number; w?: number; h?: number; flip?: boolean; fg?: boolean; y?: number }];
type Lamp = [k: 'glow' | 'torch' | 'brazier' | 'forge', x: number, lift: number, r?: number, c?: string];
interface Dress { feats?: Feat[]; props: Prop[]; lamps?: Lamp[] }
const FIRE = '#ff9a50', MOON = '#9ab8e8', BILE = '#9ae050', LAMP = '#d8f080', SLAG = '#ff7a2a';
const DRESS: Record<string, Dress> = {
  // ---- VII · the Hunt
  thaw_outpost: { props: [['hunt_palisade', 38, { w: 74, h: 6 }], ['hunt_tree', 4, { v: 1 }], ['hunt_totem', 13], ['hunt_tent', 20], ['hunt_fire', 29], ['hunt_rack', 37], ['hunt_banner', 46, { h: 4 }], ['hunt_horn', 52], ['hunt_rock', 59], ['hunt_tent', 62, { flip: true }], ['hunt_cage', 70], ['hunt_banner', 74, { h: 4 }]],
    lamps: [['glow', 29, 1, 90, FIRE], ['glow', 20, 1, 46, FIRE], ['glow', 62, 1, 46, FIRE], ['torch', 16, 3], ['torch', 44, 3]] },
  riftwood_trail: { feats: [['mound', 28, 11, 2], ['pit', 40, 4, 2, '^'], ['mound', 58, 13, 1], ['pit', 84, 5, 2, 'w']],
    props: [['hunt_tree', 6, { v: 1 }], ['hunt_tree', 15], ['hunt_totem', 21], ['hunt_rock', 31, { v: 1 }], ['hunt_tree', 36, { v: 1 }], ['hunt_bones', 46], ['hunt_tree', 51, { v: 2 }], ['hunt_fire', 64], ['hunt_rack', 67], ['hunt_rock', 73], ['hunt_bones', 81, { v: 1 }], ['hunt_tree', 91, { v: 1 }], ['hunt_totem', 99, { v: 1 }],
      ['grass', 10, { w: 5, fg: true }], ['grass', 48, { w: 4, fg: true }], ['grass', 75, { w: 5, fg: true }]],
    lamps: [['glow', 64, 1, 80, FIRE], ['glow', 86, 0, 60, MOON], ['glow', 21, 5, 50, MOON]] },
  fang_pits: { feats: [['pit', 29, 4, 2, '^'], ['mound', 36, 11, 2], ['mound', 56, 6, 1], ['pit', 68, 4, 2, '^'], ['mound', 83, 8, 2], ['hang', 15, 7, 4], ['hang', 50, 9, 3], ['hang', 75, 7, 5], ['hang', 99, 8, 3]],
    props: [['hunt_totem', 14], ['hunt_cage', 20], ['hunt_bones', 26], ['hunt_bones', 35, { v: 1 }], ['hunt_fire', 41], ['hunt_bones', 60], ['hunt_totem', 64], ['hunt_cage', 76, { flip: true }], ['hunt_bones', 80], ['hunt_rack', 87], ['hunt_banner', 100, { h: 5 }], ['hunt_bones', 106, { v: 1 }]],
    lamps: [['glow', 41, 1, 100, FIRE], ['torch', 22, 5], ['torch', 58, 5], ['torch', 96, 5], ['glow', 96, 5, 60, FIRE], ['glow', 22, 5, 60, FIRE]] },
  moonlit_grove: { feats: [['mound', 9, 6, 1], ['pit', 36, 6, 2, 'w']],
    props: [['hunt_tree', 14, { v: 1 }], ['hunt_rock', 20], ['hunt_tree', 30], ['hunt_rock', 43, { v: 1 }], ['hunt_tree', 50, { v: 1 }], ['hunt_fire', 56], ['hunt_tent', 64, { flip: true }], ['grass', 24, { w: 5, fg: true }]],
    lamps: [['glow', 56, 1, 90, FIRE], ['glow', 38, 0, 80, MOON]] },
  claw_ridge: { feats: [['mound', 16, 7, 1], ['mound', 27, 11, 2], ['pit', 44, 4, 2, '^'], ['mound', 60, 10, 2], ['mound', 73, 9, 3]],
    props: [['hunt_rock', 12, { v: 1 }], ['hunt_tree', 19, { v: 2 }], ['hunt_tree', 32, { v: 1 }], ['hunt_bones', 39], ['hunt_totem', 51], ['hunt_tree', 57], ['hunt_rock', 64], ['hunt_bones', 70, { v: 1 }], ['hunt_tree', 86, { v: 1 }], ['hunt_totem', 91, { v: 1 }], ['hunt_banner', 96, { h: 4 }], ['hunt_fire', 100], ['hunt_banner', 104, { h: 4 }], ['hunt_gate', 108],
      ['grass', 4, { w: 6, fg: true }], ['grass', 52, { w: 5, fg: true }]],
    lamps: [['glow', 100, 1, 80, FIRE]] },
  hunt_throne: { props: [['hunt_bones', 14], ['hunt_totem', 22], ['hunt_banner', 30, { h: 5 }], ['hunt_bones', 40, { v: 1 }], ['hunt_throne', 59], ['hunt_banner', 66, { h: 5 }], ['hunt_totem', 71, { flip: true }], ['hunt_bones', 75]],
    lamps: [['torch', 18, 5], ['torch', 44, 5], ['glow', 18, 5, 60, FIRE], ['glow', 44, 5, 60, FIRE], ['glow', 49, 9, 150, '#ffbd79']] },
  // ---- VIII · Pestilence
  lantern_quarantine: { props: [['plague_reeds', 3, { w: 3 }], ['plague_door', 14, { v: 1 }], ['plague_lantern', 20], ['plague_cart', 29], ['plague_door', 39], ['plague_lantern', 47], ['plague_cot', 52], ['plague_shroom', 61], ['plague_door', 67, { v: 1 }], ['plague_lantern', 73]],
    lamps: [['glow', 21, 3, 60, LAMP], ['glow', 48, 3, 60, LAMP], ['glow', 74, 3, 60, LAMP], ['brazier', 34, 0], ['glow', 34, 1, 60, FIRE]] },
  greenfall_marsh: { feats: [['pit', 28, 6, 2, 'w'], ['pit', 40, 4, 1, '~'], ['pit', 60, 7, 2, 'w'], ['mound', 69, 6, 1]],
    props: [['plague_tree', 8], ['plague_tree', 18, { v: 1 }], ['plague_shroom', 22], ['plague_reeds', 27, { w: 2 }], ['plague_reeds', 35, { w: 2 }], ['plague_lantern', 37], ['plague_tree', 47, { v: 2 }], ['plague_shroom', 52, { v: 1 }], ['plague_reeds', 59, { w: 1 }], ['plague_reeds', 68, { w: 1 }], ['plague_tree', 72], ['plague_brood', 82], ['plague_tree', 88, { v: 1 }], ['plague_lantern', 91], ['plague_shroom', 101],
      ['grass', 12, { w: 5, fg: true }], ['grass', 76, { w: 4, fg: true }]],
    lamps: [['glow', 38, 3, 60, LAMP], ['glow', 92, 3, 60, LAMP], ['glow', 41, 0, 50, BILE], ['glow', 52, 2, 50, BILE]] },
  sporeworks: { feats: [['pit', 29, 5, 2, '~'], ['mound', 36, 11, 1], ['pit', 68, 5, 2, '~'], ['mound', 84, 7, 1], ['hang', 15, 7, 3], ['hang', 50, 9, 3], ['hang', 76, 8, 4], ['hang', 99, 8, 2]],
    props: [['plague_vat', 18], ['plague_pipe', 25, { h: 10 }], ['plague_vat', 40], ['plague_brood', 46], ['plague_pipe', 55, { h: 12 }], ['plague_vat', 61], ['plague_pipe', 80, { h: 10 }], ['plague_vat', 88], ['plague_shroom', 104], ['plague_pipe', 108, { h: 10 }]],
    lamps: [['glow', 18, 3, 70, BILE], ['glow', 40, 3, 70, BILE], ['glow', 61, 3, 70, BILE], ['glow', 88, 3, 70, BILE], ['glow', 31, 0, 60, BILE], ['glow', 70, 0, 60, BILE]] },
  silent_infirmary: { feats: [['mound', 9, 5, 1]],
    props: [['plague_reeds', 4, { w: 2 }], ['plague_door', 16, { v: 1 }], ['plague_lantern', 22], ['plague_cot', 31], ['plague_cot', 38], ['plague_lantern', 44], ['plague_shroom', 52], ['plague_cot', 64]],
    lamps: [['glow', 23, 3, 70, LAMP], ['glow', 45, 3, 70, LAMP], ['glow', 17, 2, 40, FIRE]] },
  pestilent_causeway: { feats: [['pit', 18, 6, 3, 'w'], ['pit', 44, 5, 2, '~'], ['pit', 62, 6, 3, 'w'], ['pit', 82, 4, 2, 'w']],
    props: [['plague_tree', 12, { v: 1 }], ['plague_reeds', 17, { w: 1 }], ['plague_reeds', 25, { w: 1 }], ['plague_lantern', 30], ['plague_tree', 36], ['plague_brood', 41], ['plague_shroom', 51], ['plague_tree', 56, { v: 2 }], ['plague_reeds', 61, { w: 1 }], ['plague_reeds', 69, { w: 1 }], ['plague_tree', 74, { v: 1 }], ['plague_shroom', 89, { v: 1 }], ['plague_lantern', 97], ['plague_gate', 108]],
    lamps: [['glow', 31, 3, 60, LAMP], ['glow', 98, 3, 60, LAMP], ['glow', 46, 0, 60, BILE]] },
  plague_throne: { props: [['plague_brood', 14], ['plague_shroom', 22, { v: 1 }], ['plague_vat', 32], ['plague_brood', 42], ['plague_throne', 59], ['plague_brood', 70], ['plague_shroom', 75]],
    lamps: [['glow', 32, 3, 70, BILE], ['glow', 49, 9, 150, '#baed8c']] },
  // ---- IX · Cinders
  ashwatch_refuge: { props: [['cinders_tree', 3], ['cinders_ingots', 18], ['cinders_bellows', 30], ['cinders_anvil', 37], ['cinders_rack', 47], ['cinders_crucible', 52], ['cinders_tree', 61, { v: 1 }], ['cinders_anvil', 67], ['cinders_pipe', 72]],
    lamps: [['forge', 22, 0], ['glow', 52, 2, 60, SLAG], ['glow', 61, 2, 70, SLAG], ['glow', 3, 2, 60, SLAG]] },
  slag_procession: { feats: [['mound', 27, 8, 2], ['pit', 40, 5, 1, '~'], ['mound', 58, 12, 1], ['pit', 84, 5, 2, '~']],
    props: [['cinders_tree', 10], ['cinders_statue', 19], ['cinders_pipe', 31], ['cinders_statue', 37, { flip: true }], ['cinders_crucible', 48], ['cinders_tree', 52, { v: 1 }], ['cinders_statue', 63], ['cinders_statue', 74, { flip: true }], ['cinders_ingots', 80], ['cinders_statue', 91], ['cinders_tree', 101]],
    lamps: [['glow', 42, 0, 60, SLAG], ['glow', 86, 0, 60, SLAG], ['glow', 48, 2, 60, SLAG], ['glow', 10, 2, 60, SLAG], ['glow', 52, 2, 60, SLAG], ['forge', 66, 0]] },
  bellows_foundry: { feats: [['mound', 14, 6, 1], ['pit', 29, 5, 2, '~'], ['mound', 37, 9, 2], ['pit', 68, 5, 2, '~'], ['mound', 83, 9, 2], ['hang', 20, 6, 3], ['hang', 54, 8, 4], ['hang', 78, 7, 3], ['hang', 100, 7, 3]],
    props: [['cinders_bellows', 17], ['cinders_anvil', 41], ['cinders_rack', 50], ['cinders_crucible', 58], ['cinders_ingots', 63], ['cinders_tree', 76], ['cinders_anvil', 87], ['cinders_crucible', 100], ['cinders_rack', 106],
      ['cinders_chain', 24, { y: 12, h: 9 }], ['cinders_chain', 46, { y: 10, h: 7 }], ['cinders_chain', 72, { y: 14, h: 11 }], ['cinders_chain', 95, { y: 13, h: 10 }]],
    lamps: [['glow', 31, 0, 60, SLAG], ['glow', 70, 0, 60, SLAG], ['glow', 58, 2, 60, SLAG], ['glow', 100, 2, 60, SLAG], ['glow', 76, 2, 70, SLAG], ['forge', 33, 0]] },
  last_smithy: { feats: [['mound', 9, 5, 1]],
    props: [['cinders_tree', 15], ['cinders_rack', 21], ['cinders_anvil', 31], ['cinders_bellows', 38], ['cinders_ingots', 44], ['cinders_crucible', 55], ['cinders_rack', 64]],
    lamps: [['forge', 26, 0], ['glow', 15, 2, 70, SLAG], ['glow', 55, 2, 60, SLAG]] },
  ember_aqueduct: { feats: [['pit', 20, 4, 2, '~'], ['mound', 28, 9, 2], ['pit', 46, 5, 2, '~'], ['pit', 64, 4, 2, '~'], ['mound', 73, 10, 2]],
    props: [['cinders_pipe', 14], ['cinders_tree', 32], ['cinders_statue', 40], ['cinders_crucible', 53], ['cinders_pipe', 58], ['cinders_statue', 70, { flip: true }], ['cinders_tree', 78, { v: 1 }], ['cinders_statue', 88], ['cinders_ingots', 97], ['cinders_gate', 108]],
    lamps: [['glow', 22, 0, 60, SLAG], ['glow', 48, 0, 60, SLAG], ['glow', 66, 0, 60, SLAG], ['glow', 32, 2, 60, SLAG], ['glow', 78, 2, 60, SLAG], ['glow', 53, 2, 60, SLAG]] },
  cinder_throne: { props: [['cinders_anvil', 14], ['cinders_crucible', 22], ['cinders_statue', 34], ['cinders_statue', 44, { flip: true }], ['cinders_throne', 59], ['cinders_crucible', 72],
      ['cinders_chain', 28, { y: 12, h: 10 }], ['cinders_chain', 50, { y: 9, h: 7 }], ['cinders_chain', 68, { y: 12, h: 10 }]],
    lamps: [['glow', 22, 2, 60, SLAG], ['glow', 72, 2, 60, SLAG], ['glow', 49, 9, 150, '#ffad62']] },
};

/** Shape the floor, then put every grounded thing back on the ground it now has. */
function dress(r: RoomDef) {
  const d = DRESS[r.id];
  if (!d) return;
  const f = r.h - 4, g = r.rows.map((row) => row.split(''));
  for (const [kind, x, w, n, fill] of d.feats ?? []) {
    for (let i = 0; i < w; i++) {
      const c = x + i, step = Math.min(n, i + 1, w - i);
      if (kind === 'mound') for (let y = f - step; y < f; y++) g[y][c] = '#';
      else if (kind === 'hang') for (let y = 2; y < 2 + step + 1; y++) g[y][c] = '#';
      else for (let y = f; y < f + n; y++) g[y][c] = fill === 'w' ? 'w' : fill && y === f + n - 1 ? fill : '.';
    }
  }
  r.rows = g.map((row) => row.join(''));
  const ground = (x: number) => {
    const c = Math.max(0, Math.min(r.w - 1, Math.round(x)));
    for (let y = f - 6; y < r.h; y++) if (g[y][c] === '#') return y;
    return f;
  };
  for (const e of r.ents) if ('y' in e && e.y === f && e.t !== 'chest' && e.t !== 'lore' && e.t !== 'trigger' && e.t !== 'boss') e.y = ground(e.x);
  for (const [k, x, o] of d.props) r.ents.push({ t: 'decor', k, x, y: o?.y ?? ground(x), v: o?.v, w: o?.w, h: o?.h, flip: o?.flip, fg: o?.fg });
  for (const [k, x, lift, rad, c] of d.lamps ?? []) r.ents.push({ t: 'light', k, x, y: ground(x) - lift, r: rad, c });
}

function makeRooms(c:FallenChapter):RoomDef[] {
  const theme=c.biome, floor=24, width=104;
  const room=(id:string,name:string,w=width,f=floor,interior=false):RoomDef=>{
    const b=new MapBuilder(w,f+4).rect(0,f,w,4);if(interior)b.rect(0,0,w,2);
    return {id,name,region:c.title,biome:theme,music:theme,dark:interior?.36:.23,interior,weather:c.n===9?'embers':c.n===7&&!interior?'ash':'motes',seed:c.n*100+id.length,map:{x:0,y:c.n*2},w,h:b.h,rows:b.rows(),spawns:{start:{x:6,y:f},left:{x:4,y:f},right:{x:w-4,y:f,face:-1}},exits:[],ents:[]};
  };
  const hub=room(c.hub,c.n===9?'Ashwatch Refuge':c.n===7?'Thawgate Outpost':'Lantern Quarantine',76,20);
  hub.spawns.altar={x:9,y:20};hub.rows=hub.rows.map((r,y)=>y<20?'##'+r.slice(2):r);
  hub.ents=[{t:'altar',id:c.hub,x:9,y:20},
    ...(['azriel','mara','tobiah','ilan','dov'] as NpcKind[]).map((k,i):EntDef=>({t:'npc',k,x:[25,32,43,56,66][i],y:20})),{t:'npc',k:c.rescue,x:49,y:20,cond:`ch${c.n}_rescued`},
    {t:'hint',id:`ch${c.n}_help`,x:18,w:25,text:c.intro[1]}];
  const trail=room(c.trail,c.n===9?'The Slag Procession':c.n===7?'The Riftwood Trail':'Greenfall Marsh');
  const depths=room(c.depths,c.n===9?'The Bellows Foundry':c.n===7?'The Fang Pits':'The Sporeworks',112,27,true);
  const side=room(c.side,c.n===9?'The Last Smithy':c.n===7?'The Unhunted Grove':'The Silent Infirmary',68,24);
  const ridge=room(c.ridge,c.n===9?'The Ember Aqueduct':c.n===7?'Clawscar Ridge':'The Pestilent Causeway',110,25);
  const arena=room(c.arena,c.n===9?'The Throne of Cinders':c.n===7?'The Throne of Fangs':'The Throne of the Swarm',80,23,true);
  const route=[hub,trail,depths,ridge,arena];
  let mapX=0;for(const r of route){r.map={x:mapX,y:c.n*2};mapX+=r.w/16+.3;}
  side.map={x:depths.map.x+2.5,y:c.n*2-2.2};
  for(let i=0;i<route.length-1;i++){
    const a=route[i],b=route[i+1],fa=a.h-4,fb=b.h-4;
    a.exits.push({x:a.w-1,y:fa-7,w:1,h:7,to:b.id,spawn:'left',cond:b===arena?`ch${c.n}_boundary_open`:undefined});
    b.exits.push({x:0,y:fb-7,w:1,h:7,to:a.id,spawn:'right'});
  }
  depths.exits.push({x:48,y:12,w:5,h:4,to:side.id,spawn:'left'});side.exits.push({x:0,y:17,w:1,h:7,to:depths.id,spawn:'side'});
  // Return below and beside the upper door so it cannot immediately re-enter.
  depths.spawns.side={x:42,y:19};
  const addPlatforms=(r:RoomDef,ps:number[][])=>{const b=new MapBuilder(r.w,r.h);b.g=r.rows.map(x=>x.split(''));for(const[x,y,w]of ps)b.plat(x,y,w);r.rows=b.rows();};
  addPlatforms(trail,[[18,19,11],[33,13,10],[43,18,11],[66,17,10]]);
  addPlatforms(depths,[[20,22,12],[34,19,11],[47,16,11],[63,21,10],[83,18,10]]);
  addPlatforms(side,[[17,19,12],[31,17,11],[45,12,10]]);addPlatforms(ridge,[[23,20,11],[40,19,12],[59,16,10],[72,12,10],[86,18,9]]);
  addPlatforms(arena,c.n===9?[[13,18,9],[57,18,9]]:[[15,17,8],[54,17,8]]);
  if(c.n===9){addPlatforms(trail,[[7,21,7],[86,19,8]]);addPlatforms(ridge,[[12,22,6],[94,21,7]]);}
  for(const [i,r]of [trail,depths,ridge].entries()){
    const f=r.h-4;r.ents.push(foe(c.n===9?'lion':c.n===7?'hound':'drone',24,f),foe(c.n===9?'undying':c.n===7?'knight':'soldier',55,f),foe(c.n===9?'priest':c.n===7?'archer':'priest',78,f));
    if(i<2){const o=c.objectives[i];if(c.n===7)r.ents.push(foe(i?'lion':'knight',94,f,o.id,o.flag));else r.ents.push({t:'shrine',id:o.id,grants:o.id,x:97,y:f},foe(c.n===9?'bulwark':'soldier',94,f));}
  }
  depths.spawns.altar={x:10,y:27};depths.ents.push({t:'altar',id:depths.id,x:10,y:27},{t:'light',k:'brazier',x:10,y:27});
  ridge.spawns.altar={x:9,y:25};ridge.ents.push({t:'altar',id:ridge.id,x:9,y:25},{t:'light',k:'brazier',x:9,y:25},{t:'trigger',id:`ch${c.n}_gate`,x:98,y:18,w:8,h:7});
  side.ents.push(foe(c.n===9?'lion':c.n===7?'hound':'drone',24,24),foe(c.n===9?'knight':c.n===7?'lion':'soldier',49,24),{t:'npc',k:c.rescue,x:60,y:24,ncond:`ch${c.n}_rescued`},{t:'lore',id:c.record,x:48,y:12});
  trail.ents.push({t:'chest',id:c.caches[0],secret:true,x:38,y:13,loot:[{item:c.n===9?'quencher_grips':c.n===7?'trailwarden_grips':'antidote_greaves',rarity:4},{silver:900}]});
  side.ents.push({t:'chest',id:c.caches[1],secret:true,x:51,y:12,loot:[{item:c.n===9?'ashwatch_plate':c.n===7?'moonpath_boots':'quarantine_mantle',rarity:4},{mat:'radiant_core',n:4}]});
  ridge.ents.push({t:'chest',id:c.caches[2],secret:true,x:76,y:12,loot:[{silver:1200},{mat:'covenant_fragment',n:6}]},{t:'hint',id:`ch${c.n}_boss_hint`,x:84,w:18,text:c.tips});
  arena.spawns.left=arena.spawns.altar={x:9,y:23};arena.rows=arena.rows.map((r,y)=>y>=3&&y<23?r.slice(0,3)+'G'+r.slice(4,78)+'##':r);
  arena.ents.push({t:'boss',k:c.boss,x:50,y:23},{t:'trigger',id:c.boss+'_start',x:23,y:14,w:10,h:9});
  const rooms=[hub,trail,depths,side,ridge,arena];
  for(const r of rooms)dress(r);
  return rooms;
}
export const FALLEN_ROOMS=FALLEN_CHAPTERS.flatMap(makeRooms);

/** Shelter is reachable on foot, even at maximum gauntlet tempo, without a particular skill loadout. */
export function cleansingBeacon(playerX:number,bossX:number,width:number){
  const side=playerX<bossX?-1:1;return Math.max(160,Math.min(width-160,playerX+side*140));
}
