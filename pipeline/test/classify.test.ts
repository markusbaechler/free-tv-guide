import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { loadChannels, loadRights, loadRules } from '../config.ts';
import { classify, isUnclassifiedSport } from '../classify.ts';
import type { Program } from '../types.ts';

const CONFIG = join(import.meta.dirname, '..', '..', 'config');
const channels = loadChannels(CONFIG);
const rights = loadRights(CONFIG, new Set(channels.map((c) => c.id)));
const rules = loadRules(CONFIG, new Set(rights.keys()));

function prog(title: string, extra: Partial<Program> = {}): Program {
  return { channel: 'srf2', start: '2026-11-01T13:00:00.000Z', end: null, title, subtitle: null, description: null, genre: null, live: null, rerun: null, ...extra };
}

const cases: Array<[string, Partial<Program>, string | null, string?]> = [
  ['Fussball – Super League, FC Basel – BSC Young Boys', {}, 'super-league', 'live'],
  ['Fussball', { subtitle: 'UEFA Champions League, Liga-Phase: Inter – Bayern' }, 'champions-league', 'live'],
  ['Fussball – Champions League Highlights', {}, 'champions-league', 'highlights'],
  ['Eishockey – Champions Hockey League, ZSC Lions – Frölunda', {}, 'champions-hockey-league'],
  ['Eishockey – Spengler Cup, HC Davos – Team Canada', {}, 'spengler-cup'],
  ['Eishockey – Länderspiel Schweiz – Schweden', {}, 'nati-icehockey'],
  ['Formel 1', { subtitle: 'GP Mexiko, Rennen Männer – aus Mexiko-Stadt', genre: 'Sport · Automobilsport' }, 'formula-1', 'live'],
  ['Formel 1 – GP Mexiko, Rennen Teilaufzeichnung', {}, 'formula-1', 'replay'],
  ['Motorrad – MotoGP, Grand Prix von Valencia', { genre: 'Sport · Motorsport' }, 'motogp'],
  ['Fussball – Women\'s Super League, FC Zürich – Servette', {}, 'super-league-women'],
  ['Fussball – Nations League, Schweiz – Spanien', {}, 'nati-football'],
  ['Sportflash', { subtitle: 'Fussball, Eishockey, Formel 1' }, null],
  ['Sykora Gisler – Der Fussball-Talk', {}, null],
  ['Tennis – Swiss Indoors Männer Viertelfinal', {}, null],
];

for (const [title, extra, competition, kind] of cases) {
  test(`classify: ${title}`, () => {
    const c = classify(prog(title, extra), rules);
    assert.equal(c?.competition ?? null, competition);
    if (kind) assert.equal(c?.kind, kind);
  });
}

test('live=false aus der Quelle → replay', () => {
  assert.equal(classify(prog('Fussball – Super League, FCZ – GC', { live: false }), rules)?.kind, 'replay');
});

test('replica=true aus der Quelle → replay, auch wenn isLive fehlt', () => {
  assert.equal(classify(prog('Formel 1 – GP Mexiko, Rennen', { rerun: true }), rules)?.kind, 'replay');
});

test('Beschreibung allein klassifiziert nicht', () => {
  assert.equal(classify(prog('Tagesgespräch', { description: 'Danach: Eishockey National League' }), rules), null);
});

test('unklassifizierter Sport wird für debug erkannt', () => {
  assert.equal(isUnclassifiedSport(prog('Fussball – Testspiel FC Luzern – FC Aarau'), rules), true);
  assert.equal(isUnclassifiedSport(prog('Sportflash'), rules), false);
});
