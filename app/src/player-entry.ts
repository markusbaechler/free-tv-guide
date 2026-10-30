// Eigenes Bundle (dist/player.js), wird erst beim ersten Abspielen geladen, damit der Guide schnell startet.
// Wiedergabe ausschliesslich über den offiziellen SRG-Player «Pillarbox» mit SRG-URNs aus der SRG-API.
// Pillarbox holt die Stream-Adresse selbst bei der SRG; Geoblocking und DRM bleiben unangetastet.
import pillarbox from '@srgssr/pillarbox-web';

interface PlayerHandle {
  play(urn: string): void;
  onError(cb: (message: string) => void): void;
  onPlaying(cb: () => void): void;
  dispose(): void;
}

function create(elementId: string): PlayerHandle {
  // Keine Bedienelemente: gesteuert wird über die Fernbedienung
  const player = (pillarbox as unknown as (id: string, opts: object) => any)(elementId, {
    controls: false,
    autoplay: true,
    muted: false,
    fill: true,
  });
  return {
    play(urn: string) {
      player.src({ src: urn, type: 'srgssr/urn' });
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
    dispose() {
      player.dispose();
    },
  };
}

(window as unknown as { ftgPlayer: { create: typeof create } }).ftgPlayer = { create };
