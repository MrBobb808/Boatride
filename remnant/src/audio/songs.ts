// The song layer: recorded songs (soundtrack/songs.json, made in Suno) over the
// generated score. When the score is asked for a track that a song covers, the
// song is fetched (and kept offline by the service worker), the score holds its
// notes and the song fades in. A chapter's vocal song plays once per session;
// after it, and wherever only an instrumental is mapped, the instrumental loops.
// Anything without a song file keeps the generated score, so the game sounds
// whole with none, some or all of the songs present.
//
// Two <audio> elements are reused for every song (A/B for crossfades): iOS lets
// an element play without a fresh tap only once it has played inside one, so
// both are primed on the first gesture. They are routed through Web Audio,
// because iOS ignores an element's own volume, and that way songs also follow
// the music slider, the pause-menu muffle and the underwater filter.

import plan from '../../soundtrack/songs.json';
import { audio } from './audio';
import { music } from './music';
import { settings } from '../core/settings';

export interface SongDef {
  id: string;
  title: string;
  chapter: string;
  kind: 'vocal' | 'instrumental';
  keys: string[];
}

export const SONGS = plan.songs as SongDef[];

/** Song files are served beside the game; the service worker keeps them across updates. */
export const songUrl = (id: string) => `music/${id}.mp3`;

/** A silent WAV (a few samples) to prime the elements inside the first tap. */
const SILENCE = 'data:audio/wav;base64,UklGRiwAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQgAAAAAAAAAAAAAAA==';
/** How many fetched songs stay in memory (a song is ~3–5 MB); older ones are dropped and refetched from the cache. */
const KEEP = 3;
const FADE = 2.4;

interface Deck {
  el: HTMLAudioElement;
  gain: GainNode;
  id: string;
}

class Songs {
  private decks: Deck[] = [];
  private live: Deck | null = null;
  /** The deck started last: the next song takes the other one, so an outgoing song can finish its fade. */
  private last: Deck | null = null;
  /** The score track the current song stands in for. */
  private key = '';
  private blobs = new Map<string, string>();
  private missing = new Set<string>();
  private loading = new Map<string, Promise<string | null>>();
  /** Vocal songs heard this session: next time their place gets the instrumental. */
  private heard = new Set<string>();
  private primed = false;
  private ducked = false;
  /** Bumped on every request, so a slow download never starts a song for a room already left. */
  private ask = 0;
  /** Which song is playing (for tests and the settings row). */
  get playing() {
    return this.live?.id ?? '';
  }
  /** The playing song's level (1 full, lower while ducked) and position, for tests. */
  get level() {
    return this.live?.gain.gain.value ?? 0;
  }
  get position() {
    return this.live?.el.currentTime ?? 0;
  }

  constructor() {
    music.onTrack = (name) => this.request(name);
    audio.unlockHooks.push(() => this.prime());
    document.addEventListener('visibilitychange', () => {
      const el = this.live?.el;
      if (!el) return;
      if (document.hidden) el.pause();
      else el.play().catch(() => {});
    });
  }

  /** The song for a score track right now, if the player wants songs and one is mapped. */
  pick(key: string): SongDef | null {
    if (!key || settings.soundtrack === 'score') return null;
    let inst: SongDef | null = null;
    for (const s of SONGS) {
      if (!s.keys.includes(key) || this.missing.has(s.id)) continue;
      if (s.kind === 'vocal') {
        if (settings.vocals && !this.heard.has(s.id)) return s;
      } else inst ??= s;
    }
    return inst;
  }

  /** The score has switched to `key`: play its song, or hand the music back to the score. */
  request(key: string) {
    const n = ++this.ask;
    this.key = key;
    const song = this.pick(key);
    if (song && this.live?.id === song.id) {
      // Rooms that share a song keep it going; the new score track stays quiet under it.
      music.hold(true, 0.3);
      return;
    }
    if (!song) {
      this.fadeOut();
      music.hold(false);
      return;
    }
    // The score carries on until the file is ready (it may be downloading for the first time).
    this.fadeOut();
    music.hold(false);
    this.load(song.id).then((url) => {
      if (n !== this.ask) return;
      if (!url) {
        // No file for this one: try the next choice (a vocal falls back to its instrumental).
        this.request(key);
        return;
      }
      this.start(song, url);
    });
  }

  /** Settings changed: choose again for the current place. */
  refresh() {
    const key = this.key;
    if (this.live) this.fadeOut();
    this.request(key);
  }

  /** Dialogue on screen: sung words step back so spoken ones can be read and heard. */
  duck(on: boolean) {
    // Applied every time, not only on a change: a conversation cut short (a warp, a death) must not leave the flag stuck.
    this.ducked = on;
    const d = this.live, ctx = audio.ctx;
    if (!d || !ctx) return;
    // A fade-in still scheduled would otherwise finish at full level over the duck.
    const g = d.gain.gain, t = ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.setTargetAtTime(on ? 0.32 : 1, t, 0.25);
  }

  private prime() {
    if (this.primed || !audio.ctx) return;
    this.primed = true;
    for (let i = 0; i < 2; i++) {
      const el = new Audio();
      el.preload = 'auto';
      el.setAttribute('playsinline', '');
      el.src = SILENCE;
      el.play().then(() => el.pause(), () => {});
      const gain = audio.ctx.createGain();
      gain.gain.value = 0;
      audio.ctx.createMediaElementSource(el).connect(gain);
      gain.connect(audio.musicBus);
      const deck: Deck = { el, gain, id: '' };
      el.addEventListener('ended', () => this.ended(deck));
      this.decks.push(deck);
    }
    // A song may have been chosen before the first tap; it can start now.
    if (this.key && !this.live) this.request(this.key);
  }

  private load(id: string): Promise<string | null> {
    const have = this.blobs.get(id);
    if (have) {
      // Most recently used goes last.
      this.blobs.delete(id);
      this.blobs.set(id, have);
      return Promise.resolve(have);
    }
    const pending = this.loading.get(id);
    if (pending) return pending;
    const p = fetch(songUrl(id))
      .then((r) => (r.ok ? r.blob() : null))
      .catch(() => null)
      .then((blob) => {
        this.loading.delete(id);
        if (!blob || !blob.size || !/^audio\//.test(blob.type || 'audio/mpeg')) {
          this.missing.add(id);
          return null;
        }
        const url = URL.createObjectURL(blob);
        this.blobs.set(id, url);
        for (const [old, u] of this.blobs) {
          if (this.blobs.size <= KEEP) break;
          if (this.decks.some((d) => d.id === old)) continue; // still playing or fading out
          URL.revokeObjectURL(u);
          this.blobs.delete(old);
        }
        return url;
      });
    this.loading.set(id, p);
    return p;
  }

  private start(song: SongDef, url: string) {
    const ctx = audio.ctx;
    const deck = this.decks.find((d) => d !== this.last);
    if (!ctx || !deck) return; // before the first tap; prime() comes back here
    this.fadeOut();
    deck.id = song.id;
    deck.el.src = url;
    deck.el.loop = song.kind === 'instrumental';
    deck.el.currentTime = 0;
    const t = ctx.currentTime;
    deck.gain.gain.cancelScheduledValues(t);
    deck.gain.gain.setValueAtTime(0.0001, t);
    deck.gain.gain.linearRampToValueAtTime(this.ducked ? 0.32 : 1, t + FADE);
    deck.el.play().catch(() => {});
    if (song.kind === 'vocal') this.heard.add(song.id);
    this.live = this.last = deck;
    music.hold(true, FADE);
  }

  private fadeOut() {
    const d = this.live, ctx = audio.ctx;
    this.live = null;
    if (!d || !ctx) return;
    const t = ctx.currentTime;
    d.gain.gain.cancelScheduledValues(t);
    d.gain.gain.setValueAtTime(d.gain.gain.value, t);
    d.gain.gain.linearRampToValueAtTime(0.0001, t + FADE);
    const el = d.el;
    window.setTimeout(() => { if (this.live !== d) el.pause(); }, FADE * 1000 + 100);
  }

  /** A vocal song finished: its place moves on to the instrumental, or back to the score. */
  private ended(d: Deck) {
    if (this.live !== d) return;
    this.live = null;
    this.request(this.key);
  }
}

export const songs = new Songs();
