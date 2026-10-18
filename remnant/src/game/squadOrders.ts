import { G } from './ctx';
import { echoRole, ECHO_ROLES } from './data';
import type { EchoUnit } from './echoes';
import type { Entity } from './entity';
import { parseSquadOrders, type SquadIntent, type TargetPreference } from './squadLanguage';
import { los } from './physics';

const ranged = new Set(['archer', 'priest', 'wisp', 'vessel', 'scribe', 'drone']);

export function preferredSquadTarget(u: EchoUnit, preference: TargetPreference): Entity | null {
  const W = G.world;
  let best: Entity | null = null, score = -Infinity;
  const foes = W.foes();
  for (const t of foes) {
    if (!t.canBeTargeted()) continue;
    const dist = Math.hypot(t.x - u.x, t.cy - u.cy);
    if (dist > 420 || !los(W.grid, W.solid, u.x, u.cy, t.x, t.cy)) continue;
    if (preference === 'boss' && !t.isBoss) continue;
    if (preference === 'ranged' && !ranged.has((t as Entity & { kind?: string }).kind ?? '')) continue;
    let value = -dist;
    if (preference === 'crowd') for (const f of foes) if (f.canBeTargeted() && Math.hypot(f.x - t.x, f.cy - t.cy) < 100) value += 500;
    if (value > score) { best = t; score = value; }
  }
  return best;
}

/** Validate the whole instruction before changing any orders. */
export function applySquadOrders(text: string): { ok: boolean; message: string } {
  const parsed = parseSquadOrders(text);
  if (!parsed.ok) return parsed;
  const W = G.world;
  if (!G.save || !W?.room || G.inCutscene || W.transitioning || W.player.state === 'dead') return { ok: false, message: 'Give orders during free play.' };
  const live = W.echoes.filter(u => !u.remove && u.despawn <= 0 && u.hp > 0);
  const planned: { intent: SquadIntent; units: EchoUnit[]; focus: Entity | null }[] = [];
  for (const intent of parsed.intents) {
    const units = live.filter(u => intent.role === 'all' || echoRole(u.inst) === intent.role);
    if (intent.action !== 'summon' && !units.length) return { ok: false, message: intent.role === 'all' ? 'Summon your Echoes first.' : `Summon a ${ECHO_ROLES[intent.role].name.toLowerCase()} first.` };
    if (intent.action === 'summon' && !G.save.echoes.length) return { ok: false, message: 'Purify an Echo before summoning a squad.' };
    if (intent.summon === 'squad' && !(G.save.squadPick ?? []).length) return { ok: false, message: 'Choose your squad in Echo Orders first.' };
    const focus = intent.action === 'focus' ? (W.priorityTarget?.canBeTargeted() ? W.priorityTarget : W.player.lastFoe?.canBeTargeted() ? W.player.lastFoe : W.nearestEnemy(W.player.x, W.player.cy, 320, 0)) : null;
    if (intent.action === 'focus' && !focus) return { ok: false, message: 'No reachable foe to focus on.' };
    planned.push({ intent, units, focus });
  }
  const results: string[] = [];
  for (const { intent: c, units, focus } of planned) {
    if (c.action === 'summon') { W.setSummon(c.summon ?? 'all'); results.push(`Summon ${c.summon}`); continue; }
    if (c.action === 'dismiss') { W.dismissEchoes(); results.push('Squad dismissed'); continue; }
    if (c.action === 'recall' || c.action === 'sync') { W.echoCommand(c.action); results.push(c.action === 'sync' ? 'Sync strike requested' : 'Squad recalled'); continue; }
    for (const u of units) {
      u.setOrder(c.action === 'follow' ? 'guard' : c.action, focus);
      u.inst.targetPriority = c.priority;
      u.target = null;
    }
    const who = c.role === 'all' ? 'Squad' : ECHO_ROLES[c.role].name;
    results.push(`${who}: ${c.action}${c.priority ? ` · prioritize ${c.priority === 'ranged' ? 'archers and casters' : c.priority === 'crowd' ? 'groups' : 'bosses'}` : ''}`);
  }
  W.autosave(true);
  return { ok: true, message: results.join(' / ') };
}
