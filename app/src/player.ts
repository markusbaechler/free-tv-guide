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
  togglePause(): boolean;
  seekBy(seconds: number): void;
  seekTo(seconds: number): void;
  position(): { pos: number; dur: number; paused: boolean };
  stats(): unknown;
  dispose(): void;
}

/** Vergangene Sendung zum Nachsehen (SRG-Video-URN) */
export interface VodItem {
  urn: string;
  title: string;
  subtitle: string | null;
  /** z. B. «SRF 1 · Di 3.11. 19:30» */
  meta: string;
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
/** Nachsehen statt Live: eigene Tasten (Spulen, Pause), keine Senderliste */
let vod: VodItem | null = null;
let vodResumeAt = 0;
let vodTimer: number | null = null;

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

/**
 * Laufenden Player entsorgen, bevor ein neuer entsteht. Sonst liefert video.js für dieselbe Element-ID den alten
 * Player zurück («already initialised»), der in einem losgelösten Element weiterspielt (am TV gemessen 4.11.2026).
 */
function disposeHandle(): void {
  if (!handle) return;
  try {
    handle.dispose();
  } catch (e) {
    // bereits entsorgt
  }
  handle = null;
}

/** ID des Senders, der gerade im Player läuft (null = Player zu) */
export function currentPlayerChannel(): string | null {
  const ch = channels[index];
  return isPlaying() && ch ? ch.id : null;
}

/** Innerhalb des offenen Players auf einen anderen Sender der Liste wechseln. false = nicht in der Liste */
export function switchPlayerChannel(channelId: string): boolean {
  const i = channels.map((c) => c.id).indexOf(channelId);
  if (i === -1 || !isPlaying()) return false;
  index = i;
  start();
  return true;
}

export function isPlaying(): boolean {
  return !root().hidden;
}

/** Diagnose des laufenden Players (null = keiner offen) */
export function playerStats(): unknown {
  if (!handle || !isPlaying()) return null;
  return { mode: vod ? 'vod' : 'live', title: vod ? vod.title : channels[index] ? channels[index]!.name : null, stats: handle.stats() };
}

/** Läuft gerade eine Sendung zum Nachsehen (nicht live)? */
export function isVodPlaying(): boolean {
  return isPlaying() && vod !== null;
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
  disposeHandle();
  vod = null;
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
  if (vod && handle) saveResume(vod.urn, handle.position());
  vod = null;
  if (vodTimer !== null) window.clearInterval(vodTimer);
  vodTimer = null;
  disposeHandle();
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
  if (vod) return vodKey(code);
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

// ---------------------------------------------------------------- Nachsehen

const RESUME_KEY = 'ftg:resume:v1';
const RESUME_MAX = 40;

function readResume(): Record<string, { pos: number; at: number }> {
  try {
    const raw = window.localStorage.getItem(RESUME_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

/** Gespeicherte Position einer Sendung in Sekunden (0 = von vorn) */
export function resumePosition(urn: string): number {
  const r = readResume()[urn];
  return r ? r.pos : 0;
}

function saveResume(urn: string, p: { pos: number; dur: number }): void {
  const all = readResume();
  // Erst ab einer Minute merken; kurz vor Schluss gilt die Sendung als gesehen
  if (p.pos > 60 && (!p.dur || p.pos < p.dur - 180)) all[urn] = { pos: Math.floor(p.pos), at: Date.now() };
  else delete all[urn];
  const keys = Object.keys(all).sort((a, b) => all[b]!.at - all[a]!.at);
  for (const k of keys.slice(RESUME_MAX)) delete all[k];
  try {
    window.localStorage.setItem(RESUME_KEY, JSON.stringify(all));
  } catch (e) {
    // Speicher voll oder gesperrt: dann ohne Fortsetzen
  }
}

/** Sekunden → «1:02:03» bzw. «12:34» */
export function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const two = (n: number) => (n < 10 ? '0' : '') + n;
  return hh ? hh + ':' + two(mm) + ':' + two(ss) : mm + ':' + two(ss);
}

function showVodInfo(text: string | null, persistent: boolean): void {
  const info = document.getElementById('player-info');
  if (!info || !vod) return;
  clear(info);
  info.appendChild(h('div', { class: 'pinfo__name' }, vod.title));
  info.appendChild(h('div', { class: 'pinfo__now' }, [vod.subtitle, vod.meta].filter(Boolean).join(' · ')));
  const bar = h('i', { style: 'width:0%' });
  info.appendChild(h('div', { class: 'pinfo__bar' }, bar));
  const timeEl = h('div', { class: 'pinfo__time' });
  info.appendChild(timeEl);
  if (text) info.appendChild(h('div', { class: 'pinfo__msg' }, text));
  info.appendChild(h('div', { class: 'pinfo__keys' }, 'OK: Pause · Links/Rechts: 30 s · Hoch/Runter: 5 Min. · 0: Anfang · Zurück: Liste'));
  info.hidden = false;
  const update = () => {
    const p = handle ? handle.position() : { pos: 0, dur: 0, paused: false };
    bar.style.width = (p.dur ? Math.round((p.pos / p.dur) * 1000) / 10 : 0) + '%';
    timeEl.textContent = clock(p.pos) + (p.dur ? ' / ' + clock(p.dur) : '') + (p.paused ? ' · Pause' : '');
  };
  update();
  if (infoTimer !== null) window.clearTimeout(infoTimer);
  if (vodTimer !== null) window.clearInterval(vodTimer);
  vodTimer = window.setInterval(update, 500);
  const paused = handle ? handle.position().paused : false;
  infoTimer = persistent || paused ? null : window.setTimeout(() => {
    info.hidden = true;
    if (vodTimer !== null) window.clearInterval(vodTimer);
    vodTimer = null;
  }, 5000);
}

/** Öffnet den Player für eine vergangene Sendung (SRG-Video-URN); setzt an der gemerkten Stelle fort */
export function openVod(item: VodItem, closed: () => void): void {
  disposeHandle();
  vod = item;
  channels = [];
  index = 0;
  onClose = closed;
  onFail = null;
  vodResumeAt = resumePosition(item.urn);
  const el = root();
  clear(el);
  el.appendChild(h('video-js', { id: 'ftg-video', class: 'pillarbox-js' }));
  el.appendChild(h('div', { class: 'pinfo', id: 'player-info' }));
  el.hidden = false;
  showVodInfo('Player wird geladen …', true);

  loadPlayerBundle()
    .then(() => {
      if (!isPlaying() || vod !== item) return;
      const api = (window as unknown as { ftgPlayer: { create(id: string): PlayerHandle } }).ftgPlayer;
      handle = api.create('ftg-video');
      let first = true;
      handle.onPlaying(() => {
        // Nur beim ersten Start einblenden; «playing» kommt auch nach jedem Nachladen und Spulen
        if (!first) return;
        first = false;
        if (vodResumeAt > 0 && handle) {
          handle.seekTo(vodResumeAt);
          showVodInfo('Fortgesetzt bei ' + clock(vodResumeAt) + ' – 0: von Anfang', false);
        } else showVodInfo(null, false);
      });
      handle.onError((msg) => {
        // Häufig: Sendung (noch) nicht online, Rechte nur live, abgelaufen oder Abruf nicht aus der Schweiz
        showVodInfo('Diese Sendung lässt sich nicht abspielen: ' + msg + ' Nicht alles ist bei der SRG online (Rechte), manches erst Stunden nach der Ausstrahlung.', true);
      });
      handle.play({ urn: item.urn });
    })
    .catch((e: Error) => showVodInfo(e.message + '. Mit Zurück zur Liste.', true));
}

function vodKey(code: number): boolean {
  if (code === 10009 || code === 8 || code === 27) {
    closePlayer();
    return true;
  }
  if (!handle) return true;
  // OK, Play/Pause, Play, Pause
  if (code === 13 || code === 10252 || code === 415 || code === 19) {
    const p = handle.position();
    if ((code === 415 && !p.paused) || (code === 19 && p.paused)) showVodInfo(null, false);
    else handle.togglePause();
    window.setTimeout(() => showVodInfo(null, false), 50);
    return true;
  }
  const jumps: Record<number, number> = { 37: -30, 39: 30, 412: -30, 417: 30, 38: 300, 40: -300 };
  if (jumps[code] !== undefined) {
    handle.seekBy(jumps[code]!);
    showVodInfo(null, false);
    return true;
  }
  if (code === 48 || code === 96) {
    handle.seekTo(0);
    showVodInfo('Von Anfang', false);
    return true;
  }
  return true; // übrige Tasten schlucken
}
