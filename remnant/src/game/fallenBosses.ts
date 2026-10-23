import { BossBase } from './bosses2';
import { cleansingBeacon } from './fallenChapters';
import { Entity, type HitInfo } from './entity';
import { G } from './ctx';
import { bossScale } from './difficulty';
import { chapterCurve } from './curve';
import { moveBody, bodyFits } from './physics';
import { clamp, approach, sign } from '../core/math';
import { poly, rgba, glow, type Ctx } from '../render/draw';
import { drawFallenArt } from '../render/fallenArt';
import { fx } from '../render/fx';
import { lighting } from '../render/lighting';
import { Proj } from './projectiles';
import { music } from '../audio/music';
import { sfx } from '../audio/audio';

type Attack='claws'|'charge'|'leap'|'call'|'hunt'|'needles'|'spores'|'purge';
interface Spore {x:number;t:number;pulse:number;hits:Set<number>}
/** Hunt shades move and attack; Brood Cocoons stay rooted and heal their queen. Neither drops farmable loot. */
export class CrownAdd extends Entity {
  clock=0;cd=.8;windup=0;hits=new Set<number>();
  constructor(public owner:FallenMonarch,x:number,y:number,public pod:boolean){
    super(x,y,pod?27:34,pod?46:23);this.hp=this.maxHp=Math.round(owner.maxHp*.014);this.team='enemy';this.isFoe=true;this.heavyBody=true;this.layer=5;this.name=pod?'Brood Cocoon':'Hunt Shade';
  }
  takeHit(h:HitInfo){if(this.dying||this.remove||h.dmg<=0)return false;this.hp=Math.max(0,this.hp-h.dmg);this.flash=.12;if(!this.hp){this.dying=this.remove=true;fx.shards(this.x,this.cy,10,this.owner.color,1);sfx('shatter',{vol:.5});}return true;}
  parried(){this.cd=1.3;this.windup=0;this.body.vx=0;}
  update(dt:number){
    if(this.owner.dying||this.owner.remove){this.remove=true;return;}
    this.flash=Math.max(0,this.flash-dt);if(this.pod)return;
    dt*=bossScale().tempo*this.owner.encounterTempo;this.clock+=dt;const p=G.world.player;this.face=sign(p.x-this.x)||this.face;
    if(this.windup>0){this.windup-=dt;this.body.vx=0;if(this.windup<=0){this.cd=1.7;this.body.vx=this.face*330;this.hits.clear();}}
    else if(this.cd>1.35){this.cd-=dt;G.world.hitPlayerSide({x:this.x-22,y:this.y-27,w:44,h:27},{dmg:this.owner.dmg*.42,poise:15,kx:this.face*90,ky:-70,dir:this.face,kind:'melee',src:this,parryable:true},this.hits);}
    else{this.cd-=dt;this.body.vx=approach(this.body.vx,this.face*(Math.abs(p.x-this.x)>75?85:0),dt*550);if(this.cd<=0&&Math.abs(p.x-this.x)<150){this.windup=.7;this.body.vx=0;}}
    this.body.vy=Math.min(450,this.body.vy+1200*dt);moveBody(this.body,dt,G.world.grid,G.world.solid);this.x=clamp(this.x,100,G.world.grid.w*16-100);
  }
  draw(ctx:Ctx){
    ctx.save();ctx.translate(this.x,this.y);ctx.scale(this.face,1);const c=this.flash?'#fff3d9':this.pod?'#35513d':'#27242d';
    if(this.pod){poly(ctx,[-14,0,-18,-24,-11,-48,0,-57,13,-45,17,-22,12,0],c,this.owner.color,1);ctx.strokeStyle='#d8edaa';for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(-12,-12-i*11);ctx.lineTo(12,-19-i*10);ctx.stroke();}}
    else{poly(ctx,[-23,-6,-19,-19,4,-22,13,-29,15,-20,27,-15,19,-7,13,-3,8,0,5,-7,-11,-6,-15,0,-19,0,-19,-7,-30,-12],c,this.owner.color,.7);ctx.fillStyle=this.owner.color;ctx.fillRect(15,-18,3,2);if(this.windup>0){ctx.strokeStyle=this.owner.color;ctx.strokeRect(-27,-33,55,35);}}
    ctx.fillStyle=this.owner.color;ctx.fillRect(-20,this.pod?-64:-38,40*this.hp/this.maxHp,3);ctx.restore();
  }
}

/** Original Fallen Crowns: campaign HP and blows from the chapter curve (never the player's level), readable tells, and phase gates for very strong builds. */
export class FallenMonarch extends BossBase {
  // Already drawn from painted sprite atlases.
  pixelShade = false;
  attack:Attack='claws';attackCount=0;released=false;second=false;floorY:number;targetX=0;launchX=0;huntStep=-1;ward=false;
  adds:CrownAdd[]=[];spores:Spore[]=[];beaconX=0;purgePulse=-1;purgeHits=new Set<number>();
  color:string;
  constructor(public plague:boolean,x:number,y:number){
    super(plague?'plague_monarch':'beast_monarch',x,y,plague?40:50,90,chapterCurve(plague?8:7).bossHp!);
    this.name=plague?'Morvane · Crown of Pestilence':'Varkhos · Crown of the Hunt';this.sub=plague?'I · The Living Swarm':'I · The Unbroken Pack';this.color=plague?'#baed8c':'#ffbd79';
    this.floorY=y;this.face=-1;this.maxPoise=this.poise=plague?560:620;this.p2At=.67;this.p3At=.32;this.phaseMarks=[.67,.32];this.hitColor=this.color;
  }
  get addCount(){let n=0;for(const a of this.adds)if(!a.remove&&!a.dying)n++;return n;}
  get dmg(){return chapterCurve(this.plague?8:7).bossDmg!*this.ngMul*this.encounterDamage*(this.plague?1:1+this.addCount*.12)*(this.phase===3?1.12:1);}
  canBeTargeted(){return super.canBeTargeted()&&!this.ward;}
  takeHit(h:HitInfo){
    if(this.ward)return false;
    const threshold=this.phase===1?this.p2At:this.phase===2?this.p3At:0;if(!threshold||!this.fighting)return super.takeHit(h);
    const allowed=Math.max(1,this.hp-Math.ceil(this.maxHp*threshold)+1),damage=Math.min(h.dmg,allowed/(!h.dot&&this.state==='kneel'?1.5:1));
    const hit=super.takeHit({...h,dmg:damage});
    // Damage-over-time uses a separate BossBase path: enforce its phase transition too.
    if(hit&&this.fighting&&this.hp<this.maxHp*threshold){if(this.phase===1)this.beginTransition();else this.enterPhase3();}return hit;
  }
  updateDormant(_dt:number){}
  updateIntro(_dt:number){if(this.st>1.7){this.beginFight();G.camera.viewMultTarget=1.2;music.play(this.plague?'plague_monarch':'beast_monarch',.6);}}
  beginTransition(){this.cleanEffects();this.state='transition';this.st=0;this.invuln=999;this.body.vx=0;G.ui.banner(this.plague?'THE BROOD AWAKENS':'THE KING UNLEASHED',this.plague?'Destroy the Brood Cocoons to stop her healing':'Cut down his Hunt Shades: each strengthens his attacks','boss');}
  enterPhase3(){this.cleanEffects();this.phase=3;this.state='transition';this.st=0;this.invuln=999;this.body.vx=0;G.ui.banner(this.plague?'THE GREAT MIASMA':'THE GREAT HUNT',this.plague?'Gold marks clean air · enter the active beacon':'Three marked pounces · dodge, then punish the recovery','boss');}
  updateTransition(_dt:number){
    if(this.st<1.4)return;this.invuln=0;this.poise=this.maxPoise;this.staggered=0;
    if(this.phase===1){this.phase=2;this.summon();this.state='idle';this.st=0;this.cd=1;this.sub=this.plague?'II · Brood Cocoons restore the queen':'II · Hunt Shades empower the king';}
    else{this.sub=this.plague?'III · Shelter in gold, strike after the miasma':'III · Evade three marks, strike after the landing';this.startAttack(this.plague?'purge':'hunt');}
    music.bossPhase(this.phase-1);G.ui.bossBar(this.name,this.sub);
  }
  updateKneel(_dt:number){this.body.vx=0;}
  onKneel(){this.body.vx=0;}
  parried(){if(!this.fighting||this.ward)return;this.poise-=180;this.body.vx=0;if(this.poise<=0)this.kneel();else{this.state='idle';this.st=0;this.cd=1.4;}}
  startAttack(a:Attack){
    this.attack=a;this.state='attack';this.st=0;this.released=this.second=false;this.hitSet.clear();this.huntStep=-1;this.attackCount++;
    this.face=sign(G.world.player.x-this.x)||this.face;this.lockTarget();
    if(a==='hunt'||a==='purge'){this.ward=true;this.purgePulse=-1;this.beaconX=cleansingBeacon(G.world.player.x,this.x,G.world.grid.w*16);G.ui.toast(a==='hunt'?'Great Hunt: dodge each amber mark. Strike after the third landing.':'Great Miasma: enter the gold beacon. Strike after the veil breaks.','warn');}
    if(a==='spores')for(const dx of [-110,0,110])this.spores.push({x:clamp(this.targetX+dx,100,G.world.grid.w*16-100),t:0,pulse:-1,hits:new Set()});
  }
  private lockTarget(){this.launchX=this.x;this.targetX=clamp(G.world.player.x,110,G.world.grid.w*16-110);}
  private land(){this.released=true;this.hitSet.clear();fx.ring(this.x,this.floorY-2,5,62,this.color,.4,2);this.hit({x:this.x-60,y:this.floorY-54,w:120,h:55},1.7,true);}
  private hit(box:{x:number;y:number;w:number;h:number},mul:number,unblockable=false){G.world.hitPlayerSide(box,{dmg:this.dmg*mul,poise:50,kx:this.face*150,ky:-110,dir:this.face,kind:'melee',src:this,parryable:!unblockable,unblockable},this.hitSet);}
  think(dt:number){
    this.tickSpores(dt);
    if(this.plague&&this.phase===2&&this.addCount)this.hp=Math.min(this.maxHp*this.p2At,this.hp+this.maxHp*.003*this.addCount*dt);
    if(this.state==='idle'){
      this.body.vx=approach(this.body.vx,0,dt*1100);this.cd-=dt;
      if(this.cd<=0){const cycle:Attack[]=this.plague?['needles','spores','claws','call']:['claws','charge','leap','call'];this.startAttack(this.phase===3&&this.attackCount%4===0?(this.plague?'purge':'hunt'):cycle[this.attackCount%4]);}return;
    }
    const t=this.st;
    if(this.attack==='claws'||this.attack==='charge'){
      const tell=this.attack==='charge'?.9:.75;this.body.vx=t>=tell&&t<tell+.3?this.face*(this.attack==='charge'?580:230):0;
      if(t>=tell&&t<tell+.3)this.hit({x:this.x+(this.face>0?0:-80),y:this.y-68,w:80,h:65},1.35);
      if(t>2)this.finish(1.2);
    }else if(this.attack==='leap'){
      if(t>=1.35&&!this.released)this.land();if(t>2.5)this.finish(1.3);
    }else if(this.attack==='call'){
      if(t>=1&&!this.released){this.released=true;if(this.phase>=2)this.summon();else this.startAttack(this.plague?'spores':'leap');}
      if(t>1.9)this.finish(1.1);
    }else if(this.attack==='needles'){
      if(t>=1&&!this.released){this.released=true;for(const vy of [-45,0,45])G.world.add(new Proj('arrow',this.x+this.face*28,this.y-47,'enemy',this.dmg*.65,{vx:this.face*260,vy,life:3,w:15,h:5,color:this.color}));}
      if(t>2.1)this.finish(1.1);
    }else if(this.attack==='spores'){if(t>2.4)this.finish(1.1);}
    else if(this.attack==='hunt'){
      const step=Math.min(2,Math.floor(t/1.25));if(step!==this.huntStep){this.huntStep=step;this.lockTarget();this.released=false;}
      if(t%1.25>=1.1&&!this.released)this.land();if(t>3.8){this.ward=false;this.finish(2.5);G.ui.toast('The hunt ends — Varkhos is exposed.','good');}
    }else{
      const pulse=Math.min(2,Math.floor((t-1.6)/1.1));
      if(t>=1.6&&t<4.9&&pulse!==this.purgePulse){
        this.purgePulse=pulse;this.purgeHits.clear();const width=G.world.grid.w*16;
        const h:HitInfo={dmg:this.dmg*2.4,poise:30,kx:0,ky:0,dir:0,kind:'hazard',src:this,unblockable:true};
        G.world.hitPlayerSide({x:0,y:this.floorY-180,w:this.beaconX-80,h:181},h,this.purgeHits);G.world.hitPlayerSide({x:this.beaconX+80,y:this.floorY-180,w:width-this.beaconX-80,h:181},h,this.purgeHits);
        if(Math.abs(G.world.player.x-this.beaconX)<65)G.save.hp=Math.min(G.d.maxHp,G.save.hp+G.d.maxHp*.02);
      }
      if(t>4.9){this.ward=false;this.finish(2.7);G.ui.toast('The miasma breaks — Morvane is exposed.','good');}
    }
  }
  private tickSpores(dt:number){
    for(let i=this.spores.length-1;i>=0;i--){const s=this.spores[i];s.t+=dt;if(s.t>4){this.spores.splice(i,1);continue;}if(s.t<1.05)continue;
      const pulse=Math.floor((s.t-1.05)/.65);if(pulse!==s.pulse){s.pulse=pulse;s.hits.clear();}
      G.world.hitPlayerSide({x:s.x-38,y:this.floorY-65,w:76,h:66},{dmg:this.dmg*.45,poise:12,kx:0,ky:0,dir:0,kind:'hazard',src:this,unblockable:true},s.hits);
    }
  }
  private finish(cd:number){this.state='idle';this.st=0;this.body.vx=0;this.cd=cd;}
  private summon(){this.adds=this.adds.filter(a=>!a.remove&&!a.dying);for(let i=this.adds.length;i<2;i++){const a=new CrownAdd(this,clamp(this.x+(i?-155:155),105,G.world.grid.w*16-105),this.floorY,this.plague);G.world.add(a);this.adds.push(a);}}
  private cleanEffects(){for(const a of this.adds)a.remove=true;this.adds=[];this.spores=[];this.ward=false;for(const e of G.world.ents)if(e instanceof Proj&&e.team==='enemy')e.remove=true;}
  animate(dt:number){
    let u=-1;if(this.state==='attack'&&this.attack==='leap')u=clamp((this.st-.9)/.45,0,1);if(this.state==='attack'&&this.attack==='hunt')u=clamp((this.st%1.25-.75)/.35,0,1);
    if(u>0&&u<1){const nx=this.launchX+(this.targetX-this.launchX)*u,ny=this.floorY-Math.sin(u*Math.PI)*76;this.body.vx=clamp((nx-this.x)/Math.max(.001,dt),-900,900);this.body.vy=0;if(bodyFits(this.body,G.world.grid,G.world.solid,this.x,ny))this.y=ny;}
    else{if(u>=0)this.body.vx=0;this.body.vy=Math.min(480,this.body.vy+1400*dt);}moveBody(this.body,dt,G.world.grid,G.world.solid);this.x=clamp(this.x,100,G.world.grid.w*16-100);
  }
  updateDeath(dt:number){this.defeatT+=dt;if(this.defeatT>1.8&&!this.remove){this.cleanEffects();this.remove=true;G.world.onBossDefeated(this);}}
  draw(ctx:Ctx){
    let frame=this.phase>=2?4:0;if(this.state==='attack')frame=this.attack==='call'||this.attack==='spores'||this.attack==='purge'?5:this.st<.75?1:this.st<1.5?2:3;
    if(this.state==='kneel')frame=6;if(this.dying)frame=7;
    if(!drawFallenArt(ctx,this.plague,frame,this.x,this.y,this.face,this.dying?Math.max(.2,1-this.defeatT*.3):1))poly(ctx,[this.x-25,this.y,this.x-25,this.y-85,this.x,this.y-110,this.x+25,this.y-85,this.x+25,this.y],'#293d35',this.color,1);
    for(const s of this.spores){ctx.fillStyle=rgba(this.color,s.t<1.05?.1:.25);ctx.fillRect(s.x-38,this.floorY-65,76,65);ctx.strokeStyle=this.color;ctx.lineWidth=1;ctx.strokeRect(s.x-38,this.floorY-65,76,65);if(s.t<1.05)this.floorMark(ctx,s.x,this.floorY,38,s.t/1.05,this.color);}
    if(this.state!=='attack')return;
    if((this.attack==='claws'&&this.st<.75)||(this.attack==='charge'&&this.st<.9))this.glint(ctx,this.x+this.face*30,this.y-57,this.color,.8);
    if(this.attack==='charge'&&this.st<.9){ctx.fillStyle=rgba(this.color,.15);ctx.fillRect(this.face>0?this.x:this.x-270,this.floorY-12,270,12);}
    if(this.attack==='hunt'||this.attack==='leap'){const t=this.attack==='hunt'?this.st%1.25:this.st,tell=this.attack==='hunt'?.75:.9;if(t<tell+.4)this.floorMark(ctx,this.targetX,this.floorY,60,clamp(t/tell,0,1),this.color);}
    if(this.attack==='purge'){
      ctx.fillStyle=rgba(this.color,this.st<1.6?.05:.18);ctx.fillRect(0,this.floorY-180,this.beaconX-80,180);ctx.fillRect(this.beaconX+80,this.floorY-180,G.world.grid.w*16-this.beaconX-80,180);
      ctx.strokeStyle='#ffdf91';ctx.lineWidth=2;ctx.strokeRect(this.beaconX-80,this.floorY-85,160,85);glow(ctx,this.beaconX,this.floorY-35,65,'#ffdf91',.3);
    }
  }
  lights(){lighting.add(this.x,this.cy,100,this.color,.35,.3);}
}
export class BeastMonarch extends FallenMonarch {constructor(x:number,y:number){super(false,x,y);}}
export class PlagueMonarch extends FallenMonarch {constructor(x:number,y:number){super(true,x,y);}}
