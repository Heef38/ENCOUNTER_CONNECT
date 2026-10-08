import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  zonedWallTimeToUtc, dayKeyInZone, clockInZone, monthWindowInZone, addDaysToDateKey, formatTimeInZone,
} from '../../lib/time/zoned.ts';

test('a Texas evening is stored as the right UTC instant, across DST', () => {
  // CDT (UTC-5) in October, CST (UTC-6) in December.
  assert.equal(zonedWallTimeToUtc('2026-10-13', '18:30', 'America/Chicago')?.toISOString(), '2026-10-13T23:30:00.000Z');
  assert.equal(zonedWallTimeToUtc('2026-12-08', '18:30', 'America/Chicago')?.toISOString(), '2026-12-09T00:30:00.000Z');
  // The night clocks fall back (Nov 1 2026) and spring forward (Mar 8 2026).
  assert.equal(zonedWallTimeToUtc('2026-11-01', '19:00', 'America/Chicago')?.toISOString(), '2026-11-02T01:00:00.000Z');
  assert.equal(zonedWallTimeToUtc('2026-03-08', '19:00', 'America/Chicago')?.toISOString(), '2026-03-09T00:00:00.000Z');
});

test('a gathering at 7pm Texas time is on the right day and time for every viewer', () => {
  const iso = '2026-10-14T00:00:00.000Z'; // 7pm CDT on the 13th
  assert.equal(dayKeyInZone(iso, 'America/Chicago'), '2026-10-13');
  assert.equal(clockInZone(iso, 'America/Chicago'), '19:00');
  assert.equal(formatTimeInZone(iso, 'America/Chicago'), '7:00 PM');
  assert.equal(dayKeyInZone(iso, 'UTC'), '2026-10-14', 'the server’s own zone would say the 14th');
});

test('month windows start at local midnight', () => {
  assert.deepEqual(monthWindowInZone(2026, 10, 'America/Chicago'), {
    from: '2026-10-01T05:00:00.000Z',
    to: '2026-11-01T05:00:00.000Z',
  });
  assert.equal(monthWindowInZone(2026, 12, 'America/Denver').to, '2027-01-01T07:00:00.000Z');
});

test('weekly repeats step whole calendar days', () => {
  assert.equal(addDaysToDateKey('2026-10-27', 7), '2026-11-03');
  assert.equal(addDaysToDateKey('2026-12-29', 7), '2027-01-05');
  assert.equal(zonedWallTimeToUtc('2026', '18:00', 'America/Chicago'), null);
});
