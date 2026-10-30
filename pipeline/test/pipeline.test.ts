import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { loadChannels, loadRights, loadRules } from '../config.ts';
import { checkRights } from '../rights.ts';
import { extractPrograms, fillEndTimes, normalizeProgram } from '../sources/srg.ts';
import { addDays, zurichDate, zurichLocalToUtc } from '../time.ts';

const CONFIG = join(import.meta.dirname, '..', '..', 'config');
const channels = loadChannels(CONFIG);
const rights = loadRights(CONFIG, new Set(channels.map((c) => c.id)));

test('Config lädt konsistent', () => {
  assert.ok(channels.length >= 20);
  assert.doesNotThrow(() => loadRules(CONFIG, new Set(rights.keys())));
  // YAML-Anker in Listen werden flach gemacht
  assert.ok(rights.get('bundesliga')!.channels.includes('sat1'));
  assert.ok(rights.get('bundesliga')!.channels.includes('srf2'));
});

test('Rechte: Sender und Gültigkeit', () => {
  assert.equal(checkRights(rights, 'champions-league', 'srf2', '2026-11-04T20:00:00Z').ok, true);
  assert.equal(checkRights(rights, 'champions-league', 'tv24', '2026-11-04T20:00:00Z').ok, false);
  // CL-Rechte der SRG enden mit der Saison 2026/27
  assert.equal(checkRights(rights, 'champions-league', 'srf2', '2027-09-15T19:00:00Z').ok, false);
  assert.equal(checkRights(rights, 'unbekannt', 'srf2', '2026-11-04T20:00:00Z').ok, false);
});

test('Zeit: Zürich ↔ UTC inkl. Sommer/Winterzeit', () => {
  assert.equal(zurichLocalToUtc('2026-11-01 14:00'), '2026-11-01T13:00:00.000Z'); // MEZ
  assert.equal(zurichLocalToUtc('2026-07-05 16:00'), '2026-07-05T14:00:00.000Z'); // MESZ
  assert.equal(zurichDate(new Date('2026-10-31T23:30:00Z')), '2026-11-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('SRG-Normalisierung: Antwortformat laut OpenAPI (Array, isLive, replica)', () => {
  const payload = [
    { title: 'Fussball', shortDescription: 'Super League: FC Basel – YB', dateTimes: { startTime: '2026-11-01T16:15:00+01:00', endTime: '2026-11-01T18:30:00+01:00', duration: '135' }, isLive: true, replica: false },
    { title: 'Fussball', shortDescription: 'Super League: FC Basel – YB', dateTimes: { startTime: '2026-11-02T01:00:00+01:00', endTime: '2026-11-02T03:00:00+01:00' }, isLive: false, replica: true },
    { title: 'FC Lucerne - FC Sion', subTitle: 'Super League <br>12e journée', shortDescription: 'lang', dateTimes: { startTime: '2026-10-31T20:10:00+01:00' } },
  ];
  const progs = extractPrograms(payload).map((r) => normalizeProgram(r, 'srf2'));
  assert.equal(progs[0]!.live, true);
  assert.equal(progs[0]!.subtitle, 'Super League: FC Basel – YB');
  assert.equal(progs[1]!.rerun, true);
  assert.equal(progs[0]!.end, '2026-11-01T17:30:00.000Z');
  assert.equal(progs[2]!.subtitle, 'Super League · 12e journée');
});

test('SRG-Normalisierung: dateTimes, Genre-Objekte, fehlende Endzeit', () => {
  const payload = {
    programs: [
      { title: 'Formel 1', subtitle: 'GP Mexiko', dateTimes: { startTime: '2026-11-01T20:30:00+01:00' }, genre: { name: 'Sport', subGenre: { name: 'Automobilsport' } } },
      { title: 'Tagesschau', dateTimes: { startTime: '2026-11-01T22:45:00+01:00', endTime: '2026-11-01T23:00:00+01:00' } },
      { title: '' },
    ],
  };
  const progs = extractPrograms(payload).map((r) => normalizeProgram(r, 'srf2')).filter((p) => p !== null);
  assert.equal(progs.length, 2);
  assert.equal(progs[0]!.start, '2026-11-01T19:30:00.000Z');
  assert.equal(progs[0]!.genre, 'Sport · Automobilsport');
  const filled = fillEndTimes(progs);
  assert.equal(filled[0]!.end, '2026-11-01T21:45:00.000Z');
  assert.equal(filled[1]!.end, '2026-11-01T22:00:00.000Z');
});
