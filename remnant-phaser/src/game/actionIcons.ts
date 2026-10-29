// A pixel-art icon for every action button, drawn so each shows what the move is:
// his sword or her drawn bow for Strike, a winged boot for Jump, a dash for
// Dodge, a shield turning a blade for Parry, the Mantle's hood or the Wings for
// the transformation. Same 16x16 format and painter as the ability icons.
import type Phaser from 'phaser';
import { paintIcon, type PixelArt } from './abilityIcons';
import type { PlayableHero } from './style';

const ART: Record<string, PixelArt> = {
  // Elior's Strike: a sword cutting down, its trail below the blade.
  attack_elior: { pal: { a: '#ffd27a', b: '#fff6dc', c: '#8a5a2a', w: '#fff1c4' }, rows: [
    '............obo.',
    '...........obbo.',
    '..........obao..',
    '.........obao.w.',
    '........obao..w.',
    '.......obao..w..',
    '......obao..ww..',
    '.....obao..ww...',
    '.oo.obao.ww.....',
    '.occoaowww......',
    '..occo..........',
    '.occoco.........',
    'occo.oo.........',
    'oco.............',
    '.o..............',
    '................'] },
  // Tirzah's Strike: a drawn recurve, an arrow nocked and the string pulled.
  attack_tirzah: { pal: { a: '#c88a4a', b: '#f2d29a', s: '#e8d4a1', c: '#d8c8a8', t: '#fff1c4', f: '#a6efdc' }, rows: [
    '.....oo.........',
    '....s.oaoo......',
    '....s...oaao....',
    '...s......oao...',
    '...s.......oao..',
    '..s.........oao.',
    '..s.........oabo',
    'ffcccccccccccbtt',
    '..s.........oabo',
    '..s.........oao.',
    '...s.......oao..',
    '...s......oao...',
    '....s...oaao....',
    '....s.oaoo......',
    '.....oo.........',
    '................'] },
  // Jump: a winged boot rising.
  jump: { pal: { a: '#c9a06a', b: '#8a6a44', w: '#fff6dc', g: '#e2c48a', u: '#fff1c4' }, rows: [
    '.......u........',
    '......uuu.......',
    '.....u.u.u......',
    '.......u........',
    '.ww....u........',
    'owwwo...........',
    '.owwwo.oooo.....',
    '..owwwoaaao.....',
    '...owwoaaao.....',
    '......oaaao.....',
    '......oaaao.....',
    '......oaaaoo....',
    '......oaaaaaoo..',
    '......obbbbbbbo.',
    '......ooooooooo.',
    '................'] },
  // Dodge: a body tumbling forward with speed lines behind.
  dodge: { pal: { a: '#9fd8ff', b: '#e8f6ff', l: '#6fa8d8' }, rows: [
    '................',
    '..........ooo...',
    '.........oaaao..',
    '.........oabao..',
    '..........oao...',
    'lll....ooooaoo..',
    '......oaaaaaaao.',
    '.llll.oabaaoaao.',
    '.......oaaao.oo.',
    'lll....oaaao....',
    '......oaaoaao...',
    '.llll.oao.oaao..',
    '.....oao...oaao.',
    '....oao.....ooo.',
    '....oo..........',
    '................'] },
  // Parry: a shield turning a blade, sparks at the meeting.
  parry: { pal: { a: '#7fb3e8', b: '#d8ecff', g: '#e2b85a', s: '#fff1c4', w: '#e3dfdb' }, rows: [
    '..........s.....',
    '........s.s.s...',
    '.........s.s..ow',
    '..ooooooo.s..ow.',
    '.oaaagaaao..ow..',
    '.oabbgbbao.ow...',
    '.oabbgbbaoow....',
    '.ogggggggo......',
    '.oabbgbbao......',
    '.oabbgbbao......',
    '..oabgbao.......',
    '..oaagaao.......',
    '...oagao........',
    '....oao.........',
    '.....o..........',
    '................'] },
  // Balm: a stoppered flask of red balm with a glint.
  heal: { pal: { a: '#d8384a', b: '#ff8a8a', c: '#8a5a2a', g: '#e8e4dc', w: '#fff6dc' }, rows: [
    '................',
    '......oooo......',
    '......occo......',
    '......occo......',
    '.......gg.......',
    '......oggo......',
    '.....og..go.....',
    '....og....go....',
    '...oaaaaaaaao...',
    '...oabwaaaaao...',
    '...oabaaaaaao...',
    '...oaaaaaaaao...',
    '...oaaaaaaaao...',
    '....oaaaaaao....',
    '.....oooooo.....',
    '................'] },
  // Interact: an open hand.
  interact: { pal: { a: '#e8c8a0', b: '#c89a70' }, rows: [
    '................',
    '.....o.o........',
    '....oaoaoo......',
    '....oaoaoao.....',
    '..o.oaoaoao.....',
    '.oaooaoaoao.....',
    '.oaaoaaaaao.....',
    '..oaaaaaaao.....',
    '..oaaaaaaao.....',
    '...oaaaaabo.....',
    '...oaaaaabo.....',
    '....oaaabo......',
    '....oaaabo......',
    '....ooooo.......',
    '................',
    '................'] },
  // Echoes: a cleansed battle-imprint, a pale figure of light.
  echo: { pal: { a: '#a6efdc', b: '#e8fff8', c: '#5fb8a0' }, rows: [
    '................',
    '.......ooo......',
    '......oaaao.....',
    '......oabao.....',
    '......oaaao.....',
    '.......oao......',
    '....oooaaaooo...',
    '...oaaaabaaaao..',
    '...oao.aba.oao..',
    '....o..aaa..o...',
    '.......aaa......',
    '......caaac.....',
    '.....c.aaa.c....',
    '.....c..a..c....',
    '......c...c.....',
    '................'] },
  // Switch: two heroes, two arrows turning about them.
  switch: { pal: { a: '#ffd27a', b: '#a6efdc', w: '#fff6dc' }, rows: [
    '................',
    '.....wwwwww.....',
    '...ww......ww...',
    '..w..........w..',
    '..w........wwwww',
    '............www.',
    '..oo....oo...w..',
    '.oaao..obbo.....',
    '.oaao..obbo.....',
    '..oo....oo......',
    '.oaaao.obbbo....',
    '..w.............',
    '.www............',
    'wwwww........w..',
    '..w.........w...',
    '...wwwwwwwww....'] },
  // Shadow Mantle: a hood of shadow, violet eyes in the dark of it.
  transform_elior: { pal: { a: '#3a2a52', b: '#5a4078', e: '#d5a1ff', w: '#f0dcff' }, rows: [
    '......oooo......',
    '....oobbbboo....',
    '...obbbaabbbo...',
    '..obbaaaaaabbo..',
    '..obaaaaaaaabo..',
    '.obaaaaaaaaaabo.',
    '.obaaewaaeweabo.',
    '.obaaeeaaeeaabo.',
    '.obaaaaaaaaaabo.',
    '.obaaaaaaaaaabo.',
    'obbaaaaaaaaaabbo',
    'obaaaaaaaaaaaabo',
    'obaaaaaaaaaaaabo',
    'obbbaaaaaaaabbbo',
    '.oooooooooooooo.',
    '................'] },
  // Wings of the Morning: wings of light about a dawn star.
  transform_tirzah: { pal: { a: '#ffd27a', b: '#fff6dc', c: '#e2a84a', s: '#ffffff' }, rows: [
    '................',
    '.oo..........oo.',
    'obao........oabo',
    'obbao..s...oabbo',
    'oabbao.s..oabbao',
    '.oabbaosssoabbao',
    '.oaabbossoabbao.',
    '..oaabos.oabaao.',
    '..ocaabooobaaco.',
    '...ocaaoooaaco..',
    '....occo.occo...',
    '.....oo...oo....',
    '................',
    '................',
    '................',
    '................'] },
  // Super: a burst of covenant light.
  ultimate: { pal: { a: '#ffd27a', b: '#fff6dc', c: '#e2a84a' }, rows: [
    '.......a........',
    '.......a........',
    '..a....a....a...',
    '...a..aba..a....',
    '....a.aba.a.....',
    '.....abbba......',
    '.aaaabbbbbaaaa..',
    '.....abbba......',
    '....a.aba.a.....',
    '...a..aba..a....',
    '..a....a....a...',
    '.......a........',
    '.......a........',
    '................',
    '................',
    '................'] },
  // Sub-weapon: a spinning throwing axe.
  sub: { pal: { a: '#c0c4cc', b: '#eef0f4', c: '#8a5a2a' }, rows: [
    '................',
    '.....ooo........',
    '....oabbo.......',
    '...oabbbbo......',
    '...oabbbbbo.....',
    '...oaabbbbco....',
    '....oaaaacco....',
    '.....oooocco....',
    '.........occo...',
    '..........occo..',
    '...........occo.',
    '............oco.',
    '.............o..',
    '................',
    '................',
    '................'] },
};

/** The texture for an action's button, for the hero in play (Strike and the transformation differ by hero). */
export function actionIconKey(action: string, hero: PlayableHero) {
  const name = action === 'attack' || action === 'transform' ? `${action}_${hero}` : action;
  return ART[name] ? 'action-' + name : null;
}

export function bakeActionIcons(sc: Phaser.Scene) {
  for (const [name, art] of Object.entries(ART)) paintIcon(sc, 'action-' + name, art);
}

/** For the checks: every icon is a 16x16 picture using only its own palette. */
export function actionIconProblems() {
  const out: string[] = [];
  for (const [id, { pal, rows }] of Object.entries(ART)) {
    if (rows.length !== 16) out.push(`${id}: ${rows.length} rows`);
    rows.forEach((r, i) => { if (r.length !== 16) out.push(`${id} row ${i}: ${r.length} wide`); for (const ch of r) if (ch !== '.' && ch !== 'o' && !(ch in pal)) out.push(`${id} row ${i}: '${ch}'`); });
  }
  return out;
}
