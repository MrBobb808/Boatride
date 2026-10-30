import { G } from './ctx';
import { echoRole, type EchoRole } from './data';
import type { EchoUnit } from './echoes';
import type { Entity } from './entity';
import { echoSpot } from './echoRoles';
import { los } from './physics';
import { fx } from '../render/fx';
import { sfx } from '../audio/audio';
import { sign } from '../core/math';

export const ECHO_COMBOS = [
  { id: 'frostbreak', name: 'Frostbreak', roles: ['mage', 'fighter'], color: '#a6e8ff', desc: 'A mage chills the target; a nearby fighter shatters the frost with a guard-breaking blast.' },
  { id: 'skyfall', name: 'Skyfall', roles: ['fighter', 'ninja'], color: '#d1b1ff', desc: 'A fighter launches a foe; a ninja blinks in for an aerial follow-up. Bosses take damage without being launched.' },
  { id: 'sanctuary', name: 'Sanctuary', roles: ['guardian', 'herald'], color: '#a3eacb', desc: 'A guardian’s barrier links with a herald to heal nearby allies and cleanse Elior’s burning and bleeding.' },
] as const;
type ComboId = typeof ECHO_COMBOS[number]['id'];
interface Setup { id: ComboId; source: EchoUnit; target: Entity; life: number; age: number }

const ready = (u: EchoUnit) => !u.remove && !u.dying && u.hp > 0 && u.despawn <= 0 && u.recallT <= 0 && u.summonT <= 0.3;

/** A small event queue, not a search over every ally pair every frame. */
export class EchoCombinations {
  private pending: Setup[] = [];
  private cooldown = new WeakMap<EchoUnit, number>();
  private noticeAt = -9;
  count = 0;
  last: ComboId | null = null;
  reset() { this.pending.length = 0; this.cooldown = new WeakMap(); this.last = null; this.count = 0; }

  prime(id: ComboId, source: EchoUnit, target: Entity) {
    if (!ready(source) || G.inCutscene || this.pending.length >= 8) return;
    if ((this.cooldown.get(source) ?? 0) > G.time || this.pending.some(p => p.source === source)) return;
    this.pending.push({ id, source, target, life: 2.4, age: 0 });
  }

  update(dt: number) {
    if (G.inCutscene || G.world.player.state === 'dead') { this.pending.length = 0; return; }
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const setup = this.pending[i], a = setup.source, t = setup.target;
      setup.life -= dt; setup.age += dt;
      const sourceRole = setup.id === 'frostbreak' ? 'mage' : setup.id === 'skyfall' ? 'fighter' : 'guardian';
      if (setup.life <= 0 || !ready(a) || !G.world.echoes.includes(a) || echoRole(a.inst) !== sourceRole || (this.cooldown.get(a) ?? 0) > G.time || (setup.id !== 'sanctuary' && !t.canBeTargeted())) { this.pending.splice(i, 1); continue; }
      if (setup.id === 'frostbreak' && t.chill <= 0) { this.pending.splice(i, 1); continue; }
      if (setup.id === 'skyfall' && !t.heavyBody && t.body.vy >= -20) continue;
      if (setup.age < 0.14) continue;
      const wanted: EchoRole = setup.id === 'frostbreak' ? 'fighter' : setup.id === 'skyfall' ? 'ninja' : 'herald';
      let partner: EchoUnit | null = null;
      for (const u of G.world.echoes) {
        if (u === a || !ready(u) || echoRole(u.inst) !== wanted || (this.cooldown.get(u) ?? 0) > G.time) continue;
        if (u.order === 'hold' || (u.order === 'guard' && setup.id !== 'sanctuary' && Math.abs(t.x - G.world.player.x) > 150)) continue;
        const range = setup.id === 'frostbreak' ? 110 : setup.id === 'skyfall' ? 320 : 180;
        if (Math.hypot(u.x - t.x, u.cy - t.cy) > range || !los(G.world.grid, G.world.solid, u.x, u.cy, t.x, t.cy)) continue;
        if (setup.id === 'skyfall' && !echoSpot(u, t, sign(t.x - u.x) || u.face)) continue;
        partner = u; break;
      }
      if (!partner) continue;
      if (this.strike(setup, partner)) {
        this.cooldown.set(a, G.time + 7); this.cooldown.set(partner, G.time + 7);
        a.gainXp(3); partner.gainXp(3);
        this.count++; this.last = setup.id;
        if (G.time - this.noticeAt > 1.2) {
          this.noticeAt = G.time;
          const def = ECHO_COMBOS.find(c => c.id === setup.id)!;
          G.ui.toast(`${def.name} · ${echoRole(a.inst)} + ${echoRole(partner.inst)}`, 'good', def.color);
        }
      }
      this.pending.splice(i, 1);
    }
  }

  private strike(setup: Setup, u: EchoUnit) {
    const { source: a, target: t, id } = setup, W = G.world;
    const atk = (a.power() + u.power()) * 0.65;
    if (id === 'sanctuary') {
      const p = W.player;
      if (Math.hypot(a.x - p.x, a.y - p.y) > 170) return false;
      W.healAlliesIn(a.x - 150, a.x + 150, a.y, 0.12, false);
      p.burn = p.bleed = 0;
      p.shieldT = Math.max(p.shieldT, 0.6);
      fx.streak(a.x, a.cy, u.x, u.cy, '#a3eacb', 0.35, 2);
      fx.ring(a.x, a.cy, 10, 150, '#a3eacb', 0.5, 2);
      sfx('stillWaters', { vol: 0.5 });
      return true;
    }
    if (id === 'skyfall') {
      const spot = echoSpot(u, t, sign(t.x - u.x) || u.face);
      if (!spot) return false;
      const x = u.x, y = u.cy;
      u.x = spot.x; u.y = spot.y; u.body.vx = u.body.vy = 0;
      u.face = sign(t.x - u.x) || u.face;
      u.target = t; u.handoffT = 0.8;
      if (!t.takeHit({ dmg: atk * 1.6, poise: 38, kx: 0, ky: -100, dir: u.face, kind: 'echo', src: u, noKnock: true, stop: 0.035 })) return false;
      fx.streak(x, y, u.x, u.cy, '#c9adff', 0.25, 2);
      fx.slash(t.x, t.cy, 34, -2.3, 0.8, 5, u.face, '#fff6ef', '#c9adff', 0.22);
      sfx('dash', { vol: 0.55, pitch: 1.4 });
      return true;
    }
    let hits = 0;
    u.face = sign(t.x - u.x) || u.face;
    for (const f of W.foes()) {
      if (!f.canBeTargeted() || Math.hypot(f.x - t.x, f.cy - t.cy) > 85 || !los(W.grid, W.solid, u.x, u.cy, f.x, f.cy)) continue;
      if (f.takeHit({ dmg: atk * 1.4, poise: 75, kx: sign(f.x - u.x) * 100, ky: -240, dir: u.face, kind: 'echo', src: u, heavy: true, guardBreak: true, launch: true, stop: 0.045 })) { f.chill = 0; hits++; }
    }
    if (!hits) return false;
    fx.streak(a.x, a.cy, t.x, t.cy, '#a6e8ff', 0.3, 2);
    fx.ring(t.x, t.cy, 6, 85, '#a6e8ff', 0.35, 3);
    fx.hitSparks(t.x, t.cy, u.face, '#b9ecff', 10, 0.9);
    sfx('hitHeavy', { vol: 0.6 });
    return true;
  }
}
