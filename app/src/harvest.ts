// EPG-Sammlung («Harvester»): Der QE75Q70R hält das volle 7-Tage-Programm (DVB-EIT-Schedule) nur für den
// Transponder, auf den er zuletzt abgestimmt war; für alle anderen Sender liefert getProgramList nur jetzt/danach.
// Deshalb stimmt die App im Hintergrund – stumm, TV-Bild hinter der undurchsichtigen Seite – nacheinander je einen
// Sender jedes unverschlüsselten Transponders ab, wartet, bis der Fernseher die Programmtabellen eingesammelt hat,
// liest das Programm aller Sender des Transponders und stellt am Ende den vorherigen Sender und den Ton wieder her.
// Jede Benutzeraktion (Sat-Bild, Stream, Fremd-App) bricht die Sammlung ab; der Abbruch wartet auf das Aufräumen.
import {
  currentTunerChannel, hideTvWindow, isMuted, isScrambled, setMute, showTvWindow, transponderKey, tuneTo, tunerEpg,
  type TunerChannel, type TunerEpgEntry,
} from './tuner.ts';

export interface HarvestGroup {
  key: string;
  /** Sender der App auf diesem Transponder (App-ID + Tuner-Sender) */
  members: { id: string; ch: TunerChannel }[];
  /** Sender, auf den abgestimmt wird */
  tune: TunerChannel;
}

export interface HarvestStatus {
  running: boolean;
  /** Transponder gesamt / erledigt im laufenden oder letzten Durchgang */
  total: number;
  done: number;
  startedAt: number | null;
  finishedAt: number | null;
  aborted: boolean;
  log: string[];
}

export interface HarvestOptions {
  /** Wartezeit nach dem Abstimmen, bis der Fernseher die Programmtabellen hat (ms) */
  dwellMs: number;
  /** Höchstens so oft nachlesen, wenn ein Sender nur jetzt/danach liefert */
  maxRounds: number;
  /** Zeitfenster des Programms (Stunden) */
  hours: number;
  /** Ergebnis je Transponder, sofort nach dem Lesen */
  onGroup: (group: HarvestGroup, epg: Record<string, TunerEpgEntry[]>) => void;
  onProgress: () => void;
  /** Liste aller Tuner-Sender (um den vorherigen Sender zu finden) */
  list: TunerChannel[];
}

/** Sender nach Transponder gruppieren; verschlüsselte Transponder bleiben weg */
export function transponderGroups(matched: Record<string, TunerChannel>, ids: string[]): HarvestGroup[] {
  const groups: HarvestGroup[] = [];
  const byKey: Record<string, HarvestGroup> = {};
  for (const id of ids) {
    const ch = matched[id];
    if (!ch || isScrambled(ch)) continue;
    const key = transponderKey(ch);
    let g = byKey[key];
    if (!g) {
      g = byKey[key] = { key, members: [], tune: ch };
      groups.push(g);
    }
    g.members.push({ id, ch });
  }
  return groups;
}

export const harvestStatus: HarvestStatus = { running: false, total: 0, done: 0, startedAt: null, finishedAt: null, aborted: false, log: [] };

let current: Promise<void> | null = null;
let abortFlag = false;
let wake: (() => void) | null = null;

function log(line: string): void {
  harvestStatus.log = [new Date().toTimeString().slice(0, 8) + ' ' + line].concat(harvestStatus.log).slice(0, 12);
}

/** Abbrechbare Wartezeit */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (abortFlag) return resolve();
    const timer = window.setTimeout(() => {
      wake = null;
      resolve();
    }, ms);
    wake = () => {
      window.clearTimeout(timer);
      wake = null;
      resolve();
    };
  });
}

export const harvestActive = (): boolean => current !== null;

/** Sammlung abbrechen; das Versprechen erfüllt sich, sobald TV-Bild versteckt und Ton zurückgestellt sind */
export function stopHarvest(): Promise<void> {
  if (!current) return Promise.resolve();
  abortFlag = true;
  if (wake) wake();
  return current;
}

/** Sammlung starten (läuft höchstens einmal gleichzeitig) */
export function startHarvest(groups: HarvestGroup[], opts: HarvestOptions): Promise<void> {
  if (current) return current;
  if (!groups.length) return Promise.resolve();
  abortFlag = false;
  harvestStatus.running = true;
  harvestStatus.total = groups.length;
  harvestStatus.done = 0;
  harvestStatus.startedAt = Date.now();
  harvestStatus.finishedAt = null;
  harvestStatus.aborted = false;
  current = run(groups, opts).then(
    () => finish(),
    (e: Error) => {
      log('Fehler: ' + e.message);
      finish();
    },
  );
  return current;
}

function finish(): void {
  harvestStatus.running = false;
  harvestStatus.finishedAt = Date.now();
  harvestStatus.aborted = abortFlag;
  current = null;
}

function run(groups: HarvestGroup[], opts: HarvestOptions): Promise<void> {
  const prev = currentTunerChannel(opts.list);
  const wasMuted = isMuted();
  let windowShown = false;
  log('Start: ' + groups.length + ' Transponder' + (prev ? ', vorher ' + prev.name : ''));
  const muted = setMute(true);
  if (!muted) log('Stummschalten nicht möglich (tvaudiocontrol fehlt)');

  const cleanup = (): Promise<void> => {
    const restore = !abortFlag && prev ? tuneTo(prev).then(() => log('Zurück auf ' + prev.name), (e: Error) => log('Zurück nicht möglich: ' + e.message)) : Promise.resolve();
    return restore
      .then(() => (windowShown ? hideTvWindow() : Promise.resolve()))
      .then(() => {
        if (!wasMuted) setMute(false);
        log(abortFlag ? 'Abgebrochen' : 'Fertig');
        opts.onProgress();
      });
  };

  const readGroup = (g: HarvestGroup, round: number): Promise<void> => {
    if (abortFlag) return Promise.resolve();
    const epg: Record<string, TunerEpgEntry[]> = {};
    let i = 0;
    const next = (): Promise<void> => {
      if (abortFlag) return Promise.resolve();
      const m = g.members[i++];
      if (!m) return Promise.resolve();
      return tunerEpg(m.ch, opts.hours).then(
        (entries) => {
          epg[m.id] = entries;
          return next();
        },
        () => next(),
      );
    };
    return next().then(() => {
      if (abortFlag) return;
      const thin = g.members.filter((m) => (epg[m.id] || []).length <= 2);
      opts.onGroup(g, epg);
      // Nur jetzt/danach erhalten: der Fernseher hat die Tabellen noch nicht → nochmals warten und lesen
      if (thin.length && round < opts.maxRounds) {
        log(g.tune.name + ': ' + thin.length + ' Sender nur jetzt/danach, warte nochmals');
        return sleep(opts.dwellMs).then(() => readGroup(g, round + 1));
      }
      log(g.tune.name + ': ' + g.members.map((m) => (epg[m.id] || []).length).join('/') + ' Einträge');
    });
  };

  const step = (idx: number): Promise<void> => {
    if (abortFlag || idx >= groups.length) return Promise.resolve();
    const g = groups[idx]!;
    return tuneTo(g.tune).then(
      (r) => {
        if (abortFlag) return;
        if (r !== 'ok') {
          log(g.tune.name + ': ' + r + ' – übersprungen');
          return;
        }
        return sleep(opts.dwellMs).then(() => readGroup(g, 1));
      },
      (e: Error) => {
        log(g.tune.name + ': ' + e.message);
      },
    ).then(() => {
      harvestStatus.done = idx + 1;
      opts.onProgress();
      return step(idx + 1);
    });
  };

  // TV-Bild hinter der (undurchsichtigen) Seite: gibt dem Tuner die Videoebene, sonst scheitert das Abstimmen
  return showTvWindow()
    .then(
      () => {
        windowShown = true;
      },
      (e: Error) => log('TV-Bild (verdeckt) nicht möglich: ' + e.message),
    )
    .then(() => step(0))
    .then(cleanup, (e: Error) => {
      log('Fehler: ' + e.message);
      return cleanup();
    });
}
