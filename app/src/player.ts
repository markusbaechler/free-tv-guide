// Vollbild-Wiedergabe der SRG-Livestreams in der App (ohne Zattoo, ohne Zeitlimit).
// Lädt player.js (Pillarbox) bei Bedarf nach.
import { clear, h } from './dom.ts';

export interface PlaySource {
  urn?: string;
  url?: string;
  type?: 'hls' | 'dash';
}

interface PlayerHandle {
  play(src: PlaySource): void;
  onError(cb: (message: string) => void): void;
  onPlaying(cb: () => void): void;
  quality(): string | null;
  dispose(): void;
}

export interface PlayableChannel {
  id: string;
  name: string;
  src: PlaySource;
  /** Laufende Sendung, für die Info-Leiste */
  nowTitle: string | null;
}

let loading: Promise<void> | null = null;
let handle: PlayerHandle | null = null;
let channels: PlayableChannel[] = [];
let index = 0;
let infoTimer: number | null = null;
let qualityTimer: number | null = null;
let onClose: (() => void) | null = null;
/** Wird bei einem Wiedergabefehler gefragt; true = der Aufrufer übernimmt (anderer Empfangsweg), Player schliesst */
let onFail: ((channelId: string) => boolean) | null = null;

function loadPlayerBundle(): Promise<void> {
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'player.css';
    document.head.appendChild(css);
    const s = document.createElement('script');
    s.src = 'player.js';
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error('Player konnte nicht geladen werden'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

const root = () => document.getElementById('player') as HTMLElement;

export function isPlaying(): boolean {
  return !root().hidden;
}

function showInfo(text: string | null, persistent: boolean): void {
  const info = document.getElementById('player-info');
  if (!info) return;
  const ch = channels[index];
  clear(info);
  if (ch) {
    info.appendChild(h('div', { class: 'pinfo__name' }, ch.name));
    if (ch.nowTitle) info.appendChild(h('div', { class: 'pinfo__now' }, ch.nowTitle));
  }
  if (text) info.appendChild(h('div', { class: 'pinfo__msg' }, text));
  // Bildgrösse des Streams, laufend aktualisiert (die Stufe wählt der Player nach Bandbreite)
  const qualityEl = h('div', { class: 'pinfo__msg' });
  info.appendChild(qualityEl);
  info.appendChild(h('div', { class: 'pinfo__keys' }, 'Hoch/Runter: Sender wechseln · OK: Info · Zurück: Guide'));
  info.hidden = false;
  if (infoTimer !== null) window.clearTimeout(infoTimer);
  if (qualityTimer !== null) window.clearInterval(qualityTimer);
  const updateQuality = () => {
    const q = handle ? handle.quality() : null;
    qualityEl.textContent = q ? 'Bild: ' + q : '';
  };
  updateQuality();
  qualityTimer = window.setInterval(updateQuality, 1000);
  const hide = () => {
    info.hidden = true;
    if (qualityTimer !== null) window.clearInterval(qualityTimer);
    qualityTimer = null;
  };
  infoTimer = persistent ? null : window.setTimeout(hide, 8000);
}

function start(): void {
  const ch = channels[index];
  if (!ch || !handle) return;
  showInfo('Wird geladen …', true);
  handle.play(ch.src);
}

/** Öffnet den Player für einen Sender; list = alle abspielbaren Sender (für Hoch/Runter) */
export function openPlayer(list: PlayableChannel[], channelId: string, closed: () => void, failover?: (channelId: string) => boolean): void {
  channels = list;
  index = Math.max(0, list.map((c) => c.id).indexOf(channelId));
  onClose = closed;
  onFail = failover || null;
  const el = root();
  clear(el);
  el.appendChild(h('video-js', { id: 'ftg-video', class: 'pillarbox-js' }));
  el.appendChild(h('div', { class: 'pinfo', id: 'player-info' }));
  el.hidden = false;
  showInfo('Player wird geladen …', true);

  loadPlayerBundle()
    .then(() => {
      if (!isPlaying()) return; // inzwischen mit Zurück geschlossen
      const api = (window as unknown as { ftgPlayer: { create(id: string): PlayerHandle } }).ftgPlayer;
      handle = api.create('ftg-video');
      handle.onPlaying(() => showInfo(null, false));
      handle.onError((msg) => {
        const ch = channels[index];
        if (ch && onFail && onFail(ch.id)) return;
        // SRG: häufigster Grund ist Abruf nicht aus der Schweiz (Geoblocking, z. B. VPN). Direkte Streams: Adresse geändert?
        const hint = ch && ch.src.urn
          ? ' SRG-Livestreams laufen nur aus der Schweiz.'
          : ' Der Sender hat seinen Livestream vielleicht verschoben – Hoch/Runter wechselt den Sender.';
        showInfo('Der Stream lässt sich nicht abspielen: ' + msg + hint, true);
      });
      start();
    })
    .catch((e: Error) => showInfo(e.message + '. Mit Zurück zum Guide.', true));
}

export function closePlayer(): void {
  if (handle) {
    try {
      handle.dispose();
    } catch (e) {
      // bereits entsorgt
    }
    handle = null;
  }
  const el = root();
  clear(el);
  el.hidden = true;
  if (infoTimer !== null) window.clearTimeout(infoTimer);
  if (qualityTimer !== null) window.clearInterval(qualityTimer);
  qualityTimer = null;
  const cb = onClose;
  onClose = null;
  if (cb) cb();
}

/** Tastendruck während der Wiedergabe. true = verarbeitet */
export function playerKey(code: number): boolean {
  if (!isPlaying()) return false;
  if (code === 10009 || code === 8 || code === 27) {
    closePlayer();
    return true;
  }
  if (code === 38 || code === 40 || code === 427 || code === 428) {
    // hoch/runter bzw. CH+/CH−
    const step = code === 38 || code === 427 ? -1 : 1;
    index = (index + step + channels.length) % channels.length;
    start();
    return true;
  }
  if (code === 13) {
    showInfo(null, false);
    return true;
  }
  return true; // alle anderen Tasten im Player schlucken
}
