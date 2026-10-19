import { fallenObjective } from './fallenChapters';
// Interactables: NPCs, chests, altars, inscription stones, relic shrines,
// pickups and loot drops.

import { Entity } from './entity';
import { moveBody } from './physics';
import { Animator, solve, newJoints, BASE_POSE, type Joints, type Pose, type Clip, type RigDims } from '../render/skeleton';
import { drawHumanoid, type HumanStyle } from '../render/actors';
import { glow, rgba, poly, circle, ellipse, limb, type Ctx } from '../render/draw';
import { fx, PK } from '../render/fx';
import { sfx } from '../audio/audio';
import { G } from './ctx';
import { approach, rand, clamp, easeOutCubic } from '../core/math';
import { DIMS as PDIMS } from './player';
import type { NpcKind, Loot } from './tiles';
import { lighting } from '../render/lighting';
import { ITEMS, RARITY_COLORS } from './data';
import { flame } from '../render/environment';

export interface Interactable {
  prompt(): string;
  interact(): void;
  range: number;
}

// ---------------------------------------------------------------- NPCs

const NPC_BASE: Pose = { ...BASE_POSE, lean: 0.04, bUA: -0.15, bFA: 0.3, fUA: 0.15, fFA: 0.35, wpn: 0.2 };
const ARMS_CROSSED: Pose = { ...NPC_BASE, fUA: 1.0, fFA: 1.9, bUA: 0.95, bFA: 2.0, wpn: 0 };
const BOOK: Pose = { ...NPC_BASE, fUA: 0.9, fFA: 1.2, bUA: 0.8, bFA: 1.3 };
const SPEAR_REST: Pose = { ...NPC_BASE, fUA: 0.3, fFA: 0.4, wpn: 1.2 };
const HAMMER: Pose = { ...NPC_BASE, fUA: 0.25, fFA: 0.3, wpn: 0.1, lean: 0.08 };

export const NPC_DEFS: Record<NpcKind, { name: string; title: string; style: HumanStyle; base: Pose; dims: RigDims; scale: number }> = {
  azriel: {
    name: 'Captain Azriel', title: 'Captain of the Hearthward Watch', base: ARMS_CROSSED, dims: { ...PDIMS, torso: 13.5, thigh: 8.6, shin: 8.6 }, scale: 1.05,
    style: {
      skin: '#c9986f', hair: '#8e8a86', hairKind: 'short', beard: '#a09a94', coat: '#5a1a1e', coatDark: '#3e1014', skirt: 11, trim: '#c9a04a',
      pants: '#2c2622', boots: '#2a221c', glove: '#3a2a1e', belt: '#2a1c12', plate: { c: '#6e6c74', dark: '#46444c', hi: '#c8c8d0', tier: 2 },
      helm: 'none', eye: '#fff', eyeGlow: 0, outline: '#0a070c', weapon: 'none', offhand: 'none', bulk: 1.15, scarf: '#5a1a1e',
    },
  },
  mara: {
    name: 'Mara', title: 'Former Royal Archivist', base: BOOK, dims: { ...PDIMS, torso: 12, thigh: 7.8, shin: 7.8 }, scale: 0.97,
    style: {
      skin: '#d9ab88', hair: '#5a2a1a', hairKind: 'braid', coat: '#1e3a3e', coatDark: '#142a2e', skirt: 15, trim: '#c9a04a',
      pants: '#1e3a3e', boots: '#2a1e18', glove: '#d9ab88', belt: '#5a3a1a', plate: null, helm: 'none', eye: '#fff', eyeGlow: 0,
      outline: '#0a070c', weapon: 'book', offhand: 'none', bulk: 0.92,
    },
  },
  tobiah: {
    name: 'Tobiah', title: 'Watchman of Hearthward', base: SPEAR_REST, dims: { ...PDIMS, torso: 11.5, thigh: 7.6, shin: 7.6 }, scale: 0.94,
    style: {
      skin: '#e6b896', hair: '#a07a3a', hairKind: 'short', coat: '#4a3a2a', coatDark: '#33281c', skirt: 8, trim: null,
      pants: '#3a3028', boots: '#2e241c', glove: '#5a4430', belt: '#2a1e14', plate: null, helm: 'oversized', helmColor: '#7a776f',
      eye: '#fff', eyeGlow: 0, outline: '#0a070c', weapon: 'spear', weaponColor: '#9a9a9a', offhand: 'none', bulk: 0.95, scarf: '#6a5a2a',
    },
  },
  ilan: {
    name: 'Ilan', title: 'Wandering Merchant', base: NPC_BASE, dims: { ...PDIMS }, scale: 1,
    style: {
      skin: '#b98a64', hair: null, hairKind: 'none', beard: '#3a2a20', coat: '#3a2a4a', coatDark: '#281c34', skirt: 13, trim: '#a07a3a',
      pants: '#2a2230', boots: '#2a1e18', glove: '#4a3424', belt: '#4a2a1a', plate: null, helm: 'hood_up', helmColor: '#2e2238',
      eye: '#fff', eyeGlow: 0, outline: '#0a070c', weapon: 'none', offhand: 'lantern', bulk: 1.05,
    },
  },
  dov: {
    name: 'Dov', title: 'Smith of Hearthward', base: HAMMER, dims: { ...PDIMS, torso: 13, thigh: 8, shin: 8 }, scale: 1.08,
    style: {
      skin: '#b07a56', hair: null, hairKind: 'none', beard: '#1a1210', coat: '#5a3a24', coatDark: '#3e2818', skirt: 10, trim: null,
      pants: '#2a2420', boots: '#221a14', glove: '#3a2a1e', belt: '#2a1a10', plate: null, helm: 'none', eye: '#fff', eyeGlow: 0,
      outline: '#0a070c', weapon: 'hammer', offhand: 'none', bulk: 1.3,
    },
  },
  regent: {
    name: 'The Masked Regent', title: 'Voice of the Sovereign\'s Peace', base: { ...NPC_BASE, fUA: 0.5, fFA: 1.2, bUA: 0.4, bFA: 1.3 }, dims: { ...PDIMS, torso: 14, thigh: 9, shin: 9 }, scale: 1.12,
    style: {
      skin: '#d8d0c4', hair: null, hairKind: 'none', coat: '#141018', coatDark: '#0c0a10', skirt: 18, trim: '#7a3aa0',
      pants: '#141018', boots: '#0c0a10', glove: '#1e1824', belt: null, plate: null, helm: 'mask', eye: '#fff', eyeGlow: 0,
      outline: '#050308', weapon: 'staff', offhand: 'none', bulk: 1.05,
    },
  },
  satrap: {
    name: 'The Satrap of Dura', title: 'Keeper of the Image', base: { ...NPC_BASE, fUA: 0.55, fFA: 1.1, bUA: 0.45, bFA: 1.2 }, dims: { ...PDIMS, torso: 13.5, thigh: 8.6, shin: 8.6 }, scale: 1.1,
    style: {
      skin: '#b07a56', hair: '#141010', hairKind: 'long', beard: '#141010', coat: '#7a5a14', coatDark: '#4a3608', skirt: 18, trim: '#f2d68e',
      pants: '#3a2a10', boots: '#2a1e0c', glove: '#b07a56', belt: '#c9a04a', plate: null, helm: 'crown', helmColor: '#d8b04a',
      eye: '#ffcf6b', eyeGlow: 0.6, outline: '#0a0604', weapon: 'staff', offhand: 'none', bulk: 1.1,
    },
  },
  ezra: {
    name: 'Ezra', title: 'Captive of Judah', base: NPC_BASE, dims: { ...PDIMS, torso: 12.5 }, scale: 1,
    style: {
      skin: '#c48e66', hair: '#2a1a12', hairKind: 'short', beard: '#2a1a12', coat: '#8a7a5a', coatDark: '#5a4e3a', skirt: 12, trim: null,
      pants: '#5a4e3a', boots: '#3a2e20', glove: '#c48e66', belt: '#4a3a2a', plate: null, helm: 'none', eye: '#fff', eyeGlow: 0,
      outline: '#0a070c', weapon: 'none', offhand: 'none', bulk: 1,
    },
  },
  talia: {
    name: 'Talia', title: 'Captive of Judah', base: NPC_BASE, dims: { ...PDIMS, torso: 11.8, thigh: 7.8, shin: 7.8 }, scale: 0.95,
    style: {
      skin: '#d6a07a', hair: '#1a1210', hairKind: 'long', coat: '#6a7a8a', coatDark: '#4a5664', skirt: 16, trim: null,
      pants: '#4a5664', boots: '#2e241c', glove: '#d6a07a', belt: '#3a2e24', plate: null, helm: 'none', eye: '#fff', eyeGlow: 0,
      outline: '#0a070c', weapon: 'none', offhand: 'none', bulk: 0.92,
    },
  },
  barak: {
    name: 'Barak', title: 'Captive of Judah', base: { ...NPC_BASE, lean: 0.12 }, dims: { ...PDIMS, torso: 12.5 }, scale: 0.98,
    style: {
      skin: '#b88660', hair: '#d8d4cc', hairKind: 'short', beard: '#e0dcd4', coat: '#5a4a3a', coatDark: '#3e3228', skirt: 14, trim: null,
      pants: '#3e3228', boots: '#2a2018', glove: '#b88660', belt: '#2a2018', plate: null, helm: 'none', eye: '#fff', eyeGlow: 0,
      outline: '#0a070c', weapon: 'staff', offhand: 'none', bulk: 0.95,
    },
  },
  hanan: {
    name: 'Hanan', title: 'Exile and Scribe', base: { ...NPC_BASE, fUA: 0.5, fFA: 1.25 }, dims: { ...PDIMS, torso: 12 }, scale: 0.97,
    style: {
      skin: '#b98a64', hair: '#d8d4cc', hairKind: 'long', beard: '#e4e0d8', coat: '#3a4a6a', coatDark: '#24304a', skirt: 20, trim: '#c9b27a',
      pants: '#24304a', boots: '#2a2018', glove: '#b98a64', belt: '#6a5a3a', plate: null, helm: 'none', eye: '#fff', eyeGlow: 0,
      outline: '#0a070c', weapon: 'staff', offhand: 'none', bulk: 0.95,
    },
  },
  feastlord: {
    name: 'The Lord of the Feast', title: 'Regent of Babylon', base: { ...NPC_BASE, fUA: 0.55, fFA: 1.15, bUA: 0.45, bFA: 1.2 }, dims: { ...PDIMS, torso: 13.5, thigh: 8.6, shin: 8.6 }, scale: 1.12,
    style: {
      skin: '#a8724e', hair: '#0e0a0a', hairKind: 'braid', beard: '#0e0a0a', coat: '#4a1a5a', coatDark: '#2a0c34', skirt: 20, trim: '#f2d68e',
      pants: '#2a0c34', boots: '#1e1208', glove: '#a8724e', belt: '#d8b04a', plate: null, helm: 'crown', helmColor: '#e8c25a',
      eye: '#ffcf6b', eyeGlow: 0.4, outline: '#0a0406', weapon: 'none', offhand: 'none', bulk: 1.15,
    },
  },
  arshan: {
    name: 'Captain Arshan', title: 'Of the King\'s Guard at Shushan', base: SPEAR_REST, dims: { ...PDIMS, torso: 13.5, thigh: 8.8, shin: 8.8 }, scale: 1.06,
    style: {
      skin: '#b07a52', hair: '#120c0a', hairKind: 'braid', beard: '#120c0a', coat: '#2a4a8a', coatDark: '#16285a', skirt: 16, trim: '#e8c25a',
      pants: '#5a2a3a', boots: '#2a1c12', glove: '#b07a52', belt: '#d8b04a', plate: { c: '#8a6a3a', dark: '#5a4426', hi: '#e8c88a', tier: 1 },
      helm: 'cap', helmColor: '#e8dcc0', eye: '#fff', eyeGlow: 0, outline: '#0a070c', weapon: 'spear', weaponColor: '#c8b48a', offhand: 'none', bulk: 1.1,
    },
  },
  // The fallen princes speak in the dialogue box; their portraits are drawn from these.
  storm_prince: {
    name: 'The Prince of the Storm', title: 'Prince of the Power of the Air', base: { ...NPC_BASE, fUA: 0.7, fFA: 0.9, bUA: -0.6, bFA: 0.4 }, dims: { ...PDIMS, torso: 14.5, thigh: 9.4, shin: 9.4 }, scale: 1.3,
    style: {
      skin: '#6a7a9a', hair: '#dce6ff', hairKind: 'long', coat: '#1e2a4a', coatDark: '#0e1428', skirt: 18, trim: '#bcd4ff',
      pants: '#0e1428', boots: '#141a2a', glove: '#2a3450', belt: '#bcd4ff', plate: { c: '#3a4a6e', dark: '#1a2238', hi: '#dce8ff', tier: 2 },
      helm: 'crown', helmColor: '#cfe0ff', eye: '#e6f2ff', eyeGlow: 1, iris: '#9ac8ff', outline: '#04060c', weapon: 'none', offhand: 'none', bulk: 1.2, crack: '#9ac8ff',
    },
  },
  persia_prince: {
    name: 'The Prince of Persia', title: 'Prince of the Kingdom of Persia', base: { ...NPC_BASE, fUA: 0.3, fFA: 0.4, wpn: 1.25 }, dims: { ...PDIMS, torso: 15, thigh: 9.8, shin: 9.8 }, scale: 1.38,
    style: {
      skin: '#8a6a4a', hair: '#0a0606', hairKind: 'braid', beard: '#0a0606', coat: '#3a1440', coatDark: '#1e0822', skirt: 20, trim: '#ffcf6b',
      pants: '#1e0822', boots: '#1a1008', glove: '#2a1a10', belt: '#e8b84a', plate: { c: '#c89a3a', dark: '#7a5a1e', hi: '#ffe6a0', tier: 3 },
      helm: 'crown', helmColor: '#ffcf6b', eye: '#ffe08a', eyeGlow: 1, iris: '#ff9a2a', outline: '#0a0406', weapon: 'spear', weaponColor: '#e8c25a', weaponGlow: '#ffb03a', weaponGlowAmt: 0.6,
      offhand: 'none', bulk: 1.3, crest: '#ffcf6b', crack: '#ffb03a',
    },
  },
  marshal: {
    name: 'The Crimson Marshal', title: 'Commander of the Tower', base: { ...NPC_BASE, fUA: 0.65, fFA: 0.6, bUA: 0.7, bFA: 0.75, wpn: 1.35 }, dims: { ...PDIMS, torso: 14, thigh: 9.2, shin: 9.2 }, scale: 1.3,
    style: {
      skin: '#3a3036', hair: null, hairKind: 'none', coat: '#7a1218', coatDark: '#4a0a0e', skirt: 13, trim: '#c9a04a',
      pants: '#1a1216', boots: '#1e1418', glove: '#26181c', belt: '#1a1214',
      plate: { c: '#2a1c20', dark: '#140c0e', hi: '#b04048', tier: 2 }, helm: 'visor', helmColor: '#24161a', helmTrim: '#c9a04a',
      eye: '#ff2a3a', eyeGlow: 1, outline: '#0a0406', weapon: 'greatsword', weaponColor: '#9a8a90', weaponGlow: '#ff2a3a', weaponGlowAmt: 0.5,
      offhand: 'none', crack: '#ff5a3a', bulk: 1.3, crest: '#ff3a3a',
    },
  },
};

export class Npc extends Entity implements Interactable {
  kind: NpcKind;
  anim: Animator;
  pose: Pose = { ...BASE_POSE };
  j: Joints = newJoints();
  range = 34;
  talkT = 0;
  walkTo: number | null = null;
  ghost = false;
  baseFace: number;

  constructor(kind: NpcKind, x: number, y: number, face = 1) {
    super(x, y, 12, 34);
    this.kind = kind;
    this.face = face;
    this.baseFace = face;
    const def = NPC_DEFS[kind];
    const idle: Clip = { dur: 3.2, loop: true, base: def.base, fn: (u) => ({ lean: def.base.lean + Math.sin(u * Math.PI * 2) * 0.02, y: Math.sin(u * Math.PI * 2) * 0.3, head: Math.sin(u * Math.PI * 4) * 0.03 }) };
    const walk: Clip = { dur: 0.7, loop: true, base: def.base, steps: [0.25, 0.75], fn: (u) => { const p = u * Math.PI * 2, s = Math.sin(p); return { lean: 0.12, fTh: 0.6 * s, fSh: -0.2 - 0.8 * Math.max(0, Math.cos(p - 0.5)), bTh: -0.6 * s, bSh: -0.2 - 0.8 * Math.max(0, Math.cos(p + Math.PI - 0.5)) }; } };
    const talk: Clip = { dur: 1.2, loop: true, base: def.base, fn: (u) => ({ lean: def.base.lean + Math.sin(u * Math.PI * 2) * 0.03, head: -0.05 + Math.sin(u * Math.PI * 4) * 0.05, fUA: def.base.fUA + Math.sin(u * Math.PI * 2) * 0.12 }) };
    const kneel: Clip = { dur: 0.5, base: def.base, keys: [{ t: 0, p: {} }, { t: 1, p: { fTh: 1.4, fSh: -2.4, bTh: -0.15, bSh: -1.9, lean: 0.3, head: 0.3 }, ease: easeOutCubic }] };
    this.anim = new Animator({ idle, walk, talk, kneel }, def.base);
    this.anim.play('idle', 0);
    this.anim.time = rand(0, 3);
    this.anim.onStep = () => sfx('step', { vol: 0.25, pan: G.world.pan(this.x), gap: 80 });
    this.layer = 4;
    this.name = def.name;
    this.ghost = kind === 'regent';
  }

  prompt() {
    return 'Talk';
  }
  interact() {
    G.world.story.talk(this);
  }

  update(dt: number) {
    const p = G.world.player;
    const b = this.body;
    if (this.walkTo !== null) {
      const dx = this.walkTo - this.x;
      if (Math.abs(dx) < 2) {
        this.walkTo = null;
        b.vx = 0;
      } else {
        this.face = Math.sign(dx);
        b.vx = this.face * 70;
      }
      this.anim.play('walk', 0.15);
    } else {
      b.vx = approach(b.vx, 0, 600 * dt);
      if (this.talkT > 0) {
        this.talkT -= dt;
        this.anim.play('talk', 0.2);
      } else if (this.anim.name !== 'kneel') this.anim.play('idle', 0.25);
      if (Math.abs(p.x - this.x) < 90 && Math.abs(p.y - this.y) < 40) this.face = p.x > this.x ? 1 : -1;
      else this.face = this.baseFace;
    }
    if (!this.ghost) {
      b.vy = Math.min(560, b.vy + 1500 * dt);
      moveBody(b, dt, G.world.grid, G.world.solid);
    }
    this.anim.update(dt);
    this.pose = this.anim.sample();
    solve(this.pose, NPC_DEFS[this.kind].dims, true, this.j);
  }

  draw(ctx: Ctx) {
    const def = NPC_DEFS[this.kind];
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.face * def.scale, def.scale);
    if (this.ghost) ctx.globalAlpha = 0.75 + Math.sin(G.time * 3) * 0.1;
    if (this.kind === 'ilan') {
      // traveller's pack
      poly(ctx, [this.j.shBX - 9, this.j.shBY - 2, this.j.shBX - 1, this.j.shBY - 4, this.j.hipX - 2, this.j.hipY + 2, this.j.hipX - 11, this.j.hipY + 1], '#5a4028', '#0a070c', 0.8);
    }
    drawHumanoid(ctx, this.j, def.style, G.time + this.id, this.pose.rot, this.body.vx * this.face, this.ghost ? 0 : this.body.vy);
    ctx.restore();
    ctx.globalAlpha = 1;
    if (this.ghost) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, this.x, this.y - 22, 40, '#7a3aa0', 0.45);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  lights() {
    if (this.kind === 'ilan') lighting.add(this.x + this.face * 4, this.y - 14, 60, '#ffb35c', 0.6, 0.3);
    if (this.ghost) lighting.add(this.x, this.y - 22, 80, '#7a3aa0', 0.7, 0.4);
  }
}

/** Draw an NPC (or Elior) bust into a portrait canvas for the dialogue box. */
export function renderPortrait(c: HTMLCanvasElement, who: string, t: number) {
  const ctx = c.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  let style: HumanStyle;
  let base: Pose = NPC_BASE;
  let dims: RigDims = PDIMS;
  if (who === 'elior') {
    const p = G.world?.player;
    style = p?.style ?? NPC_DEFS.tobiah.style;
    base = { ...BASE_POSE, fUA: 0.2, fFA: 0.3, bUA: -0.1, bFA: 0.3 };
  } else if (who in NPC_DEFS) {
    const d = NPC_DEFS[who as NpcKind];
    style = d.style;
    base = d.base;
    dims = d.dims;
  } else return;
  const j = solve({ ...base, head: Math.sin(t * 1.5) * 0.03, lean: 0.02 }, dims, true);
  const s = c.height / 26;
  ctx.translate(c.width / 2 + 2 * s, c.height + 4 * s);
  ctx.scale(s, s);
  ctx.translate(-j.headX, -j.headY - 2);
  ctx.translate(0, -9);
  const st = { ...style, weapon: 'none' as const, offhand: 'none' as const };
  drawHumanoid(ctx, j, st, t);
}

// ---------------------------------------------------------------- Chest

export class Chest extends Entity implements Interactable {
  idKey: string;
  loot: Loot[];
  open: boolean;
  openT = 0;
  range = 26;
  secret: boolean;
  constructor(x: number, y: number, id: string, loot: Loot[], secret = false) {
    super(x, y, 18, 14);
    this.idKey = id;
    this.loot = loot;
    this.secret = secret;
    this.open = G.save.opened.includes(id);
    this.openT = this.open ? 1 : 0;
    this.layer = 3;
  }
  prompt() {
    return this.open ? '' : 'Open';
  }
  interact() {
    if (this.open) return;
    this.open = true;
    G.save.opened.push(this.idKey);
    sfx('chest');
    G.world.spawnLoot(this.x, this.y - 10, this.loot, true);
    if (this.secret || ['sanct_loft', 'crypt_high'].includes(this.idKey)) G.world.story.secret(this.idKey);
    G.world.autosave();
  }
  update(dt: number) {
    if (this.open) this.openT = Math.min(1, this.openT + dt * 3);
  }
  draw(ctx: Ctx) {
    const x = this.x, y = this.y;
    const o = '#0a0806';
    poly(ctx, [x - 9, y, x - 9, y - 9, x + 9, y - 9, x + 9, y], '#5a3a1e', o, 1);
    ctx.fillStyle = '#c9a04a';
    ctx.fillRect(x - 9, y - 6, 18, 1.4);
    ctx.fillRect(x - 1.2, y - 7, 2.4, 4);
    // lid
    const a = -this.openT * 1.9;
    ctx.save();
    ctx.translate(x - 9, y - 9);
    ctx.rotate(a);
    poly(ctx, [0, 0, 18, 0, 17, -5, 9, -7, 1, -5], '#6a4424', o, 1);
    ctx.fillStyle = '#c9a04a';
    ctx.fillRect(0, -1.4, 18, 1.2);
    ctx.restore();
    if (!this.open) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, x, y - 6, 16, '#ffcf6b', 0.25 + Math.sin(G.time * 3) * 0.1);
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  lights() {
    if (!this.open) lighting.add(this.x, this.y - 6, 40, '#ffcf6b', 0.5, 0.3);
  }
}

// ---------------------------------------------------------------- Altar (checkpoint)

export class Altar extends Entity implements Interactable {
  idKey: string;
  range = 30;
  constructor(x: number, y: number, id: string) {
    super(x, y, 20, 24);
    this.idKey = id;
    this.layer = 3;
  }
  get lit() {
    return G.save.altarsLit.includes(this.idKey);
  }
  prompt() {
    return this.lit ? 'Rest' : 'Kindle the altar';
  }
  interact() {
    G.world.restAtAltar(this);
  }
  update() {}
  draw(ctx: Ctx) {
    const x = this.x, y = this.y, o = '#0a0806';
    poly(ctx, [x - 13, y, x - 11, y - 4, x - 8, y - 5, x - 7, y - 16, x - 10, y - 18, x + 10, y - 18, x + 7, y - 16, x + 8, y - 5, x + 11, y - 4, x + 13, y], '#4a4452', o, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x - 6, y - 16, 2.5, 11);
    // carved sigil
    ctx.strokeStyle = this.lit ? '#e8c27a' : '#2a2630';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(x, y - 10, 3, 0, Math.PI * 2);
    ctx.moveTo(x, y - 15); ctx.lineTo(x, y - 5);
    ctx.stroke();
    // lamp bowl
    poly(ctx, [x - 6, y - 18, x + 6, y - 18, x + 4, y - 22, x - 4, y - 22], '#6a5a3a', o, 0.8);
    if (this.lit) {
      flame(ctx, x, y - 22, 6 + Math.sin(G.time * 9) * 0.6, G.time);
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, x, y - 26, 28, '#ffd27a', 0.5);
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, x, y - 22, 10, '#ffd27a', 0.2 + Math.sin(G.time * 2) * 0.1);
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  lights() {
    lighting.add(this.x, this.y - 22, this.lit ? 130 : 40, '#ffd9a0', this.lit ? 0.9 : 0.4, 0.4);
  }
}

// ---------------------------------------------------------------- Inscription stone

export class LoreStone extends Entity implements Interactable {
  lore: string;
  range = 28;
  constructor(x: number, y: number, lore: string) {
    super(x, y, 16, 24);
    this.lore = lore;
    this.layer = 2;
  }
  get read() {
    return G.save.lore.includes(this.lore);
  }
  prompt() {
    return 'Read inscription';
  }
  interact() {
    G.world.story.readLore(this.lore);
  }
  update() {}
  draw(ctx: Ctx) {
    const x = this.x, y = this.y, o = '#0a0806';
    poly(ctx, [x - 8, y, x - 8, y - 18, x - 5, y - 22, x + 5, y - 22, x + 8, y - 18, x + 8, y], '#3a3646', o, 1);
    ctx.fillStyle = this.read ? 'rgba(232,194,122,0.6)' : 'rgba(255,230,168,0.95)';
    for (let r = 0; r < 4; r++) ctx.fillRect(x - 5, y - 18 + r * 4, 10 - (r % 2) * 3, 1.2);
    if (!this.read) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, x, y - 12, 18, '#ffe6a8', 0.35 + Math.sin(G.time * 3) * 0.15);
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  lights() {
    lighting.add(this.x, this.y - 12, this.read ? 30 : 50, '#ffe6a8', 0.6, 0.3);
  }
}

// ---------------------------------------------------------------- Relic shrine

export class Shrine extends Entity implements Interactable {
  idKey: string;
  grants: string;
  range = 30;
  constructor(x: number, y: number, id: string, grants: string) {
    super(x, y, 16, 30);
    this.idKey = id;
    this.grants = grants;
    this.layer = 3;
  }
  get taken() {
    return fallenObjective(this.grants) ? !!G.save.flags[this.grants] : G.save.keyItems.includes(this.grants);
  }
  prompt() {
    return this.taken ? '' : fallenObjective(this.grants) ? this.grants.startsWith('cinder_')?'Release Pressure Wheel':'Cleanse Spore Heart' : 'Take the relic';
  }
  interact() {
    if (!this.taken) G.world.story.shrine(this);
  }
  update() {}
  draw(ctx: Ctx) {
    if (this.taken) return;
    const x = this.x, y = this.y - 24 + Math.sin(G.time * 2) * 2;
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, x, y, 30, '#fff1c0', 0.6);
    ctx.globalCompositeOperation = 'source-over';
    if (this.grants.startsWith('cinder_')) {
      ctx.strokeStyle='#ffd090';ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,13,0,Math.PI*2);ctx.moveTo(x-13,y);ctx.lineTo(x+13,y);ctx.moveTo(x,y-13);ctx.lineTo(x,y+13);ctx.stroke();ctx.fillStyle='#92583a';ctx.fillRect(x-3,y-3,6,6);
    } else if (fallenObjective(this.grants)) {
      ctx.fillStyle='#badc8b';ctx.strokeStyle='#edf5c1';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(x,y,10,16,0,0,Math.PI*2);ctx.fill();ctx.stroke();
    } else if (this.grants === 'eagle_wings') {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(0.5);
      ellipse(ctx, 0, 0, 2.5, 9, 0, '#fffaf0');
      ctx.strokeStyle = '#c9b88a';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(0, -9); ctx.lineTo(0, 10);
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.save();
      ctx.translate(x, y);
      ctx.strokeStyle = '#e8d8b0';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-8, 5);
      ctx.quadraticCurveTo(-2, -8, 9, -6);
      ctx.stroke();
      ctx.strokeStyle = '#8a7a5a';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
  }
  lights() {
    if (!this.taken) lighting.add(this.x, this.y - 24, 90, '#fff1c0', 0.9, 0.5);
  }
}

// ---------------------------------------------------------------- Pickup (sparkle on the ground)

export class Pickup extends Entity {
  idKey: string;
  loot: Loot[];
  constructor(x: number, y: number, id: string, loot: Loot[]) {
    super(x, y, 10, 10);
    this.idKey = id;
    this.loot = loot;
    this.layer = 3;
  }
  update() {
    const p = G.world.player;
    if (Math.abs(p.x - this.x) < 14 && Math.abs(p.y - this.y) < 20) {
      this.remove = true;
      G.save.opened.push(this.idKey);
      G.world.spawnLoot(this.x, this.y - 6, this.loot, false);
      if (this.idKey === 'hall_ledge' || this.idKey === 'gallery_gap') G.world.story.secret(this.idKey);
      if (this.idKey === 'archive_ledger') G.world.story.ledgerFound();
    }
  }
  draw(ctx: Ctx) {
    const t = G.time + this.id;
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, this.x, this.y - 6, 10 + Math.sin(t * 4) * 2, '#ffe6a8', 0.8);
    ctx.strokeStyle = 'rgba(255,250,235,0.9)';
    ctx.lineWidth = 0.8;
    const r = 4 + Math.sin(t * 6) * 1;
    ctx.beginPath();
    ctx.moveTo(this.x - r, this.y - 6); ctx.lineTo(this.x + r, this.y - 6);
    ctx.moveTo(this.x, this.y - 6 - r); ctx.lineTo(this.x, this.y - 6 + r);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }
  lights() {
    lighting.add(this.x, this.y - 6, 34, '#ffe6a8', 0.6, 0.4);
  }
}

// ---------------------------------------------------------------- Loot drop

export class Drop extends Entity {
  loot: Loot;
  t = 0;
  color: string;
  constructor(x: number, y: number, loot: Loot) {
    super(x, y, 5, 5);
    this.loot = loot;
    this.body.vx = rand(-90, 90);
    this.body.vy = rand(-260, -160);
    this.layer = 9;
    const r = loot.item ? (loot.rarity ?? ITEMS[loot.item].rarity) : loot.mat ? ITEMS[loot.mat].rarity : 0;
    this.color = loot.silver ? '#e8e2d0' : RARITY_COLORS[r];
  }
  update(dt: number) {
    this.t += dt;
    const p = G.world.player;
    const b = this.body;
    const dx = p.x - this.x, dy = p.y - 16 - this.y;
    const d = Math.hypot(dx, dy);
    if (this.t > 0.45 && d < 90) {
      b.vx += (dx / d) * 1500 * dt;
      b.vy += (dy / d) * 1500 * dt;
      b.vx *= 0.92;
      b.vy *= 0.92;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (d < 10) {
        this.remove = true;
        G.world.collect(this.loot);
      }
      return;
    }
    b.vy = Math.min(400, b.vy + 900 * dt);
    b.vx = approach(b.vx, 0, (b.onGround ? 300 : 40) * dt);
    moveBody(b, dt, G.world.grid, G.world.solid);
    if (this.t > 20) {
      this.remove = true;
      G.world.collect(this.loot);
    }
  }
  draw(ctx: Ctx) {
    const y = this.y - 3 - (this.body.onGround ? Math.abs(Math.sin(this.t * 3)) * 2 : 0);
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, this.x, y, this.loot.item ? 12 : 7, this.color, 0.8);
    ctx.globalCompositeOperation = 'source-over';
    if (this.loot.silver) {
      ellipse(ctx, this.x, y, 2.2, 2.2 * Math.abs(Math.cos(this.t * 6)) + 0.4, 0, '#e8e2d0');
    } else {
      ctx.save();
      ctx.translate(this.x, y);
      ctx.rotate(this.t * 2);
      poly(ctx, [0, -3, 2.5, 0, 0, 3, -2.5, 0], this.color, '#0a0806', 0.5);
      ctx.restore();
    }
  }
}

export { limb, circle, rgba, clamp, PK, fx };

// ---------------------------------------------------------------- the shattered relic (visual only)

export class RelicVisual extends Entity {
  constructor(x: number, y: number) {
    super(x, y, 10, 10);
    this.layer = 3;
  }
  update() {
    if (G.save.flags.relic_taken) this.remove = true;
  }
  draw(ctx: Ctx) {
    const t = G.time;
    const x = this.x, y = this.y - 30 + Math.sin(t * 1.6) * 1.5;
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, x, y, 34, '#ffd27a', 0.45 + Math.sin(t * 2.2) * 0.1);
    ctx.globalCompositeOperation = 'source-over';
    // three broken pieces of a lamp-shaped sigil, drifting slightly apart
    const parts: [number, number, number][] = [[-4, -1, -0.3], [3, -3, 0.25], [1, 4, 0.1]];
    parts.forEach(([dx, dy, r], i) => {
      ctx.save();
      ctx.translate(x + dx + Math.sin(t + i) * 0.6, y + dy + Math.cos(t * 1.3 + i) * 0.6);
      ctx.rotate(r + Math.sin(t * 0.7 + i) * 0.08);
      poly(ctx, [-3.5, -3, 3, -4, 4, 2.5, -2, 4], i === 1 ? '#f2d48a' : '#c9a04a', '#3a2408', 0.6);
      ctx.restore();
    });
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, x, y, 8, '#ffffff', 0.7);
    ctx.globalCompositeOperation = 'source-over';
  }
  lights() {
    lighting.add(this.x, this.y - 30, 120, '#ffd27a', 0.9, 0.5);
  }
}
