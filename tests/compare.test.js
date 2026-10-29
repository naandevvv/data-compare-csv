// Lancer avec : node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const { parseCSV } = require('../js/csv.js');
const { compareValues, compareTables, DEFAULT_OPTIONS } = require('../js/compare.js');

const eq = (a, b, o) => compareValues(a, b, Object.assign({}, DEFAULT_OPTIONS, o)) === null;

test('parseCSV gère guillemets, BOM et retours à la ligne', () => {
  const rows = parseCSV('﻿CLE,A\r\n"1|2","x, ""y""\nz"\r\n\r\n');
  assert.deepStrictEqual(rows, [['CLE', 'A'], ['1|2', 'x, "y"\nz']]);
});

test('normalisation des nombres', () => {
  assert.ok(eq('1.50', '1.5'));
  assert.ok(eq('1,5', '1.5'));
  assert.ok(eq('0010', '10'));
  assert.ok(!eq('0010', '10', { ignoreLeadingZeros: false }));
  assert.ok(eq('10.00', '10.009'));
  assert.ok(!eq('10.00', '10.02'));
  assert.ok(!eq('10', '10.001', { tolerance: 0 }));
  assert.ok(eq('12345678901234567890', '012345678901234567890'));
  assert.ok(eq('-0', '0'));
});

test('normalisation des dates', () => {
  assert.ok(eq('29/10/2026', '2026-10-29'));
  assert.ok(eq('29/10/2026', '2026-10-29 00:00:00.000'));
  assert.ok(eq('01/02/2026 13:45:00', '2026-02-01 13:45:00.000'));
  assert.ok(!eq('01/02/2026', '2026-01-02'));
  assert.ok(!eq('29/10/2026', '2026-10-29', { normalizeDates: false }));
});

test('NULL, espaces et casse', () => {
  assert.ok(eq('', 'NULL'));
  assert.ok(eq(' abc ', 'abc'));
  assert.ok(!eq('ABC', 'abc'));
  assert.ok(eq('ABC', 'abc', { ignoreCase: true }));
  assert.ok(!eq('', '0'));
});

test('compareTables détecte écarts, lignes manquantes, doublons et colonnes', () => {
  const a = parseCSV('CLE,MONTANT,LIB,OLD\n1|a,10.00,x,1\n2|b,5,y,1\n3|c,1,z,1\n3|c,1,z,1\n');
  const b = parseCSV('cle,lib,montant,NEW\n1|a,x,10,2\n2|b,Y,6,2\n4|d,w,1,2\n');
  const r = compareTables(a, b);
  assert.strictEqual(r.ok, false);
  assert.deepStrictEqual(r.onlyA, ['3|c']);
  assert.deepStrictEqual(r.onlyB, ['4|d']);
  assert.strictEqual(r.counts.identical, 1);
  assert.strictEqual(r.diffRows.length, 1);
  assert.deepStrictEqual(r.diffRows[0].diffs.map((d) => d.col), ['MONTANT', 'LIB']);
  assert.strictEqual(r.diffRows[0].diffs[0].delta, 1);
  assert.deepStrictEqual(r.a.duplicates, [{ key: '3|c', count: 2 }]);
  assert.deepStrictEqual(r.columns.aOnly, ['OLD']);
  assert.deepStrictEqual(r.columns.bOnly, ['NEW']);
});

test('compareTables signale une colonne CLE manquante', () => {
  const r = compareTables(parseCSV('ID,A\n1,2'), parseCSV('CLE,A\n1,2'));
  assert.ok(r.error);
  assert.match(r.errorA, /CLE/);
  assert.strictEqual(r.errorB, null);
});
