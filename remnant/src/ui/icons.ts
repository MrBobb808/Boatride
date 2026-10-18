// Procedural icons: drawn once into small canvases, reused in the HUD and as
// data URLs in DOM menus. No image files needed.

import { makeCanvas, type Ctx } from '../render/draw';

type Draw = (ctx: Ctx, c: string) => void;

const S = 32;

const line = (ctx: Ctx, pts: number[], w = 2) => {
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.stroke();
};
const fillPoly = (ctx: Ctx, pts: number[]) => {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  ctx.fill();
};

const ICONS: Record<string, Draw> = {
  voice: (x) => {
    x.lineWidth = 2;
    x.beginPath(); x.roundRect(12, 4, 8, 15, 4); x.stroke();
    x.beginPath(); x.arc(16, 15, 9, 0, Math.PI); x.stroke();
    line(x, [16, 24, 16, 29, 10, 29, 22, 29], 2);
  },
  sword: (x) => {
    line(x, [7, 25, 24, 8], 3);
    line(x, [10, 18, 14, 22], 2.4);
    line(x, [5, 27, 9, 23], 3);
  },
  attack: (x) => {
    line(x, [6, 26, 24, 8], 3);
    line(x, [9, 19, 13, 23], 2.4);
    line(x, [12, 6, 26, 20], 1.6);
  },
  spear: (x) => {
    line(x, [5, 27, 22, 10], 2);
    fillPoly(x, [22, 10, 27, 5, 25, 11, 20, 13]);
  },
  greatsword: (x) => {
    line(x, [6, 26, 25, 7], 4.5);
    line(x, [9, 17, 15, 23], 2.6);
  },
  arc: (x) => {
    x.lineWidth = 3;
    x.beginPath();
    x.arc(12, 16, 11, -1.1, 1.1);
    x.stroke();
    x.lineWidth = 1.5;
    x.beginPath();
    x.arc(8, 16, 13, -0.8, 0.8);
    x.stroke();
    line(x, [22, 16, 29, 16], 2);
  },
  horn: (x) => {
    x.lineWidth = 3.4;
    x.lineCap = 'round';
    x.beginPath();
    x.moveTo(6, 24);
    x.quadraticCurveTo(10, 8, 26, 9);
    x.stroke();
    x.lineWidth = 1.4;
    for (const r of [5, 8]) {
      x.beginPath();
      x.arc(26, 9, r, -1.2, 0.6);
      x.stroke();
    }
  },
  shield: (x) => {
    x.lineWidth = 2.2;
    x.beginPath();
    x.moveTo(16, 4);
    x.lineTo(27, 8);
    x.quadraticCurveTo(26, 22, 16, 28);
    x.quadraticCurveTo(6, 22, 5, 8);
    x.closePath();
    x.stroke();
    line(x, [16, 9, 16, 23], 1.6);
    line(x, [10, 14, 22, 14], 1.6);
  },
  lion: (x) => {
    x.lineWidth = 2;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      line(x, [16 + Math.cos(a) * 7, 16 + Math.sin(a) * 7, 16 + Math.cos(a) * 12, 16 + Math.sin(a) * 12], 2);
    }
    x.beginPath();
    x.arc(16, 16, 6, 0, Math.PI * 2);
    x.fill();
  },
  water: (x) => {
    x.lineWidth = 2;
    for (let k = 0; k < 3; k++) {
      x.beginPath();
      for (let i = 0; i <= 24; i++) {
        const px = 4 + i, py = 11 + k * 6 + Math.sin(i * 0.6 + k) * 2;
        if (i === 0) x.moveTo(px, py);
        else x.lineTo(px, py);
      }
      x.stroke();
    }
  },
  pillar: (x) => {
    fillPoly(x, [12, 28, 13, 6, 16, 2, 19, 6, 20, 28]);
    x.globalAlpha = 0.5;
    fillPoly(x, [8, 28, 11, 14, 13, 28]);
    fillPoly(x, [19, 28, 21, 12, 24, 28]);
    x.globalAlpha = 1;
  },
  chains: (x) => {
    x.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      x.beginPath();
      x.ellipse(8 + i * 8, 16 + (i % 2 ? -2 : 2), 5, 3, 0.5, 0, Math.PI * 2);
      x.stroke();
    }
    line(x, [3, 27, 7, 23], 2);
    line(x, [25, 9, 29, 5], 2);
  },
  armor: (x) => {
    fillPoly(x, [8, 6, 14, 4, 16, 7, 18, 4, 24, 6, 26, 14, 22, 28, 10, 28, 6, 14]);
  },
  hood: (x) => {
    fillPoly(x, [6, 26, 7, 12, 16, 4, 25, 12, 26, 26, 21, 26, 20, 14, 12, 14, 11, 26]);
  },
  helm: (x) => {
    fillPoly(x, [6, 24, 6, 12, 10, 6, 22, 6, 26, 12, 26, 24, 20, 24, 20, 16, 12, 16, 12, 24]);
  },
  crown: (x) => {
    fillPoly(x, [5, 24, 5, 10, 11, 17, 16, 6, 21, 17, 27, 10, 27, 24]);
  },
  gauntlet: (x) => {
    fillPoly(x, [9, 28, 9, 14, 11, 8, 14, 8, 14, 14, 16, 6, 19, 6, 19, 14, 21, 8, 24, 9, 24, 20, 20, 28]);
  },
  boot: (x) => {
    fillPoly(x, [10, 4, 18, 4, 18, 20, 27, 22, 27, 27, 8, 27, 10, 20]);
  },
  ring: (x) => {
    x.lineWidth = 3;
    x.beginPath();
    x.arc(16, 18, 8, 0, Math.PI * 2);
    x.stroke();
    fillPoly(x, [12, 9, 16, 4, 20, 9, 16, 12]);
  },
  lamp: (x) => {
    fillPoly(x, [9, 16, 23, 16, 21, 26, 11, 26]);
    x.beginPath();
    x.ellipse(16, 10, 3, 5, 0, 0, Math.PI * 2);
    x.fill();
  },
  shard: (x) => fillPoly(x, [16, 3, 22, 14, 17, 29, 10, 17]),
  sigil: (x) => {
    x.lineWidth = 2;
    x.beginPath();
    x.arc(16, 16, 11, 0, Math.PI * 2);
    x.stroke();
    x.beginPath();
    x.arc(16, 16, 5, 0, Math.PI * 2);
    x.stroke();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      line(x, [16 + Math.cos(a) * 5, 16 + Math.sin(a) * 5, 16 + Math.cos(a) * 11, 16 + Math.sin(a) * 11], 1.4);
    }
  },
  scrap: (x) => {
    fillPoly(x, [5, 22, 11, 10, 19, 12, 15, 24]);
    fillPoly(x, [17, 26, 21, 15, 28, 18, 25, 28]);
  },
  veil: (x) => {
    fillPoly(x, [16, 3, 25, 16, 16, 29, 7, 16]);
  },
  fragment: (x) => {
    fillPoly(x, [16, 2, 20, 12, 30, 16, 20, 20, 16, 30, 12, 20, 2, 16, 12, 12]);
  },
  core: (x) => {
    x.beginPath();
    x.arc(16, 16, 9, 0, Math.PI * 2);
    x.fill();
    x.lineWidth = 1.5;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      line(x, [16 + Math.cos(a) * 11, 16 + Math.sin(a) * 11, 16 + Math.cos(a) * 14, 16 + Math.sin(a) * 14], 1.5);
    }
  },
  vial: (x) => {
    fillPoly(x, [13, 4, 19, 4, 19, 10, 25, 18, 23, 28, 9, 28, 7, 18, 13, 10]);
  },
  heal: (x) => {
    fillPoly(x, [13, 4, 19, 4, 19, 10, 25, 18, 23, 28, 9, 28, 7, 18, 13, 10]);
  },
  feather: (x) => {
    x.beginPath();
    x.ellipse(16, 15, 5, 12, 0.6, 0, Math.PI * 2);
    x.fill();
    line(x, [8, 28, 22, 6], 1.2);
  },
  book: (x) => {
    fillPoly(x, [6, 6, 15, 8, 15, 27, 6, 25]);
    fillPoly(x, [17, 8, 26, 6, 26, 25, 17, 27]);
  },
  jump: (x) => {
    fillPoly(x, [16, 4, 26, 16, 20, 16, 20, 27, 12, 27, 12, 16, 6, 16]);
  },
  dodge: (x) => {
    x.lineWidth = 2.6;
    x.beginPath();
    x.arc(14, 16, 9, -2.4, 1.6);
    x.stroke();
    fillPoly(x, [22, 23, 28, 16, 18, 15]);
    line(x, [2, 10, 7, 10], 1.6);
    line(x, [1, 15, 6, 15], 1.6);
  },
  parry: (x) => {
    x.lineWidth = 2.4;
    x.beginPath();
    x.moveTo(16, 4);
    x.lineTo(26, 8);
    x.quadraticCurveTo(25, 21, 16, 28);
    x.quadraticCurveTo(7, 21, 6, 8);
    x.closePath();
    x.stroke();
    line(x, [11, 16, 15, 20, 22, 11], 2.4);
  },
  interact: (x) => {
    x.lineWidth = 2.4;
    x.beginPath();
    x.arc(16, 16, 10, 0, Math.PI * 2);
    x.stroke();
    fillPoly(x, [16, 8, 22, 17, 18, 17, 18, 24, 14, 24, 14, 17, 10, 17]);
  },
  menu: (x) => {
    for (let i = 0; i < 3; i++) x.fillRect(7, 8 + i * 7, 18, 2.6);
  },
  map: (x) => {
    x.lineWidth = 2;
    line(x, [4, 8, 12, 5, 20, 8, 28, 5, 28, 25, 20, 28, 12, 25, 4, 28, 4, 8], 2);
    line(x, [12, 5, 12, 25], 1.4);
    line(x, [20, 8, 20, 28], 1.4);
  },
  echo: (x) => {
    fillPoly(x, [16, 3, 22, 9, 22, 18, 16, 28, 10, 18, 10, 9]);
    x.globalAlpha = 0.5;
    fillPoly(x, [6, 10, 9, 13, 9, 20, 5, 24, 3, 18]);
    fillPoly(x, [26, 10, 23, 13, 23, 20, 27, 24, 29, 18]);
    x.globalAlpha = 1;
  },
  dagger: (x) => {
    fillPoly(x, [27, 5, 13, 17, 15, 19]);
    line(x, [10, 16, 16, 22], 2.4);
    line(x, [6, 26, 13, 19], 3);
  },
  axe: (x) => {
    line(x, [8, 27, 21, 8], 2.4);
    fillPoly(x, [17, 5, 27, 9, 26, 17, 21, 12, 19, 10]);
  },
  flask: (x) => {
    fillPoly(x, [13, 4, 19, 4, 19, 11, 25, 19, 23, 28, 9, 28, 7, 19, 13, 11]);
    x.globalCompositeOperation = 'destination-out';
    x.fillRect(11, 17, 10, 2);
    x.globalCompositeOperation = 'source-over';
  },
  cross: (x) => {
    x.fillRect(13.5, 3, 5, 26);
    x.fillRect(6, 10, 20, 5);
  },
  sling: (x) => {
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(4, 6);
    x.quadraticCurveTo(14, 26, 22, 20);
    x.stroke();
    x.beginPath();
    x.arc(24, 18, 4.5, 0, Math.PI * 2);
    x.fill();
  },
  heart: (x) => {
    x.beginPath();
    x.moveTo(16, 28);
    x.bezierCurveTo(2, 18, 3, 6, 10, 6);
    x.quadraticCurveTo(14, 6, 16, 10);
    x.quadraticCurveTo(18, 6, 22, 6);
    x.bezierCurveTo(29, 6, 30, 18, 16, 28);
    x.fill();
  },
  chapters: (x) => {
    // A scroll, half unrolled.
    fillPoly(x, [7, 6, 22, 6, 22, 24, 7, 24]);
    x.lineWidth = 2.4;
    x.beginPath();
    x.arc(7, 15, 3, 0, Math.PI * 2);
    x.stroke();
    x.beginPath();
    x.arc(25, 7, 3, 0, Math.PI * 2);
    x.stroke();
    x.globalCompositeOperation = 'destination-out';
    x.fillRect(10, 10, 9, 1.6);
    x.fillRect(10, 14, 9, 1.6);
    x.fillRect(10, 18, 6, 1.6);
    x.globalCompositeOperation = 'source-over';
  },
  mantle: (x) => {
    // A hooded figure whose eyes burn in the dark of the cowl.
    fillPoly(x, [16, 3, 24, 9, 26, 18, 29, 29, 3, 29, 6, 18, 8, 9]);
    x.globalCompositeOperation = 'destination-out';
    fillPoly(x, [10.5, 13, 21.5, 13, 20.5, 21, 16, 23.5, 11.5, 21]);
    x.globalCompositeOperation = 'source-over';
    x.fillRect(12.4, 16.2, 2.8, 1.7);
    x.fillRect(16.8, 16.2, 2.8, 1.7);
  },
  rally: (x) => {
    x.lineWidth = 2;
    x.beginPath();
    x.arc(16, 16, 12, 0, Math.PI * 2);
    x.stroke();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
      fillPoly(x, [16, 16, 16 + Math.cos(a - 0.3) * 10, 16 + Math.sin(a - 0.3) * 10, 16 + Math.cos(a) * 12, 16 + Math.sin(a) * 12, 16 + Math.cos(a + 0.3) * 10, 16 + Math.sin(a + 0.3) * 10]);
    }
  },
  aggressive: (x) => {
    line(x, [6, 26, 18, 14], 3);
    line(x, [26, 26, 14, 14], 3);
    fillPoly(x, [16, 4, 20, 12, 12, 12]);
  },
  defensive: (x) => {
    x.beginPath();
    x.moveTo(16, 4);
    x.lineTo(26, 8);
    x.quadraticCurveTo(25, 21, 16, 28);
    x.quadraticCurveTo(7, 21, 6, 8);
    x.closePath();
    x.fill();
  },
  follow: (x) => {
    fillPoly(x, [4, 10, 14, 16, 4, 22]);
    fillPoly(x, [14, 10, 24, 16, 14, 22]);
    x.fillRect(25, 10, 3, 12);
  },
  target: (x) => {
    x.lineWidth = 2;
    x.beginPath();
    x.arc(16, 16, 9, 0, Math.PI * 2);
    x.stroke();
    line(x, [16, 2, 16, 10], 2);
    line(x, [16, 22, 16, 30], 2);
    line(x, [2, 16, 10, 16], 2);
    line(x, [22, 16, 30, 16], 2);
  },
  recall: (x) => {
    x.lineWidth = 2.6;
    x.beginPath();
    x.arc(16, 16, 10, 0.3, Math.PI * 1.7);
    x.stroke();
    fillPoly(x, [24, 4, 27, 13, 18, 11]);
  },
  sync: (x) => {
    line(x, [6, 26, 16, 6], 2.6);
    line(x, [26, 26, 16, 6], 2.6);
    line(x, [16, 28, 16, 10], 2.6);
  },
  switch: (x) => {
    // Two arrows trading places.
    x.lineWidth = 2.4;
    x.beginPath();
    x.arc(16, 16, 9, Math.PI * 1.05, Math.PI * 1.95);
    x.stroke();
    fillPoly(x, [26, 12, 24, 20, 19, 13]);
    x.beginPath();
    x.arc(16, 16, 9, Math.PI * 0.05, Math.PI * 0.95);
    x.stroke();
    fillPoly(x, [6, 20, 8, 12, 13, 19]);
  },
  toggle: (x) => {
    x.lineWidth = 2.4;
    x.beginPath();
    x.arc(16, 17, 10, -1.1, Math.PI + 1.1);
    x.stroke();
    line(x, [16, 4, 16, 16], 2.6);
  },
  stats: (x) => {
    x.fillRect(5, 18, 5, 9);
    x.fillRect(13, 11, 5, 16);
    x.fillRect(21, 5, 5, 22);
  },
  skills: (x) => {
    fillPoly(x, [16, 3, 19, 12, 29, 12, 21, 18, 24, 28, 16, 22, 8, 28, 11, 18, 3, 12, 13, 12]);
  },
  journal: (x) => {
    fillPoly(x, [7, 4, 23, 4, 25, 6, 25, 28, 7, 28]);
    x.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 4; i++) x.fillRect(10, 9 + i * 4.5, 12, 1.6);
    x.globalCompositeOperation = 'source-over';
  },
  craft: (x) => {
    fillPoly(x, [4, 14, 14, 8, 18, 12, 8, 18]);
    line(x, [12, 14, 24, 26], 3);
    fillPoly(x, [18, 26, 30, 26, 28, 30, 20, 30]);
  },
  gear: (x) => {
    x.beginPath();
    x.arc(16, 16, 7, 0, Math.PI * 2);
    x.fill();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      x.fillRect(16 + Math.cos(a) * 9 - 2, 16 + Math.sin(a) * 9 - 2, 4, 4);
    }
    x.globalCompositeOperation = 'destination-out';
    x.beginPath();
    x.arc(16, 16, 3, 0, Math.PI * 2);
    x.fill();
    x.globalCompositeOperation = 'source-over';
  },
  save: (x) => {
    fillPoly(x, [5, 5, 23, 5, 27, 9, 27, 27, 5, 27]);
    x.globalCompositeOperation = 'destination-out';
    x.fillRect(9, 5, 12, 7);
    x.fillRect(9, 17, 14, 8);
    x.globalCompositeOperation = 'source-over';
  },
  sentinel_echo: (x) => {
    fillPoly(x, [12, 6, 20, 6, 22, 12, 20, 16, 12, 16, 10, 12]);
    fillPoly(x, [9, 17, 23, 17, 22, 28, 10, 28]);
    fillPoly(x, [2, 14, 9, 14, 9, 26, 5, 29, 2, 26]);
  },
  archer_echo: (x) => {
    fillPoly(x, [12, 5, 18, 5, 20, 11, 16, 15, 11, 11]);
    fillPoly(x, [10, 16, 20, 16, 19, 28, 11, 28]);
    x.lineWidth = 2;
    x.beginPath();
    x.arc(18, 16, 11, -1.2, 1.2);
    x.stroke();
  },
};

const cache = new Map<string, HTMLCanvasElement>();
const urlCache = new Map<string, string>();

export function icon(name: string, color = '#f2d48a', size = 64): HTMLCanvasElement {
  const key = name + color + size;
  let c = cache.get(key);
  if (c) return c;
  const m = makeCanvas(size, size);
  const ctx = m.ctx;
  ctx.scale(size / S, size / S);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  (ICONS[name] ?? ICONS.shard)(ctx, color);
  c = m.c;
  cache.set(key, c);
  return c;
}

export function iconUrl(name: string, color = '#f2d48a'): string {
  const key = name + color;
  let u = urlCache.get(key);
  if (!u) {
    u = icon(name, color, 64).toDataURL('image/png');
    urlCache.set(key, u);
  }
  return u;
}

export function img(name: string, color?: string, cls = '') {
  const i = document.createElement('img');
  i.src = iconUrl(name, color);
  i.alt = '';
  if (cls) i.className = cls;
  i.draggable = false;
  return i;
}
