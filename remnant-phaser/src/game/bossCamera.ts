import Phaser from 'phaser';
import { G } from '../classic/shim/ctx';
import { settings } from '../classic/shim/settings';
import type { World } from '../scenes/World';

/** Optional framing; story pans and executions keep ownership of the camera. */
export class BossCamera {
  mode: 'none' | 'intro' | 'phase' | 'combat' = 'none';
  private boss: object | null = null;
  private phase = 0;
  private phaseT = 0;
  private shot = { x: 0, y: 0, zoom: 1 };
  constructor(private w: World) {}
  reset() { this.boss = null; this.phase = this.phaseT = 0; this.mode = 'none'; }
  frame(dt: number) {
    const w = this.w, p = w.player, b = w.boss ?? w.cboss ?? w.classic.boss;
    this.mode = 'none';
    if (!b || p.dead || settings.shake === 'off' || G.camera.focus || p.powers?.fin || p.state === 'execute' || p.state === 'transform' || p.state === 'scripted') return null;
    const phaseNumber = 'phase' in b ? Number(b.phase) || 0 : 0;
    if (this.boss !== b) { this.boss = b; this.phase = phaseNumber; this.phaseT = 0; }
    if (phaseNumber !== this.phase) { if (this.phase > 0) this.phaseT = 1.15; this.phase = phaseNumber; }
    this.phaseT = Math.max(0, this.phaseT - dt);
    const intro = b.state === 'intro', phase = this.phaseT > 0 || b.state === 'transition';
    if (b.state !== 'intro' && b.state !== 'transition' && b.state !== 'idle' && b.state !== 'attack' && b.state !== 'kneel' || G.inCutscene && !intro) return null;
    this.mode = intro ? 'intro' : phase ? 'phase' : 'combat';
    const reduced = settings.shake === 'reduced' ? 0.4 : 1;
    const dx = b.x - p.x;
    const width = w.scale.width / w.baseZoom;
    const span = Math.abs(dx) + ('box' in b ? b.box.width : b.body.w) + 150;
    const desired = Math.min(intro ? 1.04 : phase ? 0.94 : 1, width / Math.max(width * 0.82, span));
    const floor = Math.max(w.scale.width / (w.room.w * 16), w.scale.height / (w.room.h * 16)) / w.baseZoom;
    this.shot.zoom = Math.max(floor, 1 + (Math.max(0.82, desired) - 1) * reduced);
    this.shot.x = p.x + Phaser.Math.Clamp(dx * (intro ? 0.34 : 0.2), -70, 70) * reduced;
    this.shot.y = p.y - 24;
    return this.shot;
  }
}
