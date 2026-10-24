// Covenant skills in Phaser: costs, cooldowns and effects follow the original
// (remnant/src/game/data.ts ABILITIES and game/abilities.ts). Three are
// ported so far, one per skill button; the rest arrive with the skill trees.

import Phaser from 'phaser';
import type { WorldApi } from './types';

export type SkillId = 'sword_word' | 'trumpet' | 'shield_faith';

export interface SkillDef { id: SkillId; name: string; short: string; cost: number; cd: number; color: number; desc: string }
export const SKILLS: Record<SkillId, SkillDef> = {
  sword_word: { id: 'sword_word', name: 'Sword of the Word', short: 'WORD', cost: 22, cd: 1.2, color: 0xffd27a, desc: 'A golden arc that pierces every foe in its path.' },
  trumpet: { id: 'trumpet', name: 'Trumpet of Victory', short: 'HORN', cost: 30, cd: 4, color: 0xfff1c4, desc: 'A shockwave that damages and staggers nearby foes.' },
  shield_faith: { id: 'shield_faith', name: 'Shield of Faith', short: 'SHIELD', cost: 25, cd: 6, color: 0x9fd8ff, desc: 'A barrier for 1.4 s that blocks all harm and staggers attackers.' },
};
/** Which skill each button casts (skill1–3). The skill trees will make this a choice. */
export const SLOTS: SkillId[] = ['sword_word', 'trumpet', 'shield_faith'];

export interface Caster {
  x: number; y: number; face: number;
  shieldT: number;
  power(): number;
  skillPower(): number;
}

/** Cast a skill's effect (cost and cooldown are the caller's). */
export function castSkill(w: WorldApi, p: Caster, id: SkillId) {
  const sc = w.sc;
  if (id === 'sword_word') {
    // The arc flies 260 px ahead and hits each foe once on the way.
    const arc = sc.add.image(p.x + p.face * 12, p.y - 2, 'slash').setTint(0xffd27a).setBlendMode(Phaser.BlendModes.ADD)
      .setScale(1.3, 1.6).setFlipX(p.face < 0).setDepth(16);
    const hit = new Set<object>();
    const dmg = Math.round(p.skillPower() * 1.4);
    sc.tweens.add({
      targets: arc, x: arc.x + p.face * 260, duration: 900, ease: 'Linear',
      onUpdate: () => {
        const box = new Phaser.Geom.Rectangle(arc.x - 14, arc.y - 22, 28, 44);
        for (const f of w.foes()) if (f.alive && !hit.has(f) && Phaser.Geom.Rectangle.Overlaps(box, f.box)) {
          hit.add(f);
          f.hit(dmg, p.face, 1.2);
        }
        const tx = Math.floor((arc.x + p.face * 10) / 16), ty = Math.floor(arc.y / 16);
        const t = w.tileAt(tx, ty);
        if (t >= 1 && t <= 3 || t === 6) { arc.alpha = 0; }
      },
      onComplete: () => arc.destroy(),
    });
    sc.tweens.add({ targets: arc, alpha: 0, delay: 650, duration: 250 });
  } else if (id === 'trumpet') {
    // A ring of sound 72 px across the floor: everything inside it reels.
    const ring = sc.add.circle(p.x, p.y + 4, 8, 0xfff1c4, 0).setStrokeStyle(3, 0xfff1c4, 0.9).setDepth(16);
    sc.tweens.add({ targets: ring, radius: 72, alpha: 0, duration: 380, ease: 'Cubic.out', onComplete: () => ring.destroy() });
    w.shake(0.008, 180);
    const dmg = Math.round(p.skillPower() * 1.2);
    for (const f of w.foes()) {
      if (!f.alive) continue;
      const dx = f.box.centerX - p.x, dy = f.box.centerY - p.y;
      if (dx * dx + dy * dy < 76 * 76) f.hit(dmg, Math.sign(dx) || p.face, 3);
    }
  } else {
    p.shieldT = 1.4;
  }
}
