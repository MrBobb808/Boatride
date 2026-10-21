import { G } from '../game/ctx';
import { applySquadOrders } from '../game/squadOrders';
import { echoRole, ECHO_ROLES } from '../game/data';
import { ECHO_COMBOS } from '../game/echoCombos';
import { h, btn, pushLayer, popLayer } from './dom';
import { holdUI } from './ui';
import { input } from '../core/input';
import { audio } from '../audio/audio';

interface SpeechResult { isFinal: boolean; 0: { transcript: string } }
interface SpeechSession {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  onresult: ((event: { resultIndex: number; results: ArrayLike<SpeechResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; abort(): void;
}
type SpeechConstructor = new () => SpeechSession;
let opened = false;

export function openVoiceOrders() {
  if (opened || !G.save || G.inCutscene || G.world.player.state === 'dead') return;
  opened = true;
  holdUI(1);
  audio.setMuffled(true);
  const speechWindow = window as Window & { SpeechRecognition?: SpeechConstructor; webkitSpeechRecognition?: SpeechConstructor };
  const Speech = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
  let recognition: SpeechSession | null = null, timer = 0, closed = false, session = 0;
  const status = h('p', { class: 'voice-status', role: 'status', 'aria-live': 'polite', 'data-k': 'voice_status' }, Speech ? 'Tap the microphone, then give a short order.' : 'Speech recognition is unavailable here. You can type the same orders below.');
  const transcript = h('p', { class: 'voice-transcript', 'data-k': 'voice_transcript' });
  const field = h('input', { type: 'text', maxlength: '400', placeholder: 'Guardian, protect me and ninja, attack archers', 'aria-label': 'Squad order', 'data-k': 'voice_text', autocomplete: 'off' });
  field.addEventListener('keydown', e => { if (e.key !== 'Escape') e.stopPropagation(); });
  const stop = () => {
    session++;
    window.clearTimeout(timer);
    const old = recognition; recognition = null;
    if (old) { old.onresult = old.onerror = old.onend = null; try { old.abort(); } catch { /* already ended */ } }
    mic.classList.remove('listening'); mic.setAttribute('aria-pressed', 'false');
    mic.textContent = 'Tap to speak';
  };
  const apply = (text: string) => {
    stop();
    transcript.textContent = text ? `“${text}”` : '';
    const result = applySquadOrders(text);
    status.textContent = result.message;
    status.classList.toggle('success', result.ok);
    roster.textContent = squadSummary();
    if (result.ok) G.ui.toast(result.message, 'good');
  };
  const mic = btn('Tap to speak', () => {
    if (recognition) { stop(); status.textContent = 'Listening stopped.'; return; }
    if (!Speech) return;
    const current = ++session;
    try { recognition = new Speech(); }
    catch { status.textContent = 'Speech recognition is unavailable. Type an order below.'; return; }
    recognition.lang = navigator.language || 'en-US';
    recognition.continuous = false; recognition.interimResults = true; recognition.maxAlternatives = 1;
    recognition.onresult = e => {
      if (closed || current !== session) return;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i], text = result[0].transcript.trim();
        transcript.textContent = `“${text}”`;
        if (result.isFinal) { field.value = text; apply(text); break; }
      }
    };
    recognition.onerror = e => {
      if (closed || current !== session) return;
      stop();
      status.textContent = e.error === 'not-allowed' || e.error === 'service-not-allowed'
        ? 'Microphone or speech access was denied. Allow it in your browser settings, or type an order.'
        : e.error === 'no-speech' ? 'No speech heard. Tap to try again, or type an order.' : 'Speech recognition stopped. Try again, or type an order.';
    };
    recognition.onend = () => { if (current === session) { stop(); status.textContent = 'No final order received. Tap to try again, or type one below.'; } };
    try {
      recognition.start();
      mic.textContent = 'Listening · tap to stop'; mic.classList.add('listening'); mic.setAttribute('aria-pressed', 'true');
      status.textContent = 'Listening…'; status.classList.remove('success');
      timer = window.setTimeout(() => { if (current === session) { stop(); status.textContent = 'Listening timed out. Tap to try again.'; } }, 12000);
    } catch { stop(); status.textContent = 'Couldn’t start speech recognition. Try again or type your order.'; }
  }, 'btn voice-mic primary', { disabled: !Speech, 'data-k': 'voice_mic', 'aria-pressed': 'false' });
  const examples = ['Guardian, protect me', 'Ninja, attack archers', 'Mage, control groups', 'Everyone, hold here'];
  const roster = h('p', { class: 'muted voice-roster', 'data-k': 'voice_roster' }, squadSummary());
  const form = h('form', { class: 'voice-form', onsubmit: (e: Event) => { e.preventDefault(); apply(field.value); } }, field,
    h('button', { type: 'submit', class: 'btn', 'data-nav': '', 'data-k': 'voice_apply' }, 'Apply orders'));
  const card = h('div', { class: 'panel voice-orders scroll', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'voice_title' },
    btn('Resume', () => close(), 'btn small voice-dismiss', { 'aria-label': 'Return to battle', 'data-k': 'voice_dismiss' }),
    h('div', { class: 'eyebrow' }, 'Command the Remnant'),
    h('h2', { id: 'voice_title' }, 'Your voice. Their orders.'),
    h('p', { class: 'muted' }, 'Combat pauses while you give orders. Speak up to four instructions separated by “and”.'),
    mic, status, transcript, form,
    h('div', { class: 'voice-examples' }, examples.map(text => btn(text, () => { field.value = text; field.focus(); }, 'btn small'))),
    roster,
    h('details', { class: 'voice-guide' }, h('summary', null, 'Orders and Echo combinations'),
      h('p', null, 'Protect · hunt · flank · hold here · focus · follow. Also: “Summon one”, “Summon two”, “Summon all”, “Recall everyone”, “Sync strike”. Archers, casters, bosses and groups can be priorities.'),
      ECHO_COMBOS.map(c => h('p', null, h('strong', { style: `color:${c.color}` }, c.name + ' · '), c.desc))),
    h('p', { class: 'voice-privacy muted' }, 'The microphone starts only when tapped. Your browser’s speech service may need a network connection. Audio is not saved by the game.'),
    btn('Return to battle', () => close(), 'btn primary', { 'data-k': 'voice_close' }));
  const layer = h('div', { class: 'layer dim feature-dialog' }, card);
  const background = () => { if (document.hidden) { stop(); status.textContent = 'Listening stopped while the app is in the background.'; } };
  const close = () => {
    if (closed) return;
    closed = true; stop(); opened = false;
    document.removeEventListener('visibilitychange', background);
    window.removeEventListener('pagehide', close);
    popLayer(layer); holdUI(-1); input.flush();
    audio.setMuffled(false);
  };
  document.getElementById('ui')!.appendChild(layer);
  document.addEventListener('visibilitychange', background);
  window.addEventListener('pagehide', close);
  pushLayer({ el: layer, onBack: close });
}

function squadSummary() {
  const live = G.world.echoes.filter(u => !u.remove && u.despawn <= 0 && u.hp > 0);
  return live.length ? live.map(u => `${ECHO_ROLES[echoRole(u.inst)].name}: ${u.order ?? 'free'}${u.inst.targetPriority ? ` (${u.inst.targetPriority})` : ''}`).join(' · ') : 'No Echoes summoned. Try “Summon all”.';
}
