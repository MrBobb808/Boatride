// Cloud saves for the claude.ai preview. When the game runs inside a
// claude.ai artifact viewer, each signed-in player gets a private copy of
// every save slot in the artifact's database (data/users/<id>/...), so a
// game survives the viewer clearing its browser storage and follows the
// player between devices. Anywhere else (GitHub Pages, the installed app)
// `window.claude` is absent and this module stays dormant.

interface DocSnap { exists: boolean; data(): Record<string, unknown> | undefined }
interface DocRef { get(): Promise<DocSnap>; set(d: Record<string, unknown>): Promise<void>; delete(): Promise<void> }
interface CloudDb { doc(path: string): DocRef }
interface CloudUser { id(): Promise<string | null> }
interface ClaudeHost { use(name: string): Promise<unknown> }

let db: CloudDb | null = null;
let uid: string | null = null;
let ready: Promise<boolean> | null = null;
const pending = new Map<number, { json: string; updated: number }>();
const writing = new Set<number>();
let timer: number | null = null;

const slotPath = (slot: number) => `data/users/${uid}/slot${slot}`;

/** Connect once. Resolves true when cloud saves are available here. */
export function initCloud(): Promise<boolean> {
  if (ready) return ready;
  ready = (async () => {
    const host = (window as unknown as { claude?: ClaudeHost }).claude;
    if (!host?.use) return false;
    try {
      const [d, u] = await Promise.all([host.use('db'), host.use('user')]);
      if (!d || !u) return false;
      const id = await (u as CloudUser).id();
      if (!id) return false;
      db = d as CloudDb;
      uid = id;
      return true;
    } catch {
      return false;
    }
  })();
  return ready;
}

export const cloudActive = () => !!db && !!uid;

/** Read every slot's cloud copy: `{ json, updated }` or null. */
export async function pullSlots(count: number): Promise<({ json: string; updated: number } | null)[]> {
  if (!(await initCloud()) || !db) return [];
  const out: ({ json: string; updated: number } | null)[] = [];
  for (let i = 0; i < count; i++) {
    try {
      const snap = await db.doc(slotPath(i)).get();
      const d = snap.exists ? snap.data() : undefined;
      out.push(d && typeof d.json === 'string' ? { json: d.json, updated: Number(d.updated) || 0 } : null);
    } catch {
      out.push(null);
    }
  }
  return out;
}

/** Queue a slot for upload. Writes are coalesced and never overlap per slot. */
export function pushSlot(slot: number, json: string, updated: number) {
  if (!cloudActive()) {
    // Not connected yet: connect, then upload if this turns out to be a viewer.
    void initCloud().then((ok) => ok && pushSlot(slot, json, updated));
    return;
  }
  pending.set(slot, { json, updated });
  if (timer === null) timer = window.setTimeout(flush, 1500);
}

/** Upload whatever is queued now (also used when the page is being hidden). */
export function flush() {
  timer = null;
  if (!db) return;
  for (const [slot, v] of [...pending]) {
    if (writing.has(slot)) continue;
    pending.delete(slot);
    writing.add(slot);
    db.doc(slotPath(slot)).set({ json: v.json, updated: v.updated })
      .catch(() => {
        // Keep the newest copy queued and try again shortly.
        if (!pending.has(slot)) pending.set(slot, v);
      })
      .finally(() => {
        writing.delete(slot);
        if (pending.size && timer === null) timer = window.setTimeout(flush, 3000);
      });
  }
}

export function removeSlot(slot: number) {
  pending.delete(slot);
  if (db) db.doc(slotPath(slot)).delete().catch(() => {});
}
