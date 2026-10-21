// Azkar is original fiction. His crown breaks; his soul is never raised as an Echo.
import { BossBase } from './bosses2';
import { Entity, type HitInfo } from './entity';
import { G } from './ctx';
import { bossScale } from './difficulty';
import { moveBody } from './physics';
import { clamp, approach, sign } from '../core/math';
import { rgba, poly, type Ctx } from '../render/draw';
import { drawCinderArt } from '../render/fallenArt';
import { fx } from '../render/fx';
import { lighting } from '../render/lighting';
import { music } from '../audio/music';

type Attack='hammer'|'fault'|'sweep'|'bellows';
interface Fault {x:number;t:number;fired:boolean;hits:Set<number>}
/** Low fire waves share the boss combat clock; jumping clears their 24px height. */
export class CinderWave extends Entity {
  hits=new Set<number>();life=5;
  constructor(public owner:CinderMonarch,x:number,y:number,dir:number){super(x,y,30,24);this.face=dir;this.layer=8;}
  update(dt:number){
    if(this.owner.dying||this.owner.remove||!this.owner.fighting){this.remove=true;return;}
    dt*=bossScale().tempo*this.owner.encounterTempo;this.life-=dt;this.x+=this.face*210*dt;
    if(this.life<=0||this.x<70||this.x>G.world.grid.w*16-50){this.remove=true;return;}
    G.world.hitPlayerSide({x:this.x-15,y:this.y-24,w:30,h:24},{dmg:this.owner.dmg*.8,poise:25,kx:this.face*90,ky:-90,dir:this.face,kind:'hazard',src:this,unblockable:true},this.hits);
  }
  draw(ctx:Ctx){poly(ctx,[this.x-18,this.y,this.x-11,this.y-12,this.x-3,this.y-28,this.x+3,this.y-12,this.x+15,this.y-20,this.x+18,this.y],'#ec793e','#ffdc9e',1);}
}
export class CinderMonarch extends BossBase {
  attack:Attack='hammer';attackCount=0;released=false;floorY:number;targetX=0;
  faults:Fault[]=[];waves:CinderWave[]=[];ward=false;bellowsStep=-1;armor=false;
  readonly color='#ffb16b';
  constructor(x:number,y:number){
    super('cinder_monarch',x,y,48,94,1020000);this.floorY=y;this.face=-1;
    this.name='Azkar · Crown of Cinders';this.sub='I · The Living Anvil';this.maxPoise=this.poise=680;
    this.p2At=.67;this.p3At=.32;this.phaseMarks=[.67,.32];this.hitColor=this.color;this.kneelTime=3.2;
  }
  get dmg(){return 330*this.ngMul*this.encounterDamage*(this.phase===3?1.1:1);}
  canBeTargeted(){return super.canBeTargeted()&&!this.ward;}
  takeHit(h:HitInfo){
    if(this.ward)return false;
    const armor=this.armor&&this.state!=='kneel'?.55:1,threshold=this.phase===1?this.p2At:this.phase===2?this.p3At:0;
    let dmg=h.dmg*armor;
    if(threshold&&this.fighting){const allowed=Math.max(1,this.hp-Math.ceil(this.maxHp*threshold)+1);dmg=Math.min(dmg,allowed/(!h.dot&&this.state==='kneel'?1.5:1));}
    const hit=super.takeHit({...h,dmg});
    if(hit&&this.fighting&&threshold&&this.hp<this.maxHp*threshold){if(this.phase===1)this.beginTransition();else this.enterPhase3();}
    return hit;
  }
  updateDormant(_dt:number){}
  updateIntro(_dt:number){if(this.st>1.7){this.beginFight();G.camera.viewMultTarget=1.2;music.play('cinder_monarch',.6);}}
  beginTransition(){this.clearHeat();this.state='transition';this.st=0;this.invuln=999;this.body.vx=0;G.ui.banner('THE TEMPERED CROWN','Armor reduces damage · parry the hammer to shatter it','boss');}
  enterPhase3(){this.clearHeat();this.phase=3;this.armor=false;this.state='transition';this.st=0;this.invuln=999;this.body.vx=0;G.ui.banner('THE LAST BELLOWS','Three eruptions · leave each marked crack, then strike','boss');}
  updateTransition(_dt:number){
    if(this.st<1.5)return;this.invuln=0;this.poise=this.maxPoise;this.staggered=0;
    if(this.phase===1){this.phase=2;this.armor=true;this.sub='II · Parry to break the tempered armor';this.finish(1.2);}
    else{this.sub='III · Evade the bellows, punish the broken furnace';this.startAttack('bellows');}
    music.phase=this.phase-1;G.ui.bossBar(this.name,this.sub);
  }
  updateKneel(_dt:number){this.body.vx=0;}
  onKneel(){this.armor=false;this.body.vx=0;this.clearHeat();}
  recover(){super.recover();this.armor=this.phase===2;}
  parried(){if(!this.fighting||this.ward)return;this.poise-=230;this.body.vx=0;if(this.phase===2||this.poise<=0){this.kneel();G.ui.toast('The armor shatters — Azkar is exposed.','good');}else this.finish(1.8);}
  startAttack(a:Attack){
    this.attack=a;this.attackCount++;this.state='attack';this.st=0;this.released=false;this.hitSet.clear();this.body.vx=0;
    this.face=sign(G.world.player.x-this.x)||this.face;this.targetX=clamp(G.world.player.x,110,G.world.grid.w*16-110);
    if(a==='fault')this.markFault(this.targetX);
    if(a==='bellows'){this.clearHeat();this.ward=true;this.bellowsStep=-1;G.ui.toast('Last Bellows: leave each orange crack. Azkar weakens after the third eruption.','warn');}
  }
  private markFault(x:number){this.faults.push({x:clamp(x,105,G.world.grid.w*16-105),t:0,fired:false,hits:new Set()});}
  private tickFaults(dt:number){
    for(let i=this.faults.length-1;i>=0;i--){const f=this.faults[i];f.t+=dt;if(f.t>2.15){this.faults.splice(i,1);continue;}
      if(f.t<1.7)continue;
      if(!f.fired){f.fired=true;fx.ring(f.x,this.floorY-2,4,44,this.color,.3,2);}
      G.world.hitPlayerSide({x:f.x-38,y:this.floorY-180,w:76,h:181},{dmg:this.dmg*1.3,poise:40,kx:sign(G.world.player.x-f.x)*100,ky:-120,dir:0,kind:'hazard',src:this,unblockable:true},f.hits);
    }
  }
  think(dt:number){
    this.tickFaults(dt);
    if(this.state==='idle'){
      const dx=G.world.player.x-this.x;this.face=sign(dx)||this.face;this.body.vx=approach(this.body.vx,Math.abs(dx)>115?this.face*80:0,dt*650);this.cd-=dt;
      if(this.cd<=0){const seq:Attack[]=['hammer','fault','sweep','hammer'];this.startAttack(this.phase===3&&this.attackCount%4===0?'bellows':seq[this.attackCount%4]);}return;
    }
    const t=this.st;
    if(this.attack==='hammer'){
      if(t>=.95&&t<1.2){this.body.vx=this.face*130;G.world.hitPlayerSide({x:this.x+(this.face>0?0:-100),y:this.y-85,w:100,h:85},{dmg:this.dmg*1.4,poise:70,kx:this.face*180,ky:-110,dir:this.face,kind:'melee',src:this,parryable:true},this.hitSet);}else this.body.vx=0;
      if(t>2.15)this.finish(1.1);
    }else if(this.attack==='fault'){if(t>2.4)this.finish(1.1);}
    else if(this.attack==='sweep'){
      if(t>=1.2&&!this.released){this.released=true;this.waves=this.waves.filter(w=>!w.remove);for(const dir of [-1,1]){const w=new CinderWave(this,this.x+dir*44,this.floorY,dir);this.waves.push(w);G.world.add(w);}}
      if(t>2.45)this.finish(1.2);
    }else{
      const step=Math.min(2,Math.floor(t/2.4));if(step!==this.bellowsStep){this.bellowsStep=step;const x=G.world.player.x;this.markFault(x);this.markFault(x-185);this.markFault(x+185);}
      if(t>7.15){this.ward=false;this.finish(3.1);G.ui.toast('The furnace breaks — Azkar is exposed.','good');}
    }
  }
  private finish(cd:number){this.state='idle';this.st=0;this.cd=cd;this.body.vx=0;}
  private clearHeat(){this.faults=[];for(const w of this.waves)w.remove=true;this.waves=[];this.ward=false;}
  animate(dt:number){this.body.vy=Math.min(480,this.body.vy+1400*dt);moveBody(this.body,dt,G.world.grid,G.world.solid);this.x=clamp(this.x,100,G.world.grid.w*16-100);}
  die(){this.clearHeat();super.die();}
  updateDeath(dt:number){this.defeatT+=dt;if(this.defeatT>1.8&&!this.remove){this.remove=true;G.world.onBossDefeated(this);}}
  draw(ctx:Ctx){
    const frame=this.dying||this.state==='kneel'?3:this.state==='attack'?(this.st<(this.attack==='hammer'?.95:1.2)?1:2):0;
    if(!drawCinderArt(ctx,frame,this.x,this.y,this.face,this.dying?Math.max(.15,1-this.defeatT*.35):1))poly(ctx,[this.x-25,this.y,this.x-30,this.y-90,this.x,this.y-120,this.x+30,this.y-90,this.x+25,this.y],'#302a28',this.color,1);
    if(this.armor){ctx.strokeStyle=rgba('#ffe5b1',.8);ctx.lineWidth=2;ctx.beginPath();ctx.arc(this.x,this.y-52,34,-2.7,-.4);ctx.stroke();}
    for(const f of this.faults){const active=f.t>=1.7;ctx.fillStyle=rgba(this.color,active?.6:.12);ctx.fillRect(f.x-38,this.floorY-(active?180:8),76,active?180:8);ctx.strokeStyle=active?'#fff0c9':this.color;ctx.lineWidth=active?2:1;ctx.strokeRect(f.x-38,this.floorY-10,76,10);if(!active)this.floorMark(ctx,f.x,this.floorY,38,f.t/1.7,this.color);}
    if(this.state==='attack'&&this.attack==='hammer'&&this.st<.95)this.glint(ctx,this.x+this.face*40,this.y-92,'#ffd89a',.8);
    if(this.state==='attack'&&this.attack==='sweep'&&this.st<1.2){ctx.strokeStyle='#ffca83';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(this.x-80,this.floorY-20);ctx.lineTo(this.x+80,this.floorY-20);ctx.stroke();}
  }
  lights(){lighting.add(this.x,this.cy,110,this.color,.4,.3);}
}
