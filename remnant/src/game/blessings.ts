// Run bonuses never enter the save: equipment and campaign stats stay permanent.
export type BlessingId = 'steel' | 'bond' | 'mending' | 'rhythm' | 'bloodprice' | 'ward' | 'health' | 'energy' | 'balm';
export const BLESSINGS: Record<BlessingId, { name: string; icon: string; cap: number; desc: string }> = {
  steel: { name: 'Tempered Edge', icon: 'sword', cap: 5, desc: '+12% weapon damage per rank.' },
  bond: { name: 'Remnant Bond', icon: 'sync', cap: 5, desc: '+15% Echo damage per rank, including combination attacks.' },
  mending: { name: 'Living Spring', icon: 'heal', cap: 5, desc: 'Regenerate 0.5% maximum health per second per rank after 4 seconds without damage.' },
  rhythm: { name: 'Rift Rhythm', icon: 'switch', cap: 5, desc: 'Skills, weapon throws and Mantle pursuit recharge 18% faster per rank.' },
  bloodprice: { name: 'Reckless Oath', icon: 'greatsword', cap: 5, desc: '+18% weapon damage per rank. Risk: take 10% more damage per rank.' },
  ward: { name: 'Unbroken Ward', icon: 'defensive', cap: 5, desc: 'Take 6% less damage per rank, compounded.' },
  health: { name: 'Restoring Light', icon: 'heal', cap: 0, desc: 'Restore 30% maximum health now.' },
  energy: { name: 'Kindled Covenant', icon: 'core', cap: 0, desc: 'Restore all Covenant Energy now.' },
  balm: { name: 'Pilgrim’s Supply', icon: 'heal', cap: 0, desc: 'Recover one Balm, up to your carrying limit.' },
};

export class RunBlessings {
  active = false;
  ranks: Partial<Record<BlessingId, number>> = {};
  /** A daily challenge's rules: run-only multipliers on weapon, Echo and incoming damage. */
  rule = { weapon: 1, echoes: 1, incoming: 1 };
  reset(active = false) { this.active = active; this.ranks = {}; this.rule.weapon = this.rule.echoes = this.rule.incoming = 1; }
  rank(id: BlessingId) { return this.active ? this.ranks[id] ?? 0 : 0; }
  get weapon() { return (1 + 0.12 * this.rank('steel') + 0.18 * this.rank('bloodprice')) * this.rule.weapon; }
  get echoes() { return (1 + 0.15 * this.rank('bond')) * this.rule.echoes; }
  get regen() { return 0.005 * this.rank('mending'); }
  get recharge() { return 1 + 0.18 * this.rank('rhythm'); }
  get incoming() { return (1 + 0.1 * this.rank('bloodprice')) * 0.94 ** this.rank('ward') * this.rule.incoming; }
  offer(random = Math.random): BlessingId[] {
    const pool = (Object.keys(BLESSINGS) as BlessingId[]).filter(id => !BLESSINGS[id].cap || this.rank(id) < BLESSINGS[id].cap);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, 3);
  }
  take(id: BlessingId) {
    if (!this.active || !Object.prototype.hasOwnProperty.call(BLESSINGS, id)) return false;
    const cap = BLESSINGS[id].cap;
    if (cap && this.rank(id) >= cap) return false;
    if (cap) this.ranks[id] = this.rank(id) + 1;
    return true;
  }
  summary() {
    return (Object.keys(this.ranks) as BlessingId[]).filter(id => this.rank(id)).map(id => `${BLESSINGS[id].name} ${this.rank(id)}`).join(' · ');
  }
}

export const runBlessings = new RunBlessings();
