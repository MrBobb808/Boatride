// Uri on the Watch's wall (NEXT_PLAN D2): from Watch level 35 the flame-caller stands just behind Elior, drawn from
// his own parts (C08), and hurls a fireball (V10) at the nearest foe every 1.6 seconds. His fire follows Elior's
// strength, as the shadows' does. His orc shaman (C10) stands behind him and chants a smaller fire of his own at the
// foe next in line. Under the Shadow Mantle they are one: the shaman steps into Uri (the Fusion of Flame, C09), who
// stands larger and throws twin fireballs, harder.
import Phaser from 'phaser';
import { actionAtlas, actionFrame, ACTION_CELL, ACTION_FOOT } from '../actionArt';
import type { BandFoe, BandHost } from './shadows';
import { sfx } from '../../../../remnant/src/audio/audio';

const FLIGHT = 0.35;
type Who = 'uri' | 'shaman' | 'twin';

/** One thrower: its own clock, its own ball in the air. */
class Thrower {
  cd: number;
  castT = 0;
  shot: { f: BandFoe; t: number; x0: number; y0: number; dmg: number } | null = null;
  ball: Phaser.GameObjects.Sprite;
  constructor(sc: Phaser.Scene, cd: number, scale: number, readonly every: number) {
    this.cd = cd;
    this.ball = sc.add.sprite(0, 0, 'vfx-uri-fire', 0).setScale(scale).setDepth(8).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
  }
  stop() { this.ball.setVisible(false).stop(); this.shot = null; }
}

export class UriWall {
  private sprite: Phaser.GameObjects.Sprite;
  private shaman: Phaser.GameObjects.Sprite;
  private ghost: Phaser.GameObjects.Sprite;
  private uri: Thrower;
  private chant: Thrower;
  private twin: Thrower;
  private loopT = 0;
  private fusedBefore = false;
  /** For tests: fireballs thrown and landed, the shaman's chants, and the twin fireballs of the Fusion. */
  readonly tally = { thrown: 0, landed: 0, chants: 0, twins: 0, fusions: 0 };

  constructor(private sc: Phaser.Scene, private host: BandHost, private ground: number) {
    const key = actionAtlas(sc, 'uri', 'blade'), skey = actionAtlas(sc, 'shaman', 'blade');
    this.sprite = sc.add.sprite(0, ground, key, 'idle:0').setOrigin(0.5, ACTION_FOOT / ACTION_CELL).setScale(0.74).setDepth(4.6).setVisible(false);
    this.shaman = sc.add.sprite(0, ground, skey, 'idle:0').setOrigin(0.5, ACTION_FOOT / ACTION_CELL).setScale(0.7).setDepth(4.5).setVisible(false);
    // The shaman's fire-shape inside Uri while they are one.
    this.ghost = sc.add.sprite(0, ground, skey, 'idle:0').setOrigin(0.5, ACTION_FOOT / ACTION_CELL).setScale(0.86).setDepth(4.55).setVisible(false)
      .setBlendMode(Phaser.BlendModes.ADD).setTint(0xff8a3a);
    if (!sc.anims.exists('uri-ball')) sc.anims.create({ key: 'uri-ball', frames: sc.anims.generateFrameNumbers('vfx-uri-fire', { start: 0, end: 5 }), frameRate: 18, repeat: -1 });
    this.uri = new Thrower(sc, 1, 0.24, 1.6);
    this.chant = new Thrower(sc, 1.9, 0.16, 2.3);
    this.twin = new Thrower(sc, 0.5, 0.2, 1.1);
  }

  get shown() { return this.sprite.visible; }
  get shamanShown() { return this.shaman.visible; }
  get fusedShown() { return this.ghost.visible; }

  /** One step. `on`: his level has reached him; `atk`: Elior's blow; `live`: false while Elior is down or a combo plays;
   * `fused`: the Shadow Mantle is on, and the shaman is in him. */
  tick(dt: number, on: boolean, atk: number, running: boolean, live: boolean, fused = false) {
    this.sprite.setVisible(on);
    if (!on) {
      this.shaman.setVisible(false); this.ghost.setVisible(false);
      this.uri.stop(); this.chant.stop(); this.twin.stop();
      return;
    }
    this.loopT += dt;
    for (const th of [this.uri, this.chant, this.twin]) { th.cd -= dt; th.castT = Math.max(0, th.castT - dt); }
    const hx = this.host.hx, x = hx - 20, sx = x - 34;
    if (fused !== this.fusedBefore) {
      this.fusedBefore = fused;
      if (fused) this.tally.fusions++;
      // The shaman steps into him, or steps out again, in a burst of fire.
      this.host.flare(fused ? x : sx, this.ground - 24, 0xff8a3a, 0.6);
    }
    const foes = this.host.foesAlive();
    // The foe nearest Elior first; the shaman and the twin fireball take the one after it.
    const sorted = foes.slice().sort((a, b) => a.x - b.x);
    this.throwAt(this.uri, sorted[0], x + 10, atk * (fused ? 0.85 : 0.55), live, 'uri');
    if (fused) { this.chant.stop(); this.throwAt(this.twin, sorted[1] ?? sorted[0], x + 4, atk * 0.5, live, 'twin'); }
    else { this.twin.stop(); this.throwAt(this.chant, sorted[1] ?? sorted[0], sx + 8, atk * 0.4, live, 'shaman'); }
    for (const th of [this.uri, this.chant, this.twin]) this.fly(th, dt);

    // Uri: larger, in the Crown, with the shaman burning inside him; or the shaman himself, a step behind.
    const key = actionAtlas(this.sc, 'uri', 'blade', fused), skey = actionAtlas(this.sc, 'shaman', 'blade');
    const uClip = this.uri.castT > 0 || this.twin.castT > 0 ? 'b1' : running ? 'run' : 'idle';
    const uu = uClip === 'b1' ? 1 - Math.max(this.uri.castT, this.twin.castT) / 0.3 : running ? (this.loopT * 1.6) % 1 : (this.loopT / 3) % 1;
    this.sprite.setTexture(key, actionFrame(this.sc, key, uClip, Math.min(0.999, uu))).setScale(fused ? 0.84 : 0.74).setPosition(Math.round(x), this.ground);
    this.shaman.setVisible(!fused);
    this.ghost.setVisible(fused);
    if (fused) {
      this.ghost.setTexture(skey, actionFrame(this.sc, skey, uClip, Math.min(0.999, uu))).setPosition(Math.round(x - 2), this.ground).setAlpha(0.4 + Math.sin(this.loopT * 11) * 0.08);
    } else {
      const sClip = this.chant.castT > 0 ? 'cast' : running ? 'run' : 'idle';
      const su = sClip === 'cast' ? 1 - this.chant.castT / 0.3 : running ? (this.loopT * 1.5) % 1 : (this.loopT / 3) % 1;
      this.shaman.setTexture(skey, actionFrame(this.sc, skey, sClip, Math.min(0.999, su))).setPosition(Math.round(sx), this.ground);
    }
  }

  private throwAt(th: Thrower, f: BandFoe | undefined, x0: number, dmg: number, live: boolean, who: Who) {
    if (!live || th.cd > 0 || th.shot || !f) return;
    th.cd = th.every;
    th.castT = 0.3;
    th.shot = { f, t: 0, x0, y0: this.ground - 30, dmg };
    th.ball.play('uri-ball').setVisible(true);
    this.tally.thrown++;
    if (who === 'shaman') this.tally.chants++;
    if (who === 'twin') this.tally.twins++;
    sfx(who === 'shaman' ? 'chant' : 'fireball', { vol: 0.25 });
  }

  private fly(th: Thrower, dt: number) {
    const s = th.shot;
    if (!s) return;
    const u = Math.min(1, (s.t += dt) / FLIGHT), tx = s.f.alive ? s.f.x : s.x0 + 120, ty = this.ground - 22;
    th.ball.setPosition(s.x0 + (tx - s.x0) * u, s.y0 + (ty - s.y0) * u - Math.sin(u * Math.PI) * 8);
    if (u >= 1) {
      th.stop();
      if (s.f.alive) { this.tally.landed++; this.host.hit(s.f, s.dmg, false); this.host.flare(tx, ty, 0xff8a3a, 0.45); }
    }
  }

  destroy() {
    this.sprite.destroy(); this.shaman.destroy(); this.ghost.destroy();
    for (const th of [this.uri, this.chant, this.twin]) th.ball.destroy();
  }
}
