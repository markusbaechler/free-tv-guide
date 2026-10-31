import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { Channel, CompetitionRight, ManualEvent, Rules, Sport } from './types.ts';

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
    if (!['srg', 'joyn', 'zattoo', 'direct', 'sat'].includes(c.app)) fail(file, `${id}: app muss srg, joyn, zattoo, direct oder sat sein`);
    let sat: Channel['sat'] = null;
    let fallback: Channel['fallback'] = null;
    if (c.app === 'sat') {
      if (!Array.isArray(c.sat?.names) || !c.sat.names.length) fail(file, `${id}: sat.names (Sendernamen im Tuner) fehlt`);
      sat = { names: c.sat.names.map(String) };
      if (c.fallback != null && !['joyn', 'zattoo'].includes(c.fallback)) fail(file, `${id}: fallback muss joyn oder zattoo sein`);
      fallback = c.fallback ?? null;
    } else if (c.sat || c.fallback) fail(file, `${id}: sat/fallback nur bei app: sat`);
    let stream: Channel['stream'] = null;
    if (c.app === 'direct') {
      const s = c.stream ?? {};
      if (!/^https:\/\/[^\s]+$/.test(String(s.url))) fail(file, `${id}: stream.url muss eine https-Adresse sein`);
      if (!['hls', 'dash'].includes(s.type)) fail(file, `${id}: stream.type muss hls oder dash sein`);
      if (!/^https:\/\//.test(String(s.source))) fail(file, `${id}: stream.source (Website des Senders) fehlt`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s.checked))) fail(file, `${id}: stream.checked (Prüfdatum) fehlt`);
      stream = { url: String(s.url), type: s.type, source: String(s.source), checked: String(s.checked) };
    } else if (c.stream) fail(file, `${id}: stream nur bei app: direct`);
    return {
      id,
      name: String(c.name),
      country: c.country,
      epg: c.epg ?? null,
      app: c.app,
      stream,
      sat,
      fallback,
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
