import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guessMapping, normalizeDate, normalizePhone, parseCsv, splitGroups, toImportRow } from '../../lib/import/csv.ts';

test('parses quoted fields, doubled quotes, embedded commas and newlines, CRLF and a BOM', () => {
  const rows = parseCsv('﻿First Name,Last Name,Notes\r\n"Mary","O""Neil","likes, coffee\nand tea"\r\nJo,Lee,\r\n\r\n');
  assert.deepEqual(rows, [
    ['First Name', 'Last Name', 'Notes'],
    ['Mary', "O\"Neil", 'likes, coffee\nand tea'],
    ['Jo', 'Lee', ''],
  ]);
});

test('reads semicolon-separated files', () => {
  assert.deepEqual(parseCsv('a;b\n1;2'), [['a', 'b'], ['1', '2']]);
});

test('guesses a Planning Center export’s columns', () => {
  const headers = ['Person ID', 'First Name', 'Last Name', 'Home Email', 'Mobile Phone Number', 'Home Phone Number', 'Created At', 'Membership'];
  assert.deepEqual(guessMapping(headers), {
    external_id: 0,
    first_name: 1,
    last_name: 2,
    email: 3,
    phone: 4,
    joined_on: 6,
  });
});

test('falls back to a full name column', () => {
  const m = guessMapping(['Name', 'Email']);
  const row = toImportRow(['Ana María Ruiz', 'ANA@Example.com '], m);
  assert.deepEqual(row, {
    first_name: 'Ana',
    last_name: 'María Ruiz',
    email: 'ana@example.com',
    phone: null,
    external_id: null,
    joined_on: null,
    groups: [],
  });
});

test('normalizes phones, dates and groups', () => {
  assert.equal(normalizePhone('(432) 555-1234'), '+14325551234');
  assert.equal(normalizePhone('1-432-555-1234'), '+14325551234');
  assert.equal(normalizePhone('+44 20 7946 0958'), '+442079460958');
  assert.equal(normalizePhone('555-1234'), null);
  assert.equal(normalizeDate('3/5/2024'), '2024-03-05T12:00:00.000Z');
  assert.equal(normalizeDate('2024-03-05'), '2024-03-05T12:00:00.000Z');
  assert.equal(normalizeDate('not a date'), null);
  const now = new Date('2026-10-08T00:00:00Z');
  assert.equal(normalizeDate('2030-01-01', now), now.toISOString(), 'never in the future');
  assert.deepEqual(splitGroups('Tuesday Men;  Worship Team, Tuesday Men|Kids'), ['Tuesday Men', 'Worship Team', 'Kids']);
});

test('a row without a first name is refused', () => {
  assert.deepEqual(toImportRow(['', 'Lee'], { first_name: 0, last_name: 1 }), { error: 'No first name' });
});
