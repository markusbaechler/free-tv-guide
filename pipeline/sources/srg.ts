// SRG SSR EPG API v3 (developer.srgssr.ch, Produkt «SRG SSR PUBLIC API V2»)
//   Token:  POST https://api.srgssr.ch/oauth/v1/accesstoken?grant_type=client_credentials  (Basic Auth)
//   EPG:    GET  https://api.srgssr.ch/epg/v3/{bu}/tv/stations/{station}?date=YYYY-MM-DD
// Antwort laut OpenAPI 3.0.8: Array von { title, shortDescription, longDescription, dateTimes{startTime,endTime},
// isLive, replica, … }. Tatsächlich zusätzlich: subTitle, genre (String), repetitionDescription. Trotzdem defensiv gelesen; Struktur in debug/srg-shape.json.

import type { Program } from '../types.ts';
import { toUtc } from '../time.ts';

const BASE = 'https://api.srgssr.ch';
const TIMEOUT_MS = 30_000;
const UA = 'free-tv-guide (private, non-commercial; github.com/markusbaechler/free-tv-guide)';

export class SrgError extends Error {
  status: number | null;
  constructor(message: string, status: number | null) {
    super(message);
    this.status = status;
  }
}

async function request(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
      // Unbekannte Pfade beantwortet das Gateway mit 302 auf das Portal statt 404
      if (res.status >= 300 && res.status < 400) {
        throw new SrgError(`Gateway-Redirect ${res.status} für ${new URL(url).pathname} – Basispfad geändert?`, res.status);
      }
      if (res.status === 429 || res.status >= 500) {
        last = new SrgError(`HTTP ${res.status} für ${new URL(url).pathname}`, res.status);
        await sleep(2000 * 2 ** i);
        continue;
      }
      return res;
    } catch (e) {
      if (e instanceof SrgError && e.status !== null && e.status < 400) throw e;
      last = e;
      await sleep(2000 * 2 ** i);
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function getToken(clientId: string, clientSecret: string): Promise<string> {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await request(`${BASE}/oauth/v1/accesstoken?grant_type=client_credentials`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': UA,
    },
  });
  if (res.status === 401 || res.status === 403) {
    throw new SrgError(`Token abgelehnt (HTTP ${res.status}) – SRG_CLIENT_ID/SRG_CLIENT_SECRET prüfen`, res.status);
  }
  if (!res.ok) throw new SrgError(`Token-Anfrage fehlgeschlagen (HTTP ${res.status})`, res.status);
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new SrgError('Token-Antwort ohne access_token', res.status);
  return data.access_token;
}

export async function fetchDay(token: string, bu: string, station: string, date: string): Promise<unknown> {
  const url = `${BASE}/epg/v3/${bu}/tv/stations/${encodeURIComponent(station)}?date=${date}`;
  const res = await request(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': UA },
  });
  if (!res.ok) throw new SrgError(`EPG ${bu}/${station}/${date}: HTTP ${res.status}`, res.status);
  return res.json();
}

// ---------- Normalisierung ----------

function str(v: unknown): string | null {
  if (typeof v === 'string') {
    // RTS liefert <br> im Text, RSI Zeilenumbrüche ohne Leerzeichen
    const t = v.replace(/<br\s*\/?>/gi, ' · ').replace(/<[^>]+>/g, '').replace(/\s*[\r\n]+\s*/g, ' · ').replace(/\s+/g, ' ').trim();
    return t === '' ? null : t;
  }
  return null;
}

/** Genre kann String, Objekt mit name/title oder Liste davon sein */
function genreText(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return str(v);
  if (Array.isArray(v)) {
    const parts = v.map(genreText).filter((x): x is string => x !== null);
    return parts.length ? parts.join(' · ') : null;
  }
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const own = str(o.name) ?? str(o.title) ?? str(o.label) ?? str(o.value);
    const sub = genreText(o.subGenre ?? o.subgenre ?? o.subGenres ?? o.children);
    return [own, sub].filter(Boolean).join(' · ') || null;
  }
  return null;
}

function bool(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}

export function extractPrograms(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    const o = payload as Record<string, unknown>;
    for (const k of ['programs', 'programList', 'items', 'data']) {
      if (Array.isArray(o[k])) return o[k] as unknown[];
    }
  }
  return [];
}

export function normalizeProgram(raw: unknown, channel: string): Program | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, any>;
  const dt = (o.dateTimes && typeof o.dateTimes === 'object' ? o.dateTimes : {}) as Record<string, unknown>;
  const start = toUtc(dt.startTime ?? o.startTime ?? o.start ?? o.date);
  const title = str(o.title) ?? str(o.name);
  if (!start || !title) return null;
  return {
    channel,
    start,
    end: toUtc(dt.endTime ?? o.endTime ?? o.end),
    title,
    subtitle: str(o.subTitle) ?? str(o.subtitle) ?? str(o.episodeTitle) ?? str(o.shortDescription),
    description: (str(o.longDescription) ?? str(o.description) ?? str(o.lead) ?? '').slice(0, 300) || null,
    genre: genreText(o.genre ?? o.genres ?? o.category ?? o.categories ?? o.contentClassification),
    live: bool(o.isLive) ?? bool(o.live) ?? bool(o.liveBroadcast),
    rerun: bool(o.replica) ?? bool(o.isRerun) ?? bool(o.rerun) ?? (str(o.repetitionDescription) ? true : null),
  };
}

/** Fehlende Endzeiten aus dem Start der Folgesendung ergänzen (Liste pro Sender, sortiert) */
export function fillEndTimes(programs: Program[]): Program[] {
  const sorted = [...programs].sort((a, b) => a.start.localeCompare(b.start));
  return sorted.map((p, i) => {
    if (p.end) return p;
    const next = sorted[i + 1];
    return { ...p, end: next ? next.start : null };
  });
}

/** Feldstruktur (nur Namen und Typen, keine Inhalte) für die Regelpflege */
export function shapeOf(v: unknown, depth = 0): unknown {
  if (depth > 3) return typeof v;
  if (Array.isArray(v)) return v.length ? [shapeOf(v[0], depth + 1)] : [];
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) out[k] = shapeOf(val, depth + 1);
    return out;
  }
  return v === null ? 'null' : typeof v;
}
