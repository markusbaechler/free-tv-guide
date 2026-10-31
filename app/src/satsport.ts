// Sport-Erkennung für Programm aus dem Sat-Signal: gleiche Regeln wie die Pipeline (rules.json),
// angewendet in der App auf die DVB-EPG-Einträge der zugeordneten Sat-Sender.
// Keine Rechteprüfung je Sender: Was im Signal eines frei empfangbaren Senders steht, läuft dort auch.
import { classify, isUnclassifiedSport } from '../../pipeline/classify.ts';
import type { GuideEvent, Program, Rules, RulesJson } from '../../pipeline/types.ts';
import type { TunerEpgEntry } from './tuner.ts';

let cache: { json: RulesJson; rules: Rules } | null = null;

function toRegex(list: string[]): RegExp[] {
  const out: RegExp[] = [];
  for (const s of list) {
    try {
      out.push(new RegExp(s, 'iu'));
    } catch (e) {
      // Muster, das dieser Browser nicht kennt → überspringen
    }
  }
  return out;
}

function rulesFrom(json: RulesJson): Rules {
  if (cache && cache.json === json) return cache.rules;
  const rules: Rules = {
    exclude: toRegex(json.exclude),
    highlights: toRegex(json.highlights),
    replay: toRegex(json.replay),
    sportHints: toRegex(json.sportHints || []),
    competitions: json.competitions.map((c) => ({ id: c.id, patterns: toRegex(c.patterns), requireAny: toRegex(c.requireAny) })),
  };
  cache = { json, rules };
  return rules;
}

/** Diagnose: Titel mit Sportbezug ohne Wettbewerbs-Treffer (zeigt, welche Muster fehlen) */
export function unclassifiedSportTitles(json: RulesJson, entries: TunerEpgEntry[]): string[] {
  const rules = rulesFrom(json);
  const out: string[] = [];
  for (const e of entries) {
    const p: Program = { channel: '', start: e.start, end: e.end, title: e.title, subtitle: e.subtitle, description: null, genre: null, live: null, rerun: null };
    if (isUnclassifiedSport(p, rules)) out.push(e.title);
  }
  return out;
}

/** Sport-Events aus dem Sat-Programm eines Senders */
export function satEvents(json: RulesJson, channelId: string, entries: TunerEpgEntry[]): GuideEvent[] {
  const rules = rulesFrom(json);
  const out: GuideEvent[] = [];
  for (const e of entries) {
    if (!e.end) continue;
    const p: Program = { channel: channelId, start: e.start, end: e.end, title: e.title, subtitle: e.subtitle, description: null, genre: null, live: null, rerun: null };
    const c = classify(p, rules);
    if (!c) continue;
    const right = json.rights[c.competition];
    if (!right) continue;
    out.push({
      id: channelId + '-' + e.start.slice(0, 16).replace(/[-:T]/g, ''),
      sport: right.sport,
      competition: c.competition,
      competitionName: right.name,
      title: e.title,
      subtitle: e.subtitle,
      kind: c.kind,
      start: e.start,
      end: e.end,
      channel: channelId,
      reception: 'ok',
      source: 'sat-epg',
    });
  }
  return out;
}
