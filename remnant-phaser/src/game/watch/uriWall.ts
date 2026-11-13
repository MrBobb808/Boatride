// Uri on the Watch's wall (NEXT_PLAN D2): from Watch level 35 the flame-caller stands just behind Elior, drawn from
// his own parts (C08), and hurls a fireball (V10) at the nearest foe every 1.6 seconds. His fire follows Elior's
// strength, as the shadows' does; under the Shadow Mantle it burns the hotter.
import Phaser from 'phaser';
import { actionAtlas, actionFrame, ACTION_CELL, ACTION_FOOT } from '../actionArt';
import type { BandFoe, BandHost } from './shadows';
import { sfx } from '../../../../remnant/src/audio/audio';

const EVERY = 1.6, FLIGHT = 0.35;

export class UriWall {
  private sprite: Phaser.GameObjects.Sprite;
  private ball: Phaser.GameObjects.Sprite;
  private cd = 1;
  private castT = 0;
  private loopT = 0;
  private shot: { f: BandFoe; t: number; x0: number; y0: number; dmg: number } | null = null;
  /** For tests: fireballs thrown and landed. */
  readonly tally = { thrown: 0, landed: 0 };

  constructor(private sc: Phaser.Scene, private host: BandHost, private ground: number) {
    const key = actionAtlas(sc, 'uri', 'blade');
    this.sprite = sc.add.sprite(0, ground, key, 'idle:0').setOrigin(0.5, ACTION_FOOT / ACTION_CELL).setScale(0.74).setDepth(4.6).setVisible(false);
    if (!sc.anims.exists('uri-ball')) sc.anims.create({ key: 'uri-ball', frames: sc.anims.generateFrameNumbers('vfx-uri-fire', { start: 0, end: 5 }), frameRate: 18, repeat: -1 });
    this.ball = sc.add.sprite(0, 0, 'vfx-uri-fire', 0).setScale(0.24).setDepth(8).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
  }

  get shown() { return this.sprite.visible; }

  /** One step. `on`: his level has reached him; `atk`: Elior's blow; `live`: false while Elior is down or a combo plays. */
  tick(dt: number, on: boolean, atk: number, running: boolean, live: boolean) {
    this.sprite.setVisible(on);
    if (!on) { this.ball.setVisible(false); this.shot = null; return; }
    this.loopT += dt; this.cd -= dt; this.castT = Math.max(0, this.castT - dt);
    const hx = this.host.hx, x = hx - 20;
    const foes = this.host.foesAlive();
    if (live && this.cd <= 0 && !this.shot && foes.length) {
      const f = foes.reduce((b, o) => (o.x < b.x ? o : b));
      this.cd = EVERY; this.castT = 0.3; this.tally.thrown++;
      this.shot = { f, t: 0, x0: x + 10, y0: this.ground - 30, dmg: atk * 0.55 };
      this.ball.play('uri-ball').setVisible(true);
      sfx('fireball', { vol: 0.25 });
    }
    if (this.shot) {
      const s = this.shot, u = Math.min(1, (s.t += dt) / FLIGHT), tx = s.f.alive ? s.f.x : s.x0 + 120, ty = this.ground - 22;
      this.ball.setPosition(s.x0 + (tx - s.x0) * u, s.y0 + (ty - s.y0) * u - Math.sin(u * Math.PI) * 8);
      if (u >= 1) {
        this.ball.setVisible(false).stop(); this.shot = null;
        if (s.f.alive) { this.tally.landed++; this.host.hit(s.f, s.dmg, false); this.host.flare(tx, ty, 0xff8a3a, 0.45); }
      }
    }
    const key = this.sprite.texture.key, clip = this.castT > 0 ? 'b1' : running ? 'run' : 'idle';
    const u = this.castT > 0 ? 1 - this.castT / 0.3 : running ? (this.loopT * 1.6) % 1 : (this.loopT / 3) % 1;
    this.sprite.setFrame(actionFrame(this.sc, key, clip, Math.min(0.999, u))).setPosition(Math.round(x), this.ground);
  }

  destroy() { this.sprite.destroy(); this.ball.destroy(); }
}
