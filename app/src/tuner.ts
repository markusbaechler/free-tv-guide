// Sat-/DVB-Tuner des Fernsehers über die Tizen-TV-APIs (tizen.tvchannel, tizen.tvwindow).
// Phase «Probe»: liest die Senderliste, stimmt einen Sender ab und zeigt das TV-Bild im Vollbild.
// Alle Aufrufe defensiv: die API-Formen sind nur aus der Doku bekannt, Rohdaten werden angezeigt.

export interface TunerChannel {
  index: number;
  name: string;
  major: number | null;
  minor: number | null;
  /** Rohobjekt der API (für Tune und Anzeige) */
  raw: Record<string, unknown>;
}

interface TvChannelApi {
  getChannelList(ok: (list: Record<string, unknown>[]) => void, err: (e: { message: string }) => void, mode?: string, start?: number, count?: number): void;
  tune(option: Record<string, unknown>, cb: { onsuccess?: (ch: unknown, win: unknown) => void; onnosignal?: () => void; onprograminforeceived?: () => void }, err: (e: { message: string }) => void, win?: string): void;
  getCurrentChannel(win?: string): Record<string, unknown>;
  getProgramList(ch: Record<string, unknown>, start: Date, ok: (list: Record<string, unknown>[]) => void, err: (e: { message: string }) => void, duration?: number): void;
}

interface TvWindowApi {
  show(ok: (rect: unknown, type: unknown) => void, err: (e: { message: string }) => void, rect?: string[], type?: string, z?: string): void;
  hide(ok: () => void, err: (e: { message: string }) => void, type?: string): void;
  setSource(src: Record<string, unknown>, ok: (s: unknown, t: unknown) => void, err: (e: { message: string }) => void, type?: string): void;
  getSource(type?: string): Record<string, unknown>;
}

interface SysInfoApi {
  getPropertyValue(prop: string, ok: (v: unknown) => void, err?: (e: { message: string }) => void): void;
}

function tz(): { tvchannel?: TvChannelApi; tvwindow?: TvWindowApi; systeminfo?: SysInfoApi } | null {
  const t = (window as unknown as { tizen?: { tvchannel?: TvChannelApi; tvwindow?: TvWindowApi; systeminfo?: SysInfoApi } }).tizen;
  return t || null;
}

export function tunerAvailable(): { channel: boolean; window: boolean } {
  const t = tz();
  return { channel: !!(t && t.tvchannel), window: !!(t && t.tvwindow) };
}

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);

/** Senderliste des Tuners (alle Quellen). */
export function listChannels(): Promise<TunerChannel[]> {
  const t = tz();
  if (!t || !t.tvchannel) return Promise.reject(new Error('tizen.tvchannel nicht vorhanden'));
  return new Promise((resolve, reject) => {
    try {
      t.tvchannel!.getChannelList(
        (list) =>
          resolve(
            list.map((raw, index) => ({
              index,
              name: str(raw.channelName) || str(raw.serviceName) || 'Sender ' + (index + 1),
              major: num(raw.major),
              minor: num(raw.minor),
              raw,
            })),
          ),
        (e) => reject(new Error('getChannelList: ' + e.message)),
        'ALL',
      );
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

/** Sender abstimmen. Nutzt die Kennungen aus der Senderliste. */
export function tuneTo(ch: TunerChannel): Promise<string> {
  const t = tz();
  if (!t || !t.tvchannel) return Promise.reject(new Error('tizen.tvchannel nicht vorhanden'));
  const r = ch.raw;
  const option: Record<string, unknown> = {};
  for (const k of ['major', 'minor', 'sourceID', 'programNumber', 'ptc', 'originalNetworkID', 'transportStreamID']) {
    if (r[k] !== undefined && r[k] !== null) option[k] = r[k];
  }
  return new Promise((resolve, reject) => {
    try {
      t.tvchannel!.tune(
        option,
        {
          onsuccess: () => resolve('ok'),
          onnosignal: () => resolve('kein Signal'),
        },
        (e) => reject(new Error('tune: ' + e.message)),
        'MAIN',
      );
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

/** TV-Bild im Vollbild zeigen (vor der App). */
export function showTvWindow(): Promise<string> {
  const t = tz();
  if (!t || !t.tvwindow) return Promise.reject(new Error('tizen.tvwindow nicht vorhanden'));
  return new Promise((resolve, reject) => {
    try {
      t.tvwindow!.show(
        (rect, type) => resolve(JSON.stringify({ rect, type })),
        (e) => reject(new Error('tvwindow.show: ' + e.message)),
        ['0px', '0px', '1920px', '1080px'],
        'MAIN',
        'FRONT',
      );
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

export function hideTvWindow(): Promise<void> {
  const t = tz();
  if (!t || !t.tvwindow) return Promise.resolve();
  return new Promise((resolve) => {
    try {
      t.tvwindow!.hide(() => resolve(), () => resolve(), 'MAIN');
    } catch (e) {
      resolve();
    }
  });
}

/** Aktuelle Sendung aus dem Sendesignal (DVB-EPG), falls verfügbar. */
export function programNow(ch: TunerChannel): Promise<string> {
  const t = tz();
  if (!t || !t.tvchannel) return Promise.reject(new Error('tizen.tvchannel nicht vorhanden'));
  return new Promise((resolve, reject) => {
    try {
      t.tvchannel!.getProgramList(
        ch.raw,
        new Date(),
        (list) => resolve(list.length ? JSON.stringify(list[0]).slice(0, 300) : 'keine Programmdaten'),
        (e) => reject(new Error('getProgramList: ' + e.message)),
        2 * 3600,
      );
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

/** Videoquellen des Fernsehers (TV, HDMI …) */
export function videoSources(): Promise<string> {
  const t = tz();
  if (!t || !t.systeminfo) return Promise.reject(new Error('tizen.systeminfo nicht vorhanden'));
  return new Promise((resolve, reject) => {
    try {
      t.systeminfo!.getPropertyValue('VIDEOSOURCE', (v) => resolve(JSON.stringify(v).slice(0, 400)), (e) => reject(new Error('VIDEOSOURCE: ' + e.message)));
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

// ---------------------------------------------------------------- Zuordnung und Programmdaten

export interface TunerEpgEntry {
  title: string;
  subtitle: string | null;
  start: string;
  end: string | null;
}

let cachedList: TunerChannel[] | null = null;
let listPromise: Promise<TunerChannel[]> | null = null;

/** Senderliste einmal lesen und behalten */
export function loadTunerList(): Promise<TunerChannel[]> {
  if (cachedList) return Promise.resolve(cachedList);
  if (listPromise) return listPromise;
  listPromise = listChannels().then(
    (l) => {
      cachedList = l;
      return l;
    },
    (e) => {
      listPromise = null;
      throw e;
    },
  );
  return listPromise;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Erster Name aus `names`, der in der Tuner-Liste vorkommt (HD zuerst, wenn so gelistet) */
export function matchTunerChannel(list: TunerChannel[], names: string[]): TunerChannel | null {
  for (const n of names) {
    const want = norm(n);
    for (const c of list) if (norm(c.name) === want) return c;
  }
  // Fallback: Name als Präfix (z. B. «Das Erste HD» ↔ «Das Erste»)
  for (const n of names) {
    const want = norm(n);
    for (const c of list) if (norm(c.name).indexOf(want) === 0) return c;
  }
  return null;
}

function toIso(v: unknown): string | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString();
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

/** Programm aus dem Sendesignal (DVB-EPG) für die nächsten Stunden, in der Form der App-EPG-Einträge */
export function tunerEpg(ch: TunerChannel, hours: number): Promise<TunerEpgEntry[]> {
  const t = tz();
  if (!t || !t.tvchannel) return Promise.reject(new Error('tizen.tvchannel nicht vorhanden'));
  return new Promise((resolve, reject) => {
    try {
      t.tvchannel!.getProgramList(
        ch.raw,
        new Date(),
        (list) => {
          const out: TunerEpgEntry[] = [];
          for (const p of list) {
            const start = toIso(p.startTime);
            if (!start) continue;
            const dur = typeof p.duration === 'number' ? p.duration : Number(p.duration);
            const end = dur > 0 ? new Date(new Date(start).getTime() + dur * 1000).toISOString() : toIso(p.endTime);
            out.push({ title: str(p.title) || 'Ohne Titel', subtitle: str(p.detailedDescription).slice(0, 120) || null, start, end });
          }
          out.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
          resolve(out);
        },
        (e) => reject(new Error('getProgramList: ' + e.message)),
        hours * 3600,
      );
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
}
