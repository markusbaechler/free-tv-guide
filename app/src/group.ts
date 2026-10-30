import type { GuideEvent, Kind, Sport } from '../../pipeline/types.ts';
import { addDaysKey, dayKey } from './format.ts';

export interface EventGroup {
  key: string;
  sport: Sport;
  competition: string;
  competitionName: string;
  kind: Kind;
  start: string;
  end: string;
  /** Anzeige-Event (bevorzugter Sender) */
  primary: GuideEvent;
  /** Dasselbe Spiel auf weiteren Sendern */
  others: GuideEvent[];
}

/** Gleiches Spiel auf mehreren Sendern: gleicher Wettbewerb, gleiche Art, Start max. 45 Min. auseinander
 *  (RSI steigt oft später ein, z. B. F1-Qualifying SRF 21:55 / RSI 22:30) */
const SAME_EVENT_WINDOW_MS = 45 * 60 * 1000;

export function groupEvents(events: GuideEvent[], priority: string[]): EventGroup[] {
  const rank = (ch: string) => {
    const i = priority.indexOf(ch);
    return i === -1 ? priority.length : i;
  };
  const sorted = events.slice().sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  const groups: Array<{ members: GuideEvent[] }> = [];

  for (const e of sorted) {
    const t = new Date(e.start).getTime();
    let target: { members: GuideEvent[] } | null = null;
    for (let i = groups.length - 1; i >= 0; i--) {
      const g = groups[i]!;
      const first = g.members[0]!;
      if (t - new Date(first.start).getTime() > SAME_EVENT_WINDOW_MS) break;
      if (first.competition !== e.competition || first.kind !== e.kind) continue;
      if (g.members.some((m) => m.channel === e.channel)) continue;
      target = g;
      break;
    }
    if (target) target.members.push(e);
    else groups.push({ members: [e] });
  }

  return groups.map((g) => {
    const members = g.members.slice().sort((a, b) => rank(a.channel) - rank(b.channel));
    const primary = members[0]!;
    const start = g.members[0]!.start;
    let end = primary.end;
    for (const m of members) if (m.end > end) end = m.end;
    return {
      key: primary.id,
      sport: primary.sport,
      competition: primary.competition,
      competitionName: primary.competitionName,
      kind: primary.kind,
      start,
      end,
      primary,
      others: members.slice(1),
    };
  });
}

// Sportart-Präfixe der Sender («Fussball – », «Calcio: », «Automobilismo: Formula Uno 2026 - »)
const PREFIX = /^(fussball|football|calcio|eishockey|hockey su ghiaccio|hockey sur glace|motorrad|automobilismo|automobilisme|motomondiale \d{4}|formel 1|formula uno \d{4})\s*[–:-]\s*/i;

// «Super League 12. Runde, FC Luzern – FC Sion»: Rundenangabe vor dem Komma
const ROUND = /(league|liga|runde|spieltag|journ[ée]e|giornata|tour|vorrunde|gruppe|final)/i;

function split(e: GuideEvent): { title: string; round: string | null } {
  let t = e.title;
  for (let i = 0; i < 2; i++) t = t.replace(PREFIX, '');
  t = t.replace(/\s*\((r|w)\)\s*$/i, '').replace(/\s+Männer\b/g, '');
  const comma = t.indexOf(', ');
  if (comma > 0 && ROUND.test(t.slice(0, comma))) return { title: t.slice(comma + 2), round: t.slice(0, comma) };
  return { title: t, round: null };
}

/** Titel ohne Sportart-Präfix, Rundenangabe und «(R)» */
export function displayTitle(e: GuideEvent): string {
  return split(e).title;
}

/** Untertitel; die abgetrennte Rundenangabe kommt nach vorne */
export function displaySubtitle(e: GuideEvent): string | null {
  const round = split(e).round;
  let s = e.subtitle;
  // Lange Beschreibungstexte nicht als Untertitel zeigen
  if (!s || s === 'Not available' || s.length > 90) s = null;
  if (round && s) return round + ' · ' + s;
  return round || s;
}

export type Period = 'today' | 'tomorrow' | 'week';
export type SportFilter = Sport | 'all';

export interface Filter {
  sport: SportFilter;
  period: Period;
  /** Highlights und Wiederholungen anzeigen */
  secondary: boolean;
}

export function applyFilter(groups: EventGroup[], f: Filter, now: Date): EventGroup[] {
  const today = dayKey(now);
  const nowIso = now.toISOString();
  return groups.filter((g) => {
    if (g.end <= nowIso) return false;
    if (f.sport !== 'all' && g.sport !== f.sport) return false;
    if (!f.secondary && g.kind !== 'live') return false;
    const day = dayKey(g.start);
    const running = g.start <= nowIso;
    if (f.period === 'today') return day === today || running;
    if (f.period === 'tomorrow') return day === addDaysKey(today, 1);
    return true;
  });
}

export function isRunning(g: { start: string; end: string }, now: Date): boolean {
  const n = now.toISOString();
  return g.start <= n && g.end > n;
}
