import type { Channel, GuideEvent, Sport } from '../../pipeline/types.ts';
import { loadData, nowNext, type GuideData } from './data.ts';
import { clear, h } from './dom.ts';
import { focusables, getFocused, findByKey, move, setFocus, type Dir } from './focus.ts';
import { dayKey, dayLabel, remaining, startsIn, time, weekdayShort } from './format.ts';
import { applyFilter, displaySubtitle, displayTitle, groupEvents, isRunning, type EventGroup, type Filter, type Period, type SportFilter } from './group.ts';
import { CHANNEL_PRIORITY, PLAYERS, PLAYSRF_CHANNELS, REFRESH_DATA_MS, REFRESH_VIEW_MS, type PlayerApp } from './settings.ts';
import { exitApp, isTizen, launchApp, registerKeys } from './tizen.ts';

type Tab = 'live' | 'sport' | 'channels';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'live', label: 'Jetzt live' },
  { id: 'sport', label: 'Sport' },
  { id: 'channels', label: 'Sender' },
];

const SPORT_LABEL: Record<Sport, string> = { football: 'Fussball', icehockey: 'Eishockey', motorsport: 'Motorsport' };

const state = {
  tab: 'sport' as Tab,
  filter: { sport: 'all', period: 'today', secondary: false } as Filter,
  data: null as GuideData | null,
  loading: true,
  overlay: null as null | 'watch' | 'exit',
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
    el.appendChild(h('span', { class: 'status__data' + (d.fromCache ? ' is-offline' : '') }, d.fromCache ? 'Offline · ' + stand : stand));
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

function channelTile(c: Channel, now: Date): HTMLElement {
  const nn = state.data ? nowNext(state.data.epg[c.id], now) : { now: null, next: null };
  return h(
    'div',
    { class: 'tile', 'data-nav': true, 'data-key': 'ch:' + c.id },
    h('div', { class: 'tile__name' }, c.name),
    nn.now
      ? h('div', { class: 'tile__now' }, h('span', { class: 'tile__title' }, nn.now.title), nn.now.end ? h('span', { class: 'tile__time' }, 'bis ' + time(nn.now.end)) : null)
      : h('div', { class: 'tile__now tile__now--none' }, c.epg ? 'Kein Programm verfügbar' : 'Programm in Zattoo'),
    nn.next ? h('div', { class: 'tile__next' }, time(nn.next.start) + '  ' + nn.next.title) : null,
  );
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

  const srg = state.data ? state.data.channels.filter((c) => c.epg) : [];
  if (srg.length) {
    box.appendChild(h('h2', { class: 'section-head' }, 'Jetzt im Programm'));
    box.appendChild(h('div', { class: 'tiles' }, srg.map((c) => channelTile(c, now))));
  }
  main.appendChild(box);
}

// ---------------------------------------------------------------- Tab «Sender»

function renderChannels(main: HTMLElement, now: Date): void {
  const list = state.data ? state.data.channels : [];
  const box = h('div', { class: 'channels-view', 'data-scroll': true, 'data-nav-group': 'channels' });
  const countries: Array<[string, string]> = [['CH', 'Schweiz'], ['DE', 'Deutschland'], ['AT', 'Österreich']];
  for (const [code, label] of countries) {
    const cs = list.filter((c) => c.country === code);
    if (!cs.length) continue;
    box.appendChild(h('h2', { class: 'section-head' }, label));
    box.appendChild(h('div', { class: 'tiles' }, cs.map((c) => channelTile(c, now))));
  }
  main.appendChild(box);
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
let pendingPlaySrf: PlayerApp | null = null;

function openWatch(channelId: string, title: string | null, g: EventGroup | null): void {
  rememberFocus();
  const ch = channelById(channelId);
  const name = ch ? ch.name : channelId;
  const now = new Date();
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
  const deeplink = ch ? ch.zattoo.deeplink : null;
  if (!deeplink) {
    const slot = ch && ch.zattoo.slot ? ' (Programmplatz ' + ch.zattoo.slot + ')' : '';
    lines.push(h('p', { class: 'dialog__hint' }, 'Zattoo öffnet ohne Senderwahl. Dort ' + name + slot + ' wählen.'));
  }
  pendingLaunch = { app: PLAYERS.zattoo, deeplink };
  pendingPlaySrf = PLAYSRF_CHANNELS.indexOf(channelId) !== -1 ? PLAYERS.playsrf : null;

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
        h('button', { class: 'btn btn--primary', type: 'button', 'data-nav': true, 'data-key': 'launch:zattoo' }, 'Zattoo öffnen'),
        pendingPlaySrf ? h('button', { class: 'btn', type: 'button', 'data-nav': true, 'data-key': 'launch:playsrf' }, 'Play SRF öffnen') : null,
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
    if (g) openWatch(g.primary.channel, displayTitle(g.primary), g);
    return;
  }
  if (kind === 'ch') return openWatch(value, null, null);
  if (key === 'launch:zattoo' && pendingLaunch) return doLaunch(pendingLaunch.app, pendingLaunch.deeplink);
  if (key === 'launch:playsrf' && pendingPlaySrf) return doLaunch(pendingPlaySrf, null);
  if (key === 'close') return closeOverlay();
  if (key === 'exit') {
    if (!exitApp()) launchError('In der Vorschau gibt es nichts zu beenden.');
    return;
  }
  if (key === 'reload') return refresh();
}

function back(): void {
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
    if (state.overlay) return renderStatus();
    render();
    if (firstLoad && state.data) defaultFocus();
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
  renderKeys();
  render();
  refresh();
  setInterval(refresh, REFRESH_DATA_MS);
  setInterval(() => {
    if (!state.overlay) render();
    else renderStatus();
  }, REFRESH_VIEW_MS);
}

start();
