// Covenant Echoes: purified battle-imprints that fight beside Elior.
// They keep the form and fighting style of what they were, re-forged in
// black-gold armor and white fire. Modes: aggressive / defensive / follow.
// Commands: priority target, recall, synchronized strike.

import { Entity, type HitInfo } from './entity';
import { moveBody, groundAhead, wallAhead } from './physics';
import { Animator, solve, newJoints, Chain, drawRibbon, type Joints, type Pose, BASE_POSE } from '../render/skeleton';
import { drawHumanoid } from '../render/actors';
import { glow, rgba, type Ctx } from '../render/draw';
import { fx, PK } from '../render/fx';
import { sfx } from '../audio/audio';
import { G } from './ctx';
import { approach, clamp, rand, sign } from '../core/math';
import { SENT_CLIPS, SENT_BASE, SENT_DIMS, ARCH_CLIPS, ARCH_BASE, ARCH_DIMS, sentinelStyle, archerStyle } from './enemies';
import { ECHO_SPECIES, echoXpToNext, type EchoInst } from './data';
import { echoAtk, echoMaxHp, skillRank } from './state';
import { Proj } from './projectiles';
import { lighting } from '../render/lighting';

export class EchoUnit extends Entity {
  inst: EchoInst;
  anim: Animator;
  pose: Pose = { ...BASE_POSE };
  j: Joints = newJoints();
  state = 'follow';
  st = 0;
  target: Entity | null = null;
  attackCd = 0;
  hitSet = new Set<number>();
  summonT = 0;
  recallT = 0;
  cape: Chain;
  slot: number;
  shots = 0;
  assistCd = 0;
  bowDraw = 0;
  despawn = 0;

  constructor(inst: EchoInst, x: number, y: number, slot: number) {
    super(x, y, inst.species === 'sentinel' ? 18 : 12, inst.species === 'sentinel' ? 40 : 32);
    this.inst = inst;
    this.team = 'player';
    this.slot = slot;
    const isSent = inst.species === 'sentinel';
    this.anim = new Animator(isSent ? SENT_CLIPS : ARCH_CLIPS, isSent ? SENT_BASE : ARCH_BASE);
    this.anim.play('idle', 0);
    this.cape = new Chain(7, 4, x, y - 34);
    this.maxHp = echoMaxHp(G.save, inst, G.d);
    this.hp = clamp(inst.hp, 1, this.maxHp);
    this.summonT = 1.1;
    this.layer = 7;
    this.name = ECHO_SPECIES[inst.species].stages[inst.stage].name;
  }

  get sentinel() {
    return this.inst.species === 'sentinel';
  }

  refreshStats() {
    this.maxHp = echoMaxHp(G.save, this.inst, G.d);
    this.hp = Math.min(this.hp, this.maxHp);
  }

  update(dt: number) {
    this.st += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.assistCd = Math.max(0, this.assistCd - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    if (this.summonT > 0) {
      this.summonT -= dt;
      if (Math.random() < dt * 40) fx.spawn(PK.Flame, this.x + rand(-10, 10), this.y - rand(0, 40), 0, -60, 0.6, 4, 0.5, '#fff3d0', -40, 1);
    }
    if (this.despawn > 0) {
      this.despawn -= dt;
      if (this.despawn <= 0) this.remove = true;
      this.anim.update(dt);
      this.pose = this.anim.sample();
      solve(this.pose, this.sentinel ? SENT_DIMS : ARCH_DIMS, true, this.j);
      return;
    }
    const p = G.world.player;
    const b = this.body;
    const mode = G.save.echoMode;
    if (this.recallT > 0) {
      this.recallT -= dt;
      this.collide = false;
      this.grav = 0;
      const tx = p.x - p.face * (16 + this.slot * 14), ty = p.y;
      this.x += (tx - this.x) * Math.min(1, dt * 10);
      this.y += (ty - this.y) * Math.min(1, dt * 10);
      b.vx = b.vy = 0;
      if (Math.random() < dt * 60) fx.spawn(PK.Mote, this.x, this.y - 20, 0, 0, 0.3, 10, 2, '#ffe6a8');
      if (this.recallT <= 0) {
        this.collide = true;
        this.grav = 1;
        if (G.world.solidAt(this.x, this.y - 4)) {
          this.x = p.x;
          this.y = p.y;
        }
      }
      this.animate(dt);
      return;
    }
    // Teleport back if very far from Elior (fell off or left behind).
    if (Math.abs(p.x - this.x) > 420 || Math.abs(p.y - this.y) > 260) {
      this.x = p.x - p.face * 20;
      this.y = p.y;
      b.vx = b.vy = 0;
      fx.holyBurst(this.x, this.y - 20, 10, 0.6);
    }
    // Choose a target.
    const prio = G.world.priorityTarget;
    if (prio && !prio.dying && !prio.remove) this.target = prio;
    else {
      const range = mode === 'aggressive' ? 260 : mode === 'defensive' ? 110 : 150;
      const cx = mode === 'aggressive' ? this.x : p.x;
      this.target = G.world.nearestEnemy(cx, p.y - 20, range, 0);
    }
    if (this.sentinel) this.thinkSentinel(dt, mode);
    else this.thinkArcher(dt, mode);
    b.vy = Math.min(560, b.vy + 1500 * this.grav * dt);
    moveBody(b, dt, G.world.grid, G.world.solid, this.collide);
    if (this.y > G.world.grid.h * 16 + 30) {
      this.x = p.x;
      this.y = p.y;
    }
    this.animate(dt);
    const f = this.face;
    this.cape.update(this.x + f * (this.j.shBX - 2), this.y + this.j.shBY, dt, -b.vx * 2 - f * 50 + Math.sin(G.time * 2) * 30, 380, 0.88);
  }

  private follow(dt: number, speed: number) {
    const p = G.world.player;
    const b = this.body;
    const tx = p.x - p.face * (22 + this.slot * 18);
    const dx = tx - this.x;
    if (Math.abs(dx) > 10) {
      const dir = sign(dx);
      this.face = dir;
      const fast = Math.abs(dx) > 90 ? 1.6 : 1;
      b.vx = approach(b.vx, dir * speed * fast, 900 * dt);
      // hop up ledges after Elior
      if (b.onGround && (wallAhead(b, dir, G.world.grid, G.world.solid) || (p.y < this.y - 20 && Math.abs(dx) < 80))) b.vy = -420;
      if (b.onGround && !groundAhead(b, dir, G.world.grid, G.world.solid) && p.y <= this.y + 4) b.vy = -380;
    } else {
      b.vx = approach(b.vx, 0, 900 * dt);
      this.face = p.face;
    }
  }

  private thinkSentinel(dt: number, mode: string) {
    const b = this.body;
    const t = this.target;
    const atk = echoAtk(G.save, this.inst, G.d) * G.world.commanderAura(this.x, this.y, this);
    const stage = this.inst.stage;
    if (this.state === 'slash' || this.state === 'bash' || this.state === 'slam') {
      const T = this.state === 'slam' ? 1.0 : this.state === 'bash' ? 0.6 : 0.8;
      const u = this.st / T;
      b.vx = approach(b.vx, 0, 900 * dt);
      const hitU = this.state === 'slam' ? 0.7 : this.state === 'bash' ? 0.45 : 0.58;
      if (u >= hitU && this.st - dt < hitU * T) {
        sfx(this.state === 'bash' ? 'shieldBash' : 'echoAttack', { pan: G.world.pan(this.x) });
        const box = this.state === 'slam' ? { x: -20, y: -36, w: 60, h: 38 } : { x: -4, y: -44, w: 40, h: 46 };
        const x = this.face > 0 ? this.x + box.x : this.x - box.x - box.w;
        const mult = this.state === 'slam' ? 2.0 : this.state === 'bash' ? 0.8 : 1;
        G.world.hitEnemies({ x, y: this.y + box.y, w: box.w, h: box.h }, {
          dmg: atk * mult, poise: this.state === 'bash' ? 45 : 18, kx: this.face * (this.state === 'bash' ? 280 : 140), ky: -120, dir: this.face, kind: 'echo', src: this, stop: 0.02,
          stun: this.state === 'bash' ? 0.6 : 0,
        }, this.hitSet, () => this.gainXp(1));
        fx.slash(this.x + this.face * 4, this.y - 26, 24, -2.0, 0.6, 7, this.face, '#fffaf0', '#ffe6a8', 0.15);
        if (this.state === 'slam') {
          fx.dust(this.x, this.y, 10, 1.3);
          fx.ring(this.x + this.face * 14, this.y, 6, 50, '#fff3c4', 0.35, 3, 0.3);
          if (stage >= 2) {
            G.world.add(new Proj('wave', this.x + 16, this.y, 'player', atk * 0.9, { vx: 230, life: 1.2, w: 14, h: 24, color: '#fff3c4', echo: true }));
            G.world.add(new Proj('wave', this.x - 16, this.y, 'player', atk * 0.9, { vx: -230, life: 1.2, w: 14, h: 24, color: '#fff3c4', echo: true }));
          }
        }
      }
      if (u >= 1) {
        this.attackCd = this.state === 'slam' ? 2 : rand(0.6, 1.0);
        this.state = 'follow';
      }
      return;
    }
    if (t && (mode !== 'follow' || Math.abs(t.x - G.world.player.x) < 120)) {
      const dx = t.x - this.x;
      const dist = Math.abs(dx);
      this.face = sign(dx) || this.face;
      if (dist < 40 && this.attackCd <= 0 && b.onGround) {
        this.hitSet.clear();
        const r = Math.random();
        if (stage >= 1 && r < 0.3) this.begin('bash', 0.6);
        else if (stage >= 2 && r < 0.5) this.begin('slam', 1.0);
        else this.begin('slash', 0.8);
        return;
      }
      if (mode === 'defensive') {
        // Hold a line just in front of Elior.
        const p = G.world.player;
        const guardX = p.x + sign(t.x - p.x) * 26;
        this.walk(guardX, 90, dt);
      } else this.walk(t.x, 100, dt, 30);
    } else this.follow(dt, 110);
  }

  private thinkArcher(dt: number, mode: string) {
    const b = this.body;
    const t = this.target;
    const atk = echoAtk(G.save, this.inst, G.d) * G.world.commanderAura(this.x, this.y, this);
    const stage = this.inst.stage;
    if (this.state === 'draw') {
      b.vx = approach(b.vx, 0, 900 * dt);
      this.bowDraw = Math.min(1, this.st / 0.5);
      if (t) this.face = sign(t.x - this.x) || this.face;
      if (this.st >= 0.5) {
        this.bowDraw = 0;
        this.state = 'follow';
        this.attackCd = rand(0.9, 1.3);
        if (t && !t.dying) {
          this.shots++;
          const sx = this.x + this.face * 10, sy = this.y - 22;
          const tx = t.x, ty = t.cy;
          const d = Math.hypot(tx - sx, ty - sy) || 1;
          const sp = 380;
          const pierce = stage >= 1 && this.shots % 3 === 0;
          G.world.add(new Proj(pierce ? 'word' : 'arrow', sx, sy, 'player', atk * (pierce ? 1.6 : 1), {
            vx: ((tx - sx) / d) * sp, vy: ((ty - sy) / d) * sp - 20, life: pierce ? 0.8 : 2, w: pierce ? 16 : 8, h: pierce ? 24 : 4, color: '#ffe6a8', echo: true,
          }));
          if (stage >= 2 && this.shots % 5 === 0) this.rain(t, atk);
          sfx('bowRelease', { pan: G.world.pan(this.x), pitch: 1.2 });
          this.anim.play('release', 0.03, true);
          this.gainXp(1);
        }
      }
      return;
    }
    if (t) {
      const dx = t.x - this.x, dist = Math.abs(dx);
      this.face = sign(dx) || this.face;
      if (this.attackCd <= 0 && dist < 260) {
        this.state = 'draw';
        this.st = 0;
        this.anim.play('draw', 0.06, true, 2);
        return;
      }
      if (dist < 70) this.walk(this.x - sign(dx) * 40, 80, dt);
      else if (mode === 'aggressive' && dist > 200) this.walk(t.x, 90, dt, 180);
      else this.follow(dt, 100);
    } else this.follow(dt, 110);
  }

  private rain(t: Entity, atk: number) {
    for (let i = 0; i < 6; i++) {
      G.world.add(new Proj('rain', t.x + rand(-40, 40), t.y - 200 - i * 20, 'player', atk * 0.6, { vx: rand(-10, 10), vy: 300, life: 1.6, w: 6, h: 10, color: '#fff3c4', echo: true }));
    }
    fx.column(t.x, t.y - 120, 40, 60, '#fff3c4', 0.5);
  }

  private begin(s: string, T: number) {
    this.state = s;
    this.st = 0;
    this.anim.play(s, 0.06, true, 1 / T);
  }

  private walk(tx: number, speed: number, dt: number, stop = 6) {
    const b = this.body;
    const dx = tx - this.x;
    if (Math.abs(dx) < stop) {
      b.vx = approach(b.vx, 0, 900 * dt);
      return;
    }
    const dir = sign(dx);
    b.vx = approach(b.vx, dir * speed, 900 * dt);
    if (b.onGround && wallAhead(b, dir, G.world.grid, G.world.solid)) b.vy = -420;
  }

  private animate(dt: number) {
    const b = this.body;
    const busy = ['slash', 'bash', 'slam', 'draw'].includes(this.state);
    if (!busy && this.anim.name !== 'release' || (this.anim.name === 'release' && this.anim.done)) {
      if (Math.abs(b.vx) > 12) this.anim.play('walk', 0.15, false, Math.min(2, Math.abs(b.vx) / 60));
      else this.anim.play(this.sentinel && this.target ? 'guard' : 'idle', 0.2);
    }
    this.anim.update(dt);
    this.pose = this.anim.sample();
    solve(this.pose, this.sentinel ? SENT_DIMS : ARCH_DIMS, b.onGround || this.recallT > 0, this.j);
  }

  /** Summon-assisted combination: follow up Elior's finisher on the same foe. */
  assist(e: Entity) {
    if (this.assistCd > 0 || this.recallT > 0 || this.summonT > 0) return;
    this.assistCd = 3.5;
    if (this.sentinel) {
      this.x = e.x - G.world.player.face * 24;
      this.y = e.y;
      this.face = G.world.player.face;
      fx.holyBurst(this.x, this.y - 20, 8, 0.6);
      this.hitSet.clear();
      this.begin('bash', 0.5);
      this.st = 0.15;
    } else {
      this.attackCd = 0;
    }
  }

  gainXp(n: number) {
    const mult = skillRank(G.save, 'c_glory') ? 1.6 : 1;
    this.inst.xp += n * mult;
    while (this.inst.xp >= echoXpToNext(this.inst.level) && this.inst.level < 30) {
      this.inst.xp -= echoXpToNext(this.inst.level);
      this.inst.level++;
      this.refreshStats();
      this.hp = this.maxHp;
      G.ui.toast(`${this.name} reached level ${this.inst.level}`, 'good');
      fx.holyBurst(this.x, this.y - 30, 12, 0.7);
      sfx('pickup', { pitch: 1.3 });
    }
  }

  takeHit(h: HitInfo): boolean {
    if (this.invuln > 0 || this.recallT > 0 || this.summonT > 0.4 || this.despawn > 0) return false;
    // Sentinel guard blocks frontal blows.
    if (this.sentinel && h.dir !== 0 && sign(h.dir) !== this.face && this.state === 'follow' && Math.random() < 0.5 + this.inst.stage * 0.15) {
      sfx('block', { pan: G.world.pan(this.x), vol: 0.7 });
      fx.hitSparks(this.x + this.face * 10, this.y - 24, -this.face, '#fff1c4', 6);
      this.hp -= h.dmg * 0.2;
    } else {
      this.hp -= h.dmg * (this.sentinel ? 0.8 : 1);
      this.flash = 0.12;
      this.body.vx = h.kx * 0.4;
      fx.hitSparks(this.cx, this.cy, h.dir || 1, '#ffe6a8', 5);
      sfx('hit', { pan: G.world.pan(this.x), vol: 0.6 });
    }
    this.inst.hp = this.hp;
    if (this.hp <= 0) {
      this.hp = 0;
      this.inst.hp = 0;
      this.inst.downFor = 25;
      fx.holyBurst(this.cx, this.cy, 20, 1);
      sfx('enemyDie', { pitch: 1.5 });
      G.ui.toast(`${this.name} faded. It will return in 25 seconds.`, 'warn');
      this.remove = true;
      G.world.onEchoFallen(this);
    }
    G.ui.refreshHud();
    return true;
  }

  recall() {
    this.recallT = 0.45;
    this.state = 'follow';
    if (skillRank(G.save, 'c_recall')) {
      this.invuln = 2;
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.25);
      this.inst.hp = this.hp;
    }
  }

  dismiss() {
    this.despawn = 0.5;
    fx.column(this.x, this.y, 30, 80, '#ffe6a8', 0.5);
    this.inst.hp = this.hp;
  }

  syncStrike(t: Entity, mult: number) {
    this.x = t.x - (this.slot % 2 ? 1 : -1) * 28;
    this.y = t.y;
    this.face = sign(t.x - this.x) || 1;
    this.body.vx = this.body.vy = 0;
    fx.column(this.x, this.y, 26, 90, '#fff3c4', 0.5);
    const atk = echoAtk(G.save, this.inst, G.d) * mult;
    t.takeHit({ dmg: atk * 2.5, poise: 60, kx: this.face * 160, ky: -200, dir: this.face, kind: 'echo', src: this, stop: 0.03 });
    fx.slash(t.x, t.cy, 26, -2.2, 0.8, 9, this.face, '#ffffff', '#ffe6a8', 0.25);
    this.gainXp(4);
  }

  draw(ctx: Ctx) {
    const reveal = this.summonT > 0 ? clamp(1 - this.summonT / 1.1, 0, 1) : 1;
    const fade = this.despawn > 0 ? this.despawn / 0.5 : 1;
    const style = this.sentinel ? sentinelStyle('echo', this.inst.stage) : archerStyle('echo', this.inst.stage);
    if (!this.sentinel) style.bowDraw = this.state === 'draw' ? this.bowDraw : 0;
    // white fire aura
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, this.x, this.y - 18, 30, '#fff3c4', 0.18 * fade);
    ctx.globalCompositeOperation = 'source-over';
    ctx.save();
    if (reveal < 1) {
      // materialize from the top down
      const h = this.body.h + 20;
      ctx.beginPath();
      ctx.rect(this.x - 40, this.y - h, 80, h * reveal + 2);
      ctx.clip();
    }
    ctx.globalAlpha = (this.recallT > 0 ? 0.5 : 0.95) * fade;
    drawRibbon(ctx, this.cape, 11, 15, this.inst.stage >= 1 ? '#e8dcc0' : '#2a2420', '#0a0806');
    ctx.translate(this.x, this.y);
    ctx.scale(this.face, 1);
    drawHumanoid(ctx, this.j, style, G.time + this.id, this.pose.rot);
    ctx.restore();
    ctx.globalAlpha = 1;
    if (this.flash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, this.cx, this.cy, 26, '#ffffff', this.flash * 4);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (reveal < 1) {
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, this.x, this.y - this.body.h * (1 - reveal), 22, '#ffffff', 0.9);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  drawOverlay(ctx: Ctx) {
    // compact health pip bar, shown when hurt
    if (this.hp < this.maxHp && this.despawn <= 0) {
      const w = 16, x = this.x - w / 2, y = this.y - this.body.h - 8;
      ctx.fillStyle = 'rgba(8,6,12,0.7)';
      ctx.fillRect(x - 0.5, y - 0.5, w + 1, 2.6);
      ctx.fillStyle = '#e8c86a';
      ctx.fillRect(x, y, w * (this.hp / this.maxHp), 1.6);
    }
    if (this.inst.commander) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba('#ffe6a8', 0.5);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, 60, 10, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  lights() {
    lighting.add(this.x, this.y - 20, 70, '#fff3c4', 0.6, 0.3);
  }
}
