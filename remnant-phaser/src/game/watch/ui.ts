// The Watch's readouts and controls (POLISH_PLAN §18b): a bar over the wall (coins, the stage, the boss's timer) and,
// below it, the tabs: Upgrades, Skills, Hero, Ascend; the speed (×1, ×2, ×3) by Leave; and the skill bar along the foot of
// the wall, a button for each ability he takes in, with its wait running round it. Plain DOM, styled like the game's menus; built once and then only
// updated (text and classes) a few times a second, never rebuilt per frame.
import { sfx } from '../../../../remnant/src/audio/audio';
import * as D from './defs';
import bladesUrl from '../../assets/cc0/blades.png';
import vanguardUrl from '../../../../remnant/src/assets/echo-vanguard.png';
import sovereignUrl from '../../../../remnant/src/assets/echo-sovereign.png';
import veilUrl from '../../../../remnant/src/assets/foes-veil.png';
import { ECHO_SPECIES, ECHO_ROLES } from '../../../../remnant/src/game/data';
import { SHADOW_ORDER, SHADOW_ART, ROLE_ORDER, UNLOCK_COST, SHADOW_MAX, levelCost, tierOf, shadowName, shadowRole, owned, type ShadowId } from './shadows';
import type { Watch } from '../../scenes/Watch';
import { awayCap, type AwayReport } from './offline';
import * as Q from './daily';
import { FEATS, MEASURE, checkFeats, featBonus, measure, titleOf, type FeatMeasure } from './feats';
import { pushLayer, popLayer } from '../../../../remnant/src/ui/dom';

const CSS = `
/* The Watch's own look (POLISH_PLAN §18l, the owner's ask of 7 November 2026): a twilight indigo with lantern amber,
   mint for what can be bought, an accent for each tab, and the phone's rounded type. Long idle sessions: calm colours,
   big numbers, a little bounce on every purchase. Sizes follow Settings → Text size (--fs-k). */
.wt-root,.wt-card-layer{--bg0:#0e0d27;--bg1:#17153f;--bg2:#211e55;--bg3:#2b2869;--line:rgba(176,168,255,.16);--line2:rgba(176,168,255,.28);
  --txt:#f5f2ff;--mut:#a7a3d9;--dim:#7d79b3;--amber:#ffbe55;--amber2:#ff8d3c;--mint:#3ee6aa;--mint2:#10b47e;--sky:#5ccbff;--violet:#b08cff;
  --coral:#ff7b93;--gold:#ffd76b;--aqua:#6deaf3;--rose:#ff5f8a;--acc:var(--amber);
  --wf:ui-rounded,"SF Pro Rounded","Nunito","Varela Round",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wt-root button,.wt-root select,.wt-card-layer button{font-family:var(--wf);-webkit-tap-highlight-color:transparent}
.wt-root button:focus-visible,.wt-root select:focus-visible,.wt-card-layer button:focus-visible{outline:2px solid #f6dea0;outline-offset:2px}
@keyframes wtPop{0%{transform:scale(1)}40%{transform:scale(1.05)}100%{transform:scale(1)}}
@keyframes wtRise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes wtPulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.35);opacity:.75}}
@keyframes wtShine{from{background-position:-160% 0}to{background-position:260% 0}}
@media (prefers-reduced-motion:reduce){.wt-root *,.wt-card-layer *{animation:none!important;transition:none!important}}

/* ---- the bar over the wall */
.wt-hud{position:fixed;left:0;right:0;z-index:15;pointer-events:none;font-family:var(--wf);color:var(--txt);padding:0 10px}
.wt-row{display:flex;align-items:center;gap:8px;justify-content:space-between}
.wt-row.mid{min-height:28px}
.wt-coins{display:inline-flex;align-items:center;gap:7px;font-weight:800;color:#fff3d6;font-size:calc(19px*var(--fs-k,1));font-variant-numeric:tabular-nums;white-space:nowrap;
  padding:4px 14px 4px 5px;border-radius:999px;background:linear-gradient(180deg,rgba(33,30,85,.92),rgba(17,15,52,.92));border:1px solid var(--line2);box-shadow:0 2px 10px rgba(0,0,0,.35)}
.wt-coins i{display:inline-block;width:22px;height:22px;border-radius:50%;background:radial-gradient(circle at 32% 30%,#fff6d8 0 18%,#ffd36b 40%,#f09a2a 75%,#b9661a);box-shadow:inset 0 -2px 0 rgba(120,60,10,.45),0 0 10px rgba(255,190,85,.45)}
.wt-stage{font-weight:700;font-size:calc(13px*var(--fs-k,1));letter-spacing:.02em;color:var(--txt);padding:3px 11px;border-radius:999px;background:rgba(14,13,39,.78);border:1px solid var(--line)}
.wt-statline{display:grid;grid-template-columns:1fr 1.6fr 1fr 1fr 1fr;gap:4px;margin-top:6px;white-space:nowrap}
.wt-statline span{display:flex;flex-direction:column;align-items:center;min-width:0;font-size:calc(9px*var(--fs-k,1));font-weight:700;letter-spacing:.09em;color:var(--mut);line-height:1.2;
  padding:3px 0;border-radius:9px;background:rgba(14,13,39,.7);border:1px solid var(--line)}
.wt-statline b{color:var(--txt);font-weight:800;font-size:min(12.5px,3.1vw);letter-spacing:0;font-variant-numeric:tabular-nums;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.wt-statline b.low{color:#ff8fa3}
.wt-bar{height:7px;background:rgba(10,9,30,.75);border-radius:99px;overflow:hidden;margin-top:5px;box-shadow:inset 0 1px 2px rgba(0,0,0,.5)}
.wt-bar b{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--amber2),var(--amber),#fff0bf);width:0;transition:width .25s ease-out}
.wt-bar.boss b{background:linear-gradient(90deg,#ff3d6e,#ff8a5c)}
.wt-btn{pointer-events:auto;font-weight:800;font-size:calc(12.5px*var(--fs-k,1));padding:7px 13px;border-radius:999px;border:1px solid var(--line2);background:linear-gradient(180deg,#2a2768,#1b1949);color:var(--txt);cursor:pointer;
  box-shadow:0 3px 0 #0b0a24;transition:transform .08s}
.wt-btn:active:not(:disabled){transform:translateY(2px);box-shadow:0 1px 0 #0b0a24}
.wt-btn.hot{background:linear-gradient(180deg,#ffc961,#ff9440);color:#3a1a00;border-color:#ffd98f;box-shadow:0 3px 0 #b5561a,0 0 14px rgba(255,170,70,.25)}
.wt-btn.violet{background:linear-gradient(180deg,#b593ff,#7a52e8);color:#fff;border-color:#d6c4ff;box-shadow:0 3px 0 #4b2aa8,0 0 16px rgba(176,140,255,.45)}
.wt-btn:disabled{background:#25234f;color:var(--dim);border-color:var(--line);box-shadow:none;cursor:default}
.wt-btn[hidden]{display:none}
.wt-toast{position:fixed;left:50%;transform:translateX(-50%);z-index:16;pointer-events:none;background:linear-gradient(180deg,#2b2869,#1b1949);border:1px solid var(--line2);border-radius:16px;padding:8px 16px;
  font-family:var(--wf);font-weight:700;color:var(--txt);font-size:calc(13px*var(--fs-k,1));max-width:88vw;text-align:center;opacity:0;transition:opacity .25s;box-shadow:0 6px 18px rgba(0,0,0,.4)}
.wt-toast.on{opacity:1}
.wt-call{position:fixed;left:50%;z-index:16;pointer-events:none;font-family:var(--wf);font-weight:900;font-size:min(26px,6.6vw);letter-spacing:.08em;color:#fffaf0;white-space:nowrap;opacity:0;transform:translateX(-50%);--g:#ffbe55;
  padding:6px 28px;border-radius:40px;background:radial-gradient(closest-side,rgba(8,7,26,.7),rgba(8,7,26,.35) 60%,transparent);text-shadow:0 0 2px #000,0 0 8px var(--g),0 0 18px var(--g),0 2px 2px #000;text-transform:uppercase}
.wt-call.on{animation:wtCall 1.15s ease-out forwards}
@keyframes wtCall{0%{opacity:0;transform:translateX(-50%) scale(1.9);letter-spacing:.4em}14%{opacity:1;transform:translateX(-50%) scale(1);letter-spacing:.08em}72%{opacity:1}100%{opacity:0;transform:translateX(-50%) translateY(-8px) scale(1.04)}}

/* ---- the panel under the wall */
.wt-panel{position:fixed;left:0;right:0;z-index:14;display:flex;flex-direction:column;font-family:var(--wf);color:var(--txt);padding-bottom:env(safe-area-inset-bottom);
  background:radial-gradient(120% 60% at 50% 0%,#24206a 0%,transparent 60%),linear-gradient(180deg,var(--bg1),var(--bg0));
  border-top:1px solid var(--line2)}
.wt-panel[data-tab=up]{--acc:var(--amber)}.wt-panel[data-tab=skills]{--acc:var(--sky)}.wt-panel[data-tab=shadows]{--acc:var(--violet)}
.wt-panel[data-tab=daily]{--acc:var(--coral)}.wt-panel[data-tab=feats]{--acc:#ff9ad5}.wt-panel[data-tab=hero]{--acc:var(--gold)}.wt-panel[data-tab=ascend]{--acc:var(--aqua)}
.wt-body{flex:1;overflow:auto;padding:10px 12px 14px;-webkit-overflow-scrolling:touch}
.wt-body>*{animation:wtRise .22s ease-out both}
.wt-tabs{display:flex;gap:2px;padding:5px 6px 4px;border-top:1px solid var(--line);background:linear-gradient(180deg,#141239,#0c0b24)}
.wt-tab{flex:1;min-width:0;position:relative;display:flex;flex-direction:column;align-items:center;gap:2px;padding:6px 1px 5px;font-weight:700;font-size:min(11px,2.7vw);letter-spacing:.01em;
  background:none;color:var(--dim);border:0;border-radius:12px;cursor:pointer;transition:color .15s,background .15s}
.wt-tab svg{width:22px;height:22px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;transition:transform .15s}
.wt-tab span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.wt-tab.on{color:var(--tc,var(--amber));background:rgba(255,255,255,.06)}
.wt-tab.on svg{transform:translateY(-1px) scale(1.08);filter:drop-shadow(0 0 6px var(--tc,var(--amber)))}
.wt-tab.on::before{content:'';position:absolute;top:-5px;left:28%;right:28%;height:3px;border-radius:0 0 3px 3px;background:var(--tc,var(--amber));box-shadow:0 0 10px var(--tc,var(--amber))}
.wt-tab.dot::after{content:'';position:absolute;top:4px;right:calc(50% - 17px);width:9px;height:9px;border-radius:50%;background:var(--coral);box-shadow:0 0 0 2px #110f30,0 0 8px var(--coral);animation:wtPulse 1.6s ease-in-out infinite}

/* ---- headers, words, numbers */
.wt-h{display:flex;align-items:center;gap:8px;font-weight:900;color:var(--txt);font-size:calc(16px*var(--fs-k,1));margin:4px 0 8px;letter-spacing:.01em}
.wt-h::before{content:'';flex:none;width:5px;height:1.05em;border-radius:3px;background:var(--acc);box-shadow:0 0 8px var(--acc)}
.wt-p{font-size:calc(12.5px*var(--fs-k,1));color:var(--mut);margin:0 0 10px;line-height:1.45;padding:9px 11px;border-radius:12px;background:rgba(255,255,255,.035);border:1px solid var(--line)}
.wt-tip{margin:0 0 10px;border-radius:12px;background:rgba(255,255,255,.035);border:1px solid var(--line);font-size:calc(12.5px*var(--fs-k,1));color:var(--mut)}
.wt-tip summary{list-style:none;cursor:pointer;padding:8px 11px;font-weight:800;color:var(--acc);display:flex;align-items:center;gap:7px}
.wt-tip summary::-webkit-details-marker{display:none}
.wt-tip summary::before{content:'i';flex:none;width:17px;height:17px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:900;font-style:italic;color:#0e0d27;background:var(--acc)}
.wt-tip summary::after{content:'›';margin-left:auto;font-size:18px;line-height:1;transition:transform .15s}
.wt-tip[open] summary::after{transform:rotate(90deg)}
.wt-tip p{margin:0;padding:0 11px 10px;line-height:1.45}
.wt-fsum{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px}
.wt-fsum>div{text-align:center;padding:8px 4px;border-radius:14px;background:linear-gradient(180deg,var(--bg2),var(--bg1));border:1px solid var(--line2);font-size:calc(11px*var(--fs-k,1));font-weight:800;color:var(--mut)}
.wt-fsum b{display:block;font-weight:900;font-size:calc(19px*var(--fs-k,1));color:var(--fc)}
.wt-ftitle{display:flex;align-items:center;gap:10px;margin-bottom:10px;padding:8px 11px;border-radius:14px;background:linear-gradient(90deg,rgba(255,154,213,.16),rgba(255,255,255,.03));border:1px solid var(--line2);font-weight:900;font-size:calc(13px*var(--fs-k,1))}
.wt-ftitle select{flex:1;min-width:0;font-weight:800;font-size:calc(13px*var(--fs-k,1));padding:7px 10px;border-radius:999px;border:1px solid var(--line2);background:#1b1949;color:var(--txt)}
.wt-fg{margin-bottom:9px;padding:9px 10px;border-radius:16px;background:linear-gradient(180deg,var(--bg2),var(--bg1));border:1px solid var(--line2)}
.wt-fg .hd{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px;font-size:calc(13px*var(--fs-k,1))}
.wt-fg .hd b{font-weight:900;color:var(--txt)}
.wt-fg .hd span{font-weight:900;color:var(--acc);font-variant-numeric:tabular-nums}
.wt-ft{display:grid;grid-template-columns:22px 1fr auto;gap:8px;align-items:center;padding:6px 0;border-top:1px solid var(--line)}
.wt-ft i{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-style:normal;font-weight:900;font-size:13px;color:#0e0d27;background:#2a2762;box-shadow:inset 0 0 0 1px var(--line2)}
.wt-ft.got i{background:linear-gradient(180deg,#ffd0ec,var(--acc));box-shadow:0 0 10px var(--acc)}
.wt-ft b{display:block;font-weight:900;font-size:calc(12.5px*var(--fs-k,1));color:var(--txt)}
.wt-ft small{display:block;font-size:calc(10.5px*var(--fs-k,1));color:var(--mut);font-weight:700}
.wt-ft .wt-bar{height:5px;margin-top:4px}
.wt-ft .wt-bar b{background:linear-gradient(90deg,#c25ea6,var(--acc))}
.wt-ft em{font-style:normal;font-weight:900;font-size:calc(11px*var(--fs-k,1));color:var(--acc);white-space:nowrap}
.wt-ft:not(.got){opacity:.85}
.wt-ft:not(.got) b{color:var(--mut)}
.wt-stats{display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:calc(11.5px*var(--fs-k,1));margin-bottom:12px}
.wt-stats>div{display:flex;flex-direction:column;gap:1px;padding:7px 10px;border-radius:12px;background:linear-gradient(180deg,var(--bg2),var(--bg1));border:1px solid var(--line);color:var(--mut);font-weight:700}
.wt-stats b{color:var(--txt);font-weight:900;font-size:calc(14px*var(--fs-k,1));font-variant-numeric:tabular-nums}
.wt-list{font-size:calc(12.5px*var(--fs-k,1));margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:5px}
.wt-list li{display:grid;grid-template-columns:62px 1fr;align-items:center;padding:7px 10px;border-radius:11px;background:rgba(255,255,255,.03);border:1px solid var(--line);color:var(--dim)}
.wt-list li.got{color:var(--txt);background:linear-gradient(90deg,rgba(62,230,170,.12),rgba(255,255,255,.03))}
.wt-list li b{font-weight:900;color:var(--acc)}
.wt-list li.got b::before{content:'✓ ';color:var(--mint)}
.wt-big{width:100%;margin-top:8px;font-size:calc(15px*var(--fs-k,1));padding:12px}

/* ---- buying: ×1 ×10 Max and the upgrade cards */
.wt-amt{display:flex;gap:4px;justify-content:flex-end;margin-bottom:8px;padding:3px;border-radius:999px;background:rgba(10,9,30,.6);border:1px solid var(--line);width:max-content;margin-left:auto}
.wt-amt button{font-weight:800;font-size:calc(11.5px*var(--fs-k,1));padding:5px 12px;border-radius:999px;border:0;background:none;color:var(--mut);cursor:pointer}
.wt-amt button.on{color:#3a1a00;background:linear-gradient(180deg,#ffc961,#ff9440)}
.wt-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.wt-card{--tc:var(--amber);display:flex;flex-direction:column;align-items:stretch;gap:6px;background:linear-gradient(180deg,var(--bg3),var(--bg2) 55%,var(--bg1));border:1px solid var(--line2);border-radius:16px;padding:9px;cursor:pointer;
  color:var(--txt);font:inherit;text-align:left;min-width:0;touch-action:manipulation;-webkit-user-select:none;user-select:none;box-shadow:0 4px 0 rgba(6,5,20,.55),inset 0 1px 0 rgba(255,255,255,.07);transition:transform .08s}
.wt-card:active{transform:translateY(2px)}
.wt-card .n{flex:1;display:flex;flex-direction:column;min-width:0}
.wt-card .hd{display:flex;align-items:center;gap:7px;min-width:0}
.wt-card .ic{flex:none;width:30px;height:30px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--tc) 22%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--tc) 45%,transparent)}
.wt-card .ic svg{width:18px;height:18px;stroke:var(--tc);fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.wt-card .hd>div{display:flex;flex-direction:column;min-width:0}
.wt-card .n b{font-weight:900;font-size:calc(12.5px*var(--fs-k,1));color:var(--txt);line-height:1.15}
.wt-card .n small{font-size:calc(10.5px*var(--fs-k,1));color:var(--tc);font-weight:800}
.wt-card .n span{font-size:min(15px,3.9vw);color:var(--txt);font-weight:900;margin-top:5px;white-space:nowrap;font-variant-numeric:tabular-nums}
.wt-card .n span i{font-style:normal;color:var(--mint)}
.wt-card .n em{font-style:normal;font-size:calc(10.5px*var(--fs-k,1));color:var(--mut);line-height:1.3;margin-top:1px}
.wt-card.bought{animation:wtPop .22s ease-out;box-shadow:0 4px 0 rgba(6,5,20,.55),0 0 0 2px var(--mint),0 0 18px rgba(62,230,170,.45)}
.wt-card .c{display:flex;align-items:center;justify-content:center;gap:6px;border-radius:999px;background:linear-gradient(180deg,var(--mint),var(--mint2));color:#04281b;font-weight:900;font-size:calc(12.5px*var(--fs-k,1));
  padding:7px 6px;white-space:nowrap;box-shadow:0 3px 0 #0a6e4c,0 0 12px rgba(62,230,170,.25)}
.wt-card .c small{font-size:calc(12.5px*var(--fs-k,1));font-weight:900;color:#04281b}
.wt-card .c small::before{content:'';display:inline-block;width:11px;height:11px;margin-right:4px;border-radius:50%;vertical-align:-1px;background:radial-gradient(circle at 32% 30%,#fff6d8 0 18%,#ffd36b 40%,#f09a2a 75%,#b9661a)}
.wt-card.poor .c{background:#2a2762;color:var(--mut);box-shadow:0 3px 0 #13123a}
.wt-card.poor .c small{color:var(--mut)}
.wt-card.locked{opacity:.5;cursor:default}
.wt-card.locked .c{background:#211f50;color:var(--dim);box-shadow:none}
.wt-card.maxed .c{background:linear-gradient(180deg,#ffe28a,#f2b23c);color:#3a2400;box-shadow:0 3px 0 #9b6a10}

/* ---- the skill bar */
.wt-skillbar{display:flex;gap:8px;align-items:center;padding:7px 12px;border-bottom:1px solid var(--line);background:linear-gradient(180deg,rgba(23,21,63,.96),rgba(14,13,39,.96))}
.wt-skillbar .sp{flex:1;font-size:calc(11px*var(--fs-k,1));color:var(--mut);font-weight:700}
.wt-sk{pointer-events:auto;position:relative;width:44px;height:44px;border-radius:50%;border:2px solid var(--sky);background:radial-gradient(circle at 50% 35%,#2f2b78,#15133d);display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;overflow:hidden;touch-action:manipulation;
  box-shadow:0 3px 0 #0a0924}
.wt-sk svg{width:22px;height:22px;stroke:#e9f7ff;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;position:relative;z-index:1}
.wt-sk::before{content:'';position:absolute;inset:0;background:conic-gradient(rgba(5,5,20,.78) calc(var(--p,0)*1turn),transparent 0);z-index:0}
.wt-sk.ready{box-shadow:0 3px 0 #0a0924,0 0 14px rgba(92,203,255,.6)}
.wt-sk.flash{border-color:#fff;box-shadow:0 0 20px #bfeaff;animation:wtPop .26s ease-out}
.wt-sk.empty{opacity:.35;cursor:default;border-style:dashed;border-color:var(--dim);background:none;box-shadow:none}
.wt-chip{pointer-events:auto;font-weight:900;font-size:calc(10.5px*var(--fs-k,1));letter-spacing:.06em;padding:6px 11px;border-radius:999px;border:1px solid var(--line2);background:#1b1949;color:var(--dim);cursor:pointer}
.wt-chip.on{color:#04281b;background:linear-gradient(180deg,var(--mint),var(--mint2));border-color:#9ff5d3;box-shadow:0 0 12px rgba(62,230,170,.4)}

/* ---- abilities and shadows */
.wt-ab,.wt-sh{display:grid;gap:9px;align-items:center;padding:10px;border:1px solid var(--line2);border-radius:16px;background:linear-gradient(180deg,var(--bg2),var(--bg1));margin-bottom:8px;box-shadow:0 3px 0 rgba(6,5,20,.5)}
.wt-ab{grid-template-columns:40px 1fr auto}
.wt-ab>div:first-child{width:40px;height:40px;border-radius:13px;display:flex;align-items:center;justify-content:center;background:rgba(92,203,255,.16);box-shadow:inset 0 0 0 1px rgba(92,203,255,.4)}
.wt-ab.locked,.wt-sh.locked{opacity:.55}
.wt-ab.on{border-color:var(--sky);box-shadow:0 3px 0 rgba(6,5,20,.5),0 0 0 1px var(--sky),0 0 16px rgba(92,203,255,.25)}
.wt-ab svg{width:24px;height:24px;stroke:var(--sky);fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.wt-ab b,.wt-sh b{font-weight:900;color:var(--txt);font-size:calc(13.5px*var(--fs-k,1))}
.wt-ab small,.wt-sh small{display:block;color:var(--acc);font-weight:700;font-size:calc(11px*var(--fs-k,1));margin-top:1px}
.wt-ab p,.wt-sh p{margin:3px 0 0;font-size:calc(11.5px*var(--fs-k,1));color:var(--mut);line-height:1.35}
.wt-ab .act,.wt-sh .act{display:flex;flex-direction:column;gap:5px;min-width:90px}
.wt-ab .act button,.wt-sh .act button,.wt-sh select{font-weight:900;font-size:calc(11px*var(--fs-k,1));padding:7px 6px;border-radius:999px;border:0;cursor:pointer;
  background:linear-gradient(180deg,var(--mint),var(--mint2));color:#04281b;box-shadow:0 3px 0 #0a6e4c}
.wt-ab .act button.eq,.wt-sh .act button.tm{background:#25225c;color:var(--txt);box-shadow:0 3px 0 #110f33;border:1px solid var(--line2)}
.wt-ab .act button.eq.on{background:linear-gradient(180deg,#7fd7ff,#3aa7e6);color:#04203a;box-shadow:0 3px 0 #1d6a99}
.wt-sh .act button.tm.on{background:linear-gradient(180deg,#c9b0ff,#8a62f0);color:#fff;box-shadow:0 3px 0 #4b2aa8}
.wt-ab .act button:disabled,.wt-sh .act button:disabled{background:#211f50;color:var(--dim);box-shadow:none}
.wt-sh{grid-template-columns:64px 1fr auto}
.wt-sh.on{border-color:var(--violet);box-shadow:0 3px 0 rgba(6,5,20,.5),0 0 0 1px var(--violet),0 0 16px rgba(176,140,255,.25)}
.wt-sh.locked .pic{filter:brightness(.25) grayscale(1)}
.wt-sh .pic{width:64px;height:64px;background-repeat:no-repeat;background-size:384px 384px;image-rendering:pixelated;border-radius:14px;background-color:#0b0a22;box-shadow:inset 0 0 0 1px var(--line2),inset 0 -14px 18px rgba(176,140,255,.18)}
.wt-sh .ess{height:6px;border-radius:99px;background:#0a091f;margin-top:5px;overflow:hidden}
.wt-sh .ess i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#7a52e8,#d6c4ff)}
.wt-sh select{background:#1b1949;color:var(--txt);box-shadow:none;border:1px solid var(--line2);text-align:center}
.wt-role{display:inline-block;font-size:calc(10px*var(--fs-k,1));font-weight:900;letter-spacing:.04em;padding:1px 8px;border-radius:99px;border:1px solid currentColor;margin-left:6px;vertical-align:1px}

/* ---- the armoury */
.wt-arm{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-bottom:12px}
.wt-blade{display:flex;gap:9px;align-items:center;padding:7px 9px;border:1px solid var(--line2);border-radius:14px;background:linear-gradient(180deg,var(--bg2),var(--bg1));color:var(--mut);font-weight:700;font-size:calc(11.5px*var(--fs-k,1));text-align:left;cursor:pointer;line-height:1.25;box-shadow:0 3px 0 rgba(6,5,20,.5)}
.wt-blade i{flex:none;width:24px;height:48px;background-size:192px 48px;background-repeat:no-repeat;image-rendering:pixelated;filter:drop-shadow(0 0 4px rgba(255,215,107,.35))}
.wt-blade b{display:block;font-weight:900;color:var(--txt);font-size:calc(12.5px*var(--fs-k,1))}
.wt-blade.on{border-color:var(--gold);box-shadow:0 3px 0 rgba(6,5,20,.5),0 0 0 1px var(--gold),0 0 14px rgba(255,215,107,.3)}
.wt-blade:disabled{opacity:.45;cursor:default}

/* ---- the days: streak, quests, chests */
.wt-q{display:grid;grid-template-columns:1fr auto;gap:5px 10px;align-items:center;padding:10px 11px;margin-bottom:7px;border:1px solid var(--line2);border-radius:14px;background:linear-gradient(180deg,var(--bg2),var(--bg1))}
.wt-q b{font-weight:900;color:var(--txt);font-size:calc(13px*var(--fs-k,1))}
.wt-q small{grid-column:1/-1;font-size:calc(11px*var(--fs-k,1));color:var(--mut);font-weight:700;font-variant-numeric:tabular-nums}
.wt-q .wt-bar{grid-column:1/-1;margin:0;height:9px}
.wt-q .wt-bar b{background:linear-gradient(90deg,#ff5f8a,var(--coral),var(--amber))}
.wt-q.done{border-color:var(--mint);box-shadow:0 0 14px rgba(62,230,170,.25)}
.wt-q.done .wt-bar b{background:linear-gradient(90deg,var(--mint2),var(--mint))}
.wt-q.claimed{opacity:.5}
.wt-cal{display:grid;grid-template-columns:repeat(7,1fr);gap:5px;margin:4px 0 10px}
.wt-cal div{text-align:center;padding:7px 0 6px;border-radius:12px;background:linear-gradient(180deg,var(--bg2),var(--bg1));border:1px solid var(--line);font-size:calc(10px*var(--fs-k,1));font-weight:800;color:var(--dim);line-height:1.25}
.wt-cal div b{display:block;font-weight:900;color:var(--txt);font-size:calc(15px*var(--fs-k,1))}
.wt-cal div b::before{content:'';display:block;width:16px;height:13px;margin:0 auto 3px;border-radius:3px;background:linear-gradient(180deg,var(--coral) 0 35%,#c94a6a 35%);box-shadow:inset 0 0 0 1px rgba(255,255,255,.2)}
.wt-cal div.past{opacity:.5}
.wt-cal div.past b::before{background:linear-gradient(180deg,var(--mint),var(--mint2))}
.wt-cal div.today{border-color:var(--amber);color:var(--amber);background:linear-gradient(180deg,#3a2c57,#241d4d);box-shadow:0 0 14px rgba(255,190,85,.35);animation:wtPop 1.8s ease-in-out infinite}
.wt-cal div.today b::before{background:linear-gradient(180deg,var(--amber) 0 35%,var(--amber2) 35%)}
.wt-odds{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;font-size:calc(10.5px*var(--fs-k,1));font-weight:800;color:var(--mut);text-align:center;margin:6px 0;text-transform:capitalize}
.wt-odds>div{padding:6px 0;border-radius:11px;background:rgba(255,255,255,.04);border:1px solid var(--line)}
.wt-odds b{display:block;font-weight:900;font-size:calc(14px*var(--fs-k,1))}
.wt-prize{text-align:center;padding:12px;border-radius:14px;margin:8px 0;font-weight:900;background:linear-gradient(110deg,rgba(255,255,255,.03) 30%,rgba(255,255,255,.22) 50%,rgba(255,255,255,.03) 70%) 0 0/250% 100%,linear-gradient(180deg,var(--bg3),var(--bg1));
  border:2px solid currentColor;font-size:calc(13.5px*var(--fs-k,1));animation:wtPop .3s ease-out,wtShine 1.6s ease-out .2s 2;box-shadow:0 0 18px currentColor}

/* ---- the welcome-back card */
.wt-card-layer{position:fixed;inset:0;bottom:auto;height:var(--app-h,100%);z-index:30;display:flex;align-items:center;justify-content:center;background:rgba(6,5,20,.78);padding:16px}
.wt-welcome{width:min(380px,100%);background:radial-gradient(120% 60% at 50% 0%,#2e2a80,transparent 65%),linear-gradient(180deg,var(--bg2),var(--bg0));border:1px solid var(--line2);border-radius:22px;padding:18px;text-align:center;font-family:var(--wf);color:var(--txt);
  box-shadow:0 12px 40px rgba(0,0,0,.55);animation:wtRise .3s ease-out}
.wt-welcome .wt-h{justify-content:center}
.wt-welcome .wt-h::before{display:none}
.wt-welcome b{display:block;font-weight:900;color:#fff3d6;font-size:calc(26px*var(--fs-k,1));margin:6px 0;text-shadow:0 0 16px rgba(255,190,85,.5)}
.wt-away{display:grid;grid-template-columns:auto 1fr;gap:6px 12px;text-align:left;font-size:calc(13px*var(--fs-k,1));margin:10px 0 8px;padding:11px 13px;background:rgba(10,9,30,.6);border-radius:14px;border:1px solid var(--line)}
.wt-away dt{color:var(--mut);font-weight:700}
.wt-away dd{margin:0;color:var(--txt);font-weight:900}
.wt-away dd.up{color:var(--mint)}
.wt-held{font-size:calc(12.5px*var(--fs-k,1));color:#ffb08a;margin:0 0 8px;line-height:1.4}
`;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };

type Tab = 'up' | 'skills' | 'shadows' | 'daily' | 'feats' | 'hero' | 'ascend';
const SHEET_URL: Record<string, string> = { 'echo-vanguard': vanguardUrl, 'echo-sovereign': sovereignUrl, 'foes-veil': veilUrl };

/** The abilities' marks, drawn as strokes. */
const ICON: Record<D.AbilityId, string> = {
  strike: 'M12 3v13M8 12l4 5 4-5M7 21h10',
  pillar: 'M12 21c-3 0-5-2-5-5 0-4 5-6 4-13 3 3 6 7 6 13 0 3-2 5-5 5zM12 21v-5',
  phantom: 'M4 18l6-6-6-6M11 18l6-6-6-6M19 6v12',
  storm: 'M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0M12 4a8 8 0 0 1 8 8M20 12a8 8 0 0 1-8 8M12 20a8 8 0 0 1-8-8M4 12a8 8 0 0 1 8-8',
  comet: 'M6 20l8-8M14 12V5h7M14 5l7 7M4 4l3 3',
  balm: 'M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 11c0 5.5-7 10-7 10zM12 9v6M9 12h6',
  judgment: 'M12 2l2.4 6.6L21 9l-5 4.6L17.6 21 12 17.3 6.4 21 8 13.6 3 9l6.6-.4z',
};
/** Each tab's mark and colour (the new look: POLISH_PLAN §18l). */
const TAB_LOOK: Record<Tab, { label: string; d: string; c: string }> = {
  up: { label: 'Upgrade', d: 'M12 20V6M6 12l6-6 6 6M5 4h14', c: '#ffbe55' },
  skills: { label: 'Skills', d: 'M13 2L4 14h7l-1 8 9-12h-7z', c: '#5ccbff' },
  shadows: { label: 'Shadows', d: 'M5 21V11a7 7 0 0 1 14 0v10l-2.3-1.6L14.4 21 12 19.4 9.6 21l-2.3-1.6zM9.5 11h.01M14.5 11h.01', c: '#b08cff' },
  daily: { label: 'Daily', d: 'M4 9h16v11H4zM3 6h18v3H3zM12 6v14M12 6c-1-3-5-3-5-.5S12 6 12 6s5 2.5 5 0-4-2.5-5 .5', c: '#ff7b93' },
  feats: { label: 'Feats', d: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4', c: '#ff9ad5' },
  hero: { label: 'Hero', d: 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z', c: '#ffd76b' },
  ascend: { label: 'Ascend', d: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2', c: '#6deaf3' },
};
/** Each upgrade's mark and colour. */
const TRACK_LOOK: Record<D.TrackId, { d: string; c: string }> = {
  attack: { d: 'M14.5 4.5L20 4l-.5 5.5L9 20l-5-5zM5 14l5 5M3 21l3-3', c: '#ff8a5c' },
  health: { d: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z', c: '#ff5f8a' },
  speed: { d: 'M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7', c: '#5ccbff' },
  crit: { d: 'M12 2v4M12 18v4M2 12h4M18 12h4M12 8l1.5 2.5L16 12l-2.5 1.5L12 16l-1.5-2.5L8 12l2.5-1.5z', c: '#ffd76b' },
  regen: { d: 'M12 21c-4-2-7-6-7-11 4 0 7 2 7 6 0-4 3-6 7-6 0 5-3 9-7 11zM12 16v5', c: '#3ee6aa' },
  critDmg: { d: 'M12 2l2 5 5-2-2 5 5 2-5 2 2 5-5-2-2 5-2-5-5 2 2-5-5-2 5-2-2-5 5 2z', c: '#ff8d3c' },
  defense: { d: 'M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6zM9 12l2 2 4-4', c: '#8fa8ff' },
  coins: { d: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v10M15 9.5c0-1-1.3-1.5-3-1.5s-3 .6-3 1.8 1.4 1.6 3 2 3 .9 3 2.1-1.3 1.9-3 1.9-3-.5-3-1.5', c: '#ffc94d' },
};
const fmt1 = (n: number) => D.fmt(n);
/** A tab's explanation, folded under "How it works" so the panel leads with what can be done (open it to read). */
const tip = (text: string) => { const d = el('details', 'wt-tip'), sm = el('summary', '', 'How it works'); d.append(sm, el('p', '', text)); return d; };
const svg = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;

export class WatchUI {
  /** Everything the Watch shows over the wall, as one layer of the shared menu navigation (a controller works it). */
  private root = el('div', 'wt-root');
  private hud = el('div', 'wt-hud');
  private panel = el('div', 'wt-panel');
  private body = el('div', 'wt-body');
  private toastEl = el('div', 'wt-toast');
  private callEl = el('div', 'wt-call');
  private coins = el('div', 'wt-coins');
  private stage = el('div', 'wt-stage');
  private bar = el('div', 'wt-bar');
  private barFill = el('b');
  private challenge = el('button', 'wt-btn hot', 'Challenge the boss');
  private transform = el('button', 'wt-btn violet', 'Transform');
  private leave = el('button', 'wt-btn', 'Leave');
  private speed = el('button', 'wt-btn', '×1');
  private skillbar = el('div', 'wt-skillbar');
  private auto = el('button', 'wt-chip', 'AUTO');
  private bar_: { id: D.AbilityId | null; b: HTMLButtonElement }[] = [];
  private barSig = '';
  private abCards = new Map<D.AbilityId, { root: HTMLElement; buy: HTMLButtonElement; eq: HTMLButtonElement; lv: HTMLElement }>();
  private tab: Tab = 'up';
  private tabs = Object.fromEntries((Object.keys(TAB_LOOK) as Tab[]).map((k) => {
    const b = el('button', 'wt-tab' + (k === 'up' ? ' on' : '')), t = TAB_LOOK[k];
    b.innerHTML = `${svg(t.d)}<span>${t.label}</span>`; b.style.setProperty('--tc', t.c);
    return [k, b];
  })) as Record<Tab, HTMLButtonElement>;
  /** Buy one, ten, or as many as the coins allow. */
  amount: 1 | 10 | 0 = 1;
  private cards = new Map<D.TrackId, { root: HTMLButtonElement; lvl: HTMLElement; now: Text; next: HTMLElement; per: HTMLElement; cost: HTMLElement; n: HTMLElement }>();
  /** His numbers under the stage bar: blow, health, swings, damage a second, coins a second. */
  private statline = el('div', 'wt-statline');
  private sl = { atk: el('b'), hp: el('b'), spd: el('b'), dps: el('b'), coins: el('b') };
  private toastT = 0;
  /** Where the bar over the wall ends (CSS px), as last placed. */
  private hudB = 0;
  private overlayEl: HTMLElement | null = null;

  constructor(private sc: Watch) {
    if (!document.getElementById('wt-css')) { const st = el('style'); st.id = 'wt-css'; st.textContent = CSS; document.head.appendChild(st); }
    const top = el('div', 'wt-row');
    const rightTop = el('div', 'wt-row');
    rightTop.append(this.speed, this.leave);
    top.append(this.coins, rightTop);
    this.speed.dataset.k = 'wt_speed';
    this.speed.onclick = () => { sfx('ui'); const next = ((sc.w.speed ?? 1) % 3) + 1 as 1 | 2 | 3; sc.setSpeed(sc.w.level >= D.SPEEDS[next] ? next : 1); this.refresh(); };
    this.auto.dataset.k = 'wt_auto';
    this.auto.onclick = () => { sfx('ui'); sc.w.autoSkills = !sc.w.autoSkills; this.refresh(); };
    this.bar.appendChild(this.barFill);
    const mid = el('div', 'wt-row mid');
    mid.style.marginTop = '4px';
    const right = el('div', 'wt-row');
    right.append(this.transform, this.challenge);
    mid.append(this.stage, right);
    for (const [label, b] of [['ATK', this.sl.atk], ['HEALTH', this.sl.hp], ['SPEED', this.sl.spd], ['DPS', this.sl.dps], ['COINS', this.sl.coins]] as const) {
      const span = el('span', '', label); span.appendChild(b); this.statline.appendChild(span);
    }
    this.statline.dataset.k = 'wt_stats';
    this.hud.append(top, mid, this.bar, this.statline);
    this.challenge.dataset.k = 'wt_challenge'; this.transform.dataset.k = 'wt_transform'; this.leave.dataset.k = 'wt_leave';
    this.challenge.onclick = () => { sfx('uiConfirm'); sc.challenge(); };
    this.transform.onclick = () => { sfx('uiConfirm'); sc.transformNow(); };
    this.leave.onclick = () => { sfx('uiBack'); sc.leave(); };
    const tabs = el('div', 'wt-tabs');
    for (const [k, b] of Object.entries(this.tabs) as [Tab, HTMLButtonElement][]) { b.dataset.k = 'wt_tab_' + k; b.onclick = () => { sfx('ui'); this.show(k); }; tabs.appendChild(b); }
    this.panel.append(this.skillbar, this.body, tabs);
    this.root.append(this.hud, this.panel, this.toastEl, this.callEl);
    document.body.appendChild(this.root);
    this.buildBar();
    this.show('up');
    // A controller (POLISH_PLAN §19 phase 5): the d-pad moves between every button, ✕ presses, L1/R1 change the tab,
    // and ○ goes to Leave (one more ✕ leaves), so a stray press never takes the player out.
    const order = Object.keys(this.tabs) as Tab[];
    pushLayer({
      el: this.root, nav: 'button, select, summary',
      onBack: () => { this.leave.focus(); },
      onAction: (a) => {
        if (a !== 'tabL' && a !== 'tabR') return false;
        const k = order[(order.indexOf(this.tab) + (a === 'tabR' ? 1 : order.length - 1)) % order.length];
        sfx('ui'); this.show(k); this.tabs[k].focus();
        return true;
      },
    });
  }

  /** Place the bar at `top` and say where it ends (CSS pixels): the wall starts under it, however it wraps. */
  placeHud(top: number, landscape: boolean, split: number): number {
    // Below the status bar and the Dynamic Island: the inset comes from CSS itself (as the home screen's does), so a
    // value the phone reports late, or a measurement taken too early, never tucks the bar under them.
    this.hud.style.top = `calc(max(env(safe-area-inset-top, 0px), ${top}px) + 10px)`;
    this.hud.style.right = landscape ? `${window.innerWidth - split}px` : '0px';
    this.hudB = this.hud.getBoundingClientRect().bottom;
    return this.hudB;
  }

  /** Place the panel below the wall (`wallTop` and `stripBottom` in CSS pixels). */
  layout(wallTop: number, stripBottom: number, landscape: boolean, split: number) {
    this.callEl.style.top = `${wallTop + (stripBottom - wallTop) * 0.2}px`;
    this.callEl.style.left = `${split / 2}px`;
    if (landscape) {
      Object.assign(this.panel.style, { top: '0px', height: 'var(--app-h, 100vh)', left: `${split}px`, borderTop: '0', borderLeft: '1px solid rgba(226,184,90,.35)' });
      this.toastEl.style.top = `${stripBottom - 40}px`;
    } else {
      // Down to the true foot of the screen (not the window's, which an installed iPhone app can report short).
      Object.assign(this.panel.style, { top: `${stripBottom}px`, height: `calc(var(--app-h, 100vh) - ${stripBottom}px)`, left: '0px', borderTop: '1px solid rgba(226,184,90,.35)', borderLeft: '0' });
      this.toastEl.style.top = `${stripBottom - 40}px`;
    }
  }

  /** The skill bar: a button per slot (what he takes in), and AUTO. Rebuilt when the loadout changes. */
  buildBar() {
    const w = this.sc.w;
    this.barSig = `${D.slotsAt(w.level)}:${(w.loadout ?? []).join()}`;
    this.skillbar.textContent = '';
    this.bar_ = [];
    const lo = w.loadout ?? [];
    for (let i = 0; i < D.slotsAt(w.level); i++) {
      const id = lo[i] ?? null, b = el('button', 'wt-sk' + (id ? '' : ' empty')) as HTMLButtonElement;
      if (id) { b.innerHTML = svg(ICON[id]); b.dataset.k = 'wt_cast_' + id; b.title = D.ABILITY[id].name; b.onclick = () => { if (this.sc.cast(id, true)) sfx('uiConfirm'); }; }
      this.skillbar.appendChild(b);
      this.bar_.push({ id, b });
    }
    const label = el('span', 'sp');
    if (!lo.length) { label.textContent = w.level < D.ABILITIES[0].level ? `Abilities open at Watch level ${D.ABILITIES[0].level}` : 'Learn abilities in Skills'; }
    this.skillbar.append(label, this.auto);
  }

  /** A moment's glow on an ability's button when he uses it by himself. */
  flashSkill(id: D.AbilityId) {
    const s = this.bar_.find((o) => o.id === id);
    if (!s) return;
    s.b.classList.add('flash');
    setTimeout(() => s.b.classList.remove('flash'), 260);
  }

  show(tab: Tab) {
    this.tab = tab;
    this.panel.dataset.tab = tab;
    for (const [k, b] of Object.entries(this.tabs)) b.classList.toggle('on', k === tab);
    this.body.textContent = '';
    this.cards.clear();
    this.abCards.clear();
    this.qBars = [];
    if (tab === 'up') this.buildUpgrades();
    else if (tab === 'skills') this.buildSkills();
    else if (tab === 'shadows') this.buildShadows();
    else if (tab === 'daily') this.buildDaily();
    else if (tab === 'feats') { this.newFeats = 0; this.buildFeats(); }
    else if (tab === 'hero') this.buildHero();
    else this.buildAscend();
    this.refresh();
  }

  private buildUpgrades() {
    const amt = el('div', 'wt-amt');
    for (const [label, v] of [['×1', 1], ['×10', 10], ['Max', 0]] as const) {
      const b = el('button', this.amount === v ? 'on' : '', label);
      b.dataset.k = 'wt_amt_' + label;
      b.onclick = () => { this.amount = v; for (const c of Array.from(amt.children)) c.classList.toggle('on', c === b); this.refresh(); };
      amt.appendChild(b);
    }
    const grid = el('div', 'wt-grid');
    for (const t of D.TRACKS) {
      const root = el('button', 'wt-card'), n = el('div', 'n'), c = el('div', 'c');
      // The stat itself, now and after this purchase, over what each level adds.
      const name = el('b', '', t.name), lvl = el('small'), val = el('span'), now = document.createTextNode(''), next = el('i'), per = el('em'), cst = el('small'), num = el('div');
      val.append(now, next);
      val.dataset.k = 'wt_val_' + t.id;
      root.dataset.k = 'wt_up_' + t.id;
      const hd = el('div', 'hd'), ic = el('span', 'ic'), title = el('div'), look = TRACK_LOOK[t.id];
      ic.innerHTML = svg(look.d); root.style.setProperty('--tc', look.c);
      title.append(name, lvl); hd.append(ic, title);
      n.append(hd, val, per); c.append(num, cst);
      root.append(n, c);
      const buy = () => {
        if (!this.sc.buy(t.id, this.amount)) return false;
        sfx('pickup', { vol: 0.6 });
        root.classList.add('bought'); setTimeout(() => root.classList.remove('bought'), 220);
        this.refresh();
        return true;
      };
      // A tap buys once; held, it keeps buying (after a short pause) until the coins or the finger run out.
      let hold = 0, held = false;
      const stop = () => { clearTimeout(hold); clearInterval(hold); hold = 0; };
      root.onpointerdown = () => { held = false; stop(); hold = window.setTimeout(() => { held = true; hold = window.setInterval(() => { if (!buy()) stop(); }, 110); }, 380); };
      root.onpointerup = root.onpointerleave = root.onpointercancel = stop;
      root.onclick = () => { if (!held) buy(); held = false; };
      grid.appendChild(root);
      this.cards.set(t.id, { root, lvl, now, next, per, cost: cst, n: num });
    }
    this.body.append(amt, grid);
  }

  private buildHero() {
    const w = this.sc.w, s = D.watchStats(w), title = titleOf(w);
    this.body.appendChild(el('div', 'wt-h', `Elior${title ? (title.startsWith('the ') ? ` ${title}` : `, ${title}`) : ''} · Watch level ${w.level}`));
    const xp = el('div', 'wt-bar'), f = el('b'); f.style.width = `${Math.min(100, (w.xp / D.watchXpNext(w.level)) * 100)}%`; xp.appendChild(f);
    this.body.appendChild(xp);
    const st = el('div', 'wt-stats');
    st.style.marginTop = '8px';
    const row = (k: string, v: string) => { const d = el('div'); d.append(document.createTextNode(k + ' '), el('b', '', v)); st.appendChild(d); };
    row('Damage', D.fmt(s.atk)); row('Health', D.fmt(s.maxHp)); row('Swings', `×${s.aspd.toFixed(2)}`); row('Critical', `${Math.round(s.crit * 100)}% · ×${s.critDmg.toFixed(2)}`);
    row('Regen', `${fmt1(s.maxHp * s.regen)}/s (${(s.regen * 100).toFixed(1)}%)`); row('Blows softened', `${Math.round(s.dr * 100)}%${this.sc.band.aegis() ? ` · guardians ${Math.round(this.sc.band.aegis() * 100)}%` : ''}`);
    row('Damage a second', D.fmt(D.dpsOf(s))); row('Coins a second', D.fmt(w.rate)); row('Coins', `×${s.coinMult.toFixed(2)}`); row('Shadows', `${(w.team ?? []).length} of ${D.shadowsAt(w.level)}`);
    this.body.appendChild(st);
    // The armoury: a blade for each of the first eight gates.
    this.body.appendChild(el('div', 'wt-h', 'The armoury'));
    const arm = el('div', 'wt-arm'), won = D.bladesWon(w), held = D.bladeOf(w);
    const card = (i: number, name: string, line: string) => {
      const b = el('button', 'wt-blade' + (held === i ? ' on' : '')) as HTMLButtonElement;
      b.dataset.k = i < 0 ? 'wt_blade_none' : `wt_blade_${i}`;
      const icon = el('i');
      if (i >= 0) { icon.style.backgroundImage = `url(${bladesUrl})`; icon.style.backgroundPosition = `${-i * 24}px 0`; }
      const text = el('span'); text.append(el('b', '', name), document.createTextNode(line));
      b.append(icon, text);
      b.disabled = i >= 0 && !won[i];
      b.addEventListener('click', () => { this.sc.wield(i); this.show('hero'); });
      arm.appendChild(b);
    };
    card(-1, 'His own sword', held === -1 ? 'In hand' : 'Wield');
    D.BLADES.forEach((bl, i) => card(i, won[i] ? bl.name : 'Locked', won[i] ? `Blows ×${bl.atk}${held === i ? ' · in hand' : ''}` : `Gate ${i + 1}'s boss`));
    this.body.appendChild(arm);
    this.body.appendChild(el('div', 'wt-h', 'What his levels open'));
    const ul = el('ul', 'wt-list');
    for (const [lv, text] of D.UNLOCKS) { const li = el('li', w.level >= lv ? 'got' : ''); li.append(el('b', '', `Lv ${lv}`), document.createTextNode(text)); ul.appendChild(li); }
    this.body.appendChild(ul);
  }

  /** The abilities: buy and level each with coins, and choose which he takes into the fight. */
  private buildSkills() {
    const w = this.sc.w;
    this.body.appendChild(el('div', 'wt-h', 'Abilities'));
    this.body.appendChild(tip(`He takes ${D.slotsAt(w.level)} into the fight (more at levels 25, 60 and 100) and uses them by himself while AUTO is on; tap one on the bar to use it now. Each level hits harder and comes round sooner. Abilities stay through an Ascension.`));
    for (const a of D.ABILITIES) {
      const root = el('div', 'wt-ab'), icon = el('div'), mid = el('div'), act = el('div', 'act');
      icon.innerHTML = svg(ICON[a.id]);
      const lv = el('small');
      mid.append(el('b', '', a.name), lv, el('p', '', a.desc));
      const buy = el('button') as HTMLButtonElement, eq = el('button', 'eq') as HTMLButtonElement;
      buy.dataset.k = 'wt_buy_' + a.id; eq.dataset.k = 'wt_eq_' + a.id;
      buy.onclick = () => { if (this.sc.buySkill(a.id)) { sfx('pickup', { vol: 0.6 }); this.buildBar(); this.refresh(); } };
      eq.onclick = () => { sfx('ui'); this.sc.toggleSkill(a.id); this.buildBar(); this.refresh(); };
      act.append(buy, eq);
      root.append(icon, mid, act);
      this.body.appendChild(root);
      this.abCards.set(a.id, { root, buy, eq, lv });
    }
  }

  /** The shadows: raise each with its essence, level it, choose its role, and set the team beside him. */
  private buildShadows() {
    const w = this.sc.w, slots = D.shadowsAt(w.level), team = w.team ?? [];
    this.body.appendChild(el('div', 'wt-h', `Shadows · ${team.length} of ${slots} beside him`));
    this.body.appendChild(tip(`The Echoes of the journey, earned here. Gold elite foes and the gates' holders leave essence of a shadow; enough raises it, and more takes it a level further (its second and third stage at levels 10 and 20). Choose each one's role, and who stands beside him: ${slots ? `${slots} slot${slots > 1 ? 's' : ''} now, ` : ''}more at Watch levels ${D.SHADOW_LEVELS.filter((l) => l > w.level).slice(0, 3).join(', ') || 'none left'}.`));
    for (const id of SHADOW_ORDER) {
      const raised = owned(w, id), lv = w.shadows?.[id]?.lv ?? 0, role = shadowRole(w, id), sp = ECHO_SPECIES[id];
      const root = el('div', 'wt-sh' + (team.includes(id) ? ' on' : '') + (raised ? '' : ' locked'));
      const a = SHADOW_ART[id], pic = el('div', 'pic');
      pic.style.backgroundImage = `url(${SHEET_URL[a.sheet]})`;
      // The ready pose, its feet on the box's floor and its body centred.
      pic.style.backgroundPosition = `${32 - a.ox}px ${60 - 88 - a.row * 96}px`;
      const mid = el('div');
      const name = el('b', '', raised ? shadowName(id, lv) : sp.stages[0].name);
      const chip = el('span', 'wt-role', ECHO_ROLES[role].name); chip.style.color = ECHO_ROLES[role].color;
      name.appendChild(chip);
      const have = w.essence?.[id] ?? 0, need = raised ? levelCost(lv) : UNLOCK_COST[id];
      const line = el('small', '', raised ? `Level ${lv}/${SHADOW_MAX} · ${sp.stages[tierOf(lv) - 1].title} · ${lv >= SHADOW_MAX ? `${have} essence` : `${have} of ${need} essence to level`}` : `${have} of ${need} essence to raise · ${sp.cls}`);
      const bar = el('div', 'ess'), fill = el('i'); fill.style.width = `${Math.min(100, (have / need) * 100)}%`; bar.appendChild(fill);
      const ability = el('p', '', `${ECHO_ROLES[role].signature[tierOf(Math.max(1, lv)) - 1]} ${sp.stages[tierOf(Math.max(1, lv)) - 1].ability}`);
      mid.append(name, line, bar, ability);
      const act = el('div', 'act');
      const up = el('button') as HTMLButtonElement;
      up.dataset.k = 'wt_raise_' + id;
      up.textContent = lv >= SHADOW_MAX ? 'MAX' : raised ? `Level up · ${need}` : `Raise · ${need}`;
      up.disabled = lv >= SHADOW_MAX || have < need;
      up.onclick = () => { if (this.sc.raiseShadow(id)) { sfx('lootRare', { vol: 0.5 }); this.show('shadows'); } };
      act.appendChild(up);
      if (raised) {
        const tm = el('button', 'tm' + (team.includes(id) ? ' on' : '')) as HTMLButtonElement;
        tm.dataset.k = 'wt_team_' + id;
        tm.textContent = team.includes(id) ? 'Beside him' : 'Set beside him';
        tm.onclick = () => { sfx('ui'); this.sc.toggleTeam(id); this.show('shadows'); };
        const sel = el('select') as HTMLSelectElement;
        sel.dataset.k = 'wt_role_' + id;
        for (const r of ROLE_ORDER) { const o = el('option', '', ECHO_ROLES[r].name) as HTMLOptionElement; o.value = r; o.selected = r === role; sel.appendChild(o); }
        sel.onchange = () => { sfx('ui'); this.sc.setShadowRole(id, sel.value as typeof role); this.show('shadows'); };
        act.append(tm, sel);
      }
      root.append(pic, mid, act);
      this.body.appendChild(root);
    }
  }

  /** The Daily tab (game/watch/daily.ts): the streak's calendar, three daily quests, two weekly goals, and the chests
   * with their odds and pity shown in full. Rebuilt when something is claimed or opened; the bars move in refresh(). */
  private qBars: { q: Q.Quest; weekly: boolean; fill: HTMLElement; label: HTMLElement; root: HTMLElement; btn: HTMLButtonElement }[] = [];
  private lastPrize: Q.ChestPrize | null = null;
  private buildDaily() {
    const sc = this.sc, w = sc.w, d = w.daily;
    this.qBars = [];
    if (!d) return;
    const RCOL: Record<Q.Rarity, string> = { common: '#cfc6b6', rare: '#7ab8ff', epic: '#c59bff', legendary: '#ffb347' };
    // The streak: a seven-day calendar that repeats, and today's chests.
    this.body.appendChild(el('div', 'wt-h', `Streak · day ${d.streak}`));
    this.body.appendChild(el('p', 'wt-p', `Come back each day to keep it. One missed day a week is forgiven${d.forgivenWeek === d.week ? ' (used this week)' : ''}; a second starts it again.`));
    const cal = el('div', 'wt-cal'), at = (d.streak - 1) % Q.CALENDAR.length;
    Q.CALENDAR.forEach((n, i) => { const c = el('div', i < at ? 'past' : i === at ? 'today' : ''); c.append(el('b', '', `${n}`), document.createTextNode(i === at ? 'today' : `day ${i + 1}`)); cal.appendChild(c); });
    this.body.appendChild(cal);
    const sb = el('button', 'wt-btn hot wt-big', d.streakClaimed ? "Today's chests taken" : `Take today's ${Q.calendarChests(d.streak)} chest${Q.calendarChests(d.streak) > 1 ? 's' : ''}`) as HTMLButtonElement;
    sb.dataset.k = 'wt_streak'; sb.disabled = d.streakClaimed;
    sb.onclick = () => { if (sc.claimDaily('streak')) this.show('daily'); };
    this.body.appendChild(sb);
    // Quests: today's three, and the week's two.
    const quest = (q: Q.Quest, weekly: boolean) => {
      const r = el('div', 'wt-q'), fill = el('b'), bar = el('div', 'wt-bar'), label = el('small');
      bar.appendChild(fill);
      const btn = el('button', 'wt-btn', `+${weekly ? Q.PAY.weekly : Q.PAY.quest} chest${(weekly ? Q.PAY.weekly : Q.PAY.quest) > 1 ? 's' : ''}`) as HTMLButtonElement;
      btn.dataset.k = 'wt_q_' + q.tally + (weekly ? '_w' : '');
      btn.onclick = () => { if (sc.claimDaily({ id: q.id })) this.show('daily'); };
      r.append(el('b', '', q.text), btn, bar, label);
      this.qBars.push({ q, weekly, fill, label, root: r, btn });
      return r;
    };
    this.body.appendChild(el('div', 'wt-h', "Today's quests"));
    for (const q of d.quests) this.body.appendChild(quest(q, false));
    const all = el('button', 'wt-btn wt-big', d.allClaimed ? 'All three: chest taken' : `All three done: +${Q.PAY.all} chest`) as HTMLButtonElement;
    all.dataset.k = 'wt_q_all'; all.disabled = d.allClaimed || !d.quests.every((q) => q.claimed);
    all.onclick = () => { if (sc.claimDaily('all')) this.show('daily'); };
    this.body.appendChild(all);
    this.body.appendChild(el('div', 'wt-h', "This week's goals"));
    for (const q of d.weekly) this.body.appendChild(quest(q, true));
    // Chests: Watch rewards only; the odds and the pity in full.
    this.body.appendChild(el('div', 'wt-h', `Chests · ${d.chests}`));
    const odds = el('div', 'wt-odds');
    for (const [r, p] of Q.ODDS) { const o = el('div'); const b = el('b', '', `${(p * 100).toFixed(0)}%`); b.style.color = RCOL[r]; o.append(b, document.createTextNode(r)); odds.appendChild(o); }
    this.body.appendChild(odds);
    this.body.appendChild(el('p', 'wt-p', `A rare or better within ${Q.PITY_RARE} opens (${Math.max(1, Q.PITY_RARE - d.sinceRare)} to go), an epic or better within ${Q.PITY_EPIC} (${Math.max(1, Q.PITY_EPIC - d.sinceEpic)} to go). Chests pay coins, shadows' essence and, rarely, a Seal: Watch rewards only.`));
    if (this.lastPrize) {
      const p = this.lastPrize, box = el('div', 'wt-prize');
      box.style.color = RCOL[p.rarity];
      box.textContent = `${p.rarity[0].toUpperCase() + p.rarity.slice(1)} · +${D.fmt(p.coins)} coins${p.essence ? ` · ${shadowName(p.essence[0], 1)} essence ×${p.essence[1]}` : ''}${p.seals ? ` · +${p.seals} Seal` : ''}`;
      this.body.appendChild(box);
    }
    const ob = el('button', 'wt-btn hot wt-big', d.chests ? 'Open a chest' : 'No chests yet') as HTMLButtonElement;
    ob.dataset.k = 'wt_open'; ob.disabled = d.chests <= 0;
    ob.onclick = () => { this.lastPrize = sc.openChest(); this.show('daily'); };
    this.body.appendChild(ob);
  }

  /** Feats earned since the Feats tab was last opened (its dot). */
  private newFeats = 0;
  /** The Feats tab (game/watch/feats.ts): what the feats add, the title he wears, and every feat by what it counts. */
  private buildFeats() {
    const w = this.sc.w, have = new Set(w.feats ?? []), b = featBonus(w), pct = (v: number) => `+${Math.round((v - 1) * 100)}%`;
    this.body.appendChild(el('div', 'wt-h', `Feats · ${have.size} of ${FEATS.length}`));
    const sum = el('div', 'wt-fsum');
    for (const [k, v, c] of [['blows', b.atk, '#ff8a5c'], ['health', b.hp, '#ff5f8a'], ['coins', b.coins, '#ffc94d']] as const) {
      const d = el('div'); d.style.setProperty('--fc', c); d.append(el('b', '', pct(v)), document.createTextNode(k)); sum.appendChild(d);
    }
    sum.dataset.k = 'wt_feat_sum';
    this.body.appendChild(sum);
    // The title he wears: any feat's, or none.
    const row = el('div', 'wt-ftitle'), sel = el('select') as HTMLSelectElement;
    sel.dataset.k = 'wt_title';
    const none = el('option', '', have.size ? 'No title' : 'Earn a feat for a title') as HTMLOptionElement; none.value = ''; sel.appendChild(none);
    for (const f of FEATS) if (have.has(f.id)) { const o = el('option', '', f.title) as HTMLOptionElement; o.value = f.id; o.selected = w.title === f.id; sel.appendChild(o); }
    sel.disabled = !have.size;
    sel.onchange = () => { sfx('ui'); if (sel.value) w.title = sel.value; else delete w.title; this.show('feats'); };
    row.append(el('span', '', 'Title'), sel);
    this.body.appendChild(row);
    this.body.appendChild(tip('Feats come from what the wall does anyway. Each is earned once, stays through every Ascension, and adds a little for good to his blows, his health or his coins; each also gives a title he may wear. They strengthen the Watch only.'));
    // By what each counts, nearest first within each.
    const groups = new Map<FeatMeasure, typeof FEATS>();
    for (const f of FEATS) groups.set(f.measure, [...(groups.get(f.measure) ?? []), f]);
    const KIND: Record<string, string> = { atk: 'blows', hp: 'health', coins: 'coins' };
    for (const [m, list] of groups) {
      const now = measure(w, m), box = el('div', 'wt-fg'), hd = el('div', 'hd');
      hd.append(el('b', '', MEASURE[m]), el('span', '', D.fmt(now)));
      box.appendChild(hd);
      for (const f of list) {
        const got = have.has(f.id), r = el('div', 'wt-ft' + (got ? ' got' : ''));
        r.dataset.k = 'wt_feat_' + f.id;
        const mid = el('div'); mid.append(el('b', '', f.name), el('small', '', `${f.goal.toLocaleString('en-US')} · title “${f.title}”`));
        const bar = el('div', 'wt-bar'), fill = el('b'); fill.style.width = `${Math.min(100, (now / f.goal) * 100)}%`; bar.appendChild(fill);
        if (!got) mid.appendChild(bar);
        r.append(el('i', '', got ? '✓' : ''), mid, el('em', '', `+${Math.round(f.bonus * 100)}% ${KIND[f.kind]}`));
        box.appendChild(r);
      }
      this.body.appendChild(box);
    }
  }

  private buildAscend() {
    const w = this.sc.w, seals = D.sealsFor(w.best);
    this.body.appendChild(el('div', 'wt-h', 'The Ascension'));
    this.body.appendChild(tip(`Leave the wall to a new watch and begin again from stage 1, stronger. Your stage, coins and upgrades reset; Elior's level, his shadows and his Seals stay. Each Seal adds 5% to every blow and every coin, and makes the whole 2% stronger again, so Seals grow on each other. The Ascension opens at stage ${D.ASCEND_AT}; the further past it you go, the more Seals it gives.`));
    const st = el('div', 'wt-stats');
    const row = (k: string, v: string) => { const d = el('div'); d.append(document.createTextNode(k + ' '), el('b', '', v)); st.appendChild(d); };
    row('Best this watch', `stage ${w.best}`); row('Seals now', String(w.seals)); row("Seals' strength", `×${D.sealBonus(w.seals).toFixed(2)} blows and coins`); row('Ascending gives', `${seals} Seals`); row('Ascensions', String(w.ascensions));
    this.body.appendChild(st);
    const b = el('button', 'wt-btn hot wt-big', seals > 0 ? `Ascend for ${seals} Seals` : `Reach stage ${D.ASCEND_AT} to Ascend`);
    b.dataset.k = 'wt_ascend';
    b.disabled = seals <= 0;
    let armed = false;
    b.onclick = () => {
      if (!armed) { armed = true; b.textContent = 'Tap again: begin a new watch'; return; }
      this.sc.ascend(); this.show('ascend');
    };
    this.body.appendChild(b);
  }

  /** Numbers and states, a few times a second. */
  refresh() {
    // The bar moved or changed height (a button came or went, the safe area settled): the wall stays just under it.
    if (this.hudB && Math.abs(this.hud.getBoundingClientRect().bottom - this.hudB) > 0.5) this.sc.refit();
    const sc = this.sc, w = sc.w;
    this.coins.innerHTML = '';
    this.coins.append(el('i'), document.createTextNode(D.fmt(w.coins)));
    const boss = D.isBoss(w.stage);
    this.stage.textContent = `Gate ${D.gateOf(w.stage)} · ${boss ? 'the boss' : `stage ${w.stage}${D.isRush(w.stage) ? ' · rush' : ''} · ${sc.kills}/${D.KILLS_PER_STAGE}`} · Lv ${w.level}`;
    this.bar.classList.toggle('boss', boss);
    this.barFill.style.width = `${Math.max(0, Math.min(1, boss ? sc.bossTimeLeft / D.BOSS_TIME : sc.kills / D.KILLS_PER_STAGE)) * 100}%`;
    this.challenge.hidden = w.auto;
    // A day may turn while the wall runs; the Daily tab's dot says something waits there.
    sc.checkDay();
    // Feats earned since the last look: a toast, and a dot on the Feats tab until it is opened.
    const got = checkFeats(w);
    if (got.length) {
      this.newFeats += got.length; sfx('lootRare', { vol: 0.5 });
      this.toast(got.length > 1 ? `${got.length} feats earned · see Feats` : `Feat · ${got[0].name} · +${Math.round(got[0].bonus * 100)}% ${got[0].kind === 'atk' ? 'blows' : got[0].kind === 'hp' ? 'health' : 'coins'}`, 3);
      if (this.tab === 'feats') { this.newFeats = 0; this.show('feats'); return; }
    }
    this.tabs.feats.classList.toggle('dot', this.newFeats > 0);
    this.tabs.daily.classList.toggle('dot', Q.claimable(w) > 0);
    for (const b of this.qBars) {
      const have = Q.progress(w, b.q, b.weekly), ok = have >= b.q.goal;
      b.fill.style.width = `${(have / b.q.goal) * 100}%`;
      b.label.textContent = b.q.claimed ? 'Taken' : `${D.fmt(have)} / ${D.fmt(b.q.goal)}`;
      b.root.classList.toggle('done', ok && !b.q.claimed); b.root.classList.toggle('claimed', !!b.q.claimed);
      b.btn.disabled = !ok || !!b.q.claimed;
    }
    const st = D.watchStats(w);
    this.sl.atk.textContent = D.fmt(st.atk);
    this.sl.hp.textContent = `${D.fmt(Math.max(0, sc.heroHp))}/${D.fmt(st.maxHp)}`;
    this.sl.hp.classList.toggle('low', sc.heroHp < st.maxHp * 0.35);
    this.sl.spd.textContent = `${st.aspd.toFixed(2)}/s`;
    this.sl.dps.textContent = D.fmt(D.dpsOf(st));
    this.sl.coins.textContent = `${D.fmt(w.rate)}/s`;
    this.speed.textContent = `×${w.speed ?? 1}`;
    this.auto.classList.toggle('on', !!w.autoSkills);
    if (this.barSig !== `${D.slotsAt(w.level)}:${(w.loadout ?? []).join()}`) this.buildBar();
    for (const { id, b } of this.bar_) {
      if (!id) continue;
      const cd = D.abilityCd(id, D.skillLvl(w, id)), left = sc.abilT[id] ?? 0;
      b.style.setProperty('--p', String(Math.min(1, left / cd)));
      b.classList.toggle('ready', left <= 0);
    }
    for (const a of D.ABILITIES) {
      const c = this.abCards.get(a.id);
      if (!c) continue;
      const lv = D.skillLvl(w, a.id), open = w.level >= a.level, on = (w.loadout ?? []).includes(a.id), cost = D.abilityCost(a.id, lv);
      const effect = a.id === 'balm' ? `heals ${Math.round(D.abilityMult(a.id, Math.max(1, lv)) * 100)}%` : `×${D.abilityMult(a.id, Math.max(1, lv)).toFixed(1)} blows`;
      c.lv.textContent = !open ? `Opens at Watch level ${a.level}` : lv ? `Level ${lv}/${D.ABILITY_MAX} · ${effect} · every ${D.abilityCd(a.id, lv).toFixed(1)} s` : `${effect} · every ${a.cd} s`;
      c.root.classList.toggle('locked', !open);
      c.root.classList.toggle('on', on);
      c.buy.textContent = lv >= D.ABILITY_MAX ? 'MAX' : `${lv ? 'Level up' : 'Learn'} · ${D.fmt(cost)}`;
      c.buy.disabled = !open || lv >= D.ABILITY_MAX || cost > w.coins;
      c.eq.textContent = on ? 'In the fight' : 'Take in';
      c.eq.classList.toggle('on', on);
      c.eq.disabled = lv <= 0;
    }
    this.transform.hidden = !(w.level >= D.MANTLE.level && w.gauge >= 100 && sc.mantleT <= 0);
    for (const t of D.TRACKS) {
      const c = this.cards.get(t.id);
      if (!c) continue;
      const lv = D.lvlOf(w, t.id), open = D.isOpen(w, t), maxed = t.max !== undefined && lv >= t.max;
      const n = this.amount === 0 ? Math.max(1, D.affordable(t.id, lv, w.coins)) : this.amount;
      const take = t.max !== undefined ? Math.min(n, Math.max(0, t.max - lv)) : n;
      const price = D.costN(t.id, lv, Math.max(1, take));
      const doubles = t.id === 'attack' || t.id === 'health' ? ` · ×2\u00a0at\u00a0Lv\u00a0${D.nextMilestone(lv)}` : '';
      c.lvl.textContent = open ? `Lv ${lv}${maxed ? ' · max' : ''}` : 'Locked';
      c.now.textContent = open ? D.trackStat(w, t.id) : '';
      c.next.textContent = open && !maxed ? ` → ${D.trackStat(w, t.id, take)}` : '';
      c.per.textContent = open ? (maxed ? t.per.replace(/, to .*$/, ' · at its height') : t.per + doubles) : D.opensText(t);
      c.n.textContent = maxed ? 'MAX' : `+${take}`;
      c.cost.textContent = maxed || !open ? '' : D.fmt(price);
      c.root.classList.toggle('locked', !open);
      c.root.classList.toggle('maxed', maxed);
      c.root.classList.toggle('poor', open && !maxed && price > w.coins);
    }
  }

  /** An ability's name over the wall as it is used, in its colour. */
  callout(text: string, glow: string) {
    const c = this.callEl;
    c.textContent = text;
    c.style.setProperty('--g', glow);
    c.classList.remove('on');
    void c.offsetWidth; // restart the animation
    c.classList.add('on');
  }

  toast(text: string, sec = 2.6) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('on');
    this.toastT = sec;
  }

  tick(dt: number) {
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.toastEl.classList.remove('on'); }
  }

  /** The welcome-back card: what the wall did while the player was away (already his: game/watch/offline.ts). */
  welcome(r: AwayReport, away: number) {
    const layer = el('div', 'wt-card-layer'), card = el('div', 'wt-welcome');
    const h = Math.floor(r.secs / 3600), m = Math.floor((r.secs % 3600) / 60);
    const capped = away > awayCap(this.sc.w) + 60 ? ` (the Watch counts ${awayCap(this.sc.w) / 3600} hours at most)` : '';
    card.append(el('div', 'wt-h', 'Welcome back to the Watch'), el('p', 'wt-p', `For ${h ? `${h} h ` : ''}${m} min Elior held the wall without you, at half his pace${capped}.`), el('b', '', `+${D.fmt(r.coins)} coins`));
    const dl = el('dl', 'wt-away');
    const row = (k: string, v: string, up = false) => { dl.append(el('dt', '', k), el('dd', up ? 'up' : '', v)); };
    row('Stages', r.to !== r.from ? `${r.from} → ${r.to}` : `held at ${r.to}`, r.to > r.from);
    if (r.levels) row('Watch level', `+${r.levels} (now ${r.level})`, true);
    row('Foes felled', D.fmt(r.kills));
    if (r.gates.length) row(r.gates.length > 1 ? 'Gates won' : 'Gate won', r.gates.join(', '), true);
    const ess = (Object.entries(r.essence) as [ShadowId, number][]).filter(([, n]) => n > 0).map(([id, n]) => `${shadowName(id, 1)} ×${n}`);
    if (ess.length) row('Essence', ess.join(' · '), true);
    card.appendChild(dl);
    if (r.held !== null && !r.auto) card.appendChild(el('p', 'wt-held', D.isBoss(r.held)
      ? `Gate ${D.gateOf(r.held)}'s holder stopped him at stage ${r.held}. Grow stronger, then Challenge it.`
      : `Stage ${r.held}'s foes stopped him. He holds the stage before it, growing, and tries again as he levels.`));
    const ok = el('button', 'wt-btn hot wt-big', 'Collect');
    ok.dataset.k = 'wt_collect';
    ok.onclick = () => { sfx('lootRare'); popLayer(layer); this.overlayEl = null; this.refresh(); };
    card.appendChild(ok);
    layer.appendChild(card);
    document.body.appendChild(layer);
    this.overlayEl = layer;
    // Over the panel: a controller is on Collect, and ○ collects too.
    pushLayer({ el: layer, nav: 'button', onBack: () => ok.click() });
  }

  destroy() { if (this.overlayEl) popLayer(this.overlayEl); popLayer(this.root); this.skillbar.remove(); }
}
