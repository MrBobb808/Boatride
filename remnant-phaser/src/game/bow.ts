import Phaser from 'phaser';
import { TILE, isSolid, T } from '../shared';
import type { WorldApi, FoeLike } from './types';
import type { Player } from './player';
import type { Dawn } from './dawn';
import type { Element } from '../../../remnant/src/game/power';
import { trank, bowElement } from './archer';
import { spriteFrame, isSpriteWindup } from '../../../remnant/src/render/spriteMotion';
import { G } from '../classic/shim/ctx';
import { settings } from '../classic/shim/settings';
import { ArcherKit } from './archerKit';
import type { ArrowType } from './save';
const STANDARD: readonly ArrowType[] = ['standard'];
/** `back`: a Dawnstep's point-blank arrow (breaks guard). `dawn`: shot under the Wings, drawn with a trail of light.
 * `x0`/`y0`: where it was loosed, for True Aim. `recall`: an arrow pulled back to her. `spike`: the diving arrow. */
interface Arrow { x:number; y:number; vx:number; vy:number; life:number; damage:number; pierce:number; hits:Set<FoeLike>; move:string; back:boolean; dawn:boolean; finisher:boolean; x0:number; y0:number; recall:boolean; spike:boolean;
  /** Ability arrows: `guard` breaks guards, `knock` knocks down, `scale` draws it larger, `frame` fixes its art (-1: by element). `precise` always takes the head. */
  guard:boolean; knock:boolean; scale:number; frame:number; precise:boolean;
  /** `perfect`: loosed in the Perfect Draw window (always a crit). `sure`: always a crit (Shadowstep). `age`: seconds in flight, for the launch flex. */
  perfect:boolean; sure:boolean; age:number }
const FRESH = { back:false, dawn:false, finisher:false, recall:false, spike:false, guard:false, knock:false, scale:0, frame:-1, precise:false, perfect:false, sure:false, age:0 };
/** The colour of an arrow's trail and impact, by its art column. */
const GLOW = [0xe8dcc0, 0x9fd8ff, 0xff8a3a, 0xa0deff, 0xb08aff, 0xffe6a8, 0x8a4ad0, 0xfff1c4];
/** Perfect Draw: releasing a draw in this window (seconds held) looses a perfect shot. */
const PERFECT = [0.62, 0.8] as const, PERFECT_WIDE = [0.58, 0.85] as const;
/** A classic foe's body, as her arrows read it (pinning, interrupts, bosses). */
type Body = { isBoss?: boolean; maxHp?: number; state?: string; st?: number; staggered?: number; stagger?: () => void; glintAt?: number; anim?: { u: number }; body?: { vx: number } };
const bodyOf = (f: FoeLike) => (f as FoeLike & { e?: Body }).e;
/** True Aim: the range where her shots land hardest. */
/** The dagger's three blows: length, where in it the blow lands, the step in, damage, stagger, push and V01 row. */
const DAGGER = [
  { t: 0.24, at: 0.42, step: 80, mul: 0.55, stagger: 0.5, kx: 60, ky: 0, poise: 12, row: 0 },
  { t: 0.24, at: 0.42, step: 80, mul: 0.65, stagger: 0.6, kx: 80, ky: 0, poise: 16, row: 1 },
  { t: 0.32, at: 0.45, step: 40, mul: 0.9, stagger: 1.8, kx: 420, ky: -120, poise: 40, row: 0 },
] as const;
const SWEET = [110, 230, 1.25] as const, SWEET_LONG = [90, 270, 1.45] as const;
/** The arrows of her abilities (Covenant Archer strengthens them). */
const ABILITY_MOVES = new Set(['deliverance', 'jonathan', 'rain']);
const EMBED_MAX = 8;
/** A foe is winding up: a drawn foe glinted this moment, or a sprite foe shows its anticipation frame. */
function windingUp(e: Body | undefined) {
  if (!e || e.isBoss || (e.staggered ?? 0) > 0) return false;
  if (e.glintAt !== undefined && G.time - e.glintAt < 0.12) return true;
  if (!e.state) return false;
  const u = e.anim?.u ?? Math.min(1, (e.st ?? 0) / 0.7);
  return isSpriteWindup(e.state, spriteFrame(e.state, u, e.body?.vx ?? 0, 0, e.state === 'smash' ? 0.64 : e.state === 'slam' ? 0.7 : 0.55));
}
/** Columns of the arrow sheet (C06): plain, charged, then one per element, then light. Row 2 holds the same arrows stuck in the ground. */
const ARROW_FRAME: Record<Element, number> = { fire: 2, frost: 3, storm: 4, holy: 5, shadow: 6, blood: 2 };
const LIGHT = 7, CHARGED = 1;
// Entry time along a swept segment. This catches fast arrows between frames.
function entry(x:number,y:number,dx:number,dy:number,b:Phaser.Geom.Rectangle) {
  let lo = 0, hi = 1;
  for (let axis = 0; axis < 2; axis++) {
    const p = axis ? y : x, d = axis ? dy : dx, min = (axis ? b.top : b.left) - 2, max = (axis ? b.bottom : b.right) + 2;
    if (Math.abs(d) < 0.0001) { if (p < min || p > max) return 2; }
    else { const a = (min-p)/d, z = (max-p)/d; lo = Math.max(lo,Math.min(a,z)); hi = Math.min(hi,Math.max(a,z)); if (lo > hi) return 2; }
  }
  return lo;
}
export class Bow {
  readonly arrows: Arrow[] = Array.from({length:32},()=>({x:0,y:0,vx:0,vy:0,life:0,damage:0,pierce:0,hits:new Set(),move:'',x0:0,y0:0,...FRESH}));
  /** Her six abilities. */
  readonly kit: ArcherKit;
  /** Arrows standing in foes, ripped back through them by Recall. */
  readonly embedded: { foe: FoeLike | null; img: Phaser.GameObjects.Image; dx: number; dy: number; rot: number; t: number }[];
  /** The True Aim tick on the sweet spot while she draws. */
  private tick: Phaser.GameObjects.Image;
  /** After the dagger's kick, the next shot lands point-blank and harder. */
  bashT = 0;
  /** Up close, Strike draws the dagger: two cuts and a kick (`dagger` 1–3, 0 while it is sheathed). */
  dagger = 0;
  daggerT = 0;
  private daggerNext = false;
  private daggerDone = false;
  /** The dagger's cut across the foe (V01 slash art). */
  private cut: Phaser.GameObjects.Image;
  /** Under the Wings, the stab into a foe's back plays on her dagger (`stabT` counts down). */
  stabT = 0;
  /** Strike pressed during a dodge: the backflip shot when it ends. */
  private flipT = 0;
  /** The next creak of the string while she draws. */
  private creakT = 0;
  /** Under the Wings her arrows find crits more often, and each crit carries her behind the foe for the jab. */
  wingsCrit = 0.2;
  /** Counts for the archer checks: True Aim, precision, shot down, interrupted, pinned. */
  readonly tally = { trueAim: 0, precise: 0, shotDown: 0, interrupted: 0, pinned: 0, recalled: 0, perfect: 0, dagger: 0 };
  /** A light streak behind each flying arrow, and the sparks it sheds. */
  private streaks: Phaser.GameObjects.Image[];
  private trail: Phaser.GameObjects.Particles.ParticleEmitter;
  dawn: Dawn | null = null;
  private lampBox={x:0,y:0,w:0,h:0};
  private shotBox=new Phaser.Geom.Rectangle();
  /** One sprite per pooled arrow, and a few that stay a moment where an arrow struck a wall. */
  private sprites: Phaser.GameObjects.Image[];
  private stuck: { img: Phaser.GameObjects.Image; t: number; rot: number }[];
  charge = 0;
  recovery = 0;
  volleyCd = 0;
  drawing = false;
  private queued: 'attack' | 'heavy' | null = null;
  private chargeKey: 'attack' | 'heavy' = 'heavy';
  constructor(private w:WorldApi, private p:Player) {
    this.sprites=this.arrows.map(()=>w.sc.add.image(0,0,'arrows',0).setOrigin(0.93,61/128).setDepth(13).setVisible(false));
    this.streaks=this.arrows.map(()=>w.sc.add.image(0,0,w.sc.textures.exists('fx-streak')?'fx-streak':'glow').setOrigin(1,0.5).setBlendMode(Phaser.BlendModes.ADD).setDepth(12.8).setVisible(false));
    this.trail=w.sc.add.particles(0,0,'vfx-spark',{emitting:false,maxParticles:140,lifespan:{min:160,max:340},speed:{min:6,max:26},scale:{start:0.38,end:0},alpha:{start:0.8,end:0},blendMode:'ADD'}).setDepth(12.7);
    this.stuck=Array.from({length:6},()=>({img:w.sc.add.image(0,0,'arrows',8).setOrigin(0.86,0.6).setDepth(12.9).setVisible(false),t:-1,rot:0}));
    this.embedded=Array.from({length:EMBED_MAX},()=>({foe:null,img:w.sc.add.image(0,0,'arrows',0).setOrigin(0.93,61/128).setScale(0.24).setDepth(9.4).setVisible(false),dx:0,dy:0,rot:0,t:0}));
    this.tick=w.sc.add.image(0,0,'vfx-impacts',0).setScale(0.12).setBlendMode(Phaser.BlendModes.ADD).setDepth(13).setVisible(false);
    this.cut=w.sc.add.image(0,0,'vfx-slashes',0).setBlendMode(Phaser.BlendModes.ADD).setDepth(11).setVisible(false);
    this.kit=new ArcherKit(w,p,this);
  }
  /** Loose an arrow from the pool with the given flight; everything unnamed starts fresh. */
  spawn(o: Partial<Arrow> & { x:number; y:number; vx:number; vy:number; life:number; damage:number; pierce:number; move:string }) {
    const a=this.arrows.find(a=>a.life<=0);if(!a)return null;
    Object.assign(a,FRESH,{x0:o.x,y0:o.y},o);a.hits.clear();
    return a;
  }
  /** The element her arrows carry: the nocked arrow type, or the weapon's own. */
  element(): Element | null {
    const t=this.w.save.arrowType;
    return t&&t!=='standard'&&this.quiver().includes(t)?t:bowElement(this.w.save);
  }
  /** Her rank in a skill-tree node. */
  private r(id:string) { return trank(this.w.save,id); }
  /** The Perfect Draw window (Patient String widens it). */
  private get perfectWin() { return this.r('t_perfect')?PERFECT_WIDE:PERFECT; }
  /** True Aim's band and bonus (Long Sight widens and strengthens it). */
  private get sweet() { return this.r('t_sight')?SWEET_LONG:SWEET; }
  /** Arrow types she has unlocked (`syncArcher` records them as she levels). */
  quiver(): readonly ArrowType[] { return this.w.save.quiver??STANDARD; }
  /** Down + Sub: nock the next arrow type. */
  cycleArrows() {
    const q=this.quiver(),s=this.w.save,i=q.indexOf(s.arrowType??'standard');
    s.arrowType=q[(i+1)%q.length];
    this.w.toast(q.length>1?`${s.arrowType[0].toUpperCase()+s.arrowType.slice(1)} arrows`:'Only standard arrows so far.');
  }
  get embeddedCount() { let n=0; for(const o of this.embedded) if(o.foe) n++; return n; }
  /** The arrow stays in the foe where it struck, until the foe falls or she recalls it. */
  private embed(f:FoeLike,x:number,y:number,a:Arrow,frame:number) {
    const o=this.embedded.find(o=>!o.foe)??this.embedded[0];
    o.foe=f;o.dx=x-f.x;o.dy=y-f.box.top;o.rot=Math.atan2(a.vy,a.vx);o.t=0;
    o.img.setFrame(frame).setRotation(o.rot).setVisible(true);
  }
  /** Recall: every embedded arrow tears back out through its foe and flies home, hitting what's in the way. More arrows, a bigger rip. */
  recall() {
    const p=this.p,n=this.embeddedCount,swift=this.r('t_recall')>0;
    if(!n)return false;
    for(const o of this.embedded) {
      const f=o.foe; if(!f)continue;
      o.foe=null;o.img.setVisible(false);
      if(!f.alive)continue;
      const x=f.x+o.dx,y=f.box.top+o.dy,hp=f.hp,dir=Math.sign(p.x-x)||1;
      if(f.hit(Math.round(p.power()*0.45*(1+0.12*(n-1))*(swift?1.6:1)),dir,1.2,false,{kind:'proj',kx:dir*90,ky:-40,poise:14})){
        this.w.heroHit(f,hp!==undefined&&f.hp!==undefined?Math.max(0,hp-f.hp):0,false);
        this.w.spark(x,y,0xa6efdc,6);
      }
      const d=Math.max(1,Math.hypot(p.x-x,p.feet-30-y)),speed=620;
      this.spawn({x,y,vx:(p.x-x)/d*speed,vy:(p.feet-30-y)/d*speed,life:d/speed,damage:p.power()*0.35*(swift?1.6:1),pierce:3,move:'recall',recall:true})?.hits.add(f);
    }
    // Swift Recall: every arrow home mends her a little.
    if(swift)p.hp=Math.min(p.maxHp,p.hp+p.maxHp*0.01*n);
    this.tally.recalled+=n;
    this.p.noteStyle('recall');
    this.w.playEffect('arrowRecall',{x:this.p.x});
    return true;
  }
  /** Which arrow the sheet draws: light under the Wings, charged for a piercing shot, else the weapon's element. */
  private frameOf(a:Arrow) { if(a.frame>=0)return a.frame; if(a.dawn)return LIGHT; const el=this.element(); if(el&&!a.recall)return ARROW_FRAME[el]; return a.pierce>1?CHARGED:0; }
  private stick(a:Arrow,frame:number) {
    const o=this.stuck.find(o=>o.t<0)??this.stuck.reduce((x,o)=>(o.t>x.t?o:x));
    // The stuck art leans about 38° from the shaft's line; turn it to match the flight.
    o.t=0;o.rot=Math.atan2(a.vy,a.vx)-0.67;o.img.setFrame(8+frame).setPosition(a.x,a.y).setRotation(o.rot).setScale(0.26).setAlpha(1).setVisible(true);
    this.w.spark(a.x,a.y,GLOW[frame],4);
    this.w.playEffect('arrowThunk',{x:a.x,pitch:0.9+Math.random()*0.2});
  }
  cancel() { this.charge=0; this.recovery=0; this.drawing=false;this.queued=null;this.dagger=0;this.cut.setVisible(false); }
  update(dt:number) {
    this.volleyCd=Math.max(0,this.volleyCd-dt);
    this.bashT=Math.max(0,this.bashT-dt);
    this.stabT=Math.max(0,this.stabT-dt);
    this.flipT=Math.max(0,this.flipT-dt);
    for (const o of this.embedded) {
      const f=o.foe; if(!f)continue;
      if(!f.alive){o.foe=null;o.img.setVisible(false);continue;}
      o.t+=dt;
      // A struck arrow quivers a moment before it settles.
      o.img.setPosition(f.x+o.dx,f.box.top+o.dy).setRotation(o.rot+quiver(o.t));
    }
    this.aimTick();
    this.kit.update(dt);
    for (const o of this.stuck) {
      if (o.t<0) continue;
      o.t+=dt;
      if (o.t>=1.2) { o.t=-1; o.img.setVisible(false); continue; }
      o.img.setRotation(o.rot+quiver(o.t));
      if (o.t>0.8) o.img.setAlpha((1.2-o.t)/0.4);
    }
    for (let i=0;i<this.arrows.length;i++) {
      const a=this.arrows[i],img=this.sprites[i],streak=this.streaks[i];
      if (a.life <= 0) { if(img.visible){img.setVisible(false);streak.setVisible(false);} continue; }
      a.life-=dt;a.age+=dt;
      // Hunter's Mark: her own shots curve toward the marked foe.
      const m=this.kit.mark;
      if(m&&m.alive&&!a.back&&!a.recall&&a.move!=='rain'&&a.move!=='morning_star'&&!a.hits.has(m)){
        const want=Math.atan2(m.box.centerY-a.y,m.x-a.x),cur=Math.atan2(a.vy,a.vx),sp=Math.hypot(a.vx,a.vy);
        const turn=Phaser.Math.Clamp(Phaser.Math.Angle.Wrap(want-cur),-4*dt,4*dt);
        a.vx=Math.cos(cur+turn)*sp;a.vy=Math.sin(cur+turn)*sp;
      }
      const dx=a.vx*dt,dy=a.vy*dt;
      let wall=1;
      const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/4));
      let struck=false;
      for(let i=1;i<=steps;i++) { const u=i/steps,t=this.w.tileAt(Math.floor((a.x+dx*u)/TILE),Math.floor((a.y+dy*u)/TILE)); if(isSolid(t as T)) {wall=(i-1)/steps;a.life=0;struck=true;break;} }
      // A shot that meets an enemy projectile destroys it; a quick arrow is spent doing so.
      if(!a.recall) for(const o of this.w.enemyShots()) {
        const r=this.shotBox.setTo(o.x-o.w/2,o.y-o.h/2,o.w,o.h);
        if(entry(a.x,a.y,dx,dy,r)>wall)continue;
        o.remove=true;this.tally.shotDown++;
        this.w.spark(o.x,o.y,0xfff1c4,8);this.w.burst(o.x,o.y,0);
        this.w.save.ce=Math.min(this.p.maxCe,this.w.save.ce+2);
        this.p.noteStyle('shot_down');
        if(--a.pierce<=0){a.life=0;wall=Math.max(0,entry(a.x,a.y,dx,dy,r));break;}
      }
      for(let n=0;n<3 && a.pierce>0;n++) {
        let nearest:FoeLike|null=null, time=2;
        for(const f of this.w.foes()) if(f.alive&&!a.hits.has(f)) { const t=entry(a.x,a.y,dx,dy,f.box);if(t<time&&t<=wall){time=t;nearest=f;} }
        if(!nearest) break;
        a.hits.add(nearest);
        const hp=nearest.hp;
        // Her arrows crit like his blows; a back arrow always does, and a finishing one fells a weakened foe outright.
        const hx=a.x+dx*time,hy=a.y+dy*time,body=bodyOf(nearest),aimed=!a.back&&!a.recall&&a.move!=='morning_star';
        // True Aim: mid range lands hardest. Precision: a shot from range that takes the head (the top quarter) always crits and staggers a little more.
        const sw=this.sweet,travelled=Math.hypot(hx-a.x0,hy-a.y0),trueAim=aimed&&travelled>=sw[0]&&travelled<=sw[1];
        const precise=aimed&&(a.precise||travelled>40&&hy<nearest.box.top+nearest.box.height*0.25);
        const interrupt=aimed&&windingUp(body);
        const wingsCrit=this.dawn?.active?this.wingsCrit+(this.r('t_huntress')?0.15:0):0;
        const crit=a.back||precise||a.perfect||a.sure||(a.move!=='morning_star'&&Math.random()<this.w.d.crit+wingsCrit);
        // Her tree: Headhunter, Elemental Fletching and Covenant Archer.
        const tree=(precise&&this.r('t_heads')?1.35:1)*(!a.recall&&!a.dawn&&this.element()&&this.r('t_fletch')?1.25:1)*(ABILITY_MOVES.has(a.move)&&this.r('t_covenant')?1.3:1);
        let damage=a.damage*(crit&&!a.back?this.w.d.critDmg:1)*(trueAim?sw[2]:1)*this.kit.damageFor(nearest)*tree;
        if(a.finisher&&hp!==undefined&&body&&!body.isBoss&&body.maxHp&&hp<body.maxHp*0.4)damage=Math.max(damage,hp+1);
        if(nearest.hit(Math.round(damage),Math.sign(a.vx),a.back?3:a.pierce>1?2.5:0.8,crit,{kind:'proj',kx:Math.sign(a.vx)*(a.back||a.knock?140:55),ky:a.spike?260:a.knock?-220:a.back?-60:0,poise:(a.back||a.knock?60:a.pierce>1?24:8)+(precise?(this.r('t_heads')?32:16):0),guardBreak:a.back||a.guard,launch:a.knock})) {
          this.w.heroHit(nearest,hp!==undefined&&nearest.hp!==undefined?Math.max(0,hp-nearest.hp):damage,false,crit);
          if(a.back&&!nearest.alive)this.w.finale(nearest.x,nearest.box.centerY,a.finisher?1.2:0.9);
          else if(crit&&!a.back)this.dawn?.critStep(nearest);
          this.p.noteStyle(a.move);
          this.p.comboHits++; this.w.save.bestCombo=Math.max(this.w.save.bestCombo??0,this.p.comboHits);
          this.w.save.ce=Math.min(this.p.maxCe,this.w.save.ce+1);
          this.w.spark(hx,hy,GLOW[this.frameOf(a)],crit?9:5);
          this.w.playEffect('arrowPierce',{x:hx,pitch:0.9+Math.random()*0.2,vol:crit?1:0.8});
          this.dawn?.onArrowHit(nearest);
          if(precise){this.tally.precise++;this.w.spark(hx,hy,0xffffff,6);}
          if(trueAim){this.tally.trueAim++;this.w.spark(hx,hy,0xffd27a,4);}
          // Her answer to a parry: an arrow into a foe's wind-up breaks the attack.
          if(interrupt&&nearest.alive&&body?.stagger){body.stagger();body.staggered=Math.min(body.staggered??1.2,1.2);this.tally.interrupted++;this.w.floatText(nearest.x,nearest.box.top-8,'INTERRUPT','#fff1c4');this.p.noteStyle('interrupt');}
          // A pinning arrow stops in its foe; the last foe an arrow reaches keeps it.
          if((a.move==='bow_pierce'||a.move==='bow_perfect')&&nearest.alive&&!body?.isBoss&&body?.stagger&&this.pin(nearest,Math.sign(a.vx)))a.pierce=1;
          if(a.pierce<=1&&nearest.alive&&!a.dawn&&!a.recall&&!a.back)this.embed(nearest,hx,hy,a,this.frameOf(a));
        }
        if(--a.pierce<=0) {wall=time;a.life=0;}
      }
      const box=this.lampBox;box.x=Math.min(a.x,a.x+dx*wall)-2;box.y=Math.min(a.y,a.y+dy*wall)-2;box.w=Math.abs(dx*wall)+4;box.h=Math.abs(dy*wall)+4;this.w.strikeLamps(box);
      a.x+=dx*wall;a.y+=dy*wall;
      const frame=this.frameOf(a);
      if(struck&&!a.dawn&&!a.recall){this.stick(a,frame);img.setVisible(false);streak.setVisible(false);continue;}
      if(a.life<=0){img.setVisible(false);streak.setVisible(false);continue;}
      this.drawArrow(a,img,streak,frame);
    }
  }
  /** An arrow in flight: it flexes as it leaves the string, charged and perfect shots pulse, a streak of its colour trails it, and it sheds sparks. */
  private drawArrow(a:Arrow,img:Phaser.GameObjects.Image,streak:Phaser.GameObjects.Image,frame:number) {
    const angle=Math.atan2(a.vy,a.vx),flex=Math.sin(a.age*55)*0.09*Math.max(0,1-a.age/0.22);
    const big=a.scale||(a.dawn||a.pierce>1||a.perfect?0.32:0.27),pulse=a.perfect||a.pierce>1||a.scale?1+Math.sin(a.age*32)*0.06:1;
    img.setFrame(frame).setPosition(a.x,a.y).setRotation(angle+flex).setScale(big*pulse).setVisible(true);
    const glow=GLOW[frame],tail=Math.min(1,a.age*9);
    streak.setTint(a.perfect?0xffe6a8:glow).setPosition(a.x-Math.cos(angle)*big*80,a.y-Math.sin(angle)*big*80).setRotation(angle)
      .setScale((a.perfect||a.scale?0.75:0.5)*tail,a.perfect||a.scale?1.2:0.7).setAlpha(settings.reduceFlashes?0.3:0.6).setVisible(true);
    // Sparks from the fletching: embers rise from fire, frost drifts, the rest scatter; standard arrows shed few.
    if(settings.quality==='low'||(frame===0&&!a.perfect&&Math.random()<0.7))return;
    this.trail.setParticleTint(a.perfect?0xffd27a:glow);
    this.trail.gravityY=frame===2?-90:frame===3?40:0;
    this.trail.emitParticleAt(a.x-Math.cos(angle)*big*70,a.y-Math.sin(angle)*big*70,1);
  }
  control(dt:number) {
    const p=this.p,c=this.w.controls;
    if(p.state==='bow'&&this.dagger){this.stepDagger(dt);return true;}
    if(p.state==='bow') {
      p.body.setVelocityX(p.body.velocity.x*Math.exp(-16*dt));
      if(this.drawing) {
        const was=this.charge;
        this.charge=Math.min(1.2,this.charge+dt);
        if(Math.abs(c.axis)>0.25)p.face=Math.sign(c.axis);
        // The Perfect Draw window opens with a gold glint at the bow.
        const pw=this.perfectWin;
        if(was<pw[0]&&this.charge>=pw[0]){this.w.spark(p.x+p.face*15,p.feet-31,0xffd27a,6);this.w.playEffect('perfectChime');}
        // The string creaks tighter the longer she holds.
        this.creakT-=dt;if(this.creakT<=0&&this.charge<1.2){this.creakT=0.17;this.w.playEffect('bowCreak',{x:p.x,pitch:0.8+this.charge*0.55+Math.random()*0.05,vol:0.5+this.charge*0.5});}
        if(!c.down(this.chargeKey)||this.charge>=1.2) {
          const perfect=c.down(this.chargeKey)===false&&this.charge>=pw[0]&&this.charge<=pw[1];
          this.fire(perfect?'pierce':this.charge>=0.55?'pierce':'quick',perfect?'bow_perfect':undefined,perfect);this.drawing=false;this.recovery=0.28;
        }
      } else {
        if(c.pressed('heavy')&&c.down('down')&&this.embeddedCount){this.recall();this.recovery=0.25;this.queued=null;return true;}
        if(c.pressed('attack'))this.queued='attack';
        if(c.pressed('heavy'))this.queued='heavy';
        // She turns during the follow-through, and running cancels it.
        if(Math.abs(c.axis)>0.25)p.face=Math.sign(c.axis);
        if(!this.queued&&Math.abs(c.axis)>0.5&&this.recovery<0.2){this.recovery=0;p.releaseState();return false;}
        this.recovery-=dt;
        if(this.recovery<=0){
          p.releaseState();
          if(this.queued){p.face=p.swingFacing();this.w.playEffect('bowDraw');this.chargeKey=this.queued;this.drawing=true;this.charge=0;this.creakT=0.17;this.queued=null;p.state='bow';}
        }
      }
      return true;
    }
    if(p.state==='dodge'&&c.pressed('attack')){this.flipT=0.35;return false;}
    if(p.state!=='free'&&p.state!=='swim') return false;
    // Down + Heavy: Recall.
    if(c.pressed('heavy')&&c.down('down')&&this.embeddedCount){this.recall();this.recovery=0.25;this.drawing=false;p.state='bow';return true;}
    // Dodge then Strike: a backflip away, loosing as she goes.
    if((this.flipT>0||(c.pressed('attack')&&p.sinceDodge<0.25))&&!p.water.swimming){
      this.flipT=0;p.face=p.swingFacing();
      p.body.setVelocity(-p.face*190,-300);
      this.fire('quick','bow_backflip');this.recovery=0.32;this.drawing=false;p.state='bow';return true;
    }
    // Down + Strike in the air: a diving arrow that spikes foes downward, and a small hop up.
    if(c.pressed('attack')&&c.down('down')&&!p.onGround&&!p.water.swimming){
      p.face=p.swingFacing();
      this.fire('dive');p.body.setVelocityY(Math.min(p.body.velocity.y,-170));this.recovery=0.25;this.drawing=false;p.state='bow';return true;
    }
    if(c.pressed('heavy')||c.pressed('attack')||c.down('heavy'))p.face=p.swingFacing();
    // A foe at arm's length: the dagger, then the kick back into bow range.
    if(c.pressed('attack')&&!c.down('up')&&p.onGround&&this.reach()){this.dagger=1;this.daggerT=0;this.daggerNext=false;this.daggerDone=false;this.drawing=false;this.recovery=0;p.state='bow';this.w.playEffect('swing',{x:p.x,pitch:1.45});return true;}
    if(c.pressed('heavy')||c.down('heavy')) {this.w.playEffect('bowDraw');this.chargeKey='heavy';this.drawing=true;this.charge=0;this.creakT=0.17;this.recovery=0;p.state='bow';return true;}
    if(c.pressed('attack')) {
      if(c.down('up')){this.fire('volley');this.recovery=0.28;this.drawing=false;}
      else {this.w.playEffect('bowDraw');this.chargeKey='attack';this.drawing=true;this.charge=0;this.creakT=0.17;this.recovery=0;}
      p.state='bow';return true;
    }
    return false;
  }
  /** How far through the current dagger blow she is (0–1). */
  get daggerU() { return this.dagger?Math.min(1,this.daggerT/DAGGER[this.dagger-1].t):0; }
  /** The foe at arm's length in front of her, if any. */
  private reach(): FoeLike|null {
    const p=this.p;
    for(const f of this.w.foes()){const dx=f.x-p.x;if(f.alive&&dx*p.face>-f.box.width/2&&Math.abs(dx)-f.box.width/2<26&&Math.abs(f.box.centerY-(p.feet-24))<34)return f;}
    return null;
  }
  /** The dagger: each cut steps in and lands partway through; Strike again before it ends for the next. The kick
   * knocks the foe back into bow range and makes her next shot point-blank; Strike during it nocks that shot. */
  private stepDagger(dt:number) {
    const p=this.p,c=this.w.controls,h=DAGGER[this.dagger-1];
    this.daggerT+=dt;
    if(c.pressed('attack'))this.daggerNext=true;
    const u=this.daggerT/h.t,f=this.reach();
    // She steps in until she's close, never through the foe, however long the frame.
    const room=f?Math.max(0,Math.abs(f.x-p.x)-f.box.width/2-8):h.step;
    p.body.setVelocityX(u<h.at?p.face*Math.min(h.step,room/Math.max(dt,1/120)):p.body.velocity.x*Math.exp(-18*dt));
    if(!this.daggerDone&&u>=h.at){this.daggerDone=true;this.daggerStrike(h);}
    // The cut's arc sweeps with the blade, then fades.
    if(this.dagger<3&&u>=h.at-0.05&&u<=h.at+0.35){const k=(u-h.at+0.05)/0.4;this.cut.setFrame(h.row*6+Math.min(5,Math.floor(k*6))).setPosition(p.x+p.face*18,p.feet-27).setFlipX(p.face<0).setScale(0.3).setAlpha(settings.reduceFlashes?0.45:0.9).setVisible(true);}
    else this.cut.setVisible(false);
    if(u<1)return;
    this.cut.setVisible(false);
    const next=this.daggerNext,kick=this.dagger===3;
    if(next&&!kick&&f){this.dagger++;this.daggerT=0;this.daggerNext=false;this.daggerDone=false;this.w.playEffect('swing',{x:p.x,pitch:1.3+this.dagger*0.1});return;}
    this.dagger=0;p.releaseState();
    // Kicked into range: Strike during the kick goes straight into a draw.
    if(next&&kick){this.w.playEffect('bowDraw');this.chargeKey='attack';this.drawing=true;this.charge=0;this.creakT=0.17;p.state='bow';}
  }
  private daggerStrike(h:(typeof DAGGER)[number]) {
    const p=this.p,d=this.w.d,kick=this.dagger===3;
    let struck=false;
    for(const f of this.w.foes()){
      const dx=f.x-p.x;
      // In front, or close enough to touch.
      if(!f.alive||dx*p.face<-f.box.width/2||Math.abs(dx)-f.box.width/2>30||Math.abs(f.box.centerY-(p.feet-24))>36)continue;
      const crit=Math.random()<d.crit,hp=f.hp;
      // Her tree's Keen Dagger sharpens every cut and the kick.
      const dmg=p.power()*h.mul*(1+this.r('t_blade')*0.1)*(crit?d.critDmg:1);
      if(f.hit(Math.round(dmg),p.face,h.stagger,crit,{kind:'melee',kx:p.face*h.kx,ky:h.ky,poise:h.poise})){
        this.w.heroHit(f,hp!==undefined&&f.hp!==undefined?Math.max(0,hp-f.hp):0,kick,crit);
        this.p.noteStyle(kick?'dagger_kick':'dagger');
        this.p.comboHits++;this.w.save.bestCombo=Math.max(this.w.save.bestCombo??0,this.p.comboHits);
        this.w.save.ce=Math.min(this.p.maxCe,this.w.save.ce+2);
        this.w.spark(f.x-p.face*4,f.box.centerY,crit?0xfff1c4:0xdfe3ea,crit?8:4);
        this.tally.dagger++;
        struck=true;
      }
    }
    if(kick){this.bashT=0.9;this.w.burst(p.x+p.face*16,p.feet-26,2);this.w.playEffect('shieldBash',{x:p.x});}
    else if(struck)this.w.playEffect('slice',{x:p.x+p.face*16,pitch:1.1+Math.random()*0.15});
  }
  /** A charged arrow that drives a foe into a wall pins it there a moment. */
  private pin(f:FoeLike,dir:number) {
    const b=f.box,x=dir>0?b.right+6:b.left-6;
    if(!isSolid(this.w.tileAt(Math.floor(x/TILE),Math.floor(b.centerY/TILE)) as T))return false;
    const e=bodyOf(f)!;
    e.stagger!();e.staggered=1.1;if(e.body)e.body.vx=0;
    this.tally.pinned++;
    this.w.floatText(f.x,b.top-8,'PINNED','#a6efdc');
    this.w.shake(0.004,90);
    return true;
  }
  /** The sweet spot along her aim, ticked while she draws. */
  private aimTick() {
    const p=this.p,show=p.state==='bow'&&this.drawing;
    this.tick.setVisible(show);
    if(!show)return;
    const {x,y,aim}=this.aim(),sw=this.sweet,d=(sw[0]+sw[1])/2;
    this.tick.setPosition(x+Math.cos(aim)*d*p.face,y+Math.sin(aim)*d).setAlpha(0.35+Math.min(1,this.charge/0.55)*0.3).setRotation(this.charge*3);
  }
  /** Where she looses from, and the angle: toward the nearest foe ahead in sight (its head while Up is held), or up or down with the stick. */
  private aim() {
    const p=this.p,x=p.x+p.face*15,y=p.feet-31;
    let target:FoeLike|null=null,distance=320;
    for(const f of this.w.foes()) {const dx=f.x-p.x,dy=f.box.centerY-y,d=Math.hypot(dx,dy);if(f.alive&&dx*p.face>0&&Math.abs(dy)<110&&d<distance&&p.lineOfSight(f.x,f.box.centerY)){target=f;distance=d;}}
    const ty=target?(this.w.controls.down('up')?target.box.top+target.box.height*0.1:target.box.centerY):0;
    return {x,y,aim:target?Phaser.Math.Clamp(Math.atan2(ty-y,Math.abs(target.x-x)),-0.45,0.45):cAim(this.w)};
  }
  private fire(kind:'quick'|'pierce'|'volley'|'dive',move:string=`bow_${kind}`,perfect=false) {
    const p=this.p,s=this.w.save;
    if(kind==='volley'&&(this.volleyCd>0||s.ce<10)){this.w.toast(this.volleyCd>0?'Spread shot is recharging.':'Spread shot needs 10 Energy.');kind='quick';}
    // Under the Wings every charged shot is free.
    const wings=!!this.dawn?.active;
    // A perfect shot costs nothing.
    if(kind==='pierce'&&s.ce<6&&!wings&&!perfect){this.w.toast('Piercing shot needs 6 Energy.');kind='quick';}
    if(kind==='volley'){s.ce-=10;this.volleyCd=2.5;}
    if(kind==='pierce'&&!wings&&!perfect)s.ce-=6;
    if(perfect){this.tally.perfect++;this.w.floatText(p.x,p.feet-62,'PERFECT','#ffd27a');this.p.noteStyle('perfect_draw');}
    const {x:muzzleX,y:muzzleY,aim:aimed}=this.aim(),aim=kind==='dive'?1.05:aimed;
    // After a bow-bash the next shot is point-blank: harder, as True Aim's equal.
    const blank=this.bashT>0?1.4:1;this.bashT=0;
    // Quiver of the Mighty splits every shot in three; Watchman's Eye makes the next shots precision hits.
    const split=kind==='volley'||this.kit.quiverT>0&&kind!=='dive'?3:1,precise=this.kit.eyeShots>0;
    if(precise)this.kit.eyeShots--;
    // Shadowstep: a shot just after a dodge always crits. Patient String: a Perfect shot pierces one more.
    const sure=this.r('t_shadow')>0&&p.sinceDodge<0.6,pierce=(kind==='pierce'?3:kind==='dive'?2:1)+(perfect&&this.r('t_perfect')?1:0);
    for(let i=0;i<split;i++) {
      const angle=aim+(split>1?(i-1)*(kind==='volley'?0.14:0.12):0),speed=(kind==='pierce'?590:kind==='dive'?560:440)*(perfect?1.25:1)*(p.water.swimming?0.65:1);
      this.spawn({x:muzzleX,y:muzzleY,vx:Math.cos(angle)*speed*p.face,vy:Math.sin(angle)*speed,life:1.2,
        damage:p.power()*(kind==='pierce'?2.1:kind==='volley'?0.48:kind==='dive'?1.1:0.7)*blank*(split>1&&kind!=='volley'?0.6:1),
        pierce,move,dawn:wings,spike:kind==='dive',precise,perfect,sure});
    }
    // Twin String: a full draw looses a second arrow just behind the first.
    if(kind==='pierce'&&this.charge>=1&&this.r('t_twin'))this.spawn({x:muzzleX-p.face*14,y:muzzleY+3,vx:Math.cos(aim)*590*p.face,vy:Math.sin(aim)*590,life:1.2,damage:p.power()*2.1*blank*0.7,pierce,move:'bow_twin',dawn:wings,sure});
    this.w.playEffect('bowRelease',{x:p.x,pitch:0.94+Math.random()*0.12});
    if(kind==='pierce'||perfect){this.w.playEffect('bowCrack',{x:p.x});this.w.playEffect('arrowWhistle',{x:p.x+p.face*120,pitch:perfect?1.15:1});}
    // The release: a flash of the arrow's colour at the bow.
    const colour=perfect?0xffd27a:GLOW[wings?LIGHT:this.element()?ARROW_FRAME[this.element()!]:kind==='pierce'?CHARGED:0];
    this.w.spark(muzzleX,muzzleY,colour,kind==='pierce'||perfect?8:3);
    if(kind==='pierce'||perfect)this.w.burst(muzzleX+p.face*6,muzzleY,perfect?1:0);
  }
  /** Dawnstep's point-blank arrow into a foe's back: harder with each step of the chain. */
  backShot(chain:number,finisher=false) {
    const p=this.p;
    this.spawn({x:p.x+p.face*10,y:p.feet-31,vx:p.face*640,vy:0,life:0.45,damage:p.power()*(2.4+0.35*(chain-1))*(finisher?1.6:1),pierce:2,move:'dawnstep',back:true,dawn:true,finisher});
    this.w.playEffect('bowRelease');
  }
  /** Morning Star: a ring of light arrows. */
  radial(n:number) {
    const p=this.p;
    for(let i=0;i<n;i++){
      const angle=i/n*Math.PI*2;
      if(!this.spawn({x:p.x,y:p.feet-28,vx:Math.cos(angle)*520,vy:Math.sin(angle)*520,life:0.6,damage:p.power()*0.9,pierce:2,move:'morning_star',dawn:true}))break;
    }
  }
  destroy(){this.kit.destroy();this.trail.destroy();for(const s of this.streaks)s.destroy();for(const s of this.sprites)s.destroy();for(const o of this.stuck)o.img.destroy();for(const o of this.embedded)o.img.destroy();this.tick.destroy();}
}
/** A struck arrow's shudder: a fast wobble that dies away in a third of a second. */
function quiver(t:number){return t<0.32?Math.sin(t*70)*0.14*(1-t/0.32):0;}
function cAim(w:WorldApi){return w.controls.down('up')?-0.4:w.controls.down('down')?0.35:0;}
