import Phaser from 'phaser';
import { TILE, isSolid, T } from '../shared';
import type { WorldApi, FoeLike } from './types';
import type { Player } from './player';
import type { Dawn } from './dawn';
import { weaponElement, type Element } from '../../../remnant/src/game/power';
import { spriteFrame, isSpriteWindup } from '../../../remnant/src/render/spriteMotion';
import { G } from '../classic/shim/ctx';
import { ArcherKit } from './archerKit';
import type { ArrowType } from './save';
const STANDARD: readonly ArrowType[] = ['standard'];
/** `back`: a Dawnstep's point-blank arrow (breaks guard). `dawn`: shot under the Wings, drawn with a trail of light.
 * `x0`/`y0`: where it was loosed, for True Aim. `recall`: an arrow pulled back to her. `spike`: the diving arrow. */
interface Arrow { x:number; y:number; vx:number; vy:number; life:number; damage:number; pierce:number; hits:Set<FoeLike>; move:string; back:boolean; dawn:boolean; finisher:boolean; x0:number; y0:number; recall:boolean; spike:boolean;
  /** Ability arrows: `guard` breaks guards, `knock` knocks down, `scale` draws it larger, `frame` fixes its art (-1: by element). `precise` always takes the head. */
  guard:boolean; knock:boolean; scale:number; frame:number; precise:boolean }
const FRESH = { back:false, dawn:false, finisher:false, recall:false, spike:false, guard:false, knock:false, scale:0, frame:-1, precise:false };
/** A classic foe's body, as her arrows read it (pinning, interrupts, bosses). */
type Body = { isBoss?: boolean; maxHp?: number; state?: string; st?: number; staggered?: number; stagger?: () => void; glintAt?: number; anim?: { u: number }; body?: { vx: number } };
const bodyOf = (f: FoeLike) => (f as FoeLike & { e?: Body }).e;
/** True Aim: the range where her shots land hardest. */
const SWEET = [110, 230] as const, SWEET_MUL = 1.25;
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
  readonly embedded: { foe: FoeLike | null; img: Phaser.GameObjects.Image; dx: number; dy: number }[];
  /** The True Aim tick on the sweet spot while she draws. */
  private tick: Phaser.GameObjects.Image;
  /** After a bow-bash, the next shot lands point-blank and harder. */
  bashT = 0;
  /** Strike pressed during a dodge: the backflip shot when it ends. */
  private flipT = 0;
  /** Counts for the archer checks: True Aim, precision, shot down, interrupted, pinned. */
  readonly tally = { trueAim: 0, precise: 0, shotDown: 0, interrupted: 0, pinned: 0, recalled: 0 };
  dawn: Dawn | null = null;
  private lampBox={x:0,y:0,w:0,h:0};
  private shotBox=new Phaser.Geom.Rectangle();
  /** One sprite per pooled arrow, and a few that stay a moment where an arrow struck a wall. */
  private sprites: Phaser.GameObjects.Image[];
  private stuck: { img: Phaser.GameObjects.Image; t: number }[];
  charge = 0;
  recovery = 0;
  volleyCd = 0;
  drawing = false;
  private queued: 'attack' | 'heavy' | null = null;
  private chargeKey: 'attack' | 'heavy' = 'heavy';
  constructor(private w:WorldApi, private p:Player) {
    this.sprites=this.arrows.map(()=>w.sc.add.image(0,0,'arrows',0).setOrigin(0.93,61/128).setDepth(13).setVisible(false));
    this.stuck=Array.from({length:6},()=>({img:w.sc.add.image(0,0,'arrows',8).setOrigin(0.86,0.6).setDepth(12.9).setVisible(false),t:-1}));
    this.embedded=Array.from({length:EMBED_MAX},()=>({foe:null,img:w.sc.add.image(0,0,'arrows',0).setOrigin(0.93,61/128).setScale(0.24).setDepth(9.4).setVisible(false),dx:0,dy:0}));
    this.tick=w.sc.add.image(0,0,'vfx-impacts',0).setScale(0.12).setBlendMode(Phaser.BlendModes.ADD).setDepth(13).setVisible(false);
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
    return t&&t!=='standard'&&this.quiver().includes(t)?t:weaponElement();
  }
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
    o.foe=f;o.dx=x-f.x;o.dy=y-f.box.top;
    o.img.setFrame(frame).setRotation(Math.atan2(a.vy,a.vx)).setVisible(true);
  }
  /** Recall: every embedded arrow tears back out through its foe and flies home, hitting what's in the way. More arrows, a bigger rip. */
  recall() {
    const p=this.p,n=this.embeddedCount;
    if(!n)return false;
    for(const o of this.embedded) {
      const f=o.foe; if(!f)continue;
      o.foe=null;o.img.setVisible(false);
      if(!f.alive)continue;
      const x=f.x+o.dx,y=f.box.top+o.dy,hp=f.hp,dir=Math.sign(p.x-x)||1;
      if(f.hit(Math.round(p.power()*0.45*(1+0.12*(n-1))),dir,1.2,false,{kind:'proj',kx:dir*90,ky:-40,poise:14})){
        this.w.heroHit(f,hp!==undefined&&f.hp!==undefined?Math.max(0,hp-f.hp):0,false);
        this.w.spark(x,y,0xa6efdc,6);
      }
      const d=Math.max(1,Math.hypot(p.x-x,p.feet-30-y)),speed=620;
      this.spawn({x,y,vx:(p.x-x)/d*speed,vy:(p.feet-30-y)/d*speed,life:d/speed,damage:p.power()*0.35,pierce:3,move:'recall',recall:true})?.hits.add(f);
    }
    this.tally.recalled+=n;
    this.p.noteStyle('recall');
    this.w.playEffect('bowRelease');
    return true;
  }
  /** Which arrow the sheet draws: light under the Wings, charged for a piercing shot, else the weapon's element. */
  private frameOf(a:Arrow) { if(a.frame>=0)return a.frame; if(a.dawn)return LIGHT; const el=this.element(); if(el&&!a.recall)return ARROW_FRAME[el]; return a.pierce>1?CHARGED:0; }
  private stick(a:Arrow,frame:number) {
    const o=this.stuck.find(o=>o.t<0)??this.stuck.reduce((x,o)=>(o.t>x.t?o:x));
    // The stuck art leans about 38° from the shaft's line; turn it to match the flight.
    o.t=0;o.img.setFrame(8+frame).setPosition(a.x,a.y).setRotation(Math.atan2(a.vy,a.vx)-0.67).setScale(0.26).setAlpha(1).setVisible(true);
  }
  cancel() { this.charge=0; this.recovery=0; this.drawing=false;this.queued=null; }
  update(dt:number) {
    this.volleyCd=Math.max(0,this.volleyCd-dt);
    this.bashT=Math.max(0,this.bashT-dt);
    this.flipT=Math.max(0,this.flipT-dt);
    for (const o of this.embedded) {
      const f=o.foe; if(!f)continue;
      if(!f.alive){o.foe=null;o.img.setVisible(false);continue;}
      o.img.setPosition(f.x+o.dx,f.box.top+o.dy);
    }
    this.aimTick();
    this.kit.update(dt);
    for (const o of this.stuck) {
      if (o.t<0) continue;
      o.t+=dt;
      if (o.t>=1.2) { o.t=-1; o.img.setVisible(false); } else if (o.t>0.8) o.img.setAlpha((1.2-o.t)/0.4);
    }
    for (let i=0;i<this.arrows.length;i++) {
      const a=this.arrows[i],img=this.sprites[i];
      if (a.life <= 0) { if(img.visible)img.setVisible(false); continue; }
      a.life-=dt;
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
        const travelled=Math.hypot(hx-a.x0,hy-a.y0),trueAim=aimed&&travelled>=SWEET[0]&&travelled<=SWEET[1];
        const precise=aimed&&(a.precise||travelled>40&&hy<nearest.box.top+nearest.box.height*0.25);
        const interrupt=aimed&&windingUp(body);
        const crit=a.back||precise||(a.move!=='morning_star'&&Math.random()<this.w.d.crit);
        let damage=a.damage*(crit&&!a.back?this.w.d.critDmg:1)*(trueAim?SWEET_MUL:1)*this.kit.damageFor(nearest);
        if(a.finisher&&hp!==undefined&&body&&!body.isBoss&&body.maxHp&&hp<body.maxHp*0.4)damage=Math.max(damage,hp+1);
        if(nearest.hit(Math.round(damage),Math.sign(a.vx),a.back?3:a.pierce>1?2.5:0.8,crit,{kind:'proj',kx:Math.sign(a.vx)*(a.back||a.knock?140:55),ky:a.spike?260:a.knock?-220:a.back?-60:0,poise:(a.back||a.knock?60:a.pierce>1?24:8)+(precise?16:0),guardBreak:a.back||a.guard,launch:a.knock})) {
          this.w.heroHit(nearest,hp!==undefined&&nearest.hp!==undefined?Math.max(0,hp-nearest.hp):damage,false,crit);
          if(a.back&&!nearest.alive)this.w.finale(nearest.x,nearest.box.centerY,a.finisher?1.2:0.9);
          else if(crit&&!a.back)this.dawn?.critStep(nearest);
          this.p.noteStyle(a.move);
          this.p.comboHits++; this.w.save.bestCombo=Math.max(this.w.save.bestCombo??0,this.p.comboHits);
          this.w.save.ce=Math.min(this.p.maxCe,this.w.save.ce+1);
          this.w.spark(nearest.x,nearest.box.centerY,a.dawn?0xffe6a8:0xa6efdc,5);
          this.dawn?.onArrowHit(nearest);
          if(precise){this.tally.precise++;this.w.spark(hx,hy,0xffffff,6);}
          if(trueAim){this.tally.trueAim++;this.w.spark(hx,hy,0xffd27a,4);}
          // Her answer to a parry: an arrow into a foe's wind-up breaks the attack.
          if(interrupt&&nearest.alive&&body?.stagger){body.stagger();body.staggered=Math.min(body.staggered??1.2,1.2);this.tally.interrupted++;this.w.floatText(nearest.x,nearest.box.top-8,'INTERRUPT','#fff1c4');this.p.noteStyle('interrupt');}
          // A pinning arrow stops in its foe; the last foe an arrow reaches keeps it.
          if(a.move==='bow_pierce'&&nearest.alive&&!body?.isBoss&&body?.stagger&&this.pin(nearest,Math.sign(a.vx)))a.pierce=1;
          if(a.pierce<=1&&nearest.alive&&!a.dawn&&!a.recall&&!a.back)this.embed(nearest,hx,hy,a,this.frameOf(a));
        }
        if(--a.pierce<=0) {wall=time;a.life=0;}
      }
      const box=this.lampBox;box.x=Math.min(a.x,a.x+dx*wall)-2;box.y=Math.min(a.y,a.y+dy*wall)-2;box.w=Math.abs(dx*wall)+4;box.h=Math.abs(dy*wall)+4;this.w.strikeLamps(box);
      a.x+=dx*wall;a.y+=dy*wall;
      const frame=this.frameOf(a);
      if(struck&&!a.dawn&&!a.recall){this.stick(a,frame);img.setVisible(false);continue;}
      if(a.life<=0){img.setVisible(false);continue;}
      img.setFrame(frame).setPosition(a.x,a.y).setRotation(Math.atan2(a.vy,a.vx)).setScale(a.scale||(a.dawn||a.pierce>1?0.32:0.27)).setVisible(true);
    }
  }
  control(dt:number) {
    const p=this.p,c=this.w.controls;
    if(p.state==='bow') {
      p.body.setVelocityX(p.body.velocity.x*Math.exp(-16*dt));
      if(this.drawing) {
        this.charge=Math.min(1.2,this.charge+dt);
        if(Math.abs(c.axis)>0.25)p.face=Math.sign(c.axis);
        if(!c.down(this.chargeKey)||this.charge>=1.2) {this.fire(this.charge>=0.55?'pierce':'quick');this.drawing=false;this.recovery=0.28;}
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
          if(this.queued){p.face=p.swingFacing();this.w.playEffect('bowDraw');this.chargeKey=this.queued;this.drawing=true;this.charge=0;this.queued=null;p.state='bow';}
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
    // A foe right in front: bow-bash and kick it back first.
    if(c.pressed('attack')&&!c.down('up')&&p.onGround&&this.bash()){this.recovery=0.22;this.drawing=false;p.state='bow';return true;}
    if(c.pressed('heavy')||c.down('heavy')) {this.w.playEffect('bowDraw');this.chargeKey='heavy';this.drawing=true;this.charge=0;this.recovery=0;p.state='bow';return true;}
    if(c.pressed('attack')) {
      if(c.down('up')){this.fire('volley');this.recovery=0.28;this.drawing=false;}
      else {this.w.playEffect('bowDraw');this.chargeKey='attack';this.drawing=true;this.charge=0;this.recovery=0;}
      p.state='bow';return true;
    }
    return false;
  }
  /** The close-range answer: a bash and kick that knock an adjacent foe back, and make her next shot point-blank. */
  private bash() {
    const p=this.p;
    let foe:FoeLike|null=null;
    for(const f of this.w.foes()){const dx=f.x-p.x;if(f.alive&&dx*p.face>-4&&Math.abs(dx)<36&&Math.abs(f.box.centerY-(p.feet-24))<34){foe=f;break;}}
    if(!foe)return false;
    const hp=foe.hp;
    if(foe.hit(Math.round(p.power()*0.6),p.face,1.8,false,{kind:'melee',kx:p.face*300,ky:-90,poise:30})){
      this.w.heroHit(foe,hp!==undefined&&foe.hp!==undefined?Math.max(0,hp-foe.hp):0,false);
      this.w.burst(p.x+p.face*16,p.feet-26,2);
      this.p.noteStyle('bow_bash');
    }
    this.bashT=0.9;
    this.w.playEffect('dash');
    return true;
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
    const {x,y,aim}=this.aim(),d=(SWEET[0]+SWEET[1])/2;
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
  private fire(kind:'quick'|'pierce'|'volley'|'dive',move:string=`bow_${kind}`) {
    const p=this.p,s=this.w.save;
    if(kind==='volley'&&(this.volleyCd>0||s.ce<10)){this.w.toast(this.volleyCd>0?'Spread shot is recharging.':'Spread shot needs 10 Energy.');kind='quick';}
    // Under the Wings every charged shot is free.
    const wings=!!this.dawn?.active;
    if(kind==='pierce'&&s.ce<6&&!wings){this.w.toast('Piercing shot needs 6 Energy.');kind='quick';}
    if(kind==='volley'){s.ce-=10;this.volleyCd=2.5;}
    if(kind==='pierce'&&!wings)s.ce-=6;
    const {x:muzzleX,y:muzzleY,aim:aimed}=this.aim(),aim=kind==='dive'?1.05:aimed;
    // After a bow-bash the next shot is point-blank: harder, as True Aim's equal.
    const blank=this.bashT>0?1.4:1;this.bashT=0;
    // Quiver of the Mighty splits every shot in three; Watchman's Eye makes the next shots precision hits.
    const split=kind==='volley'||this.kit.quiverT>0&&kind!=='dive'?3:1,precise=this.kit.eyeShots>0;
    if(precise)this.kit.eyeShots--;
    for(let i=0;i<split;i++) {
      const angle=aim+(split>1?(i-1)*(kind==='volley'?0.14:0.12):0),speed=(kind==='pierce'?590:kind==='dive'?560:440)*(p.water.swimming?0.65:1);
      this.spawn({x:muzzleX,y:muzzleY,vx:Math.cos(angle)*speed*p.face,vy:Math.sin(angle)*speed,life:1.2,
        damage:p.power()*(kind==='pierce'?2.1:kind==='volley'?0.48:kind==='dive'?1.1:0.7)*blank*(split>1&&kind!=='volley'?0.6:1),
        pierce:kind==='pierce'?3:kind==='dive'?2:1,move,dawn:wings,spike:kind==='dive',precise});
    }
    this.w.playEffect('bowRelease');
    this.w.spark(muzzleX,muzzleY,0xa6efdc,kind==='pierce'?8:3);
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
  destroy(){this.kit.destroy();for(const s of this.sprites)s.destroy();for(const o of this.stuck)o.img.destroy();for(const o of this.embedded)o.img.destroy();this.tick.destroy();}
}
function cAim(w:WorldApi){return w.controls.down('up')?-0.4:w.controls.down('down')?0.35:0;}
