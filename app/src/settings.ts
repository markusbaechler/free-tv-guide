// Zentrale Einstellungen der TV-App.

/** Datenquelle (Branch «data»). In der Vorschau überschreibbar mit ?data=<url> */
export const DATA_BASE = 'https://raw.githubusercontent.com/markusbaechler/free-tv-guide/data/';

/** Daten alle 15 Minuten neu laden, Anzeige jede Minute aktualisieren */
export const REFRESH_DATA_MS = 15 * 60 * 1000;
export const REFRESH_VIEW_MS = 60 * 1000;

/** Bevorzugte Reihenfolge, wenn ein Spiel auf mehreren SRG-Sendern läuft (Deutsch zuerst) */
export const CHANNEL_PRIORITY = ['srf2', 'srf1', 'srfinfo', 'rts2', 'rts1', 'rsila2', 'rsila1'];

/**
 * Wiedergabe-Apps. Tizen-App-IDs am QE75Q70R ausgelesen (Apps2Samsung, 31.10.2026).
 * null = noch nicht verknüpft.
 */
export interface PlayerApp {
  name: string;
  tizenId: string | null;
}

/** Externe Apps für Sender ohne SRG-Livestream. SRG-Sender spielt die App selbst ab. */
export const PLAYERS: { joyn: PlayerApp; zattoo: PlayerApp } = {
  joyn: { name: 'Joyn', tizenId: '2200MKoe7c.ZAPPNTV' },
  zattoo: { name: 'Zattoo', tizenId: 'QZf9YjXnoV.Zattoo' },
};

/** Hinweis im Dialog, je nach App */
export const PLAYER_NOTE: { joyn: string; zattoo: string } = {
  joyn: 'Läuft in der Joyn-App: gratis, ohne Zeitlimit, mit kurzen Werbespots vor dem Stream.',
  zattoo: 'Läuft nur über Zattoo Free: mit Werbung beim Umschalten und höchstens 10 Stunden pro Monat am TV.',
};
