// Zwischenspeicher für Tuner-Zuordnung und Sat-EPG (localStorage, abgesichert), damit die App nach dem Start
// sofort Programm zeigt und nicht erst 30 Sender × bis zu 20 EPG-Abrufe abwarten muss.
import type { TunerChannel, TunerEpgEntry } from './tuner.ts';

const KEY = 'ftg:tuner:v1';
/** EPG-Einträge, die älter sind als das, werden beim Speichern verworfen */
const KEEP_PAST_MS = 3 * 3600 * 1000;
/** Höchstens so viele Einträge je Sender speichern (Speicherplatz am TV) */
const MAX_ENTRIES = 400;

export interface TunerCache {
  savedAt: number;
  /** Sender-ID → zugeordneter Tuner-Sender (Rohobjekt inkl. _serviceId) */
  matched: Record<string, TunerChannel>;
  epg: Record<string, { fetchedAt: number; entries: TunerEpgEntry[] }>;
}

export function readTunerCache(): TunerCache | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as TunerCache;
    if (!c || typeof c !== 'object' || !c.matched || !c.epg) return null;
    return c;
  } catch (e) {
    return null;
  }
}

export function writeTunerCache(matched: Record<string, TunerChannel>, epg: Record<string, { fetchedAt: number; entries: TunerEpgEntry[] }>): void {
  try {
    const cutoff = new Date(Date.now() - KEEP_PAST_MS).toISOString();
    const slim: TunerCache['epg'] = {};
    for (const id of Object.keys(epg)) {
      const e = epg[id]!;
      slim[id] = { fetchedAt: e.fetchedAt, entries: e.entries.filter((x) => !x.end || x.end >= cutoff).slice(0, MAX_ENTRIES) };
    }
    window.localStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), matched, epg: slim }));
  } catch (e) {
    // Speicher voll oder nicht verfügbar: dann eben ohne Zwischenspeicher
  }
}

/** Zuordnung über die stabile Kennung `_serviceId` (überlebt Umbenennung), sonst null */
export function findByServiceId(list: TunerChannel[], cached: TunerChannel): TunerChannel | null {
  const sid = cached.raw && cached.raw._serviceId;
  if (!sid) return null;
  for (const c of list) if (c.raw && c.raw._serviceId === sid) return c;
  return null;
}
