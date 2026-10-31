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
}

export interface Channel {
  id: string;
  name: string;
  country: 'CH' | 'DE' | 'AT';
  epg: string | null;
  /** srg = in der App (Pillarbox), joyn/zattoo = externe App */
  app: 'srg' | 'joyn' | 'zattoo';
  /** Startparameter für die externe App (PAYLOAD), null = nur öffnen */
  deeplink: string | null;
  verified: boolean;
  /** Offizieller SRG-Livestream (URN für den Pillarbox-Player), null = nicht in der App abspielbar */
  live?: { urn: string } | null;
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
  source: 'srg-epg' | 'manual';
}

export interface Classification {
  competition: string;
  kind: Kind;
}
