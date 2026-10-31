import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { loadChannels, loadRights, loadRules } from '../../pipeline/config.ts';
import type { RulesJson } from '../../pipeline/types.ts';
import { satEvents } from '../src/satsport.ts';

const CONFIG = join(import.meta.dirname, '..', '..', 'config');
const channels = loadChannels(CONFIG);
const rights = loadRights(CONFIG, new Set(channels.map((c) => c.id)));
const rules = loadRules(CONFIG, new Set(rights.keys()));

// Gleiche Umwandlung wie in pipeline/main.ts (rules.json)
const src = (list: RegExp[]) => list.map((r) => r.source);
const json: RulesJson = {
  exclude: src(rules.exclude),
  highlights: src(rules.highlights),
  replay: src(rules.replay),
  competitions: rules.competitions.map((r) => ({ id: r.id, patterns: src(r.patterns), requireAny: src(r.requireAny) })),
  rights: {},
};
for (const [id, r] of rights) json.rights[id] = { name: r.name, sport: r.sport, reception: r.reception };

test('Sat-EPG: Sport wird mit den Pipeline-Regeln erkannt, ohne Senderrechte-Prüfung', () => {
  const events = satEvents(json, 'sat1', [
    { title: 'ran Fussball: Bundesliga', subtitle: '1. FC Köln – FC Bayern München, 9. Spieltag', start: '2026-10-31T17:30:00.000Z', end: '2026-10-31T20:00:00.000Z' },
    { title: 'Bundesliga Highlights', subtitle: null, start: '2026-10-31T22:00:00.000Z', end: '2026-10-31T23:00:00.000Z' },
    { title: 'Tagesschau', subtitle: null, start: '2026-10-31T19:00:00.000Z', end: '2026-10-31T19:15:00.000Z' },
    { title: 'Formel 1: Grosser Preis von Mexiko', subtitle: 'Rennen', start: '2026-11-01T20:00:00.000Z', end: null },
  ]);
  assert.equal(events.length, 2);
  assert.equal(events[0]!.competition, 'bundesliga');
  assert.equal(events[0]!.sport, 'football');
  assert.equal(events[0]!.kind, 'live');
  assert.equal(events[0]!.channel, 'sat1');
  assert.equal(events[0]!.source, 'sat-epg');
  assert.equal(events[1]!.kind, 'highlights');
});

test('Sat-EPG: Eurosport-Motorsport wird erkannt, obwohl der Sender in rights.yaml nicht steht', () => {
  const events = satEvents(json, 'eurosport1', [
    { title: 'MotoGP: Grand Prix von Valencia', subtitle: 'Rennen live', start: '2026-11-15T13:00:00.000Z', end: '2026-11-15T14:00:00.000Z' },
  ]);
  assert.equal(events.length, 1);
  assert.equal(events[0]!.sport, 'motorsport');
});
