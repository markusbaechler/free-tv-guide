// Eigenes Bundle (dist/player.js), wird erst beim ersten Abspielen geladen, damit der Guide schnell startet.
// Wiedergabe über den offiziellen SRG-Player «Pillarbox» (video.js): SRG-Sender per URN aus der SRG-API
// (Pillarbox holt die Stream-Adresse selbst bei der SRG), übrige Sender über ihren offiziellen, frei
// zugänglichen Livestream (HLS/DASH ohne DRM). Geoblocking und DRM bleiben unangetastet.
import pillarbox from '@srgssr/pillarbox-web';

/** Quelle: SRG-URN (Pillarbox löst sie über die SRG-API auf) oder direkte Manifest-Adresse ohne DRM */
export interface PlaySource {
  urn?: string;
  url?: string;
  type?: 'hls' | 'dash';
}

interface PlayerHandle {
  play(src: PlaySource): void;
  onError(cb: (message: string) => void): void;
  onPlaying(cb: () => void): void;
  /** Aktuelle Bildgrösse des Streams, z. B. «1280×720», null solange unbekannt */
  quality(): string | null;
  dispose(): void;
}

function create(elementId: string): PlayerHandle {
  // Keine Bedienelemente: gesteuert wird über die Fernbedienung
  const player = (pillarbox as unknown as (id: string, opts: object) => any)(elementId, {
    controls: false,
    autoplay: true,
    muted: false,
    fill: true,
    html5: {
      vhs: {
        useForcedSubtitles: true,
        overrideNative: true,
        // Hohe Start-Bandbreitenschätzung: sofort die höchste Stufe statt mit 360p zu beginnen
        // (gemessene Bandbreite wird danach gemerkt; localStorage-Zugriffe sind in VHS abgesichert)
        bandwidth: 20000000,
        useBandwidthFromLocalStorage: true,
        limitRenditionByPlayerDimensions: false,
      },
    },
  });
  return {
    play(src: PlaySource) {
      if (src.urn) player.src({ src: src.urn, type: 'srgssr/urn' });
      else if (src.url) player.src({ src: src.url, type: src.type === 'dash' ? 'application/dash+xml' : 'application/x-mpegURL' });
      else return;
      const p = player.play();
      if (p && typeof p.catch === 'function') p.catch(() => undefined);
    },
    onError(cb) {
      player.on('error', () => {
        const err = player.error();
        cb(err && err.message ? String(err.message) : 'Unbekannter Fehler');
      });
    },
    onPlaying(cb) {
      player.on('playing', cb);
    },
    quality() {
      const w = Number(player.videoWidth && player.videoWidth()) || 0;
      const ht = Number(player.videoHeight && player.videoHeight()) || 0;
      return w && ht ? w + '×' + ht : null;
    },
    dispose() {
      player.dispose();
    },
  };
}

(window as unknown as { ftgPlayer: { create: typeof create } }).ftgPlayer = { create };
