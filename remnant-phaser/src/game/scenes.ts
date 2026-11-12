// The first screen loads only Boot and Title; the journey (World with its Hud), the Horde and the Watch arrive when
// first opened (NEXT_PLAN.md A3). The service worker still precaches every chunk, so offline play is unchanged.
import type Phaser from 'phaser';

type Key = 'world' | 'horde' | 'watch' | 'title';
const LOAD: Record<Exclude<Key, 'title'>, () => Promise<[string, typeof Phaser.Scene][]>> = {
  world: () => Promise.all([import('../scenes/World'), import('../scenes/Hud')]).then(([w, h]) => [['world', w.World], ['hud', h.Hud]]),
  horde: () => import('../scenes/Horde').then((m) => [['horde', m.Horde]]),
  watch: () => import('../scenes/Watch').then((m) => [['watch', m.Watch]]),
};
const pending = new Map<string, Promise<void>>();

/** Adds a scene (and the scenes it launches) to the game once its module is in. */
export function ensureScene(game: Phaser.Game, key: Key): Promise<void> {
  if (key === 'title' || game.scene.getScene(key)) return Promise.resolve();
  let p = pending.get(key);
  if (!p) {
    p = LOAD[key]().then((list) => { for (const [k, cls] of list) if (!game.scene.getScene(k)) game.scene.add(k, cls, false); });
    // A failed fetch (offline before the precache finished) may be tried again.
    p.catch(() => pending.delete(key));
    pending.set(key, p);
  }
  return p;
}

/** Starts a scene from another, loading it first when it is not in yet. */
export function startScene(from: Phaser.Scene, key: Key, data?: object): Promise<void> {
  return ensureScene(from.game, key).then(() => { from.scene.start(key, data); });
}

/** Warms the chunks while the home screen idles, the journey first, so Continue starts without a wait and the service
 *  worker has every mode cached for offline play. */
export function preloadScenes(game: Phaser.Game) {
  const idle = (fn: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 1500));
  idle(() => {
    ensureScene(game, 'world').then(() => ensureScene(game, 'horde')).then(() => ensureScene(game, 'watch')).catch(() => {});
  });
}
