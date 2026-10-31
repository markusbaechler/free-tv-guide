import type { Channel, GuideEvent, Sport } from '../../pipeline/types.ts';
import { loadData, nowNext, type EpgEntry, type GuideData } from './data.ts';
import { clear, h } from './dom.ts';
import { focusables, getFocused, findByKey, move, setFocus, type Dir } from './focus.ts';
import { dayKey, dayLabel, remaining, startsIn, time, weekdayShort } from './format.ts';
import { applyFilter, displaySubtitle, displayTitle, groupEvents, isRunning, type EventGroup, type Filter, type Period, type SportFilter } from './group.ts';
import { CHANNEL_PRIORITY, PLAYER_NOTE, PLAYERS, REFRESH_DATA_MS, REFRESH_VIEW_MS, type PlayerApp } from './settings.ts';
import { closePlayer, currentPlayerChannel, isPlaying, openPlayer, playerKey, switchPlayerChannel, type PlayableChannel } from './player.ts';
import { exitApp, isTizen, launchApp, registerKeys } from './tizen.ts';
import { hideTvWindow, listChannels, loadTunerList, matchTunerChannel, programNow, showTvWindow, tuneTo, tunerAvailable, tunerEpg, videoSources, type TunerChannel, type TunerEpgEntry } from './tuner.ts';

/** Wird beim Build aus config.xml gesetzt */
declare const __APP_VERSION__: string;
const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

type Tab = 'live' | 'sport' | 'channels';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'live', label: 'Jetzt live' },
  { id: 'sport', label: 'Sport' },
  { id: 'channels', label: 'Sender' },
];

const SPORT_LABEL: Record<Sport, string> = { football: 'Fussball', icehockey: 'Eishockey', motorsport: 'Motorsport' };

const state = {
  tab: 'live' as Tab,
  filter: { sport: 'all', period: 'today', secondary: false } as Filter,
  data: null as GuideData | null,
  loading: true,
  overlay: null as null | 'watch' | 'exit',
  /** Sat-Tuner: Diagnose, Zuordnung Sender-ID → Tuner-Sender, Programm aus dem Sendesignal, Sichtmodus */
  tuner: {
    channels: [] as TunerChannel[],
    log: [] as string[],
    tvOpen: false,
    loaded: false,
    error: null as string | null,
    matched: {} as Record<string, TunerChannel>,
    epg: {} as Record<string, { fetchedAt: number; entries: TunerEpgEntry[] }>,
    current: null as string | null,
  },
};

const $ = (id: string) => document.getElementById(id) as HTMLElement;

function channelById(id: string): Channel | null {
  const list = state.data ? state.data.channels : [];
  for (const c of list) if (c.id === id) return c;
  return null;
}

const channelName = (id: string) => {
  const c = channelById(id);
  return c ? c.name : id;
};

function groups(): EventGroup[] {
  return state.data ? groupEvents(state.data.events, CHANNEL_PRIORITY) : [];
}

// ---------------------------------------------------------------- Kopfzeile

function renderTabs(): void {
  const nav = $('tabs');
  clear(nav);
  for (const t of TABS) {
    nav.appendChild(
      h('button', { class: 'tab' + (state.tab === t.id ? ' is-active' : ''), 'data-nav': true, 'data-key': 'tab:' + t.id, 'data-tab': t.id, type: 'button' }, t.label),
    );
  }
}

function renderStatus(): void {
  const el = $('status');
  clear(el);
  const now = new Date();
  el.appendChild(h('span', { class: 'status__clock' }, weekdayShort(now) + '  ' + time(now)));
  const d = state.data;
  if (d) {
    const stand = 'Stand ' + time(d.meta.generatedAt);
    el.appendChild(h('span', { class: 'status__data' + (d.fromCache ? ' is-offline' : '') }, (d.fromCache ? 'Offline · ' + stand : stand) + ' · v' + APP_VERSION));
  } else {
    el.appendChild(h('span', { class: 'status__data' }, 'v' + APP_VERSION));
  }
}

function renderKeys(): void {
  const el = $('keys');
  clear(el);
  const key = (cls: string, label: string) => h('span', { class: 'key' }, h('span', { class: 'key__cap key__cap--' + cls }), label);
  // Tastenfarbe = Sportfarbe: grün Rasen, blau Eis, rot Motorsport
  el.appendChild(key('green', 'Fussball'));
  el.appendChild(key('blue', 'Eishockey'));
  el.appendChild(key('red', 'Motorsport'));
  el.appendChild(key('yellow', 'Alle'));
  el.appendChild(h('span', { class: 'key key--text' }, h('b', null, 'OK'), ' ansehen'));
  el.appendChild(h('span', { class: 'key key--text' }, h('b', null, 'Zurück'), ' eine Ebene zurück'));
}

// ---------------------------------------------------------------- Bausteine

function stateLabel(g: EventGroup, now: Date): HTMLElement | null {
  if (g.kind === 'highlights') return h('span', { class: 'tag' }, 'Highlights');
  if (g.kind === 'replay') return h('span', { class: 'tag' }, 'Wiederholung');
  if (isRunning(g, now)) return h('span', { class: 'live' }, 'Live');
  return null;
}

function eventRow(g: EventGroup, now: Date, first: boolean): HTMLElement {
  const running = isRunning(g, now);
  const sub = displaySubtitle(g.primary);
  const others = g.others.map((o) => channelName(o.channel));
  return h(
    'div',
    {
      class: 'row row--' + g.sport + (running ? ' is-running' : '') + (g.kind !== 'live' ? ' is-secondary' : ''),
      'data-nav': true,
      'data-key': 'ev:' + g.key,
      'data-first': first,
    },
    h('div', { class: 'row__time' }, time(g.start), h('span', { class: 'row__when' }, running ? remaining(g.end, now) : 'bis ' + time(g.end))),
    h(
      'div',
      { class: 'row__body' },
      h('div', { class: 'row__comp' }, h('span', { class: 'sport-mark' }), g.competitionName, stateLabel(g, now)),
      h('div', { class: 'row__title' }, displayTitle(g.primary)),
      sub ? h('div', { class: 'row__sub' }, sub) : null,
    ),
    h(
      'div',
      { class: 'row__channel' },
      h('span', { class: 'chan' }, channelName(g.primary.channel)),
      others.length ? h('span', { class: 'row__also' }, 'auch ' + others.join(', ')) : null,
      g.primary.reception === 'uncertain' ? h('span', { class: 'row__also' }, 'Empfang ungeprüft') : null,
    ),
  );
}

function emptyState(text: string, action: { label: string; key: string } | null): HTMLElement {
  return h(
    'div',
    { class: 'empty' },
    h('p', null, text),
    action ? h('button', { class: 'btn', type: 'button', 'data-nav': true, 'data-key': action.key }, action.label) : null,
  );
}

// ---------------------------------------------------------------- Tab «Sport»

function filterButton(key: string, label: string, active: boolean, swatch?: string): HTMLElement {
  return h(
    'button',
    { class: 'filter' + (active ? ' is-active' : ''), type: 'button', 'data-nav': true, 'data-key': key },
    swatch ? h('span', { class: 'filter__swatch filter__swatch--' + swatch }) : null,
    label,
  );
}

function renderSport(main: HTMLElement, now: Date): void {
  const f = state.filter;
  const aside = h(
    'aside',
    { class: 'filters', 'data-nav-group': 'filters', 'data-nav-memory': 'off' },
    h('h2', { class: 'filters__head' }, 'Sportart'),
    filterButton('sport:all', 'Alle', f.sport === 'all'),
    filterButton('sport:football', 'Fussball', f.sport === 'football', 'football'),
    filterButton('sport:icehockey', 'Eishockey', f.sport === 'icehockey', 'icehockey'),
    filterButton('sport:motorsport', 'Motorsport', f.sport === 'motorsport', 'motorsport'),
    h('h2', { class: 'filters__head' }, 'Zeitraum'),
    filterButton('period:today', 'Heute', f.period === 'today'),
    filterButton('period:tomorrow', 'Morgen', f.period === 'tomorrow'),
    filterButton('period:week', '7 Tage', f.period === 'week'),
    h('h2', { class: 'filters__head' }, 'Auch zeigen'),
    h(
      'button',
      { class: 'filter filter--toggle' + (f.secondary ? ' is-active' : ''), type: 'button', 'data-nav': true, 'data-key': 'toggle:secondary' },
      h('span', { class: 'check' + (f.secondary ? ' is-on' : '') }),
      'Highlights und Wiederholungen',
    ),
  );

  const board = h('div', { class: 'board', 'data-scroll': true, 'data-nav-group': 'board' });
  const list = applyFilter(groups(), f, now);
  if (!list.length) {
    const what = f.sport === 'all' ? 'Live-Sport' : SPORT_LABEL[f.sport as Sport];
    const when = f.period === 'today' ? 'Heute läuft' : f.period === 'tomorrow' ? 'Morgen läuft' : 'In den nächsten 7 Tagen läuft';
    // Statt leerer Tafel gleich die nächsten Termine zeigen
    const next = applyFilter(groups(), { sport: f.sport, period: 'week', secondary: f.secondary }, now).slice(0, 5);
    board.appendChild(h('p', { class: 'note' }, when + ' kein ' + what + (f.period === 'today' ? ' mehr' : '') + ' im Free-TV.'));
    if (next.length) {
      board.appendChild(h('h3', { class: 'board__day' }, 'Als Nächstes'));
      next.forEach((g, i) => {
        const row = eventRow(g, now, i === 0);
        const t = row.querySelector('.row__when');
        if (t) t.textContent = dayLabel(dayKey(g.start), now);
        board.appendChild(row);
      });
    }
  } else {
    let lastDay = '';
    let first = true;
    for (const g of list) {
      const day = isRunning(g, now) ? dayKey(now) : dayKey(g.start);
      if (day !== lastDay) {
        board.appendChild(h('h3', { class: 'board__day' }, dayLabel(day, now)));
        lastDay = day;
      }
      board.appendChild(eventRow(g, now, first));
      first = false;
    }
  }
  main.appendChild(h('section', { class: 'sport' }, aside, board));
}

// ---------------------------------------------------------------- Tab «Jetzt live»

/** Programm eines Senders: aus den Pipeline-Daten (SRG) oder aus dem Sat-Signal (Tuner) */
function epgFor(c: Channel): EpgEntry[] | undefined {
  if (state.data && state.data.epg[c.id]) return state.data.epg[c.id];
  const t = state.tuner.epg[c.id];
  return t ? t.entries : undefined;
}

// ---------------------------------------------------------------- Empfangswege (Priorität aus channels.yaml)

type Way = { kind: 'stream' } | { kind: 'sat'; tuner: TunerChannel } | { kind: 'ext'; app: 'joyn' | 'zattoo' };

/** Quellen defensiv lesen (ältere Daten ohne `sources`) */
const sourcesOf = (c: Channel) => c.sources || [];
const hasSource = (c: Channel, kind: string) => sourcesOf(c).some((s) => s.kind === kind);

/** Verfügbare Wege in Prioritätsreihenfolge: Direktstream/SRG → Sat (nur wenn im Tuner gefunden) → externe App */
function ways(c: Channel): Way[] {
  const out: Way[] = [];
  let streamAdded = false;
  for (const s of sourcesOf(c)) {
    if (s.kind === 'srg' || s.kind === 'direct') {
      const live = c.live;
      const ok = live && ((s.kind === 'srg' && live.urn) || (s.kind === 'direct' && live.url === s.url));
      if (ok && !streamAdded) {
        out.push({ kind: 'stream' });
        streamAdded = true;
      }
    } else if (s.kind === 'sat') {
      const m = state.tuner.matched[c.id];
      if (m) out.push({ kind: 'sat', tuner: m });
    } else {
      out.push({ kind: 'ext', app: s.kind });
    }
  }
  return out;
}

const firstWay = (c: Channel | null): Way | null => (c ? ways(c)[0] || null : null);

function wayLabel(c: Channel): string {
  const w = firstWay(c);
  const t = state.tuner;
  const satPending = hasSource(c, 'sat') && isTizen() && !t.loaded && !t.error;
  if (w && w.kind === 'stream') return c.epg ? 'Kein Programm verfügbar' : 'Livestream';
  if (w && w.kind === 'sat') return 'Sat' + (w.tuner.major !== null ? ' · Kanal ' + w.tuner.major : '');
  if (satPending) return 'Sat-Tuner wird gelesen …';
  const missing = hasSource(c, 'sat') && (isTizen() ? 'Nicht im Sat-Tuner' : 'Sat nur am Fernseher');
  if (w && w.kind === 'ext') return (missing ? missing + ' · ' : '') + 'über ' + PLAYERS[w.app].name;
  return missing || 'Kein Empfangsweg';
}

function channelTile(c: Channel, now: Date): HTMLElement {
  const nn = nowNext(epgFor(c), now);
  const none = wayLabel(c);
  return h(
    'div',
    { class: 'tile', 'data-nav': true, 'data-key': 'ch:' + c.id },
    h('div', { class: 'tile__name' }, c.name),
    nn.now
      ? h('div', { class: 'tile__now' }, h('span', { class: 'tile__title' }, nn.now.title), nn.now.end ? h('span', { class: 'tile__time' }, 'bis ' + time(nn.now.end)) : null)
      : h('div', { class: 'tile__now tile__now--none' }, none),
    nn.next ? h('div', { class: 'tile__next' }, time(nn.next.start) + '  ' + nn.next.title) : null,
  );
}

// ---------------------------------------------------------------- Sat-Tuner: Zuordnung, Programm, Sichtmodus

const TUNER_EPG_MAX_AGE_MS = 10 * 60 * 1000;

/** Tuner-Liste lesen, Sat-Sender zuordnen, Programm nachladen (nur am Fernseher) */
function ensureTuner(): void {
  const t = state.tuner;
  if (!isTizen() || !state.data || !tunerAvailable().channel) return;
  const sats = state.data.channels.filter((c) => hasSource(c, 'sat'));
  if (!sats.length) return;
  loadTunerList().then(
    (list) => {
      t.channels = list;
      t.loaded = true;
      t.error = null;
      for (const c of sats) {
        const names = ([] as string[]).concat(...sourcesOf(c).map((s) => (s.kind === 'sat' ? s.names : [])));
        const m = matchTunerChannel(list, names);
        if (m) t.matched[c.id] = m;
      }
      render();
      refreshTunerEpg();
    },
    (e: Error) => {
      t.loaded = true;
      t.error = e.message;
      render();
    },
  );
}

/** Programmdaten der zugeordneten Sat-Sender nacheinander laden (schonend für den Tuner) */
function refreshTunerEpg(): void {
  const t = state.tuner;
  const ids = Object.keys(t.matched).filter((id) => !t.epg[id] || Date.now() - t.epg[id]!.fetchedAt > TUNER_EPG_MAX_AGE_MS);
  const next = () => {
    const id = ids.shift();
    if (!id) return;
    tunerEpg(t.matched[id]!, 6).then(
      (entries) => {
        t.epg[id] = { fetchedAt: Date.now(), entries };
        if (!isPlaying() && !state.overlay) render();
        next();
      },
      () => {
        t.epg[id] = { fetchedAt: Date.now(), entries: [] };
        next();
      },
    );
  };
  next();
}

function openSat(channelId: string): void {
  const m = state.tuner.matched[channelId];
  if (!m) return;
  if (state.overlay) closeOverlay();
  else rememberFocus();
  tuneTo(m).then(
    (r) => {
      state.tuner.current = channelId;
      if (r !== 'ok') tunerLog('Tune ' + m.name + ': ' + r);
      if (!state.tuner.tvOpen) openTvWindow();
    },
    (e: Error) => tunerLog('Fehler ' + e.message),
  );
}

/** Gemeinsame Zapp-Liste: alle Sender, die die App selbst zeigt (Stream oder Sat), in Favoriten-Reihenfolge */
function zapList(): Channel[] {
  return orderedChannels().filter((c) => {
    const w = firstWay(c);
    return !!w && w.kind !== 'ext';
  });
}

/** Hoch/Runter: nächster Sender der gemeinsamen Liste, unabhängig vom Empfangsweg */
function zap(step: number): void {
  const list = zapList();
  if (!list.length) return;
  const current = state.tuner.tvOpen ? state.tuner.current : currentPlayerChannel();
  const i = list.map((c) => c.id).indexOf(current || '');
  const nextCh = list[(i + step + list.length) % list.length]!;
  const w = firstWay(nextCh);
  if (!w) return;
  if (w.kind === 'sat') {
    if (isPlaying()) closePlayer();
    openSat(nextCh.id);
    return;
  }
  // Stream: Sat-Bild zu, dann Player (läuft er schon, nur umschalten)
  if (state.tuner.tvOpen) {
    hideTvWindow().then(() => {
      state.tuner.tvOpen = false;
      play(nextCh.id);
    });
    return;
  }
  if (!switchPlayerChannel(nextCh.id)) play(nextCh.id);
}

/** Tasten im Sat-Sichtmodus (TV-Bild vor der App). true = verarbeitet */
function satKey(code: number): boolean {
  if (!state.tuner.tvOpen) return false;
  if (code === 10009 || code === 8 || code === 27) {
    closeTvWindow();
    return true;
  }
  if (code === 38 || code === 427) {
    zap(-1);
    return true;
  }
  if (code === 40 || code === 428) {
    zap(1);
    return true;
  }
  return true;
}

function renderLive(main: HTMLElement, now: Date): void {
  const box = h('div', { class: 'live-view', 'data-scroll': true, 'data-nav-group': 'live' });
  const all = groups().filter((g) => g.kind === 'live');
  const running = all.filter((g) => isRunning(g, now));
  const soon = all.filter((g) => !isRunning(g, now) && g.start > now.toISOString() && dayKey(g.start) === dayKey(now)).slice(0, 4);

  box.appendChild(h('h2', { class: 'section-head' }, 'Sport läuft jetzt'));
  if (running.length) running.forEach((g, i) => box.appendChild(eventRow(g, now, i === 0)));
  else box.appendChild(h('p', { class: 'note' }, 'Gerade läuft kein Live-Sport im Free-TV.'));

  if (soon.length) {
    box.appendChild(h('h2', { class: 'section-head' }, 'Heute noch'));
    soon.forEach((g, i) => {
      const row = eventRow(g, now, !running.length && i === 0);
      const when = row.querySelector('.row__when');
      if (when) when.textContent = startsIn(g.start, now);
      box.appendChild(row);
    });
  }

  // Favoriten mit Programmdaten (SRG-API oder Sat-Signal)
  const withEpg = orderedChannels().filter((c) => {
    const e = epgFor(c);
    return !!e && e.length > 0;
  });
  if (withEpg.length) {
    box.appendChild(h('h2', { class: 'section-head' }, 'Jetzt im Programm'));
    box.appendChild(h('div', { class: 'tiles' }, withEpg.map((c) => channelTile(c, now))));
  }
  main.appendChild(box);
}

// ---------------------------------------------------------------- Tab «Sender»

/** Sender in Favoriten-Reihenfolge, danach die übrigen in Listenreihenfolge */
function orderedChannels(): Channel[] {
  const list = state.data ? state.data.channels : [];
  const fav = state.data ? state.data.favorites || [] : [];
  const byId: Record<string, Channel> = {};
  for (const c of list) byId[c.id] = c;
  const out: Channel[] = [];
  for (const id of fav) if (byId[id]) out.push(byId[id]!);
  for (const c of list) if (fav.indexOf(c.id) === -1) out.push(c);
  return out;
}

function renderChannels(main: HTMLElement, now: Date): void {
  const list = state.data ? state.data.channels : [];
  const box = h('div', { class: 'channels-view', 'data-scroll': true, 'data-nav-group': 'channels' });
  const favIds = state.data ? state.data.favorites || [] : [];
  const favs = favIds.map((id) => channelById(id)).filter((c): c is Channel => !!c);
  if (favs.length) {
    box.appendChild(h('h2', { class: 'section-head' }, 'Favoriten'));
    box.appendChild(h('div', { class: 'tiles' }, favs.map((c) => channelTile(c, now))));
  }
  const countries: Array<[string, string]> = [['CH', 'Schweiz'], ['DE', 'Deutschland'], ['AT', 'Österreich']];
  for (const [code, label] of countries) {
    const cs = list.filter((c) => c.country === code);
    if (!cs.length) continue;
    box.appendChild(h('h2', { class: 'section-head' }, label));
    box.appendChild(h('div', { class: 'tiles' }, cs.map((c) => channelTile(c, now))));
  }
  renderTunerProbe(box);
  main.appendChild(box);
}

// ---------------------------------------------------------------- Sat-Tuner (Probe)

function tunerLog(line: string): void {
  state.tuner.log = [line].concat(state.tuner.log).slice(0, 6);
  if (!state.tuner.tvOpen) render();
}

function renderTunerProbe(box: HTMLElement): void {
  const t = state.tuner;
  const avail = tunerAvailable();
  box.appendChild(h('h2', { class: 'section-head' }, 'Tuner-Diagnose'));
  box.appendChild(
    h('p', { class: 'note' }, 'APIs: tvchannel ' + (avail.channel ? 'ja' : 'nein') + ' · tvwindow ' + (avail.window ? 'ja' : 'nein') + (t.channels.length ? ' · ' + t.channels.length + ' Sender gelesen' : '')),
  );
  box.appendChild(
    h(
      'div',
      { class: 'tiles' },
      h('div', { class: 'tile', 'data-nav': true, 'data-key': 'tuner:list' }, h('div', { class: 'tile__name' }, 'Senderliste lesen'), h('div', { class: 'tile__now tile__now--none' }, 'tizen.tvchannel.getChannelList')),
      h('div', { class: 'tile', 'data-nav': true, 'data-key': 'tuner:sources' }, h('div', { class: 'tile__name' }, 'Videoquellen'), h('div', { class: 'tile__now tile__now--none' }, 'systeminfo VIDEOSOURCE')),
      h('div', { class: 'tile', 'data-nav': true, 'data-key': 'tuner:show' }, h('div', { class: 'tile__name' }, 'TV-Bild zeigen'), h('div', { class: 'tile__now tile__now--none' }, 'aktueller Tuner-Sender, Zurück = schliessen')),
    ),
  );
  for (const line of t.log) box.appendChild(h('p', { class: 'note' }, line));
  if (t.channels.length) {
    box.appendChild(h('h2', { class: 'section-head' }, 'Tuner-Sender (OK = umschalten)'));
    box.appendChild(
      h(
        'div',
        { class: 'tiles' },
        t.channels.slice(0, 60).map((c) =>
          h(
            'div',
            { class: 'tile', 'data-nav': true, 'data-key': 'tuner:ch:' + c.index },
            h('div', { class: 'tile__name' }, (c.major !== null ? c.major + (c.minor ? '-' + c.minor : '') + '  ' : '') + c.name),
            h('div', { class: 'tile__now tile__now--none' }, JSON.stringify(c.raw).slice(0, 90)),
          ),
        ),
      ),
    );
  }
}

function tunerAction(key: string): void {
  if (key === 'tuner:list') {
    listChannels().then(
      (list) => {
        state.tuner.channels = list;
        tunerLog('Senderliste: ' + list.length + ' Einträge' + (list[0] ? ' · erster: ' + JSON.stringify(list[0].raw).slice(0, 160) : ''));
      },
      (e: Error) => tunerLog('Fehler ' + e.message),
    );
    return;
  }
  if (key === 'tuner:sources') {
    videoSources().then((s) => tunerLog('Quellen: ' + s), (e: Error) => tunerLog('Fehler ' + e.message));
    return;
  }
  if (key === 'tuner:show') {
    openTvWindow();
    return;
  }
  if (key.indexOf('tuner:ch:') === 0) {
    const ch = state.tuner.channels[Number(key.slice(9))];
    if (!ch) return;
    tuneTo(ch).then(
      (r) => {
        tunerLog('Tune ' + ch.name + ': ' + r);
        programNow(ch).then((p) => tunerLog('EPG ' + ch.name + ': ' + p), (e: Error) => tunerLog('EPG-Fehler ' + e.message));
        openTvWindow();
      },
      (e: Error) => tunerLog('Fehler ' + e.message),
    );
  }
}

function openTvWindow(): void {
  showTvWindow().then(
    (r) => {
      state.tuner.tvOpen = true;
      tunerLog('TV-Bild: ' + r);
    },
    (e: Error) => tunerLog('Fehler ' + e.message),
  );
}

function closeTvWindow(): void {
  hideTvWindow().then(() => {
    state.tuner.tvOpen = false;
    render();
    const back = focusBeforeOverlay ? findByKey(focusBeforeOverlay) : null;
    if (back) setFocus(back);
  });
}

// ---------------------------------------------------------------- Rendern

function defaultFocus(): void {
  const main = $('main');
  const board = main.querySelector('[data-nav-group="board"]');
  const target = (board && focusables(board)[0]) || focusables(main)[0] || findByKey('tab:' + state.tab);
  if (target) setFocus(target);
}

function render(): void {
  const prev = getFocused();
  const prevKey = prev ? prev.getAttribute('data-key') : null;
  const now = new Date();
  renderTabs();
  renderStatus();
  const main = $('main');
  clear(main);

  if (!state.data) {
    if (state.loading) main.appendChild(h('p', { class: 'note note--center' }, 'Programm wird geladen …'));
    else main.appendChild(emptyState('Keine Verbindung zum Programm-Server. Bitte Netzwerk des Fernsehers prüfen.', { label: 'Erneut laden', key: 'reload' }));
  } else if (state.tab === 'sport') renderSport(main, now);
  else if (state.tab === 'live') renderLive(main, now);
  else renderChannels(main, now);

  if (state.overlay) return;
  const again = prevKey ? findByKey(prevKey) : null;
  if (again) setFocus(again);
  else defaultFocus();
}

// ---------------------------------------------------------------- Overlays

function openOverlay(kind: 'watch' | 'exit', content: HTMLElement): void {
  const ov = $('overlay');
  clear(ov);
  ov.appendChild(content);
  ov.hidden = false;
  state.overlay = kind;
  const first = focusables(ov)[0];
  if (first) setFocus(first);
}

let focusBeforeOverlay: string | null = null;

function closeOverlay(): void {
  const ov = $('overlay');
  ov.hidden = true;
  clear(ov);
  state.overlay = null;
  const back = focusBeforeOverlay ? findByKey(focusBeforeOverlay) : null;
  if (back) setFocus(back);
  else defaultFocus();
}

function rememberFocus(): void {
  const f = getFocused();
  focusBeforeOverlay = f ? f.getAttribute('data-key') : null;
}

let pendingLaunch: { app: PlayerApp; deeplink: string | null } | null = null;

/** Sender, die die App selbst abspielt (SRG-URN oder offizieller Livestream), in Listen-Reihenfolge (Hoch/Runter im Player) */
function playableChannels(): PlayableChannel[] {
  const now = new Date();
  return orderedChannels()
    .filter((c) => isLive(c))
    .map((c) => {
      const nn = state.data ? nowNext(state.data.epg[c.id], now) : { now: null, next: null };
      return { id: c.id, name: c.name, src: c.live!, nowTitle: nn.now ? nn.now.title : null };
    });
}

function isLive(c: Channel | null): boolean {
  return !!(c && c.live && (c.live.urn || c.live.url));
}

function canPlay(channelId: string): boolean {
  return isLive(channelById(channelId));
}

function play(channelId: string): void {
  if (state.overlay) {
    // Dialog schliessen, ohne den Fokus zurückzusetzen; der Player merkt sich die Stelle
    $('overlay').hidden = true;
    clear($('overlay'));
    state.overlay = null;
  } else {
    rememberFocus();
  }
  openPlayer(
    playableChannels(),
    channelId,
    () => {
      render();
      const back = focusBeforeOverlay ? findByKey(focusBeforeOverlay) : null;
      if (back) setFocus(back);
    },
    streamFailover,
  );
}

/** Stream des Senders spielt nicht → nächster Weg (Sat oder externe App). true = übernommen */
function streamFailover(channelId: string): boolean {
  const c = channelById(channelId);
  if (!c) return false;
  const rest = ways(c).filter((w) => w.kind !== 'stream');
  const next = rest[0];
  if (!next) return false;
  closePlayer();
  if (next.kind === 'sat') openSat(channelId);
  else openWatch(channelId, null, null, 'Der Livestream ist nicht erreichbar.');
  return true;
}

/** Sender ansehen: erster verfügbarer Weg */
function watch(channelId: string, title: string | null, g: EventGroup | null): void {
  const c = channelById(channelId);
  const w = firstWay(c);
  if (w && w.kind === 'stream') return play(channelId);
  if (w && w.kind === 'sat') return openSat(channelId);
  openWatch(channelId, title, g, null);
}

/** Startet in weniger als 15 Minuten oder läuft schon → direkt abspielen */
function startsSoon(g: EventGroup, now: Date): boolean {
  return new Date(g.start).getTime() - now.getTime() < 15 * 60 * 1000;
}

function openWatch(channelId: string, title: string | null, g: EventGroup | null, note: string | null): void {
  rememberFocus();
  const ch = channelById(channelId);
  const name = ch ? ch.name : channelId;
  const now = new Date();
  const first = firstWay(ch);
  const playable = !!first && first.kind !== 'ext';
  const lines0: string[] = note ? [note] : [];
  const lines: HTMLElement[] = [];
  if (g && g.start > now.toISOString()) {
    const day = dayKey(g.start) === dayKey(now) ? 'heute' : dayLabel(dayKey(g.start), now);
    lines.push(h('p', null, 'Beginnt ' + day + ' um ' + time(g.start) + ' auf ' + name + '.'));
  } else if (g) {
    lines.push(h('p', null, 'Läuft auf ' + name + ', ' + remaining(g.end, now) + '.'));
  } else {
    lines.push(h('p', null, name + ' ansehen.'));
  }
  if (g && g.others.length) {
    lines.push(h('p', { class: 'dialog__muted' }, 'Auch auf ' + g.others.map((o) => channelName(o.channel)).join(', ') + '.'));
  }
  // Externe App laut Prioritätsliste (erste joyn/zattoo-Quelle), sonst Zattoo
  const extWay = ch ? ways(ch).filter((w) => w.kind === 'ext')[0] : undefined;
  const ext: 'joyn' | 'zattoo' = extWay && extWay.kind === 'ext' ? extWay.app : 'zattoo';
  const hasExt = !!extWay;
  if (!playable) {
    for (const l of lines0) lines.push(h('p', { class: 'dialog__muted' }, l));
    if (ch && hasSource(ch, 'sat') && isTizen()) lines.push(h('p', { class: 'dialog__muted' }, wayLabel(ch) + '.'));
    if (hasExt) lines.push(h('p', { class: 'dialog__hint' }, PLAYER_NOTE[ext] + ' Dort ' + name + ' wählen.'));
    else lines.push(h('p', { class: 'dialog__hint' }, 'Zurzeit kein Empfangsweg für ' + name + '.'));
  }
  pendingLaunch = { app: PLAYERS[ext], deeplink: ch ? ch.deeplink : null };

  openOverlay(
    'watch',
    h(
      'div',
      { class: 'dialog', role: 'dialog', 'data-nav-group': 'dialog' },
      h('h2', { class: 'dialog__title' }, title || name),
      lines,
      h('p', { class: 'dialog__error', id: 'launch-error' }),
      h(
        'div',
        { class: 'dialog__actions' },
        playable
          ? h('button', { class: 'btn btn--primary', type: 'button', 'data-nav': true, 'data-key': 'play:' + channelId }, name + ' jetzt einschalten')
          : hasExt
            ? h('button', { class: 'btn btn--primary', type: 'button', 'data-nav': true, 'data-key': 'launch:ext' }, PLAYERS[ext].name + ' öffnen')
            : null,
        h('button', { class: 'btn', type: 'button', 'data-nav': true, 'data-key': 'close' }, 'Abbrechen'),
      ),
    ),
  );
}

function launchError(text: string): void {
  const el = document.getElementById('launch-error');
  if (el) el.textContent = text;
}

function doLaunch(app: PlayerApp, deeplink: string | null): void {
  if (!isTizen()) return launchError('In der Vorschau im Browser lassen sich keine Apps öffnen.');
  if (!app.tizenId) return launchError(app.name + ' ist auf diesem Fernseher noch nicht verknüpft.');
  launchApp(app.tizenId, deeplink).then(
    () => closeOverlay(),
    () => launchError(app.name + ' liess sich nicht öffnen. Ist die App installiert?'),
  );
}

function openExit(): void {
  rememberFocus();
  openOverlay(
    'exit',
    h(
      'div',
      { class: 'dialog dialog--small', role: 'dialog', 'data-nav-group': 'dialog' },
      h('h2', { class: 'dialog__title' }, 'Free-TV Guide beenden?'),
      h('p', { class: 'dialog__error', id: 'launch-error' }),
      h(
        'div',
        { class: 'dialog__actions' },
        h('button', { class: 'btn btn--primary', type: 'button', 'data-nav': true, 'data-key': 'exit' }, 'Beenden'),
        h('button', { class: 'btn', type: 'button', 'data-nav': true, 'data-key': 'close' }, 'Abbrechen'),
      ),
    ),
  );
}

// ---------------------------------------------------------------- Aktionen

function setTab(tab: Tab): void {
  if (state.tab === tab) return;
  state.tab = tab;
  render();
  const t = findByKey('tab:' + tab);
  if (t) setFocus(t);
}

function showSport(sport: SportFilter): void {
  state.tab = 'sport';
  state.filter.sport = sport;
  render();
  defaultFocus();
}

function activate(el: HTMLElement): void {
  const key = el.getAttribute('data-key') || '';
  const [kind, value] = [key.slice(0, key.indexOf(':') === -1 ? key.length : key.indexOf(':')), key.slice(key.indexOf(':') + 1)];

  if (kind === 'tab') return setTab(value as Tab);
  if (kind === 'sport') {
    state.filter.sport = value as SportFilter;
    return render();
  }
  if (kind === 'period') {
    state.filter.period = value as Period;
    return render();
  }
  if (key === 'toggle:secondary') {
    state.filter.secondary = !state.filter.secondary;
    return render();
  }
  if (kind === 'ev') {
    const g = groups().filter((x) => x.key === value)[0];
    if (!g) return;
    // Läuft oder beginnt gleich und SRG-Sender → sofort abspielen, sonst Dialog
    const fw = firstWay(channelById(g.primary.channel));
    if (fw && fw.kind !== 'ext' && startsSoon(g, new Date())) return watch(g.primary.channel, displayTitle(g.primary), g);
    return openWatch(g.primary.channel, displayTitle(g.primary), g, null);
  }
  if (kind === 'ch') return watch(value, null, null);
  if (kind === 'play') return watch(value, null, null);
  if (key === 'launch:ext' && pendingLaunch) return doLaunch(pendingLaunch.app, pendingLaunch.deeplink);
  if (key === 'close') return closeOverlay();
  if (key === 'exit') {
    if (!exitApp()) launchError('In der Vorschau gibt es nichts zu beenden.');
    return;
  }
  if (key === 'reload') return refresh();
  if (kind === 'tuner') return tunerAction(key);
}

function back(): void {
  if (state.tuner.tvOpen) return closeTvWindow();
  if (state.overlay) return closeOverlay();
  const f = getFocused();
  const inTabs = f && f.closest('#tabs');
  if (!inTabs) {
    const t = findByKey('tab:' + state.tab);
    if (t) setFocus(t);
    return;
  }
  openExit();
}

// ---------------------------------------------------------------- Tasten

const KEY = { left: 37, up: 38, right: 39, down: 40, enter: 13, back: 10009, backspace: 8, escape: 27, red: 403, green: 404, yellow: 405, blue: 406 };

function onKey(e: KeyboardEvent): void {
  const code = e.keyCode;
  if (satKey(code)) {
    e.preventDefault();
    return;
  }
  if (isPlaying() && (code === 38 || code === 40 || code === 427 || code === 428)) {
    e.preventDefault();
    zap(code === 38 || code === 427 ? -1 : 1);
    return;
  }
  if (playerKey(code)) {
    e.preventDefault();
    return;
  }
  const dirs: Record<number, Dir> = { 37: 'left', 38: 'up', 39: 'right', 40: 'down' };
  if (dirs[code]) {
    e.preventDefault();
    const root = state.overlay ? $('overlay') : document;
    const before = getFocused();
    move(dirs[code]!, root);
    // Tabs wechseln, sobald der Fokus auf einen anderen Tab springt
    const after = getFocused();
    if (!state.overlay && after && after !== before && after.hasAttribute('data-tab')) setTab(after.getAttribute('data-tab') as Tab);
    return;
  }
  if (code === KEY.enter) {
    e.preventDefault();
    const f = getFocused();
    if (f) activate(f);
    return;
  }
  if (code === KEY.back || code === KEY.backspace || code === KEY.escape) {
    e.preventDefault();
    return back();
  }
  if (state.overlay) return;
  // Farbtasten (Farbe = Sportfarbe); in der Browser-Vorschau 1 rot, 2 grün, 3 gelb, 4 blau
  if (code === KEY.green || code === 50) return showSport('football');
  if (code === KEY.blue || code === 52) return showSport('icehockey');
  if (code === KEY.red || code === 49) return showSport('motorsport');
  if (code === KEY.yellow || code === 51) return showSport('all');
}

// ---------------------------------------------------------------- Start

function refresh(): void {
  const firstLoad = !state.data;
  loadData().then((d) => {
    state.loading = false;
    if (d) state.data = d;
    if (state.overlay || isPlaying() || state.tuner.tvOpen) return renderStatus();
    render();
    if (firstLoad && state.data) defaultFocus();
    ensureTuner();
  });
}

function start(): void {
  registerKeys();
  document.addEventListener('keydown', onKey);
  // Maus/Pointer in der Vorschau: Klick = Fokus + OK
  document.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest('[data-nav]') as HTMLElement | null;
    if (!el) return;
    setFocus(el);
    activate(el);
  });
  // Rückkehr aus Joyn/Zattoo (App lief im Hintergrund): Daten und Anzeige auffrischen
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (state.overlay) closeOverlay();
    refresh();
  });
  renderKeys();
  render();
  refresh();
  setInterval(refresh, REFRESH_DATA_MS);
  setInterval(() => {
    if (isPlaying() || state.tuner.tvOpen) return;
    if (!state.overlay) render();
    else renderStatus();
  }, REFRESH_VIEW_MS);
  setInterval(() => {
    if (state.tuner.loaded && !state.tuner.tvOpen) refreshTunerEpg();
  }, TUNER_EPG_MAX_AGE_MS);
}

start();
