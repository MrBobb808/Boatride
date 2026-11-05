// The Unshorn's awakening (POLISH_PLAN §16): the first time Elior faces the King of the North, the king is too
// strong. When the fight turns against him, the Shadow Mantle is offered; he takes it up, and the king beats him down
// anyway. On the edge of falling he prays as Samson prayed (Judges 16:28), the hair of his head grows again (16:22),
// and he rises bare-handed as the Unshorn. From then on, in the Shadow Mantle, Transform again ascends.
import type Phaser from 'phaser';
import type { World } from '../scenes/World';
import { G } from '../classic/shim/ctx';
import { sfx } from '../classic/shim/audio';
import { fx, PK } from '../../../remnant/src/render/fx';
import { Proj } from '../../../remnant/src/game/projectiles';

type Stage = 'idle' | 'prompt' | 'beaten' | 'rising' | 'done';

export class Awakening {
  stage: Stage = 'idle';
  private t = 0;
  private struck = false;
  /** C15: the drawn sequence of the prayer and the rise, played over Elior while the sprite steps aside. */
  private art: Phaser.GameObjects.Image;

  constructor(private w: World) {
    this.art = w.add.image(0, 0, 'unshorn-awakening', 0).setDepth(10).setVisible(false);
  }

  /** Eight frames over the prayer: standing in the Mantle, kneeling, praying, the hair growing, rising to guard. */
  private showArt(on: boolean) {
    const p = this.w.player;
    p.staged = on;
    if (!on) { this.art.setVisible(false); return; }
    const f = this.t >= 4.2 ? 7 : Math.min(6, Math.floor((this.t / 4.2) * 7));
    this.art.setFrame(f).setFlipX(p.face < 0).setOrigin(p.face < 0 ? 0.53 : 0.47, 0.948).setPosition(p.x, p.feet).setVisible(true);
  }

  /** Journeys that beat the king before the form existed receive it on load. */
  sync() {
    const s = this.w.save;
    if (s.flags.ch12_done && !s.flags.unshorn) {
      s.flags.unshorn = true;
      this.w.time.delayedCall(2600, () => this.w.toast('The Unshorn is yours: in the Shadow Mantle, press Transform again to ascend.'));
    }
  }

  private reset() {
    if (this.stage === 'rising') { this.showArt(false); G.inCutscene = false; this.w.hud.cinematicBars(false); this.w.hud.caption(null); G.camera.focus = null; G.camera.zoomTarget = 1; }
    if (this.w.player) this.w.player.deathless = false;
    this.stage = 'idle';
    this.t = 0;
  }

  update(dt: number) {
    const w = this.w, s = w.save, p = w.player, b = w.cboss as unknown as (null | { key: string; state: string; phase: number; cd: number; hp: number; maxHp: number; body: { vx: number } });
    if (s.flags.ch12_done && !s.flags.unshorn) this.sync();
    // Once awakened there is nothing left to stage (the rise itself plays out first).
    if (s.flags.unshorn && this.stage !== 'rising') { if (this.stage !== 'idle' && this.stage !== 'done') this.reset(); return; }
    const fighting = !!b && b.key === 'north_king' && ['idle', 'attack', 'kneel', 'transition'].includes(b.state) && p.hero === 'elior' && !p.dead;
    if (!fighting && this.stage !== 'rising') { if (this.stage !== 'idle') this.reset(); return; }
    const hero = w.classic.hero;
    this.t += dt;
    switch (this.stage) {
      case 'idle':
        // The fight turns: the king's second movement, or half of Elior's health gone.
        if (b!.phase >= 2 || p.hp < p.maxHp * 0.5) {
          this.stage = 'prompt'; this.t = 0; p.deathless = true;
          if (p.mantleT > 0) { this.stage = 'beaten'; break; }
          s.mantle = 100;
          sfx('mantleReady');
          w.banner('HE IS TOO STRONG', 'Take up the Shadow Mantle · G / the MANTLE button');
        }
        break;
      case 'prompt':
        b!.hp = Math.max(b!.hp, Math.ceil(b!.maxHp * 0.34));
        // Taken up, or (if the player waits) it rises in him on its own.
        if (p.mantleT > 0) { this.stage = 'beaten'; this.t = 0; }
        else if (this.t > 6 && p.state !== 'transform' && hero?.tryTransform()) this.t = 0;
        break;
      case 'beaten':
        // He does not fall to Elior before the awakening (his last movement comes after it).
        b!.hp = Math.max(b!.hp, Math.ceil(b!.maxHp * 0.34));
        // The king presses without rest. Elior cannot fall here; the beating goes on until he is on the edge of it.
        if (b!.state === 'idle') b!.cd = Math.min(b!.cd, 0.25);
        if (this.t > 9 && !this.struck && p.hp > p.maxHp * 0.15) {
          // The king's blow that ends the contest: no Mantle stands in front of it.
          this.struck = true;
          p.hp = Math.max(1, Math.round(p.maxHp * 0.08));
          s.hp = p.hp;
          w.playEffect('hurt'); w.playEffect('bossSlam', { vol: 0.8 });
          w.floatText(p.x, p.feet - 50, 'OVERWHELMED', '#ff6a6a', true);
          w.shake(0.014, 300);
        }
        // Not while the king is between movements (his own cinematic holds the camera then).
        if (p.hp <= p.maxHp * 0.15 && p.state !== 'transform' && b!.state !== 'transition') this.rise();
        break;
      case 'rising': {
        // The cinematic: the prayer, the hair growing again, and the rise.
        this.showArt(this.t < 4.5);
        if (this.t >= 2.6 && this.t - dt < 2.6) {
          w.hud.caption('“Howbeit the hair of his head began to grow again after he was shaven.” · Judges 16:22 (KJV)');
          sfx('chant'); sfx('bell', { vol: 0.6 });
          fx.ring(p.x, p.feet - 30, 6, 120, '#ff5a2a', 0.8, 4);
        }
        if (this.t < 4.2 && Math.random() < dt * 40) fx.spawn(PK.Ember, p.x + (Math.random() - 0.5) * 50, p.feet - Math.random() * 10, 0, -60 - Math.random() * 80, 0.8, 2, 0.4, Math.random() < 0.5 ? '#ff5a2a' : '#ffd27a', -20, 1);
        if (this.t >= 4.2 && this.t - dt < 4.2) {
          w.burst(p.x, p.feet, 3, true, 'vfx-unshorn');
          s.flags.unshorn = true;
          p.deathless = false;
          p.releaseState();
          hero?.ascend(32);
          p.hp = Math.round(p.maxHp * 0.75); s.hp = p.hp;
          w.hud.caption(null);
        }
        if (this.t >= 5.2) {
          G.inCutscene = false;
          G.camera.focus = null; G.camera.zoomTarget = 1; G.camera.focusRate = 8;
          w.hud.cinematicBars(false);
          this.stage = 'done';
          w.toast('The Unshorn: from now on, in the Shadow Mantle press Transform (G) again to ascend.');
          w.persist();
        }
        break;
      }
    }
  }

  /** On the edge of falling: everything stops, and he prays. */
  private rise() {
    const w = this.w, p = w.player, b = w.cboss as unknown as { state: string; cd: number; body: { vx: number }; atk: unknown; hitSet: Set<number> };
    this.stage = 'rising'; this.t = 0;
    G.inCutscene = true;
    w.hud.cinematicBars(true);
    b.state = 'idle'; b.cd = 6; b.body.vx = 0; b.atk = null;
    for (const e of w.classic.ents) if (e instanceof Proj && e.team === 'enemy') e.remove = true;
    p.mantleT = 0;
    p.state = 'scripted';
    w.classic.hero?.playClip('heal', 0.4);
    w.slowTime(4, 0.25);
    // The camera comes to Elior; the king's own caption gives way.
    G.ui.caption?.(null);
    G.camera.focus = { x: p.x, y: p.feet - 30 }; G.camera.zoomTarget = 1.3; G.camera.focusRate = 6;
    w.hud.caption('“O Lord GOD, remember me, I pray thee, and strengthen me, I pray thee, only this once.” · Judges 16:28 (KJV)');
    w.playEffect('heartbeat', { vol: 0.9 });
    w.flashLight(p.x, p.feet - 30, 160, '#ff7a3a', 2.4);
  }
}
