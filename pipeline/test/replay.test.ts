import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { loadChannels } from '../config.ts';
import { buildReplay, needsPastFetch } from '../replay.ts';
import { normalizeProgram } from '../sources/srg.ts';
import type { Program } from '../types.ts';

const CONFIG = join(import.meta.dirname, '..', '..', 'config');

test('Nachsehen: nur SRF-Sender mit replay: true', () => {
  const ids = loadChannels(CONFIG).filter((c) => c.replay).map((c) => c.id);
  assert.deepEqual(ids.sort(), ['srf1', 'srf2', 'srfinfo']);
});

test('SRG-Normalisierung: vodUrn nur als Video-URN', () => {
  const base = { title: 'Tagesschau', dateTimes: { startTime: '2026-11-03T19:30:00+01:00', endTime: '2026-11-03T20:00:00+01:00' } };
  assert.equal(normalizeProgram({ ...base, vodUrn: 'urn:srf:video:28e1a57d-5b76-4399-8ab3-9097f071e6c5' }, 'srf1')!.vodUrn, 'urn:srf:video:28e1a57d-5b76-4399-8ab3-9097f071e6c5');
  assert.equal(normalizeProgram({ ...base, vodUrn: 'urn:rts:video:6348260' }, 'rts1')!.vodUrn, 'urn:rts:video:6348260');
  assert.equal(normalizeProgram({ ...base, vodUrn: '' }, 'srf1')!.vodUrn, null);
  assert.equal(normalizeProgram({ ...base, vodUrn: 'urn:srf:show:tv:123' }, 'srf1')!.vodUrn, null);
  assert.equal(normalizeProgram(base, 'srf1')!.vodUrn, null);
});

const prog = (channel: string, start: string, end: string | null, vodUrn: string | null, title = 'X'): Program => ({
  channel, start, end, title, subtitle: null, description: null, genre: null, live: null, rerun: null, vodUrn,
});

test('Nachsehen: nur beendete Sendungen mit URN, im Fenster, neueste zuerst, ohne Doppel', () => {
  const now = '2026-11-04T20:00:00.000Z';
  const from = '2026-10-27T23:00:00.000Z';
  const r = buildReplay(
    [
      prog('srf1', '2026-11-04T18:30:00.000Z', '2026-11-04T19:00:00.000Z', 'urn:srf:video:a', 'Tagesschau'),
      prog('srf1', '2026-11-04T19:30:00.000Z', '2026-11-04T20:30:00.000Z', 'urn:srf:video:b', 'läuft noch'),
      prog('srf1', '2026-11-03T18:30:00.000Z', '2026-11-03T19:00:00.000Z', 'urn:srf:video:c', 'gestern'),
      prog('srf1', '2026-11-03T18:30:00.000Z', '2026-11-03T19:00:00.000Z', 'urn:srf:video:c', 'gestern'),
      prog('srf1', '2026-11-03T20:00:00.000Z', '2026-11-03T21:00:00.000Z', null, 'ohne URN'),
      prog('srf1', '2026-10-20T18:30:00.000Z', '2026-10-20T19:00:00.000Z', 'urn:srf:video:d', 'zu alt'),
      prog('rts1', '2026-11-04T18:30:00.000Z', '2026-11-04T19:00:00.000Z', 'urn:rts:video:1', 'kein replay'),
    ],
    new Set(['srf1', 'srf2']),
    now,
    from,
  );
  assert.deepEqual(Object.keys(r), ['srf1']);
  assert.deepEqual(r.srf1!.map((e) => e.title), ['Tagesschau', 'gestern']);
  assert.equal(r.srf1![0]!.urn, 'urn:srf:video:a');
});

test('Nachsehen: vergangene Tage neu laden', () => {
  const nowMs = Date.parse('2026-11-04T20:00:00Z');
  const fresh = { fetchedAt: '2026-11-04T10:00:00Z', programs: [prog('srf1', '2026-11-01T18:30:00Z', null, null)] };
  const old = { fetchedAt: '2026-11-03T10:00:00Z', programs: fresh.programs };
  const legacy = { fetchedAt: '2026-11-04T10:00:00Z', programs: [{ ...fresh.programs[0]!, vodUrn: undefined }].map(({ vodUrn, ...p }) => p as Program) };
  assert.equal(needsPastFetch('2026-11-01', '2026-11-03', null, nowMs, 20), true);
  assert.equal(needsPastFetch('2026-11-03', '2026-11-03', fresh, nowMs, 20), true); // gestern: immer
  assert.equal(needsPastFetch('2026-11-01', '2026-11-03', fresh, nowMs, 20), false);
  assert.equal(needsPastFetch('2026-11-01', '2026-11-03', old, nowMs, 20), true);
  assert.equal(needsPastFetch('2026-11-01', '2026-11-03', legacy, nowMs, 20), true); // Cache vor 0.14
});
