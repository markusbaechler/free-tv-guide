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
  /** Nachsehen: Wiedergabe anhalten/fortsetzen, Sprung um Sekunden, Position/Dauer in Sekunden */
  togglePause(): boolean;
  seekBy(seconds: number): void;
  seekTo(seconds: number): void;
  position(): { pos: number; dur: number; paused: boolean };
  /** Diagnose: Stufe, Bandbreite, Puffer, Ruckler, Ereignisse (für ftgDiag am TV) */
  stats(): unknown;
  dispose(): void;
}

function create(elementId: string): PlayerHandle {
  // Keine Bedienelemente: gesteuert wird über die Fernbedienung
  const player = (pillarbox as unknown as (id: string, opts: object) => any)(elementId, {
    controls: false,
    autoplay: true,
    muted: false,
    fill: true,
    // Pillarbox-Qualitätsmonitoring aus: es wertet Fehler asynchron aus und greift dabei auf den Player zu,
    // den die App beim Wechsel auf den nächsten Empfangsweg bereits entsorgt hat (TypeError im Hintergrund).
    // Die SRG-Nutzungsmessung (srgAnalytics) bleibt an.
    trackers: { pillarboxMonitoring: false },
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
  // Ereignis-Protokoll für die Diagnose: Nachladen (waiting/stalled) unterscheidet Netz- von Decoder-Ruckeln
  const t0 = Date.now();
  const events: Array<[number, string, number]> = [];
  const counts: Record<string, number> = {};
  ['waiting', 'stalled', 'playing', 'seeking', 'seeked', 'error', 'loadedmetadata'].forEach((name) => {
    player.on(name, () => {
      counts[name] = (counts[name] || 0) + 1;
      events.push([Math.round((Date.now() - t0) / 100) / 10, name, Math.round((Number(player.currentTime()) || 0) * 10) / 10]);
      if (events.length > 60) events.shift();
    });
  });
  return {
    stats() {
      let vhs: any = null;
      try {
        vhs = player.tech({ IWillNotUseThisInPlugins: true }).vhs;
      } catch (e) {
        vhs = null;
      }
      const rend = (pl: any) => (pl && pl.attributes ? { res: pl.attributes.RESOLUTION ? pl.attributes.RESOLUTION.width + 'x' + pl.attributes.RESOLUTION.height : null, kbps: Math.round((pl.attributes.BANDWIDTH || 0) / 1000), fps: pl.attributes['FRAME-RATE'] || null, codecs: pl.attributes.CODECS || null } : null);
      let media: any = null;
      let all: any[] = [];
      try {
        media = rend(vhs.playlists.media());
        all = (vhs.playlists.main.playlists || []).map(rend);
      } catch (e) {
        media = null;
      }
      const ct = Number(player.currentTime()) || 0;
      let ahead = 0;
      try {
        const b = player.buffered();
        for (let i = 0; i < b.length; i++) if (b.start(i) <= ct + 0.5 && b.end(i) > ct) ahead = b.end(i) - ct;
      } catch (e) {
        ahead = 0;
      }
      let frames: any = null;
      try {
        const v = player.tech({ IWillNotUseThisInPlugins: true }).el() as any;
        const q = v.getVideoPlaybackQuality ? v.getVideoPlaybackQuality() : null;
        frames = q ? { dropped: q.droppedVideoFrames, total: q.totalVideoFrames } : { dropped: v.webkitDroppedFrameCount, total: v.webkitDecodedFrameCount };
      } catch (e) {
        frames = null;
      }
      const cur = player.currentSource ? player.currentSource() : null;
      const src = cur && cur.src ? String(cur.src) : '';
      return {
        type: cur ? cur.type : null,
        // Nur Host und Endung, keine Token aus der Adresse
        host: (/^https?:\/\/([^/]+)/.exec(src) || [])[1] || src.slice(0, 40),
        ext: (/\.(m3u8|mpd)/.exec(src) || [])[1] || null,
        vhs: !!vhs,
        rendition: media,
        renditions: all,
        bandwidthKbps: vhs ? Math.round((vhs.systemBandwidth || vhs.bandwidth || 0) / 1000) : null,
        bufferAhead: Math.round(ahead * 10) / 10,
        pos: Math.round(ct),
        frames,
        counts,
        events: events.slice(-25),
        sinceStartS: Math.round((Date.now() - t0) / 1000),
      };
    },
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
        const msg = err && err.message ? String(err.message) : 'Unbekannter Fehler';
        // Erst nach den übrigen Fehler-Empfängern von Pillarbox (Monitoring liest noch die Tonspur);
        // ein sofortiges dispose() beim Wechsel auf den nächsten Empfangsweg liesse sie ins Leere greifen
        window.setTimeout(() => cb(msg), 0);
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
    togglePause() {
      if (player.paused()) {
        const p = player.play();
        if (p && typeof p.catch === 'function') p.catch(() => undefined);
        return false;
      }
      player.pause();
      return true;
    },
    seekBy(seconds: number) {
      const dur = Number(player.duration()) || 0;
      const t = Math.max(0, (Number(player.currentTime()) || 0) + seconds);
      player.currentTime(dur > 0 ? Math.min(t, dur - 5) : t);
    },
    seekTo(seconds: number) {
      player.currentTime(Math.max(0, seconds));
    },
    position() {
      const dur = Number(player.duration());
      return { pos: Number(player.currentTime()) || 0, dur: isFinite(dur) ? dur : 0, paused: !!player.paused() };
    },
    dispose() {
      player.dispose();
    },
  };
}

(window as unknown as { ftgPlayer: { create: typeof create } }).ftgPlayer = { create };
