import Phaser from 'phaser';
import { TILE, isSolid, T } from '../shared';
import type { WorldApi, FoeLike } from './types';
import type { Player } from './player';
import type { Dawn } from './dawn';
/** `back`: a Dawnstep's point-blank arrow (breaks guard). `dawn`: shot under the Wings, drawn with a trail of light. */
interface Arrow { x:number; y:number; vx:number; vy:number; life:number; damage:number; pierce:number; hits:Set<FoeLike>; move:string; back:boolean; dawn:boolean }
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
  readonly arrows: Arrow[] = Array.from({length:24},()=>({x:0,y:0,vx:0,vy:0,life:0,damage:0,pierce:0,hits:new Set(),move:'',back:false,dawn:false}));
  dawn: Dawn | null = null;
  private lampBox={x:0,y:0,w:0,h:0};
  readonly graphics: Phaser.GameObjects.Graphics;
  charge = 0;
  recovery = 0;
  volleyCd = 0;
  drawing = false;
  private queued: 'attack' | 'heavy' | null = null;
  private chargeKey: 'attack' | 'heavy' = 'heavy';
  constructor(private w:WorldApi, private p:Player) { this.graphics=w.sc.add.graphics().setDepth(13); }
  cancel() { this.charge=0; this.recovery=0; this.drawing=false;this.queued=null; }
  update(dt:number) {
    this.volleyCd=Math.max(0,this.volleyCd-dt);
    const g=this.graphics.clear();
    for (const a of this.arrows) {
      if (a.life <= 0) continue;
      a.life-=dt;
      const dx=a.vx*dt,dy=a.vy*dt;
      let wall=1;
      const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/4));
      for(let i=1;i<=steps;i++) { const u=i/steps,t=this.w.tileAt(Math.floor((a.x+dx*u)/TILE),Math.floor((a.y+dy*u)/TILE)); if(isSolid(t as T)) {wall=(i-1)/steps;a.life=0;break;} }
      for(let n=0;n<3 && a.pierce>0;n++) {
        let nearest:FoeLike|null=null, time=2;
        for(const f of this.w.foes()) if(f.alive&&!a.hits.has(f)) { const t=entry(a.x,a.y,dx,dy,f.box);if(t<time&&t<=wall){time=t;nearest=f;} }
        if(!nearest) break;
        a.hits.add(nearest);
        const hp=nearest.hp;
        if(nearest.hit(Math.round(a.damage),Math.sign(a.vx),a.back?3:a.pierce>1?2.5:0.8,a.back,{kind:'proj',kx:Math.sign(a.vx)*(a.back?140:55),ky:a.back?-60:0,poise:a.back?60:a.pierce>1?24:8,guardBreak:a.back})) {
          this.w.heroHit(nearest,hp!==undefined&&nearest.hp!==undefined?Math.max(0,hp-nearest.hp):a.damage,false);
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
      const angle=Math.atan2(a.vy,a.vx),cos=Math.cos(angle),sin=Math.sin(angle);
      if(a.dawn)g.lineStyle(2.2,0xffe6a8,0.35).lineBetween(a.x-cos*30,a.y-sin*30,a.x-cos*6,a.y-sin*6);
      g.lineStyle(1.3,0xe8d4a1,1).lineBetween(a.x-cos*13,a.y-sin*13,a.x,a.y);
      g.lineStyle(1.2,0xa6efdc,0.9).lineBetween(a.x,a.y,a.x-cos*4-sin*3,a.y-sin*4+cos*3).lineBetween(a.x,a.y,a.x-cos*4+sin*3,a.y-sin*4-cos*3);
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
        this.recovery-=dt;
        if(this.recovery<=0){
          p.releaseState();
          if(this.queued){this.w.playEffect('bowDraw');this.chargeKey=this.queued;this.drawing=true;this.charge=0;this.queued=null;p.state='bow';}
        }
      }
      return true;
    }
    if(p.state!=='free'&&p.state!=='swim') return false;
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
      a.life=1.2;a.damage=p.power()*(kind==='pierce'?2.1:kind==='volley'?0.48:0.7);a.pierce=kind==='pierce'?3:1;a.hits.clear();a.move=`bow_${kind}`;a.back=false;a.dawn=wings;
    }
    this.w.playEffect('bowRelease');
    this.w.spark(muzzleX,muzzleY,0xa6efdc,kind==='pierce'?8:3);
  }
  /** Dawnstep's point-blank arrow into a foe's back: harder with each step of the chain. */
  backShot(chain:number) {
    const p=this.p,a=this.arrows.find(a=>a.life<=0);if(!a)return;
    a.x=p.x+p.face*10;a.y=p.feet-31;a.vx=p.face*640;a.vy=0;a.life=0.45;a.damage=p.power()*(2.4+0.35*(chain-1));a.pierce=2;a.hits.clear();a.move='dawnstep';a.back=true;a.dawn=true;
    this.w.playEffect('bowRelease');
  }
  /** Morning Star: a ring of light arrows. */
  radial(n:number) {
    const p=this.p;
    for(let i=0;i<n;i++){
      const a=this.arrows.find(a=>a.life<=0);if(!a)break;
      const angle=i/n*Math.PI*2;a.x=p.x;a.y=p.feet-28;a.vx=Math.cos(angle)*520;a.vy=Math.sin(angle)*520;a.life=0.6;a.damage=p.power()*0.9;a.pierce=2;a.hits.clear();a.move='morning_star';a.back=false;a.dawn=true;
    }
  }
  destroy(){this.graphics.destroy();}
}
function cAim(w:WorldApi){return w.controls.down('up')?-0.4:w.controls.down('down')?0.35:0;}
