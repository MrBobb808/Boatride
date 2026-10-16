// Settings → Controller: what is connected, and moving any action to any
// button. PlayStation pads (DualSense, DualShock) are named with ✕ ○ □ △ and
// L1/R1; Xbox and other pads with A B X Y and LB/RB.

import { input, ACTION_LABELS, PAD_REMAPPABLE, type Action } from '../core/input';
import { settings, saveSettings } from '../core/settings';
import { h, btn } from './dom';

let waiting: Action | null = null;

/** Stop waiting for a button (the menu closed or the player changed their mind). */
export function cancelPadCapture() {
  waiting = null;
  input.capturePadButton(null);
}

function prettyName(id: string) {
  // Chrome appends "(STANDARD GAMEPAD Vendor: … Product: …)".
  return id.replace(/\s*\(.*\)\s*$/, '').trim() || 'Controller';
}

/** Give `a` the button `i`. An action that had `i` takes `a`'s old button, so the two swap and nothing is left unbound. */
function assign(a: Action, i: number) {
  const st = settings;
  const old = (input.padMap[a] ?? []).filter((x) => x !== i);
  for (const other of PAD_REMAPPABLE) {
    if (other === a) continue;
    const cur = input.padMap[other] ?? [];
    if (cur.includes(i)) st.pad[other] = [...cur.filter((x) => x !== i), ...old];
  }
  st.pad[a] = [i];
  saveSettings();
}

export function controllerBox(rerender: () => void): HTMLElement {
  const st = settings;
  const kind = input.padKind === 'playstation' ? 'PlayStation controller' : input.padKind === 'xbox' ? 'Xbox controller' : 'Controller';
  const connected = input.gamepadConnected && !!input.padName;
  const rows = PAD_REMAPPABLE.map((a) => h('div', { class: 'set-row' },
    h('label', null, ACTION_LABELS[a] ?? a),
    h('div', { class: 'bind' }, h('button', {
      class: 'key' + (waiting === a ? ' listen' : ''), 'data-nav': '', 'data-k': 'pad_' + a,
      onclick: () => {
        if (waiting === a) {
          cancelPadCapture();
          rerender();
          return;
        }
        waiting = a;
        rerender();
        input.capturePadButton((i) => {
          waiting = null;
          assign(a, i);
          rerender();
        });
      },
    }, waiting === a ? 'Press a button…' : input.padLabel(a))),
  ));
  return h('div', { class: 'box' },
    h('h3', null, 'Controller'),
    h('p', { class: 'muted', style: 'margin:0 0 6px;font-size:0.85em' },
      connected ? `${kind} connected: ${prettyName(input.padName)}.` : 'No controller yet. Pair it in the iPhone\'s Settings → Bluetooth (on a PS5 DualSense, hold PS and Create until the light flashes), then press any button.',
    ),
    h('p', { class: 'muted', style: 'margin:0 0 6px;font-size:0.85em' },
      'Select an action, then press the controller button you want for it. Menus always use ✕ / A to confirm and ○ / B to go back. The Shadow Mantle is L3 + R3 together unless you give it a button of its own. Leave the PS / Home button alone; the iPhone uses it.'),
    rows,
    h('div', { class: 'set-row' },
      h('label', null, 'Rumble', h('small', null, 'Controller vibration on hits, parries, finishers and the Mantle, where the browser supports it.')),
      h('div', { class: 'seg' },
        btn('On', () => { st.rumble = true; saveSettings(); rerender(); }, 'btn' + (st.rumble ? ' on' : ''), { 'data-k': 'rum_on' }),
        btn('Off', () => { st.rumble = false; saveSettings(); rerender(); }, 'btn' + (!st.rumble ? ' on' : ''), { 'data-k': 'rum_off' }),
      ),
    ),
    h('div', { style: 'margin-top:8px' }, btn('Reset controller buttons', () => { cancelPadCapture(); st.pad = {}; saveSettings(); rerender(); }, 'btn small', { 'data-k': 'pad_reset' })),
  );
}
