import type { Classification, Kind, Program, Rules } from './types.ts';

const any = (res: RegExp[], text: string) => res.some((r) => r.test(text));

/**
 * Ordnet eine Sendung einem Wettbewerb zu.
 * Wettbewerb und Ausschluss werden nur gegen Titel + Untertitel + Genre geprüft:
 * Beschreibungen erwähnen oft andere Sportarten («danach: Eishockey …»).
 * Liefert null, wenn keine Regel passt oder die Sendung ausgeschlossen ist.
 */
export function classify(p: Program, rules: Rules): Classification | null {
  const head = [p.title, p.subtitle, p.genre].filter(Boolean).join(' · ');
  if (any(rules.exclude, p.title)) return null;

  for (const rule of rules.competitions) {
    if (!any(rule.patterns, head)) continue;
    if (rule.requireAny.length > 0 && !any(rule.requireAny, head)) continue;
    return { competition: rule.id, kind: kindOf(p, rules) };
  }
  return null;
}

export function kindOf(p: Program, rules: Rules): Kind {
  const head = [p.title, p.subtitle].filter(Boolean).join(' · ');
  if (any(rules.highlights, head)) return 'highlights';
  if (any(rules.replay, head) || p.live === false) return 'replay';
  return 'live';
}

/** Sendungen mit Sportbezug, die keine Regel getroffen haben (für debug/unclassified.json) */
export function isUnclassifiedSport(p: Program, rules: Rules): boolean {
  if (any(rules.exclude, p.title)) return false;
  const head = [p.title, p.subtitle, p.genre].filter(Boolean).join(' · ');
  return any(rules.sportHints, head) && classify(p, rules) === null;
}
