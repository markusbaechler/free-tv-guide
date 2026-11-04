export type Sport = 'football' | 'icehockey' | 'motorsport';
export type Kind = 'live' | 'highlights' | 'replay';
export type Reception = 'ok' | 'uncertain';

/** Normalisierte Sendung aus einer EPG-Quelle. Zeiten als ISO-UTC. */
export interface Program {
  channel: string;
  start: string;
  end: string | null;
  title: string;
  subtitle: string | null;
  description: string | null;
  genre: string | null;
  /** true/false, falls die Quelle ein Live-Flag liefert, sonst null */
  live: boolean | null;
  /** true = Wiederholung laut Quelle (SRG: `replica`), sonst false/null */
  rerun: boolean | null;
  /** SRG: Video-URN der Sendung zum Nachsehen (EPG-Feld `vodUrn`), sonst null */
  vodUrn?: string | null;
}

/** Sendung zum Nachsehen (replay.json) */
export interface ReplayEntry {
  title: string;
  subtitle: string | null;
  start: string;
  end: string | null;
  /** Video-URN für Pillarbox */
  urn: string;
}

export interface Channel {
  id: string;
  name: string;
  country: 'CH' | 'DE' | 'AT';
  epg: string | null;
  /**
   * Empfangswege in Prioritätsreihenfolge; die App nimmt den ersten, der funktioniert:
   * srg    = in der App über SRG-API-URN (Pillarbox)
   * direct = in der App über den offiziellen Livestream des Senders (Adresse aus channels.yaml)
   * sat    = Sat-/DVB-Tuner des Fernsehers (tizen.tvchannel), Zuordnung über Sendernamen der Tuner-Liste
   * joyn/zattoo = externe App
   */
  sources: ChannelSource[];
  /** Startparameter für die externe App (PAYLOAD), null = nur öffnen */
  deeplink: string | null;
  verified: boolean;
  /** true = vergangene Sendungen zum Nachsehen (SRG-EPG mit Video-URN, replay.json) */
  replay?: boolean;
  /** In der App abspielbar (erster srg-/direct-Weg): SRG-URN oder direkte Stream-Adresse. null = keiner */
  live?: LiveSource | null;
}

export type ChannelSource =
  | { kind: 'srg' }
  | { kind: 'direct'; url: string; type: 'hls' | 'dash'; source: string; checked: string }
  | { kind: 'sat'; names: string[] }
  | { kind: 'joyn' }
  | { kind: 'zattoo' };

export interface LiveSource {
  /** SRG: URN für Pillarbox */
  urn?: string;
  /** direct: Manifest-Adresse (HLS/DASH, ohne DRM) */
  url?: string;
  type?: 'hls' | 'dash';
}

export interface CompetitionRight {
  id: string;
  name: string;
  sport: Sport;
  channels: string[];
  validFrom: string;
  validUntil: string;
  reception: Reception;
}

export interface CompetitionRule {
  id: string;
  patterns: RegExp[];
  requireAny: RegExp[];
}

export interface Rules {
  exclude: RegExp[];
  highlights: RegExp[];
  replay: RegExp[];
  competitions: CompetitionRule[];
  sportHints: RegExp[];
}

export interface ManualEvent {
  competition: string;
  title: string;
  channel: string;
  start: string;
  end?: string;
  kind?: Kind;
}

export interface GuideEvent {
  id: string;
  sport: Sport;
  competition: string;
  competitionName: string;
  title: string;
  subtitle: string | null;
  kind: Kind;
  start: string;
  end: string;
  channel: string;
  reception: Reception;
  source: 'srg-epg' | 'manual' | 'sat-epg';
}

/** Regeln und Wettbewerbe für die App (rules.json): Regex als Quelltext, in der App mit Flags «iu» rekonstruiert */
export interface RulesJson {
  exclude: string[];
  highlights: string[];
  replay: string[];
  competitions: Array<{ id: string; patterns: string[]; requireAny: string[] }>;
  /** Muster mit Sportbezug (Diagnose: Sendungen, die Sport sind, aber keinem Wettbewerb zugeordnet wurden) */
  sportHints: string[];
  rights: Record<string, { name: string; sport: Sport; reception: Reception }>;
}

export interface Classification {
  competition: string;
  kind: Kind;
}
