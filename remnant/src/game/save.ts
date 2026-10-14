// Save slots in localStorage, plus a portable save code for moving a game
// between Safari and the installed home-screen app (iOS keeps their storage
// separate).

import { store } from '../core/settings';
import type { SaveData } from './state';

export const SLOT_COUNT = 3;
const key = (slot: number) => `remnant-save-${slot}`;
const LAST = 'remnant-last-slot';

export interface SlotInfo {
  slot: number;
  data: SaveData | null;
}

export function saveSlot(slot: number, data: SaveData): boolean {
  data.updated = Date.now();
  const ok = store.set(key(slot), JSON.stringify(data));
  if (ok) store.set(LAST, String(slot));
  return ok;
}

export function loadSlot(slot: number): SaveData | null {
  const raw = store.get(key(slot));
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as SaveData;
    if (!d || d.version !== 1) return null;
    return migrate(d);
  } catch {
    return null;
  }
}

export function deleteSlot(slot: number) {
  store.remove(key(slot));
}

export function listSlots(): SlotInfo[] {
  const out: SlotInfo[] = [];
  for (let i = 0; i < SLOT_COUNT; i++) out.push({ slot: i, data: loadSlot(i) });
  return out;
}

export function lastSlot(): number | null {
  const v = store.get(LAST);
  if (v === null) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && loadSlot(n) ? n : null;
}

/** Fill in fields that older saves might lack. */
function migrate(d: SaveData): SaveData {
  d.keyItems ??= [];
  d.altarsLit ??= ['sanctuary'];
  d.secrets ??= [];
  d.formations ??= [];
  d.echoMode ??= 'follow';
  d.affinity ??= { mara: 0, azriel: 0, tobiah: 0 };
  d.choices ??= {};
  d.equippedSkills ??= [null, null, null];
  return d;
}

export function exportCode(d: SaveData): string {
  const json = JSON.stringify(d);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return 'RA1.' + btoa(bin);
}

export function importCode(code: string): SaveData | null {
  try {
    const c = code.trim();
    if (!c.startsWith('RA1.')) return null;
    const bin = atob(c.slice(4));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const d = JSON.parse(new TextDecoder().decode(bytes)) as SaveData;
    if (!d || d.version !== 1 || typeof d.level !== 'number') return null;
    return migrate(d);
  } catch {
    return null;
  }
}

/** Ask the browser not to evict our saves (honoured for installed web apps). */
export function requestPersistence() {
  try {
    navigator.storage?.persist?.().catch(() => {});
  } catch {
    /* unsupported */
  }
}
