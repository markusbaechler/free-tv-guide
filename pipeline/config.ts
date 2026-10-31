import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { Channel, ChannelSource, CompetitionRight, ManualEvent, Rules, Sport } from './types.ts';

const SPORTS: Sport[] = ['football', 'icehockey', 'motorsport'];

function readYaml(dir: string, file: string): any {
  return parse(readFileSync(join(dir, file), 'utf8'));
}

function fail(file: string, msg: string): never {
  throw new Error(`config/${file}: ${msg}`);
}

/** YAML-Datum (String oder Date) → "YYYY-MM-DD" */
function toDateString(v: unknown, file: string, field: string): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return fail(file, `${field} muss ein Datum YYYY-MM-DD sein, ist ${JSON.stringify(v)}`);
}

function regexList(v: unknown, file: string, field: string): RegExp[] {
  if (v == null) return [];
  if (!Array.isArray(v)) fail(file, `${field} muss eine Liste sein`);
  return v.map((p) => {
    if (typeof p !== 'string') fail(file, `${field}: Muster muss ein String sein`);
    try {
      return new RegExp(p, 'iu');
    } catch (e) {
      return fail(file, `${field}: ungültige Regex ${JSON.stringify(p)} (${(e as Error).message})`);
    }
  });
}

/** Reihenfolge der Favoriten (Standardansicht); alle IDs müssen Sender sein */
export function loadFavorites(dir: string, channelIds: Set<string>): string[] {
  const file = 'channels.yaml';
  const doc = readYaml(dir, file);
  const fav: unknown = doc?.favorites ?? [];
  if (!Array.isArray(fav)) fail(file, 'favorites muss eine Liste sein');
  const out = fav.map(String);
  for (const id of out) if (!channelIds.has(id)) fail(file, `favorites: unbekannter Sender ${id}`);
  if (new Set(out).size !== out.length) fail(file, 'favorites: doppelter Eintrag');
  return out;
}

export function loadChannels(dir: string): Channel[] {
  const file = 'channels.yaml';
  const doc = readYaml(dir, file);
  if (!Array.isArray(doc?.channels)) fail(file, 'channels fehlt');
  const seen = new Set<string>();
  return doc.channels.map((c: any): Channel => {
    const id = String(c.id);
    if (seen.has(id)) fail(file, `doppelte id ${id}`);
    seen.add(id);
    if (!['CH', 'DE', 'AT'].includes(c.country)) fail(file, `${id}: country ungültig`);
    if (c.epg != null && !/^srg:(srf|rts|rsi):[A-Za-z0-9_-]+$/.test(c.epg)) fail(file, `${id}: epg ungültig`);
    if (!Array.isArray(c.sources) || !c.sources.length) fail(file, `${id}: sources (Empfangswege in Prioritätsreihenfolge) fehlt`);
    const sources: ChannelSource[] = c.sources.map((raw: any, i: number): ChannelSource => {
      const src = typeof raw === 'string' ? { kind: raw } : raw ?? {};
      const where = `${id}: sources[${i}]`;
      switch (src.kind) {
        case 'srg':
        case 'joyn':
        case 'zattoo':
          return { kind: src.kind };
        case 'direct':
          if (!/^https:\/\/[^\s]+$/.test(String(src.url))) fail(file, `${where}: url muss eine https-Adresse sein`);
          if (!['hls', 'dash'].includes(src.type)) fail(file, `${where}: type muss hls oder dash sein`);
          if (!/^https:\/\//.test(String(src.source))) fail(file, `${where}: source (Live-Seite des Senders) fehlt`);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(String(src.checked))) fail(file, `${where}: checked (Prüfdatum) fehlt`);
          return { kind: 'direct', url: String(src.url), type: src.type, source: String(src.source), checked: String(src.checked) };
        case 'sat':
          if (!Array.isArray(src.names) || !src.names.length) fail(file, `${where}: names (Sendernamen im Tuner) fehlt`);
          return { kind: 'sat', names: src.names.map(String) };
        default:
          return fail(file, `${where}: kind muss srg, direct, sat, joyn oder zattoo sein`);
      }
    });
    if (sources.filter((x) => x.kind === 'srg').length > 1) fail(file, `${id}: srg höchstens einmal`);
    return {
      id,
      name: String(c.name),
      country: c.country,
      epg: c.epg ?? null,
      sources,
      deeplink: c.deeplink == null ? null : String(c.deeplink),
      verified: c.verified === true,
    };
  });
}

export function loadRights(dir: string, channelIds: Set<string>): Map<string, CompetitionRight> {
  const file = 'rights.yaml';
  const doc = readYaml(dir, file);
  const comps = doc?.competitions;
  if (!comps || typeof comps !== 'object') fail(file, 'competitions fehlt');
  const out = new Map<string, CompetitionRight>();
  for (const [id, c] of Object.entries<any>(comps)) {
    if (!SPORTS.includes(c.sport)) fail(file, `${id}: sport ungültig`);
    if (!['ok', 'uncertain'].includes(c.reception)) fail(file, `${id}: reception ungültig`);
    // Listen dürfen YAML-Anker enthalten ([sat1, *srg]) → flach machen
    const channels: string[] = [c.channels].flat(3).map(String);
    for (const ch of channels) {
      if (!channelIds.has(ch)) fail(file, `${id}: unbekannter Sender ${ch}`);
    }
    out.set(id, {
      id,
      name: String(c.name),
      sport: c.sport,
      channels: [...new Set(channels)],
      validFrom: toDateString(c.validFrom, file, `${id}.validFrom`),
      validUntil: toDateString(c.validUntil, file, `${id}.validUntil`),
      reception: c.reception,
    });
  }
  return out;
}

export function loadRules(dir: string, competitionIds: Set<string>): Rules {
  const file = 'rules.yaml';
  const doc = readYaml(dir, file);
  if (!Array.isArray(doc?.competitions)) fail(file, 'competitions fehlt');
  return {
    exclude: regexList(doc.exclude, file, 'exclude'),
    highlights: regexList(doc.highlights, file, 'highlights'),
    replay: regexList(doc.replay, file, 'replay'),
    sportHints: regexList(doc.sportHints, file, 'sportHints'),
    competitions: doc.competitions.map((r: any, i: number) => {
      if (!competitionIds.has(r.id)) fail(file, `competitions[${i}]: ${r.id} fehlt in rights.yaml`);
      const patterns = regexList(r.patterns, file, `${r.id}.patterns`);
      if (patterns.length === 0) fail(file, `${r.id}: patterns leer`);
      return { id: r.id, patterns, requireAny: regexList(r.requireAny, file, `${r.id}.requireAny`) };
    }),
  };
}

export function loadManualEvents(dir: string): ManualEvent[] {
  const file = 'manual_events.yaml';
  const doc = readYaml(dir, file);
  const list = doc?.events ?? [];
  if (!Array.isArray(list)) fail(file, 'events muss eine Liste sein');
  return list.map((e: any, i: number): ManualEvent => {
    for (const k of ['competition', 'title', 'channel', 'start']) {
      if (typeof e?.[k] !== 'string' || e[k] === '') fail(file, `events[${i}].${k} fehlt`);
    }
    if (e.kind != null && !['live', 'highlights', 'replay'].includes(e.kind)) fail(file, `events[${i}].kind ungültig`);
    return { competition: e.competition, title: e.title, channel: e.channel, start: e.start, end: e.end, kind: e.kind };
  });
}
