import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyFilter, displaySubtitle, displayTitle, groupEvents } from '../src/group.ts';
import { dayLabel, remaining } from '../src/format.ts';
import { CHANNEL_PRIORITY } from '../src/settings.ts';
import type { GuideEvent } from '../../pipeline/types.ts';

function ev(channel: string, start: string, title: string, extra: Partial<GuideEvent> = {}): GuideEvent {
  return {
    id: channel + start,
    sport: 'football',
    competition: 'champions-league',
    competitionName: 'UEFA Champions League',
    title,
    subtitle: null,
    kind: 'live',
    start,
    end: new Date(new Date(start).getTime() + 2 * 3600_000).toISOString(),
    channel,
    reception: 'ok',
    source: 'srg-epg',
    ...extra,
  };
}

test('Gleiches Spiel auf SRF, RTS, RSI wird zusammengefasst, SRF zuerst', () => {
  const g = groupEvents(
    [
      ev('rts2', '2026-11-04T19:10:00.000Z', 'Borussia Dortmund - Real Betis'),
      ev('rsila2', '2026-11-04T19:30:00.000Z', 'Calcio: Champions League 2026/2027 - Dortmund - Betis'),
      ev('srf2', '2026-11-04T19:10:00.000Z', 'Fussball – UEFA Champions League, Dortmund – Betis'),
    ],
    CHANNEL_PRIORITY,
  );
  assert.equal(g.length, 1);
  assert.equal(g[0]!.primary.channel, 'srf2');
  assert.deepEqual(g[0]!.others.map((o) => o.channel), ['rts2', 'rsila2']);
});

test('RSI steigt 35 Min. später ein → trotzdem eine Zeile', () => {
  const g = groupEvents([ev('srfinfo', '2026-10-31T20:55:00.000Z', 'F1'), ev('rsila2', '2026-10-31T21:30:00.000Z', 'F1')], CHANNEL_PRIORITY);
  assert.equal(g.length, 1);
});

test('Live und Wiederholung bleiben getrennt, ebenso Spiele > 45 Min. auseinander', () => {
  const g = groupEvents(
    [
      ev('srf2', '2026-11-04T19:10:00.000Z', 'A'),
      ev('rsila2', '2026-11-04T19:20:00.000Z', 'A (R)', { kind: 'replay' }),
      ev('rts2', '2026-11-04T20:00:00.000Z', 'B'),
    ],
    CHANNEL_PRIORITY,
  );
  assert.equal(g.length, 3);
});

test('Sportart-Präfix wird aus dem Titel entfernt', () => {
  const sl = ev('srf2', '2026-11-04T19:10:00Z', 'Fussball – Super League 12. Runde, FC Luzern – FC Sion', { subtitle: 'aus Luzern' });
  assert.equal(displayTitle(sl), 'FC Luzern – FC Sion');
  assert.equal(displaySubtitle(sl), 'Super League 12. Runde · aus Luzern');
  assert.equal(displayTitle(ev('srfinfo', '2026-11-04T19:10:00Z', 'Formel 1 – GP Mexiko, Qualifying Männer')), 'GP Mexiko, Qualifying');
  assert.equal(displayTitle(ev('rsila2', '2026-11-04T19:10:00Z', 'Automobilismo: Formula Uno 2026 - Gran Premio del Messico (R)')), 'Gran Premio del Messico');
});

test('Filter: Highlights standardmässig ausgeblendet, laufende Events zählen zu «Heute»', () => {
  const now = new Date('2026-11-04T20:00:00.000Z');
  const groups = groupEvents(
    [
      ev('srf2', '2026-11-04T19:10:00.000Z', 'läuft'),
      ev('srf2', '2026-11-04T22:00:00.000Z', 'HL', { kind: 'highlights' }),
      ev('srf2', '2026-11-05T19:10:00.000Z', 'morgen', { sport: 'icehockey', competition: 'nhl' }),
      ev('srf2', '2026-11-03T10:00:00.000Z', 'vorbei'),
    ],
    CHANNEL_PRIORITY,
  );
  const titles = (f: Parameters<typeof applyFilter>[1]) => applyFilter(groups, f, now).map((g) => g.primary.title);
  assert.deepEqual(titles({ sport: 'all', period: 'today', secondary: false }), ['läuft']);
  assert.deepEqual(titles({ sport: 'all', period: 'today', secondary: true }), ['läuft', 'HL']);
  assert.deepEqual(titles({ sport: 'icehockey', period: 'week', secondary: false }), ['morgen']);
  assert.deepEqual(titles({ sport: 'all', period: 'tomorrow', secondary: false }), ['morgen']);
});

test('Datums- und Restzeit-Texte', () => {
  const now = new Date('2026-10-31T10:00:00.000Z');
  assert.equal(dayLabel('2026-10-31', now), 'Heute');
  assert.equal(dayLabel('2026-11-01', now), 'Morgen');
  assert.match(dayLabel('2026-11-03', now), /^Di 3\.11\.?$/);
  assert.equal(remaining('2026-10-31T11:25:00.000Z', now), 'noch 1 Std. 25');
  assert.equal(remaining('2026-10-31T10:45:00.000Z', now), 'noch 45 Min.');
});
