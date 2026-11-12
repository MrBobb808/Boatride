// The result card (NEXT_PLAN C5): a picture of a run drawn to a canvas and handed to the share sheet (an iPhone's
// Messages, Photos, Files), else saved as a download. It is the leaderboard a static site can have: players compare
// the same day's seed by sending the card. The date, the mode and its rules, the result, the hero's level and the
// three pieces the build turns on. No server, no account.
import { ITEMS, RARITY_COLORS } from '../../../remnant/src/game/data';
import { LEGENDS } from '../../../remnant/src/game/legendary';
import { shareHook, type ShareResult } from '../../../remnant/src/ui/share';
import { loadSave, type PhaserSave } from './save';
import { installedVersion } from './update';

const W = 1080, H = 1350;

/** The three pieces a build turns on: the weapon, then pieces with a Legendary Power, then the rarest. */
export function buildPieces(s: PhaserSave | null) {
  if (!s) return [] as { name: string; color: string; legend?: string }[];
  const worn = Object.values(s.equipment ?? {}).map((uid) => s.inventory.find((i) => i.uid === uid)).filter((i): i is NonNullable<typeof i> => !!i && !!ITEMS[i.id]);
  worn.sort((a, b) => Number(ITEMS[b.id].slot === 'weapon') - Number(ITEMS[a.id].slot === 'weapon') || Number(!!b.legend) - Number(!!a.legend) || b.rarity - a.rarity);
  return worn.slice(0, 3).map((i) => ({ name: `${ITEMS[i.id].name}${i.plus ? ` +${i.plus}` : ''}`, color: RARITY_COLORS[i.rarity] ?? '#ddd4c6', legend: i.legend && LEGENDS[i.legend] ? LEGENDS[i.legend].name : undefined }));
}

/** Draw the card. Plain 2D canvas, no images to load, so it is the same everywhere. */
export function drawCard(r: ShareResult, s: PhaserSave | null, when = new Date()) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d')!;
  const bg = x.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#1a1220'); bg.addColorStop(0.55, '#100c15'); bg.addColorStop(1, '#07060a');
  x.fillStyle = bg; x.fillRect(0, 0, W, H);
  const glow = x.createRadialGradient(W / 2, 470, 20, W / 2, 470, 520);
  glow.addColorStop(0, 'rgba(226,184,90,.28)'); glow.addColorStop(1, 'rgba(226,184,90,0)');
  x.fillStyle = glow; x.fillRect(0, 0, W, H);
  x.strokeStyle = 'rgba(226,184,90,.55)'; x.lineWidth = 4; x.strokeRect(36, 36, W - 72, H - 72);
  x.textAlign = 'center'; x.textBaseline = 'alphabetic';
  const text = (t: string, y: number, size: number, color: string, font = 'Georgia, serif', spacing = 0) => {
    x.font = `${size}px ${font}`; x.fillStyle = color;
    if (spacing) (x as unknown as { letterSpacing: string }).letterSpacing = `${spacing}px`;
    x.fillText(t, W / 2, y, W - 140);
    if (spacing) (x as unknown as { letterSpacing: string }).letterSpacing = '0px';
  };
  text('REMNANT', 150, 92, '#f6dea0', 'Cinzel, Georgia, serif', 22);
  text('ASCENSION', 210, 40, '#e2b85a', 'Cinzel, Georgia, serif', 14);
  text(r.mode, 300, 46, '#ddd4c6');
  text(when.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }), 350, 32, '#9b92a6');
  text(r.big, 560, 220, '#fff1c4', 'Cinzel, Georgia, serif');
  text(r.unit, 630, 40, '#e2b85a', 'Cinzel, Georgia, serif', 10);
  let y = 730;
  if (r.rules) { text(r.rules, y, 30, '#ffb070'); y += 60; }
  const facts = [...r.lines, ...(s ? [['Hero', `Level ${s.level}`] as [string, string]] : [])];
  x.font = '36px Georgia, serif';
  const col = (W - 140) / Math.max(1, facts.length);
  facts.forEach(([k, v], i) => {
    const cx = 70 + col * (i + 0.5);
    x.textAlign = 'center';
    x.fillStyle = '#fff6dc'; x.font = '46px Georgia, serif'; x.fillText(v, cx, y + 20, col - 10);
    x.fillStyle = '#9b92a6'; x.font = '28px Georgia, serif'; x.fillText(k.toUpperCase(), cx, y + 62, col - 10);
  });
  y += 150;
  const pieces = buildPieces(s);
  if (pieces.length) {
    text('THE BUILD', y, 30, '#e2b85a', 'Cinzel, Georgia, serif', 8); y += 56;
    for (const p of pieces) { text(p.name, y, 40, p.color); y += p.legend ? 40 : 58; if (p.legend) { text(`✦ ${p.legend}`, y, 30, '#ffb347'); y += 58; } }
  }
  text('mrbobb808.github.io/Boatride', H - 100, 28, '#6f6878');
  text(`v${installedVersion()}`, H - 66, 20, '#4f4858');
  return c;
}

/** Hand the card on: the share sheet with the picture where it takes files, else a download. Says what happened. */
export async function shareCard(r: ShareResult): Promise<string> {
  const c = drawCard(r, loadSave() as PhaserSave | null);
  const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/png'));
  if (!blob) return 'Could not make the card';
  const name = `remnant-${r.mode.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.png`;
  try {
    const file = new File([blob], name, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Remnant: Ascension' }); return 'Shared'; }
      catch (e) { if ((e as Error)?.name === 'AbortError') return 'Share this run'; }
    }
  } catch { /* no File or share here */ }
  const a = document.createElement('a'), url = URL.createObjectURL(blob);
  a.href = url; a.download = name; a.style.display = 'none';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'Saved the card';
}

/** The host build can share: set the hook once at start. */
export function installShare() { shareHook.share = shareCard; }
