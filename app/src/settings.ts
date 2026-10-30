// Zentrale Einstellungen der TV-App.

/** Datenquelle (Branch «data»). In der Vorschau überschreibbar mit ?data=<url> */
export const DATA_BASE = 'https://raw.githubusercontent.com/markusbaechler/free-tv-guide/data/';

/** Daten alle 15 Minuten neu laden, Anzeige jede Minute aktualisieren */
export const REFRESH_DATA_MS = 15 * 60 * 1000;
export const REFRESH_VIEW_MS = 60 * 1000;

/** Bevorzugte Reihenfolge, wenn ein Spiel auf mehreren SRG-Sendern läuft (Deutsch zuerst) */
export const CHANNEL_PRIORITY = ['srf2', 'srf1', 'srfinfo', 'rts2', 'rts1', 'rsila2', 'rsila1'];

/**
 * Wiedergabe-Apps. Die Tizen-App-IDs werden in Phase 4 am TV ermittelt
 * (sdb shell 0 vd_applist) und hier eingetragen. null = noch nicht verknüpft.
 */
export interface PlayerApp {
  name: string;
  tizenId: string | null;
}

/** Nur noch für Sender ohne SRG-Livestream (ARD, ZDF, RTL …). SRG-Sender spielt die App selbst ab. */
export const PLAYERS: { zattoo: PlayerApp } = {
  zattoo: { name: 'Zattoo', tizenId: null },
};
