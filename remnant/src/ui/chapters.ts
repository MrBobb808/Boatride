// Pause-menu Chapters tab: travel to any chapter you have reached, begin the
// next one, or step into the training grounds (the Trial of the Remnant).

import { G } from '../game/ctx';
import { h, btn } from './dom';
import { ITEMS, TRIAL_REWARDS, RARITY_NAMES, RARITY_COLORS, SLOT_NAMES } from '../game/data';
import { chapterOf } from '../game/rooms';
import { openLeaderboard } from './leaderboard';
import { CHAPTERS, chapterOpen, travelToChapter, trainingOpen, trainingBest, trainingStarts, startTraining, rushOpen, rushCount, startBossRush, RUSH_MIN } from '../game/chapters';
import { loadBoard, rushClock } from '../game/board';
import { contractBoard } from './progression';
import { dailyBox } from './daily';

/** Kept at the top of Settings so wave entry never disappears below the trophy catalog. */
export function gameModes(close: () => void): HTMLElement {
  const busy = G.world.bossActive || G.world.transitioning;
  return h('div', { class: 'box game-modes' },
    h('h3', null, 'Game modes'),
    trainingOpen() ? [
      h('b', null, 'Endless monster waves'),
      h('p', { class: 'muted' }, `The Trial of the Remnant · highest available round: ${Math.max(1, trainingBest())}. Start fresh for a ranked run, or practise from an unlocked round.`),
      h('div', { class: 'ch-waves' }, trainingStarts().map((w) => btn(w === 1 ? 'Start waves at round 1' : `Continue from round ${w}`, () => { close(); startTraining(w); }, 'btn small' + (w === 1 ? ' primary' : ''), { disabled: busy, 'data-k': 'settings_tw_' + w }))),
      h('hr', { class: 'rule' }),
      h('b', null, 'Boss Gauntlet'),
      h('div', { class: 'ch-waves' }, trainingStarts(true).map((w) => btn(w === 1 ? 'Start boss round 1' : `Boss round ${w}`, () => { close(); startTraining(w, true); }, 'btn small', { disabled: busy, 'data-k': 'settings_bt_' + w }))),
      busy ? h('small', { class: 'muted' }, 'Available after the current boss fight or room transition.') : null,
      h('hr', { class: 'rule' }), contractBoard(close),
    ] : h('p', { class: 'muted' }, 'Recover the covenant relic to unlock endless waves and the Boss Gauntlet. Existing round records keep these modes unlocked.'),
  );
}

export function chaptersTab(close: () => void): HTMLElement {
  const W = G.world;
  const s = G.save;
  const busy = W.bossActive || W.transitioning;
  const here = chapterOf(W.room.id);
  const rows = CHAPTERS.map((c) => {
    const open = chapterOpen(c);
    const status = c.done() ? 'Complete' : c.reached() ? (here === c.n ? 'You are here' : 'In progress') : open ? 'Ready to begin' : `Locked: finish Chapter ${CHAPTERS[c.n - 2].roman} first`;
    const action = open && !busy
      ? btn(c.reached() ? 'Travel' : 'Begin', () => { close(); travelToChapter(c); }, 'btn small', { 'data-k': 'ch_' + c.n })
      : null;
    return h('div', { class: 'row-item ch-row', style: open ? '' : 'opacity:0.5' },
      h('div', { class: 'ch-num' }, c.roman),
      h('div', { class: 'ch-text' },
        h('b', null, c.title),
        h('span', { class: 'muted' }, c.blurb),
        h('small', null, `${status} · level ${c.level}+`),
      ),
      action,
    );
  });
  const best = trainingBest();
  const training = trainingOpen()
    ? h('div', { class: 'box' },
      h('h3', null, 'The Trial: endless rounds'),
      h('div', { class: 'ch-waves' },
        busy ? h('span', { class: 'muted' }, 'Not during a boss fight.') : trainingStarts().map((w) => btn(w === 1 ? 'Start at round 1' : `Round ${w} (unranked)`, () => { close(); startTraining(w); }, 'btn small' + (w === 1 ? ' primary' : ''), { 'data-k': 'tw_' + w })),
        btn('Leaderboard', () => openLeaderboard(), 'btn small', { 'data-k': 'tw_board' }),
      ),
      h('p', { class: 'muted' }, 'Survive round after round of foes that grow stronger, faster and more numerous. Every fifth round the Pack runs; every tenth a Champion comes. Beyond wave 30, incoming damage keeps increasing. The run ends when you fall, and runs from round 1 go on the leaderboard. Wave experience is shared across its enemies, granting steady progress toward your next level.'),
      h('p', { class: 'muted' }, 'Every cleared wave awards a random Legendary or Covenant weapon or armor piece directly in Equipment. Every fifth wave guarantees a weapon. Higher waves and hero levels increase reward Power. Choose a blessing, then pause to equip your new gear. Enemies scale with the wave, so leveling up helps you overpower earlier rounds.'),
      h('p', { class: 'muted' }, 'Every ten cleared waves also guarantees a milestone item, and the next sector changes the environment and platforms. Leave through Chapters when you are ready.'),
      h('div', { class: 'list trial-rewards' }, TRIAL_REWARDS.map((id, i) => {
        const wave = (i + 1) * 10, item = ITEMS[id], earned = (s.trialMilestones ?? []).includes(wave);
        return h('div', { class: 'row-item', 'data-wave': String(wave) },
          h('span', { class: 'tag' }, `WAVE ${wave}`),
          h('div', null, h('b', { style: `color:${RARITY_COLORS[item.rarity ?? 0]}` }, item.name),
            h('div', { class: 'sub' }, `${RARITY_NAMES[item.rarity ?? 0]} · ${SLOT_NAMES[item.slot as keyof typeof SLOT_NAMES]} · ${earned ? 'Claimed' : 'Guaranteed reward'}`)));
      })),
      h('small', { class: 'muted' }, 'Beyond wave 100: Worldbreaker, Eternal Bastion and Heart of Ascendancy repeat with higher Ascension ranks. Each rank adds 15% base gear power, up to +1500%.'),
      best ? h('small', { class: 'muted' }, `Best available: round ${best}. Reach rounds 10, 20, 30… to practise from them.`) : null,
    )
    : null;
  return h('div', { class: 'col scroll', style: 'flex:1' },
    h('div', { class: 'box' }, h('h3', null, 'Chapters'), h('div', { class: 'list' }, rows)),
    training,
    bossRush(close, busy),
    dailyBox(close, busy),
    trainingOpen() ? h('div', { class: 'box' }, contractBoard(close)) : null,
    trainingOpen() ? h('div', { class: 'box boss-trial' },
      h('div', { class: 'eyebrow' }, 'Endless challenge'),
      h('h3', null, 'The Boss Gauntlet'),
      h('p', { class: 'muted' }, 'One chapter boss at a time. The Gilded Idol, Gatekeeper, Crimson Marshal, Locust King, Image of Gold and Weigher repeat forever. Completing VII adds Varkhos; completing VIII adds Morvane; completing IX adds Azkar. Each round adds 22% health and 10% damage; attacks gradually accelerate. No ordinary enemies. Recover 20% health between fights; earn a Balm and loot each full cycle. Campaign progress stays intact.'),
      h('div', { class: 'ch-waves' },
        busy ? h('span', { class: 'muted' }, 'Not during a boss fight.') : trainingStarts(true).map((w) => btn(w === 1 ? 'Start boss round 1' : `Boss round ${w} (unranked)`, () => { close(); startTraining(w, true); }, 'btn small' + (w === 1 ? ' primary' : ''), { 'data-k': 'bt_' + w })),
        btn('Boss leaderboard', () => openLeaderboard(true), 'btn small', { 'data-k': 'bt_board' }),
      ),
      h('small', { class: 'muted' }, `Best: ${trainingBest(true)} bosses defeated. Records are separate from survival.`),
    ) : null,
  );
}

/** The Boss Rush: every boss beaten so far, back to back, against the clock. */
function bossRush(close: () => void, busy: boolean): HTMLElement {
  const n = rushCount(), open = rushOpen();
  const top = loadBoard('rush')[0];
  const best = top ? (top.done ? `Best: ${top.rounds}/${top.total ?? top.rounds} in ${rushClock(top.time)}.` : `Best: ${top.rounds}/${top.total ?? top.rounds} bosses.`) : 'No runs yet.';
  return h('div', { class: 'box boss-rush', style: open ? '' : 'opacity:0.6' },
    h('div', { class: 'eyebrow' }, 'Against the clock'),
    h('h3', null, 'Boss Rush'),
    h('p', { class: 'muted' }, `Every boss you have beaten, in story order, one after another. A short breather between fights restores some health and your Balm. Boss difficulty applies. Nothing is earned or lost: campaign progress, gear and experience stay as they are.`),
    h('div', { class: 'ch-waves' },
      open
        ? btn(`Start Boss Rush · ${n} bosses`, () => { close(); startBossRush(); }, 'btn small primary', { disabled: busy, 'data-k': 'rush_start' })
        : h('span', { class: 'muted', 'data-k': 'rush_locked' }, `Locked: defeat ${RUSH_MIN} bosses in the story (${n}/${RUSH_MIN}).`),
      btn('Rush leaderboard', () => openLeaderboard('rush'), 'btn small', { 'data-k': 'rush_board' }),
    ),
    open ? h('small', { class: 'muted' }, busy ? 'Available after the current boss fight or room transition.' : best) : null,
  );
}
