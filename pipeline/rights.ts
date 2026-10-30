import type { CompetitionRight, GuideEvent, Kind } from './types.ts';
import { zurichDate } from './time.ts';

export type RightsDecision = { ok: true; right: CompetitionRight } | { ok: false; reason: string };

/** Prüft, ob ein Event laut rights.yaml frei empfangbar ist. */
export function checkRights(
  rights: Map<string, CompetitionRight>,
  competition: string,
  channel: string,
  startUtc: string,
): RightsDecision {
  const right = rights.get(competition);
  if (!right) return { ok: false, reason: `Wettbewerb ${competition} nicht in rights.yaml` };
  if (!right.channels.includes(channel)) return { ok: false, reason: `${channel} hat keine Free-Rechte für ${competition}` };
  const day = zurichDate(new Date(startUtc));
  if (day < right.validFrom || day > right.validUntil) {
    return { ok: false, reason: `${competition}: ${day} ausserhalb ${right.validFrom}–${right.validUntil}` };
  }
  return { ok: true, right };
}

export function buildEvent(args: {
  right: CompetitionRight;
  channel: string;
  title: string;
  subtitle: string | null;
  kind: Kind;
  start: string;
  end: string;
  source: GuideEvent['source'];
}): GuideEvent {
  const stamp = args.start.slice(0, 16).replace(/[-:T]/g, '');
  return {
    id: `${args.channel}-${stamp}`,
    sport: args.right.sport,
    competition: args.right.id,
    competitionName: args.right.name,
    title: args.title,
    subtitle: args.subtitle,
    kind: args.kind,
    start: args.start,
    end: args.end,
    channel: args.channel,
    reception: args.right.reception,
    source: args.source,
  };
}
