// A result to share (NEXT_PLAN C5): the end cards of the Trial, its kin, the daily challenge and (in the Phaser build)
// the Horde offer "Share this run" when a host build can draw and hand off a picture of it. The card itself is the
// host's (remnant-phaser/src/game/shareCard.ts); this is only the hook and the button, so the original edition is
// unchanged where no host sets it.
import { btn } from './dom';

export interface ShareResult {
  /** The mode's name, e.g. "The Trial of the Remnant". */
  mode: string;
  /** The big number and what it counts, e.g. "31" and "ROUNDS". */
  big: string; unit: string;
  /** Smaller facts: [label, value]. */
  lines: [string, string][];
  /** The rules of a seeded run (the daily's modifiers), if any. */
  rules?: string;
}
export const shareHook: { share: ((r: ShareResult) => Promise<string>) | null } = { share: null };

/** A "Share this run" button, or nothing where no host can share. */
export function shareButton(r: ShareResult) {
  const share = shareHook.share;
  if (!share) return null;
  const b = btn('Share this run', () => {
    b.textContent = 'Making the card…';
    void share(r).then((said) => { b.textContent = said; }, () => { b.textContent = 'Could not share it'; });
  }, 'btn', { 'data-k': 'go_share' });
  return b;
}
