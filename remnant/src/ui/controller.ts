// Settings → Controller: what is connected, and moving any action to any
// button. PlayStation pads (DualSense, DualShock) are named with ✕ ○ □ △ and
// L1/R1; Xbox and other pads with A B X Y and LB/RB.

import { input, ACTION_LABELS, PAD_REMAPPABLE, type Action } from '../core/input';
import { settings, saveSettings } from '../core/settings';
import { h, btn } from './dom';

let waiting: Action | null = null;
let rumbleNote = '';

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
  const status = h('p', { class: 'muted', role: 'status', 'data-controller-status': '', style: 'margin:0 0 6px;font-size:0.85em;overflow-wrap:anywhere' });
  const reading = h('p', { class: 'muted', 'data-controller-reading': '', style: 'margin:0 0 8px;font-size:0.85em;font-variant-numeric:tabular-nums' });
  const direct = h('a', { class: 'btn small', 'data-nav': '', href: 'https://mrbobb808.github.io/Boatride/', target: '_blank', rel: 'noopener' }, 'Open game directly');
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
  const box = h('div', { class: 'box', 'data-controller-box': '' },
    h('h3', null, 'Controller'),
    status,
    reading,
    h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px' },
      btn('Check controller', () => { input.poll(); refresh(); }, 'btn small', { 'data-k': 'pad_check' }), direct),
    h('p', { class: 'muted', style: 'margin:0 0 6px;font-size:0.85em' },
      'Pair in your device’s Bluetooth settings first. On a PS5 DualSense, hold PS and Create until the light flashes. Return to the game, tap Check controller, then press ✕ / A or move the left stick.'),
    h('p', { class: 'muted', style: 'margin:0 0 6px;font-size:0.85em' },
      'Select an action, then press the controller button you want for it. Menus always use ✕ / A to confirm and ○ / B to go back. Move and aim combos with the left stick (up + Attack launches, down + Attack plunges); the D-pad holds quick actions. The Shadow Mantle is L3 + R3 together unless you give it a button of its own. Leave the PS / Home button alone; the iPhone uses it.'),
    rows,
    h('div', { class: 'set-row' },
      h('label', null, 'Rumble', h('small', null, 'Controller vibration on hits, parries, plunges, finishers, the Mantle and boss kills, where the browser supports it.')),
      h('div', { class: 'seg' },
        btn('On', () => { st.rumble = true; saveSettings(); rerender(); }, 'btn' + (st.rumble ? ' on' : ''), { 'data-k': 'rum_on' }),
        btn('Off', () => { st.rumble = false; saveSettings(); rerender(); }, 'btn' + (!st.rumble ? ' on' : ''), { 'data-k': 'rum_off' }),
        btn('Test', () => {
          const can = input.canRumble();
          if (can === null) rumbleNote = 'Connect a controller and press any button on it first.';
          else if (!can) rumbleNote = 'This browser cannot make the controller vibrate. Safari on iPhone and iPad has not supported controller vibration so far (Safari on a Mac and Chrome do). Everything else works, and the game will rumble as soon as iOS allows it.';
          else {
            input.rumble(0.9, 0.9, 450, true);
            rumbleNote = 'Sent a half-second rumble. If you felt nothing, check that the controller is charged and that Rumble is On.';
          }
          rerender();
        }, 'btn', { 'data-k': 'rum_test' }),
      ),
    ),
    rumbleNote ? h('p', { class: 'muted', 'data-k': 'rum_note', style: 'margin:0 0 6px;font-size:0.85em' }, rumbleNote) : null,
    h('div', { style: 'margin-top:8px' }, btn('Reset controller buttons', () => { cancelPadCapture(); st.pad = {}; saveSettings(); rerender(); }, 'btn small', { 'data-k': 'pad_reset' })),
  );
  function refresh() {
    const messages = {
      connected: `Connected: ${prettyName(input.padName)}.`,
      waiting: 'Waiting for controller input. Press ✕ / A or move the left stick while this game is open.',
      unavailable: 'This browser does not provide controller access. Open the game directly in Safari or Chrome.',
      blocked: 'Controller access is blocked in this preview. Open the game directly in Safari or Chrome.',
      background: 'Return to this game to use your controller.',
      error: 'Controller access was interrupted. Reconnect it in Bluetooth settings, then check again.',
    };
    const text = messages[input.gamepadStatus];
    if (status.textContent !== text) status.textContent = text;
    const live = input.gamepadConnected
      ? `Left stick: X ${input.controllerX.toFixed(2)} · Y ${input.controllerY.toFixed(2)} · Last button: ${input.lastPadButton < 0 ? '—' : input.buttonName(input.lastPadButton)}`
      : 'Stick movement and button presses will appear here once detected.';
    if (reading.textContent !== live) reading.textContent = live;
    direct.style.display = input.gamepadStatus === 'blocked' || input.gamepadStatus === 'unavailable' ? '' : 'none';
    for (const a of PAD_REMAPPABLE) {
      const button = box.querySelector(`[data-k="pad_${a}"]`)!;
      const label = waiting === a ? 'Press a button…' : input.padLabel(a);
      if (button.textContent !== label) button.textContent = label;
    }
  }
  refresh();
  // Keep an already-open Settings screen honest through pairing and reconnects.
  let last = 0;
  const tick = (now: number) => {
    if (!box.isConnected) return;
    if (now - last >= 120) { last = now; refresh(); }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return box;
}
