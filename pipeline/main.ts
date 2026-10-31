// Datenpipeline: EPG laden → klassifizieren → gegen Free-Rechte filtern → JSON für die TV-App.
// Ausgabe nach OUT_DIR (Standard: ./out). Der Workflow veröffentlicht diesen Ordner im Branch «data».

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadChannels, loadManualEvents, loadRights, loadRules } from './config.ts';
import { classify, isUnclassifiedSport } from './classify.ts';
import { buildEvent, checkRights } from './rights.ts';
import { extractPrograms, fetchDay, fillEndTimes, getToken, normalizeProgram, shapeOf, SrgError } from './sources/srg.ts';
import { fetchLivestreams, matchChannel, type LiveStream } from './sources/srg-live.ts';
import { addDays, zurichDate, zurichLocalToUtc } from './time.ts';
import type { Channel, GuideEvent, Program } from './types.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG_DIR = join(ROOT, 'config');
const OUT_DIR = process.env.OUT_DIR ?? join(ROOT, 'out');
const DAYS = Number(process.env.DAYS ?? 8); // heute + 7
const EPG_HOURS = 36; // «Jetzt/Danach»-Fenster für epg.json
const CACHE_MAX_AGE_H = 20; // Tage ab übermorgen nur einmal täglich neu laden (API-Kontingent schonen)
const DEFAULT_MANUAL_DURATION_MIN = 150;

type SrgStatus = 'ok' | 'partial' | 'missing-credentials' | 'auth-error' | 'error';

interface CacheEntry {
  fetchedAt: string;
  programs: Program[];
}

const now = new Date();
const today = zurichDate(now);
const warnings: string[] = [];

function writeJson(rel: string, data: unknown): void {
  const file = join(OUT_DIR, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, rel.startsWith('debug/') || rel === 'meta.json' ? 2 : 0) + '\n');
}

function cachePath(channel: string, date: string): string {
  return join(OUT_DIR, 'cache', 'srg', channel, `${date}.json`);
}

function readCache(channel: string, date: string): CacheEntry | null {
  try {
    return JSON.parse(readFileSync(cachePath(channel, date), 'utf8')) as CacheEntry;
  } catch {
    return null;
  }
}

function pruneCache(): void {
  const base = join(OUT_DIR, 'cache', 'srg');
  if (!existsSync(base)) return;
  const oldest = addDays(today, -1);
  for (const ch of readdirSync(base)) {
    const dir = join(base, ch);
    if (!statSync(dir).isDirectory()) continue;
    for (const f of readdirSync(dir)) {
      if (f.replace('.json', '') < oldest) rmSync(join(dir, f));
    }
  }
}

function needsFetch(date: string, cache: CacheEntry | null): boolean {
  if (!cache) return true;
  if (date <= addDays(today, 1)) return true;
  return now.getTime() - new Date(cache.fetchedAt).getTime() > CACHE_MAX_AGE_H * 3600_000;
}

async function loadSrg(channels: Channel[]): Promise<{ programs: Program[]; status: SrgStatus; fetched: number; cached: number; failed: number; token: string | null }> {
  const srgChannels = channels.filter((c) => c.epg?.startsWith('srg:'));
  const dates = Array.from({ length: DAYS }, (_, i) => addDays(today, i));
  const id = process.env.SRG_CLIENT_ID;
  const secret = process.env.SRG_CLIENT_SECRET;

  let token: string | null = null;
  let status: SrgStatus = 'ok';
  if (!id || !secret) {
    status = 'missing-credentials';
    warnings.push('SRG_CLIENT_ID/SRG_CLIENT_SECRET nicht gesetzt – nur Cache und manuelle Events.');
  } else {
    try {
      token = await getToken(id, secret);
    } catch (e) {
      status = e instanceof SrgError && (e.status === 401 || e.status === 403) ? 'auth-error' : 'error';
      warnings.push(`SRG-Token: ${(e as Error).message}`);
    }
  }

  const all: Program[] = [];
  const shapes: Record<string, unknown> = {};
  let fetched = 0;
  let cached = 0;
  let failed = 0;

  for (const ch of srgChannels) {
    const [, bu, station] = ch.epg!.split(':') as [string, string, string];
    const perChannel: Program[] = [];
    for (const date of dates) {
      const cache = readCache(ch.id, date);
      if (token && needsFetch(date, cache)) {
        try {
          const payload = await fetchDay(token, bu, station, date);
          if (!shapes[bu]) shapes[bu] = shapeOf(payload);
          const programs = extractPrograms(payload)
            .map((r) => normalizeProgram(r, ch.id))
            .filter((p): p is Program => p !== null);
          writeJson(`cache/srg/${ch.id}/${date}.json`, { fetchedAt: now.toISOString(), programs } satisfies CacheEntry);
          perChannel.push(...programs);
          fetched++;
          continue;
        } catch (e) {
          failed++;
          warnings.push(`${ch.id} ${date}: ${(e as Error).message}`);
        }
      }
      if (cache) {
        perChannel.push(...cache.programs);
        cached++;
      }
    }
    all.push(...fillEndTimes(perChannel));
  }

  if (Object.keys(shapes).length) writeJson('debug/srg-shape.json', shapes);
  if (status === 'ok' && failed > 0) status = fetched > 0 ? 'partial' : 'error';
  return { programs: all, status, fetched, cached, failed, token };
}

/** Livestream-URNs je Sender; bei Fehler die URNs aus dem letzten veröffentlichten Stand */
async function loadLivestreams(token: string | null, channels: Channel[]): Promise<{ ok: number; failed: number }> {
  let previous: Record<string, string> = {};
  try {
    const prev = JSON.parse(readFileSync(join(OUT_DIR, 'channels.json'), 'utf8')) as { channels: Channel[] };
    for (const c of prev.channels) if (c.live && c.live.urn) previous[c.id] = c.live.urn;
  } catch {
    previous = {};
  }
  const found: LiveStream[] = [];
  let failed = 0;
  if (token) {
    for (const bu of ['srf', 'rts', 'rsi']) {
      try {
        found.push(...(await fetchLivestreams(token, bu)));
      } catch (e) {
        failed++;
        warnings.push((e as Error).message);
      }
    }
  }
  const byChannel: Record<string, string> = {};
  for (const l of found) {
    const id = matchChannel(l.title);
    if (id && !byChannel[id]) byChannel[id] = l.urn;
  }
  let ok = 0;
  for (const c of channels) {
    // Erster Weg, den die App selbst abspielen kann: SRG-URN oder offizieller Livestream des Senders
    c.live = null;
    for (const s of c.sources) {
      if (s.kind === 'srg') {
        const urn = byChannel[c.id] ?? previous[c.id];
        if (urn) c.live = { urn };
      } else if (s.kind === 'direct') {
        c.live = { url: s.url, type: s.type };
      }
      if (c.live) break;
    }
    if (c.live) ok++;
  }
  writeJson('debug/livestreams.json', found.map((l) => ({ ...l, channel: matchChannel(l.title) })));
  return { ok, failed };
}

async function main(): Promise<void> {
  const channels = loadChannels(CONFIG_DIR);
  const channelIds = new Set(channels.map((c) => c.id));
  const rights = loadRights(CONFIG_DIR, channelIds);
  const rules = loadRules(CONFIG_DIR, new Set(rights.keys()));
  const manual = loadManualEvents(CONFIG_DIR);

  mkdirSync(OUT_DIR, { recursive: true });
  pruneCache();

  const srg = await loadSrg(channels);
  const live = await loadLivestreams(srg.token, channels);
  const nowIso = now.toISOString();
  const windowEnd = new Date(`${addDays(today, DAYS)}T00:00:00Z`).toISOString();

  const events = new Map<string, GuideEvent>();
  const rejected: Array<{ title: string; channel: string; start: string; reason: string }> = [];
  const unclassified: Array<{ title: string; subtitle: string | null; genre: string | null; channel: string; start: string }> = [];

  // --- EPG-Sendungen ---
  for (const p of srg.programs) {
    const end = p.end ?? new Date(new Date(p.start).getTime() + 2 * 3600_000).toISOString();
    if (end <= nowIso || p.start >= windowEnd) continue;
    const c = classify(p, rules);
    if (!c) {
      if (isUnclassifiedSport(p, rules)) unclassified.push({ title: p.title, subtitle: p.subtitle, genre: p.genre, channel: p.channel, start: p.start });
      continue;
    }
    const r = checkRights(rights, c.competition, p.channel, p.start);
    if (!r.ok) {
      rejected.push({ title: p.title, channel: p.channel, start: p.start, reason: r.reason });
      continue;
    }
    const ev = buildEvent({ right: r.right, channel: p.channel, title: p.title, subtitle: p.subtitle, kind: c.kind, start: p.start, end, source: 'srg-epg' });
    events.set(ev.id, ev);
  }

  // --- Manuelle Events ---
  for (const m of manual) {
    let start: string;
    let end: string;
    try {
      start = zurichLocalToUtc(m.start);
      end = m.end ? zurichLocalToUtc(m.end) : new Date(new Date(start).getTime() + DEFAULT_MANUAL_DURATION_MIN * 60000).toISOString();
    } catch (e) {
      warnings.push(`manual_events: ${(e as Error).message}`);
      continue;
    }
    if (end <= nowIso || start >= windowEnd) continue;
    if (!channelIds.has(m.channel)) {
      warnings.push(`manual_events: unbekannter Sender ${m.channel}`);
      continue;
    }
    const r = checkRights(rights, m.competition, m.channel, start);
    if (!r.ok) {
      rejected.push({ title: m.title, channel: m.channel, start, reason: r.reason });
      continue;
    }
    const ev = buildEvent({ right: r.right, channel: m.channel, title: m.title, subtitle: null, kind: m.kind ?? 'live', start, end, source: 'manual' });
    events.set(ev.id, ev); // manuell überschreibt EPG bei gleichem Sender + Startzeit
  }

  const eventList = [...events.values()].sort((a, b) => a.start.localeCompare(b.start) || a.channel.localeCompare(b.channel));

  // --- «Jetzt/Danach» pro Sender ---
  const epgEnd = new Date(now.getTime() + EPG_HOURS * 3600_000).toISOString();
  const epg: Record<string, Array<{ title: string; subtitle: string | null; start: string; end: string | null }>> = {};
  for (const p of srg.programs) {
    if ((p.end ?? p.start) <= nowIso || p.start >= epgEnd) continue;
    (epg[p.channel] ??= []).push({ title: p.title, subtitle: p.subtitle, start: p.start, end: p.end });
  }
  for (const list of Object.values(epg)) list.sort((a, b) => a.start.localeCompare(b.start));

  const bySport = { football: 0, icehockey: 0, motorsport: 0 };
  for (const e of eventList) bySport[e.sport]++;

  const meta = {
    generatedAt: nowIso,
    window: { from: today, days: DAYS },
    attribution: 'Programmdaten: SRG SSR (developer.srgssr.ch)',
    srg: { status: srg.status, fetchedDays: srg.fetched, cachedDays: srg.cached, failedDays: srg.failed },
    livestreams: { channels: live.ok, failedRequests: live.failed },
    counts: { events: eventList.length, bySport, manual: eventList.filter((e) => e.source === 'manual').length, unclassified: unclassified.length, rejected: rejected.length },
    warnings,
  };

  writeJson('events.json', { generatedAt: nowIso, events: eventList });
  writeJson('channels.json', { generatedAt: nowIso, channels });
  writeJson('epg.json', { generatedAt: nowIso, channels: epg });
  writeJson('meta.json', meta);
  writeJson('debug/unclassified.json', unclassified);
  writeJson('debug/rejected.json', rejected);

  console.log(`Events: ${eventList.length} (Fussball ${bySport.football}, Eishockey ${bySport.icehockey}, Motorsport ${bySport.motorsport})`);
  console.log(`SRG: ${srg.status} · geladen ${srg.fetched} · Cache ${srg.cached} · Fehler ${srg.failed}`);
  console.log(`Nicht klassifiziert (Sportbezug): ${unclassified.length} · abgelehnt: ${rejected.length}`);
  for (const w of warnings) console.log(`::warning::${w}`);
}

main().catch((e) => {
  console.error(`::error::${(e as Error).message}`);
  process.exit(1);
});
