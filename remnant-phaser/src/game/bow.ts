import Phaser from 'phaser';
import { TILE, isSolid, T } from '../shared';
import type { WorldApi, FoeLike } from './types';
import type { Player } from './player';
import type { Dawn } from './dawn';
import { weaponElement, type Element } from '../../../remnant/src/game/power';
/** `back`: a Dawnstep's point-blank arrow (breaks guard). `dawn`: shot under the Wings, drawn with a trail of light. */
interface Arrow { x:number; y:number; vx:number; vy:number; life:number; damage:number; pierce:number; hits:Set<FoeLike>; move:string; back:boolean; dawn:boolean; finisher:boolean }
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
  readonly arrows: Arrow[] = Array.from({length:24},()=>({x:0,y:0,vx:0,vy:0,life:0,damage:0,pierce:0,hits:new Set(),move:'',back:false,dawn:false,finisher:false}));
  dawn: Dawn | null = null;
  private lampBox={x:0,y:0,w:0,h:0};
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
  }
  /** Which arrow the sheet draws: light under the Wings, charged for a piercing shot, else the weapon's element. */
  private frameOf(a:Arrow) { if(a.dawn)return LIGHT; if(a.pierce>1)return CHARGED; const el=weaponElement(); return el?ARROW_FRAME[el]:0; }
  private stick(a:Arrow,frame:number) {
    const o=this.stuck.find(o=>o.t<0)??this.stuck.reduce((x,o)=>(o.t>x.t?o:x));
    // The stuck art leans about 38° from the shaft's line; turn it to match the flight.
    o.t=0;o.img.setFrame(8+frame).setPosition(a.x,a.y).setRotation(Math.atan2(a.vy,a.vx)-0.67).setScale(0.26).setAlpha(1).setVisible(true);
  }
  cancel() { this.charge=0; this.recovery=0; this.drawing=false;this.queued=null; }
  update(dt:number) {
    this.volleyCd=Math.max(0,this.volleyCd-dt);
    for (const o of this.stuck) {
      if (o.t<0) continue;
      o.t+=dt;
      if (o.t>=1.2) { o.t=-1; o.img.setVisible(false); } else if (o.t>0.8) o.img.setAlpha((1.2-o.t)/0.4);
    }
    for (let i=0;i<this.arrows.length;i++) {
      const a=this.arrows[i],img=this.sprites[i];
      if (a.life <= 0) { if(img.visible)img.setVisible(false); continue; }
      a.life-=dt;
      const dx=a.vx*dt,dy=a.vy*dt;
      let wall=1;
      const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/4));
      let struck=false;
      for(let i=1;i<=steps;i++) { const u=i/steps,t=this.w.tileAt(Math.floor((a.x+dx*u)/TILE),Math.floor((a.y+dy*u)/TILE)); if(isSolid(t as T)) {wall=(i-1)/steps;a.life=0;struck=true;break;} }
      for(let n=0;n<3 && a.pierce>0;n++) {
        let nearest:FoeLike|null=null, time=2;
        for(const f of this.w.foes()) if(f.alive&&!a.hits.has(f)) { const t=entry(a.x,a.y,dx,dy,f.box);if(t<time&&t<=wall){time=t;nearest=f;} }
        if(!nearest) break;
        a.hits.add(nearest);
        const hp=nearest.hp;
        // Her arrows crit like his blows; a back arrow always does, and a finishing one fells a weakened foe outright.
        const crit=a.back||(a.move!=='morning_star'&&Math.random()<this.w.d.crit);
        let damage=a.damage*(crit&&!a.back?this.w.d.critDmg:1);
        const body=(nearest as FoeLike&{e?:{isBoss?:boolean;maxHp?:number}}).e;
        if(a.finisher&&hp!==undefined&&body&&!body.isBoss&&body.maxHp&&hp<body.maxHp*0.4)damage=Math.max(damage,hp+1);
        if(nearest.hit(Math.round(damage),Math.sign(a.vx),a.back?3:a.pierce>1?2.5:0.8,crit,{kind:'proj',kx:Math.sign(a.vx)*(a.back?140:55),ky:a.back?-60:0,poise:a.back?60:a.pierce>1?24:8,guardBreak:a.back})) {
          this.w.heroHit(nearest,hp!==undefined&&nearest.hp!==undefined?Math.max(0,hp-nearest.hp):damage,false,crit);
          if(a.back&&!nearest.alive)this.w.finale(nearest.x,nearest.box.centerY,a.finisher?1.2:0.9);
          else if(crit&&!a.back)this.dawn?.critStep(nearest);
          this.p.noteStyle(a.move);
          this.p.comboHits++; this.w.save.bestCombo=Math.max(this.w.save.bestCombo??0,this.p.comboHits);
          this.w.save.ce=Math.min(this.p.maxCe,this.w.save.ce+1);
          this.w.spark(nearest.x,nearest.box.centerY,a.dawn?0xffe6a8:0xa6efdc,5);
          this.dawn?.onArrowHit(nearest);
        }
        if(--a.pierce<=0) {wall=time;a.life=0;}
      }
      const box=this.lampBox;box.x=Math.min(a.x,a.x+dx*wall)-2;box.y=Math.min(a.y,a.y+dy*wall)-2;box.w=Math.abs(dx*wall)+4;box.h=Math.abs(dy*wall)+4;this.w.strikeLamps(box);
      a.x+=dx*wall;a.y+=dy*wall;
      const frame=this.frameOf(a);
      if(struck&&!a.dawn){this.stick(a,frame);img.setVisible(false);continue;}
      if(a.life<=0){img.setVisible(false);continue;}
      img.setFrame(frame).setPosition(a.x,a.y).setRotation(Math.atan2(a.vy,a.vx)).setScale(a.dawn||a.pierce>1?0.32:0.27).setVisible(true);
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
    if(p.state!=='free'&&p.state!=='swim') return false;
    if(c.pressed('heavy')||c.pressed('attack')||c.down('heavy'))p.face=p.swingFacing();
    if(c.pressed('heavy')||c.down('heavy')) {this.w.playEffect('bowDraw');this.chargeKey='heavy';this.drawing=true;this.charge=0;this.recovery=0;p.state='bow';return true;}
    if(c.pressed('attack')) {
      if(c.down('up')){this.fire('volley');this.recovery=0.28;this.drawing=false;}
      else {this.w.playEffect('bowDraw');this.chargeKey='attack';this.drawing=true;this.charge=0;this.recovery=0;}
      p.state='bow';return true;
    }
    return false;
  }
  private fire(kind:'quick'|'pierce'|'volley') {
    const p=this.p,s=this.w.save;
    if(kind==='volley'&&(this.volleyCd>0||s.ce<10)){this.w.toast(this.volleyCd>0?'Spread shot is recharging.':'Spread shot needs 10 Energy.');kind='quick';}
    // Under the Wings every charged shot is free.
    const wings=!!this.dawn?.active;
    if(kind==='pierce'&&s.ce<6&&!wings){this.w.toast('Piercing shot needs 6 Energy.');kind='quick';}
    if(kind==='volley'){s.ce-=10;this.volleyCd=2.5;}
    if(kind==='pierce'&&!wings)s.ce-=6;
    const muzzleX=p.x+p.face*15,muzzleY=p.feet-31;
    let target:FoeLike|null=null,distance=320;
    for(const f of this.w.foes()) {const dx=f.x-p.x,dy=f.box.centerY-muzzleY,d=Math.hypot(dx,dy);if(f.alive&&dx*p.face>0&&Math.abs(dy)<110&&d<distance&&p.lineOfSight(f.x,f.box.centerY)){target=f;distance=d;}}
    const aim=target?Phaser.Math.Clamp(Math.atan2(target.box.centerY-muzzleY,Math.abs(target.x-muzzleX)),-0.45,0.45):cAim(this.w);
    for(let i=0;i<(kind==='volley'?3:1);i++) {
      const a=this.arrows.find(a=>a.life<=0);if(!a)break;
      const angle=aim+(kind==='volley'?(i-1)*0.14:0),speed=(kind==='pierce'?590:440)*(p.water.swimming?0.65:1);
      a.x=muzzleX;a.y=muzzleY;a.vx=Math.cos(angle)*speed*p.face;a.vy=Math.sin(angle)*speed;
      a.life=1.2;a.damage=p.power()*(kind==='pierce'?2.1:kind==='volley'?0.48:0.7);a.pierce=kind==='pierce'?3:1;a.hits.clear();a.move=`bow_${kind}`;a.back=false;a.dawn=wings;a.finisher=false;
    }
    this.w.playEffect('bowRelease');
    this.w.spark(muzzleX,muzzleY,0xa6efdc,kind==='pierce'?8:3);
  }
  /** Dawnstep's point-blank arrow into a foe's back: harder with each step of the chain. */
  backShot(chain:number,finisher=false) {
    const p=this.p,a=this.arrows.find(a=>a.life<=0);if(!a)return;
    a.x=p.x+p.face*10;a.y=p.feet-31;a.vx=p.face*640;a.vy=0;a.life=0.45;a.damage=p.power()*(2.4+0.35*(chain-1));a.pierce=2;a.hits.clear();a.move='dawnstep';a.back=true;a.dawn=true;a.finisher=finisher;if(finisher)a.damage*=1.6;
    this.w.playEffect('bowRelease');
  }
  /** Morning Star: a ring of light arrows. */
  radial(n:number) {
    const p=this.p;
    for(let i=0;i<n;i++){
      const a=this.arrows.find(a=>a.life<=0);if(!a)break;
      const angle=i/n*Math.PI*2;a.x=p.x;a.y=p.feet-28;a.vx=Math.cos(angle)*520;a.vy=Math.sin(angle)*520;a.life=0.6;a.damage=p.power()*0.9;a.pierce=2;a.hits.clear();a.move='morning_star';a.back=false;a.dawn=true;a.finisher=false;
    }
  }
  destroy(){for(const s of this.sprites)s.destroy();for(const o of this.stuck)o.img.destroy();}
}
function cAim(w:WorldApi){return w.controls.down('up')?-0.4:w.controls.down('down')?0.35:0;}
