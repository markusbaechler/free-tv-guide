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
  /**
   * srg    = in der App über SRG-API-URN (Pillarbox)
   * direct = in der App über den offiziellen Livestream des Senders (Adresse aus channels.yaml)
   * sat    = Sat-/DVB-Tuner des Fernsehers (tizen.tvchannel), Zuordnung über Sendernamen der Tuner-Liste
   * joyn/zattoo = externe App
   */
  app: 'srg' | 'joyn' | 'zattoo' | 'direct' | 'sat';
  /** Nur app=sat: Namen in der Tuner-Senderliste, bevorzugte zuerst (HD vor SD) */
  sat?: { names: string[] } | null;
  /** Nur app=sat: externe App, falls der Sender im Tuner fehlt */
  fallback?: 'joyn' | 'zattoo' | null;
  /** Nur app=direct: offizieller Livestream des Senders, wie auf seiner Website */
  stream?: { url: string; type: 'hls' | 'dash'; source: string; checked: string } | null;
  /** Startparameter für die externe App (PAYLOAD), null = nur öffnen */
  deeplink: string | null;
  verified: boolean;
  /** In der App abspielbar: SRG-URN oder direkte Stream-Adresse. null = nur externe App */
  live?: LiveSource | null;
}

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
  source: 'srg-epg' | 'manual';
}

export interface Classification {
  competition: string;
  kind: Kind;
}
