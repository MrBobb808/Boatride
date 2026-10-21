import type { EchoRole, EchoOrder } from './data';

export type TargetPreference = 'ranged' | 'boss' | 'crowd';
export interface SquadIntent {
  role: EchoRole | 'all';
  action: EchoOrder | 'follow' | 'summon' | 'dismiss' | 'recall' | 'sync';
  priority?: TargetPreference;
  summon?: 'one' | 'two' | 'squad' | 'all';
}
export type SquadParse = { ok: true; intents: SquadIntent[] } | { ok: false; message: string };
const roles: [EchoRole, RegExp][] = [
  ['guardian', /\b(guardians?|tanks?)\b/], ['mage', /\b(mages?|wizards?)\b/],
  ['ninja', /\b(ninjas?|assassins?)\b/], ['fighter', /\b(fighters?|brawlers?)\b/],
  ['ranger', /\b(rangers?)\b/], ['herald', /\b(heralds?|healers?)\b/],
];

/** Match supported orders explicitly. Unclear or negative speech changes nothing. */
export function parseSquadOrders(transcript: string): SquadParse {
  const fail = (message: string): SquadParse => ({ ok: false, message });
  if (transcript.length > 400) return fail('Keep orders to four short instructions.');
  const text = transcript.toLowerCase().replace(/[’']/g, '').replace(/[.!?:]/g, '').trim();
  if (!text || /\b(dont|do not|never|not|cancel|no)\b/.test(text)) return fail('Order unclear. Try “Guardian, protect me” or “Ninja, attack archers.”');
  // A comma after a role is punctuation, while commas between orders separate clauses.
  const clauses = text.replace(/\b(guardian|mage|ninja|fighter|ranger|herald|healer|everyone|echoes|shadows),\s*/g, '$1 ').split(/\s*(?:;|,|\band\b|\bthen\b)\s*/).filter(Boolean);
  if (clauses.length > 4) return fail('Give up to four orders at a time.');
  const intents: SquadIntent[] = [];
  for (const clause of clauses) {
    const matched = roles.filter(([, pattern]) => pattern.test(clause));
    if (matched.length > 1) return fail('Give each role its own instruction, separated by “and”.');
    const role: SquadIntent['role'] = matched.length ? matched[0][0] : 'all';
    if (role === 'all' && !/^(please\s+)?(all|everyone|everybody|echoes|shadows|squad|summon|dismiss|recall|regroup|sync|protect|defend|guard|hold|stay|flank|follow|come|return|attack|hunt|target|focus|control|fight|eliminate|take out)\b/.test(clause)) return fail('Name a squad role or begin with an order such as “Protect me”.');
    if (/\bsummon\b/.test(clause) && role === 'all') {
      const summon = /\b(one|1)\b/.test(clause) ? 'one' : /\b(two|2)\b/.test(clause) ? 'two' : /\b(my|picked|selected) squad\b/.test(clause) ? 'squad' : 'all';
      intents.push({ role, action: 'summon', summon }); continue;
    }
    if (/\b(dismiss|recall|regroup|sync)\b/.test(clause) && role === 'all') {
      intents.push({ role, action: /\bdismiss\b/.test(clause) ? 'dismiss' : /\bsync\b/.test(clause) ? 'sync' : 'recall' }); continue;
    }
    let action: SquadIntent['action'] | undefined;
    let priority: TargetPreference | undefined;
    if (/\b(hold|stay here|defend (this|that) (spot|position))\b/.test(clause)) action = 'hold';
    else if (/\b(guard|protect|defend|stay (close|near)|keep .+ (close|near))\b/.test(clause)) action = 'guard';
    else if (/\b(flank|get behind|attack from behind)\b/.test(clause)) action = 'flank';
    else if (/\b(follow|come back|return to me)\b/.test(clause)) action = 'follow';
    else if (/\b(attack|hunt|target|focus|control|fight|eliminate|take out)\b/.test(clause)) {
      priority = /\b(boss|champion)\b/.test(clause) ? 'boss' : /\b(archers?|casters?|ranged|priests?)\b/.test(clause) ? 'ranged' : /\b(groups?|crowds?)\b/.test(clause) ? 'crowd' : undefined;
      action = /\bfocus\b/.test(clause) && !priority ? 'focus' : 'hunt';
    }
    if (!action) return fail(`Couldn’t understand “${clause}”. Use protect, hunt, flank, hold, focus, or follow.`);
    intents.push({ role, action, priority });
  }
  return intents.length ? { ok: true, intents } : fail('Say an order first.');
}
