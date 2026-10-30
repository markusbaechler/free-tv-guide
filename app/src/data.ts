import type { Channel, GuideEvent } from '../../pipeline/types.ts';
import { DATA_BASE } from './settings.ts';

export interface EpgEntry {
  title: string;
  subtitle: string | null;
  start: string;
  end: string | null;
}

export interface Meta {
  generatedAt: string;
  srg: { status: string };
  warnings: string[];
}

export interface GuideData {
  events: GuideEvent[];
  channels: Channel[];
  epg: Record<string, EpgEntry[]>;
  meta: Meta;
  /** Zeitpunkt, an dem die App die Daten erfolgreich geladen hat */
  loadedAt: string;
  /** true = aus dem lokalen Speicher, weil das Netz fehlt */
  fromCache: boolean;
}

const CACHE_KEY = 'ftg:data:v1';

function dataBase(): string {
  const m = /[?&]data=([^&]+)/.exec(location.search);
  return m ? decodeURIComponent(m[1]!) : DATA_BASE;
}

function getJson<T>(file: string): Promise<T> {
  return fetch(dataBase() + file, { cache: 'no-cache' }).then((res) => {
    if (!res.ok) throw new Error(file + ': HTTP ' + res.status);
    return res.json() as Promise<T>;
  });
}

function readCache(): GuideData | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as GuideData) : null;
  } catch (e) {
    return null;
  }
}

function writeCache(d: GuideData): void {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(d));
  } catch (e) {
    // Speicher voll oder gesperrt: App funktioniert trotzdem, nur ohne Offline-Stand
  }
}

/** Lädt alle Dateien; bei Netzfehler der letzte gespeicherte Stand (oder null). */
export function loadData(): Promise<GuideData | null> {
  // Eigenständige Vorschau-Seite: Daten sind eingebettet
  const embedded = (window as unknown as { __FTG_DATA__?: Omit<GuideData, 'loadedAt' | 'fromCache'> }).__FTG_DATA__;
  if (embedded) return Promise.resolve(Object.assign({ loadedAt: new Date().toISOString(), fromCache: false }, embedded));
  return Promise.all([
    getJson<{ events: GuideEvent[] }>('events.json'),
    getJson<{ channels: Channel[] }>('channels.json'),
    getJson<{ channels: Record<string, EpgEntry[]> }>('epg.json'),
    getJson<Meta>('meta.json'),
  ])
    .then(([ev, ch, epg, meta]) => {
      const d: GuideData = {
        events: ev.events,
        channels: ch.channels,
        epg: epg.channels,
        meta,
        loadedAt: new Date().toISOString(),
        fromCache: false,
      };
      writeCache(d);
      return d;
    })
    .catch(() => {
      const c = readCache();
      if (c) c.fromCache = true;
      return c;
    });
}

/** Laufende und nächste Sendung eines Senders */
export function nowNext(entries: EpgEntry[] | undefined, now: Date): { now: EpgEntry | null; next: EpgEntry | null } {
  if (!entries) return { now: null, next: null };
  const n = now.toISOString();
  let current: EpgEntry | null = null;
  let next: EpgEntry | null = null;
  for (const e of entries) {
    const end = e.end || '9999';
    if (e.start <= n && end > n) current = e;
    else if (e.start > n && !next) next = e;
  }
  return { now: current, next };
}
