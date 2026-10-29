// The Echoes: purified battle-imprints that fight beside Elior (remnant/src/game/echoes.ts,
// echoRoles.ts, squadOrders.ts, echoCombos.ts run unchanged). This is the
// squad's side of the original's world.ts: summoning (one, two, the squad or
// the whole lineup), orders, the Switch (a benched Echo steps in, or Elior
// trades places with one), recall, mark target, sync strike, and an Echo's
// return after it falls.

import { G } from './shim/ctx';
import { input } from './shim/input';
import { EchoUnit } from '../../../remnant/src/game/echoes';
import { EchoCombinations } from '../../../remnant/src/game/echoCombos';
import { echoMaxHp, skillRank, leadEcho, echoName } from '../../../remnant/src/game/state';
import { ECHO_SPECIES, type EchoOrder } from '../../../remnant/src/game/data';
import { Marshal } from '../../../remnant/src/game/bosses2';
import { fx } from '../../../remnant/src/render/fx';
import { T, TILE } from '../../../remnant/src/game/tiles';
import type { Entity } from '../../../remnant/src/game/entity';
import type { ClassicLayer } from './layer';

type Command = 'toggle' | 'aggressive' | 'defensive' | 'follow' | 'target' | 'recall' | 'sync' | 'switch';
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export class Squad {
  echoes: EchoUnit[] = [];
  combos = new EchoCombinations();
  priorityTarget: Entity | null = null;
  /** The Echo a swap would trade places with right now (marked over its head). */
  swapPick: EchoUnit | null = null;
  switchCd = 0;
  syncCd = 0;

  constructor(private L: ClassicLayer) {}

  private get p() { return this.L.playerView; }
  private toast(t: string) { G.ui.toast(t); }

  /** The Marshal's honour duel: Elior fights alone. */
  get duel() { return this.L.bossActive && this.L.boss instanceof Marshal && !this.L.boss.dying; }

  clear() {
    this.echoes = [];
    this.priorityTarget = null;
    this.swapPick = null;
    this.combos.reset();
  }

  update(dt: number) {
    this.switchCd = Math.max(0, this.switchCd - dt);
    this.syncCd = Math.max(0, this.syncCd - dt);
    this.recover(dt);
    for (const e of this.echoes) try { e.update(dt); } catch (err) { this.L.fault(e, err); }
    this.combos.update(dt);
    this.echoes = this.echoes.filter((e) => !e.remove);
    if (this.priorityTarget && (this.priorityTarget.dying || this.priorityTarget.remove)) this.priorityTarget = null;
    this.swapPick = this.switchCd <= 0 && !this.duel && !this.benchReady() ? this.pickSwap() : null;
  }

  /** Call out the lineup the summon preset names, beside Elior. */
  summonEchoes(silent = false) {
    if (this.duel) return;
    const s = G.save, slots = G.d.echoSlots;
    s.active = s.active.filter((u: string) => s.echoes.some((e: { uid: string }) => e.uid === u)).slice(0, slots);
    const call = this.summonList();
    for (const e of this.echoes) if (!call.includes(e.inst.uid) && e.tempT <= 0 && e.despawn <= 0) e.dismiss();
    let i = 0;
    for (const u of call) {
      if (this.echoes.some((e) => e.inst.uid === u && e.despawn <= 0)) { i++; continue; }
      const inst = s.echoes.find((e: { uid: string }) => e.uid === u)!;
      if ((inst.downFor ?? 0) > 0) continue;
      if (inst.hp <= 0) inst.hp = echoMaxHp(s, inst, G.d);
      const p = this.p;
      const x = clamp(p.x - p.face * (24 + i * 18), 20, this.L.grid.w * TILE - 20);
      const e = new EchoUnit(inst, x, p.y, i);
      if (silent) e.summonT = 0.5;
      this.echoes.push(e);
      if (!silent) {
        fx.column(x, p.y, 34, 160, '#fff3c4', 0.9);
        fx.ring(x, p.y - 2, 6, 40, '#ffe6a8', 0.4, 2, 0.3);
      }
      i++;
    }
    s.flags.army_out = true;
  }

  dismissEchoes() {
    for (const e of this.echoes) e.dismiss();
    G.save.flags.army_out = false;
  }

  /** Which Echoes the summon preset calls out, in order. */
  summonList(): string[] {
    const s = G.save, slots = G.d.echoSlots, pre = s.summonPreset ?? 'all';
    if (pre === 'squad') {
      const pick = (s.squadPick ?? []).filter((u: string) => s.echoes.some((e: { uid: string }) => e.uid === u)).slice(0, slots);
      if (pick.length) return pick;
    }
    const line: string[] = s.active.slice(0, slots);
    if (pre !== 'one' && pre !== 'two') return line;
    // The lead (or lead two) still standing: a fallen lead's place is taken until it returns.
    const up = line.filter((u) => (s.echoes.find((e: { uid: string }) => e.uid === u)?.downFor ?? 0) <= 0);
    return up.slice(0, pre === 'one' ? 1 : 2);
  }

  setSummon(pre: 'one' | 'two' | 'squad' | 'all') {
    const s = G.save;
    if (pre === 'squad' && !(s.squadPick ?? []).some((u: string) => s.echoes.some((e: { uid: string }) => e.uid === u))) {
      this.toast('Pick your squad first: each Echo can be marked "In squad" (with the Echo menus).');
      return;
    }
    s.summonPreset = pre;
    if (!s.active.length) s.active = s.echoes.slice(0, G.d.echoSlots).map((e: { uid: string }) => e.uid);
    this.summonEchoes();
    // The bond follows how many are called: fewer Echoes, each stronger.
    for (const e of this.echoes) e.refreshStats();
    const n = this.summonList().length;
    this.toast(pre === 'one' ? 'Summon: the lead Echo' : pre === 'two' ? 'Summon: the lead two' : pre === 'squad' ? `Summon: your squad (${n})` : `Summon: the whole lineup (${n})`);
  }

  /** One Echo, chosen, fights beside the hero alone with the whole bond. */
  choose(uid: string) {
    const s = G.save;
    if (!leadEcho(s, uid, G.d.echoSlots)) return;
    this.summonEchoes();
    for (const e of this.echoes) e.refreshStats();
    this.toast(`${echoName(s, uid)} fights beside you, with the whole bond`);
  }

  /** Give every summoned Echo an order (or one, by uid). */
  orderEchoes(order: EchoOrder | undefined, uid?: string) {
    const p = this.p;
    const foe = (this.priorityTarget && !this.priorityTarget.dying ? this.priorityTarget : null)
      ?? (p.lastFoe && !p.lastFoe.dying && !p.lastFoe.remove ? p.lastFoe : null)
      ?? this.nearestEnemy(p.x + p.face * 40, p.y - 20, 320, 0);
    if (order === 'focus' && !foe) { this.toast('No enemy in sight to focus on.'); return; }
    let n = 0;
    for (const e of this.echoes) {
      if (uid && e.inst.uid !== uid) continue;
      e.setOrder(order, foe);
      n++;
    }
    if (uid && !n) {
      const inst = G.save.echoes.find((e: { uid: string }) => e.uid === uid);
      if (inst) inst.order = order === 'focus' || order === 'hold' ? undefined : order;
    }
    if (order === 'hold') fx.ring(p.x, p.y, 6, 40, '#9fd7ff', 0.35, 2);
  }

  /** Whether Switch rotates in a benched Echo (whole-lineup preset only) rather than swapping places. */
  benchReady() {
    const s = G.save;
    if ((s.summonPreset ?? 'all') !== 'all') return false;
    for (const e of s.echoes) if ((e.downFor ?? 0) <= 0 && s.active.indexOf(e.uid) < 0) return true;
    return false;
  }

  /** The Echo a swap trades places with: the nearest in the aimed direction, else the farthest. */
  pickSwap(): EchoUnit | null {
    const p = this.p, axis = input.axisX;
    const ax = Math.abs(axis) > 0.35 ? Math.sign(axis) : p.face;
    let best: EchoUnit | null = null, bestD = Infinity, far: EchoUnit | null = null, farD = 0;
    for (const e of this.echoes) {
      if (e.despawn > 0 || e.recallT > 0 || e.summonT > 0.4) continue;
      const dx = e.x - p.x, d = Math.hypot(dx, e.y - p.y);
      if (d < 40 || d > 700) continue;
      if (Math.sign(dx) === ax && d < bestD) { best = e; bestD = d; }
      if (d > farD) { far = e; farD = d; }
    }
    return best ?? far;
  }

  onEchoFallen(e: EchoUnit) { this.echoes = this.echoes.filter((x) => x !== e); }

  /** A fallen Echo returns after its time down. */
  private recover(dt: number) {
    const s = G.save;
    for (const inst of s.echoes) {
      if ((inst.downFor ?? 0) <= 0) continue;
      inst.downFor -= dt;
      if (inst.downFor > 0) continue;
      inst.downFor = 0;
      inst.hp = echoMaxHp(s, inst, G.d);
      if (s.active.includes(inst.uid) && s.flags.army_out === true && !G.inCutscene) {
        this.summonEchoes();
        this.toast(`${ECHO_SPECIES[inst.species].stages[inst.stage].name} returns to your side`);
      }
    }
  }

  echoAssist(target: Entity) {
    this.echoes.find((x) => x.assistCd <= 0 && x.despawn <= 0)?.assist(target);
  }

  /**
   * Switch support. With Echoes on the bench, the lead steps back and the next
   * steps in already swinging; with none, Elior trades places with an Echo.
   */
  switchSupport() {
    const s = G.save;
    if (this.duel) { this.toast('An honour duel: your Echoes kneel and watch.'); return; }
    if (!s.echoes.length) { this.toast('You have no Echoes yet.'); return; }
    if (this.switchCd > 0) { this.toast(`Switch ready in ${Math.ceil(this.switchCd)}s`); return; }
    if (!this.echoes.length && s.flags.army_out !== true) { this.echoCommand('toggle'); return; }
    const p = this.p;
    const target = (this.priorityTarget && !this.priorityTarget.dying ? this.priorityTarget : null) ?? this.nearestEnemy(p.x, p.y - 20, 260, 0);
    const bench = this.benchReady() ? s.echoes.filter((e: { uid: string; downFor?: number }) => !s.active.includes(e.uid) && (e.downFor ?? 0) <= 0) : [];
    if (bench.length) {
      const outUid = s.active[0], incoming = bench[0];
      s.active = [...s.active.filter((u: string) => u !== outUid), incoming.uid];
      if (outUid) {
        const outInst = s.echoes.find((e: { uid: string }) => e.uid === outUid);
        if (outInst) s.echoes = [...s.echoes.filter((e: unknown) => e !== outInst), outInst];
        this.echoes.find((e) => e.inst.uid === outUid)?.dismiss();
      }
      this.summonEchoes(true);
      this.echoes.find((e) => e.inst.uid === incoming.uid)?.tagIn(target);
      this.switchCd = 4.5;
      this.toast(`Switch: ${ECHO_SPECIES[incoming.species].stages[incoming.stage].name} steps in`);
    } else if (this.echoes.length) {
      const far = this.pickSwap();
      if (!far) { this.toast('Your Echoes are already at your side.'); return; }
      // The fight transfers: the Echo takes over Elior's foe where he stood.
      const foe = p.lastFoe && !p.lastFoe.dying && !p.lastFoe.remove && Math.abs(p.lastFoe.x - p.x) < 220 ? p.lastFoe : this.nearestEnemy(p.x, p.y - 20, 200, 0);
      const px = p.x, py = p.y;
      if (!p.canPlace(far.x, far.y)) { this.toast('No safe opening for an Echo exchange here.'); return; }
      fx.streak(px, py - 20, far.x, far.y - 20, '#ffe6a8', 0.25, 3);
      fx.streak(far.x, far.y - 20, px, py - 20, '#fff3c4', 0.25, 2);
      p.moveTo(far.x, far.y);
      far.x = px;
      far.y = py;
      far.body.vx = far.body.vy = 0;
      p.grantInvuln(0.35);
      fx.ring(p.x, p.y - 20, 4, 30, '#ffe6a8', 0.3, 2);
      fx.ring(far.x, far.y - 20, 4, 30, '#fff3c4', 0.3, 2);
      far.takeOver(foe);
      // Elior arrives with an opening: his next blow lands harder.
      p.swapStrike();
      p.lastFoe = null;
      const there = this.nearestEnemy(p.x, p.y - 20, 160, 0);
      if (there) p.faceTo(Math.sign(there.x - p.x) || p.face);
      this.switchCd = 3;
    }
  }

  echoCommand(cmd: Command) {
    const s = G.save;
    if (!s.echoes.length) { this.toast('You have no Echoes yet.'); return; }
    if (this.duel && cmd !== 'aggressive' && cmd !== 'defensive' && cmd !== 'follow') { this.toast('An honour duel: your Echoes kneel and watch.'); return; }
    const p = this.p;
    switch (cmd) {
      case 'switch': this.switchSupport(); return;
      case 'toggle':
        if (this.echoes.length) this.dismissEchoes();
        else {
          if (!s.active.length) s.active = s.echoes.slice(0, G.d.echoSlots).map((e: { uid: string }) => e.uid);
          this.summonEchoes();
        }
        return;
      case 'aggressive': case 'defensive': case 'follow':
        s.echoMode = cmd;
        this.toast(`Echoes: ${cmd === 'aggressive' ? 'Aggressive — seek and strike' : cmd === 'defensive' ? 'Defensive — guard Elior' : 'Follow — stay close'}`);
        return;
      case 'target': {
        const t = this.nearestEnemy(p.x + p.face * 40, p.y - 20, 300, p.face) ?? this.nearestEnemy(p.x, p.y, 300, 0);
        if (t) { this.priorityTarget = t; this.toast(`Priority target: ${t.name || 'enemy'}`); } else this.toast('No enemy in sight.');
        return;
      }
      case 'recall':
        for (const e of this.echoes) e.recall();
        fx.ring(p.x, p.y - 18, 6, 50, '#ffe6a8', 0.3, 2);
        return;
      case 'sync': {
        if (this.syncCd > 0) { this.toast(`Sync Strike ready in ${Math.ceil(this.syncCd)}s`); return; }
        const t = (this.priorityTarget && !this.priorityTarget.dying ? this.priorityTarget : null) ?? this.nearestEnemy(p.x, p.y, 320, 0);
        if (!t || !this.echoes.length) { this.toast(this.echoes.length ? 'No enemy in sight.' : 'Summon your Echoes first.'); return; }
        const coord = skillRank(s, 'c_sync') > 0;
        this.syncCd = coord ? 7.2 : 12;
        const mult = coord ? 1.5 : 1;
        this.L.slowmo(0.35, 0.4);
        this.echoes.forEach((e, i) => this.L.after(0.08 * i, () => { if (!t.dying) e.syncStrike(t, mult); }));
        return;
      }
    }
  }

  nearestEnemy(x: number, y: number, range: number, dir: number): Entity | null {
    let best: Entity | null = null, bd = range;
    for (const e of this.L.ents) {
      if (!e.isFoe || e.dying || e.remove || !e.canBeTargeted()) continue;
      if (!this.L.host.player.lineOfSight(e.x, e.cy)) continue;
      if (e.isBoss && !e.canBeTargeted()) continue;
      if (dir && Math.sign(e.x - x) !== dir && Math.abs(e.x - x) > 20) continue;
      const d = Math.hypot(e.x - x, (e.y - y) * 0.7);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  commanderAura(x: number, y: number, self?: Entity) {
    for (const e of this.echoes) {
      if (e === self || (!e.inst.commander && !e.kit.warden) || e.despawn > 0) continue;
      if (Math.abs(e.x - x) < 120 && Math.abs(e.y - y) < 60) return 1.15;
    }
    return 1;
  }

  guardianAura(x: number, y: number) {
    for (const e of this.echoes) {
      if (!e.sentinel || e.inst.stage < 1 || e.despawn > 0) continue;
      if (Math.abs(e.x - x) < 70 && Math.abs(e.y - y) < 50) return 0.85;
    }
    return 1;
  }

  groundY(x: number, fromY: number) {
    const g = this.L.grid, tx = Math.floor(x / TILE), ty = Math.floor((fromY - 40) / TILE);
    for (let i = 0; i < 16; i++) if (this.L.solid(g.get(tx, ty + i)) || g.get(tx, ty + i) === T.OneWay) return (ty + i) * TILE;
    return fromY;
  }

  /** A gold chevron over the Echo a swap would trade places with. */
  drawSwapMark(c: CanvasRenderingContext2D) {
    const e = this.swapPick;
    if (!e || !this.echoes.length) return;
    const x = Math.round(e.x), y = Math.round(e.y - e.body.h - 10 + Math.sin(G.time * 5) * 1.5);
    c.fillStyle = '#e2b85a';
    c.beginPath();
    c.moveTo(x - 4, y - 3); c.lineTo(x, y + 1); c.lineTo(x + 4, y - 3); c.lineTo(x + 4, y - 1); c.lineTo(x, y + 3); c.lineTo(x - 4, y - 1);
    c.closePath();
    c.fill();
  }
}
