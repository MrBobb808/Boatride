// Covenant abilities — fictional gameplay interpretations of biblical imagery.

import type { Player } from './player';
import { ABILITIES, type AbilityId } from './data';
import { Proj } from './projectiles';
import { G } from './ctx';
import { fx, PK } from '../render/fx';
import { sfx } from '../audio/audio';
import { skillRank } from './state';
import { rand } from '../core/math';
import { shakeScale } from '../core/settings';
import { TILE } from './tiles';

export function castAbility(p: Player, id: AbilityId) {
  const d = G.d;
  const W = G.world;
  const pow = d.atk * d.abil;
  p.cds[id] = ABILITIES[id].cd;
  switch (id) {
    case 'chain_snare': {
      const t = W.nearestEnemy(p.x, p.cy, 260, p.face);
      if (t && p.blinkSpot(t)) {
        fx.streak(p.x, p.cy, t.x, t.cy, '#ddcfb0', 0.45, 3);
        t.takeHit({ dmg: pow * 1.6, poise: 65, kx: 0, ky: -80, dir: p.face, kind: 'ability', src: p, stun: 1.1, guardBreak: true });
        if (!t.isBoss) t.body.vx = -Math.sign(t.x - p.x) * 300;
        fx.ring(t.x, t.cy, 18, 12, '#ddcfb0', 1.1, 3);
      }
      sfx('chains');
      break;
    }
    case 'blink_strike': {
      const t = W.nearestEnemy(p.x, p.cy, 260, p.face);
      if (t && p.blinkToFoe(t)) {
        t.takeHit({ dmg: pow * 3.2, poise: 80, kx: p.face * 180, ky: -180, dir: p.face, kind: 'ability', src: p, guardBreak: true, stop: 0.06 });
        fx.slash(t.x, t.cy, 38, -2.3, 0.7, 9, p.face, '#ffffff', '#ad9aff', 0.3);
      }
      sfx('dash');
      break;
    }
    case 'mending_light': {
      p.mendT = 6;
      fx.ring(p.x, p.cy, 8, 38, '#9de6bb', 0.6, 3);
      sfx('stillWaters');
      break;
    }
    case 'frost_ring': {
      W.hitEnemies({ x: p.x - 120, y: p.y - 100, w: 240, h: 120 }, { dmg: pow * 1.7, poise: 35, kx: 0, ky: -80, dir: p.face, kind: 'ability', src: p }, new Set(), (e) => { e.chill = Math.max(e.chill, 4); });
      fx.ring(p.x, p.cy, 10, 120, '#a0deff', 0.65, 5);
      sfx('shieldFaith');
      break;
    }
    case 'sword_word': {
      W.add(new Proj('word', p.x + p.face * 14, p.y - 22, 'player', pow * 1.9, { vx: p.face * 430, life: 0.75, w: 26, h: 46, poise: 30 }));
      sfx('swordWord');
      fx.slash(p.x + p.face * 6, p.y - 22, 24, -1.4, 1.4, 8, p.face, '#fffaf0', '#ffcf6b', 0.2);
      G.camera.addTrauma(0.12 * shakeScale());
      break;
    }
    case 'trumpet': {
      W.add(new Proj('trumpet', p.x, p.y - 18, 'player', pow * 1.4, { life: 0.45, w: 110 }));
      sfx('trumpet');
      fx.flash('#fff1c4', 0.25);
      G.camera.addTrauma(0.45 * shakeScale());
      fx.dust(p.x, p.y, 14, 2);
      break;
    }
    case 'shield_faith': {
      p.shieldT = 1.4;
      sfx('shieldFaith');
      fx.ring(p.x, p.y - 18, 6, 30, '#bfe0ff', 0.3, 2.5);
      break;
    }
    case 'lion': {
      p.lion = 10;
      p.veiled = 0;
      sfx('lion');
      fx.ring(p.x, p.y - 20, 8, 60, '#ffb347', 0.5, 4);
      fx.holyBurst(p.x, p.y - 20, 20, 1);
      G.camera.addTrauma(0.3 * shakeScale());
      G.ui.toast("Lion's Courage — 10s", 'good');
      break;
    }
    case 'still_waters': {
      const well = skillRank(G.save, 'l_well') > 0;
      W.add(new Proj('waters', p.x, groundBelow(p.x, p.y), 'player', 0.06 * (1 + d.abil * 0.2), { life: well ? 9 : 6, w: 96, big: well }));
      sfx('stillWaters');
      break;
    }
    case 'pillar_fire': {
      // Direction is measured from Elior; starting 70px ahead skips close foes.
      const target = W.nearestEnemy(p.x, p.cy, 220, p.face);
      const x = target ? target.x : p.x + p.face * 80;
      W.add(new Proj('pillar', x, groundBelow(x, (target ? target.y : p.y) - 4), 'player', pow * 0.55, { life: 1.6, w: 36, h: 170, poise: 8 }));
      sfx('pillarFire');
      fx.flash('#ffcf6b', 0.15);
      G.camera.addTrauma(0.25 * shakeScale());
      break;
    }
    case 'chains': {
      p.veiled = 0;
      p.untouchable = 1.2;
      sfx('chains');
      fx.ring(p.x, p.y - 18, 6, 70, '#ffffff', 0.4, 3);
      for (let i = 0; i < 12; i++) fx.spawn(PK.Shard, p.x, p.y - 18, rand(-200, 200), rand(-220, 40), 0.8, 2, 1, '#cfc8bc', 600, 0.5);
      W.hitEnemies({ x: p.x - 60, y: p.y - 50, w: 120, h: 60 }, { dmg: pow * 0.8, poise: 40, kx: 0, ky: -160, dir: 0, kind: 'ability', src: p }, new Set(), (e) => {
        e.body.vx = Math.sign(e.x - p.x) * 320;
      });
      break;
    }
    case 'armor_light': {
      p.armorLight = 12;
      p.styleKey = '';
      sfx('armorLight');
      fx.column(p.x, p.y, 60, 220, '#ffe6a8', 1.0);
      fx.holyBurst(p.x, p.y - 20, 30, 1.4);
      fx.flash('#fff6dc', 0.4);
      G.camera.addTrauma(0.35 * shakeScale());
      G.ui.toast('Armor of Light — 12s', 'good');
      break;
    }
  }
  G.ui.refreshHud();
}

function groundBelow(x: number, y: number) {
  const W = G.world;
  let ty = Math.floor(y / TILE);
  for (let i = 0; i < 20; i++) {
    if (W.solidAt(x, (ty + i) * TILE + 1)) return (ty + i) * TILE;
  }
  return y;
}
