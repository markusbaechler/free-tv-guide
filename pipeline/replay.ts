// Nachsehen: vergangene Sendungen der Sender mit `replay: true`, deren SRG-EPG eine Video-URN (vodUrn) nennt.
// Die App spielt die URN mit Pillarbox ab, genau wie die Livestreams; ob die Sendung (noch) abrufbar ist,
// entscheidet die SRG beim Abspielen (Rechte, Ablaufdatum, Geoblocking Schweiz).

import type { Program, ReplayEntry } from './types.ts';

export const REPLAY_DAYS = 7;

/** Sendungen, die vor `nowIso` geendet haben und ab `fromIso` begonnen haben, neueste zuerst, je Sender */
export function buildReplay(programs: Program[], replayChannels: Set<string>, nowIso: string, fromIso: string): Record<string, ReplayEntry[]> {
  const out: Record<string, ReplayEntry[]> = {};
  const seen = new Set<string>();
  for (const p of programs) {
    if (!replayChannels.has(p.channel) || !p.vodUrn) continue;
    const end = p.end ?? p.start;
    if (end > nowIso || p.start < fromIso) continue;
    // Gleiche Sendung zweimal im EPG (Tagesgrenze im Cache) nur einmal
    const key = p.channel + '|' + p.start + '|' + p.vodUrn;
    if (seen.has(key)) continue;
    seen.add(key);
    (out[p.channel] ??= []).push({ title: p.title, subtitle: p.subtitle, start: p.start, end: p.end, urn: p.vodUrn });
  }
  for (const list of Object.values(out)) list.sort((a, b) => b.start.localeCompare(a.start));
  return out;
}

/**
 * Vergangenen Tag neu laden? Die SRG trägt die Video-URN oft erst nach der Ausstrahlung ein.
 * Gestern: bei jedem Lauf. Ältere Tage: höchstens alle `maxAgeH` Stunden. Cache ohne URN-Feld (vor 0.14): neu laden.
 */
export function needsPastFetch(date: string, yesterday: string, cache: { fetchedAt: string; programs: Program[] } | null, nowMs: number, maxAgeH: number): boolean {
  if (!cache) return true;
  if (date >= yesterday) return true;
  if (cache.programs.length && !cache.programs.some((p) => 'vodUrn' in p)) return true;
  return nowMs - new Date(cache.fetchedAt).getTime() > maxAgeH * 3600_000;
}
