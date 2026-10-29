/*
 * Moteur de comparaison Oracle / Snowflake.
 * Aucune dépendance au DOM : utilisable dans le navigateur et sous Node (tests).
 */
(function (root) {
  'use strict';

  const KEY_NAMES = ['CLE', 'CLÉ'];

  const DEFAULT_OPTIONS = {
    tolerance: 0.01, // écart numérique absolu toléré
    ignoreLeadingZeros: true, // 0010 = 10
    normalizeDates: true, // 29/10/2026 = 2026-10-29 00:00:00.000
    nullEquivalent: true, // '' = NULL = null
    trim: true, // espaces en début / fin ignorés
    ignoreCase: false, // ABC = abc
  };

  function normHeader(h) {
    return String(h).replace(/^﻿/, '').trim().toUpperCase();
  }

  /* ---------- Construction d'une table indexée par CLE ---------- */

  function buildTable(rows) {
    if (!rows || !rows.length) return { error: 'Fichier vide.' };
    const headers = rows[0].map((h) => String(h).replace(/^﻿/, '').trim());
    const norm = headers.map(normHeader);
    const keyIndex = norm.findIndex((h) => KEY_NAMES.includes(h));
    if (keyIndex < 0) {
      return { error: 'Colonne « CLE » introuvable dans l’en-tête.' };
    }
    const colIndex = new Map();
    norm.forEach((h, i) => {
      if (!colIndex.has(h)) colIndex.set(h, i);
    });

    const map = new Map();
    const counts = new Map();
    const order = [];
    const badRows = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const key = (r[keyIndex] == null ? '' : String(r[keyIndex])).trim();
      counts.set(key, (counts.get(key) || 0) + 1);
      if (!map.has(key)) {
        map.set(key, r);
        order.push(key);
      }
      if (r.length !== headers.length) badRows.push(i + 1);
    }
    const duplicates = [];
    counts.forEach((count, key) => {
      if (count > 1) duplicates.push({ key, count });
    });

    return {
      headers,
      norm,
      keyIndex,
      colIndex,
      map,
      order,
      duplicates,
      rowCount: rows.length - 1,
      badRows,
    };
  }

  /* ---------- Normalisation des valeurs ---------- */

  const NUM_RE = /^([+-])?(\d*)(?:[.,](\d*))?(?:[eE]([+-]?\d+))?$/;
  const FR_DATE_RE =
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:[.,](\d+))?)?)?$/;
  const ISO_DATE_RE =
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:[.,](\d+))?)?)?(?:\s*(?:Z|[+-]\d{2}:?\d{2}))?$/;

  const pad = (s, n) => String(s).padStart(n, '0');

  function canonicalDate(y, mo, d, h, mi, s, frac) {
    let out = pad(y, 4) + '-' + pad(mo, 2) + '-' + pad(d, 2);
    const f = (frac || '').replace(/0+$/, '');
    if (+(h || 0) || +(mi || 0) || +(s || 0) || f) {
      out += ' ' + pad(h || 0, 2) + ':' + pad(mi || 0, 2) + ':' + pad(s || 0, 2);
      if (f) out += '.' + f;
    }
    return out;
  }

  function parseDate(s) {
    let m = FR_DATE_RE.exec(s);
    if (m) return canonicalDate(m[3], m[2], m[1], m[4], m[5], m[6], m[7]);
    m = ISO_DATE_RE.exec(s);
    if (m) return canonicalDate(m[1], m[2], m[3], m[4], m[5], m[6], m[7]);
    return null;
  }

  function parseNumber(s) {
    const m = NUM_RE.exec(s);
    if (!m) return null;
    const intPart = m[2] || '';
    const fracPart = m[3] || '';
    if (!intPart && !fracPart) return null;
    const value = parseFloat(s.replace(',', '.'));
    if (!isFinite(value)) return null;
    let canon;
    if (m[4]) {
      canon = String(value);
    } else {
      const i = intPart.replace(/^0+/, '') || '0';
      const f = fracPart.replace(/0+$/, '');
      canon = i + (f ? '.' + f : '');
      if (m[1] === '-' && canon !== '0') canon = '-' + canon;
    }
    return { value, canon, leadingZero: /^0\d/.test(intPart) };
  }

  function normalize(raw, opts) {
    let s = raw == null ? '' : String(raw);
    if (opts.trim) s = s.trim();
    if (opts.nullEquivalent && (s === '' || /^null$/i.test(s))) {
      return { kind: 'null', text: '' };
    }
    if (opts.normalizeDates) {
      const d = parseDate(s);
      if (d) return { kind: 'date', text: d };
    }
    const n = parseNumber(s);
    if (n && (opts.ignoreLeadingZeros || !n.leadingZero)) {
      return { kind: 'number', text: n.canon, value: n.value };
    }
    return { kind: 'text', text: opts.ignoreCase ? s.toLowerCase() : s };
  }

  /* Retourne null si égal, sinon { delta } (delta numérique ou null). */
  function compareValues(a, b, opts) {
    const na = normalize(a, opts);
    const nb = normalize(b, opts);
    if (na.kind === 'number' && nb.kind === 'number') {
      if (na.text === nb.text) return null;
      const delta = Number((nb.value - na.value).toPrecision(12));
      // petite marge pour les erreurs d'arrondi flottant
      if (Math.abs(delta) <= (opts.tolerance || 0) + 1e-9) return null;
      return { delta };
    }
    if (na.kind === nb.kind && na.text === nb.text) return null;
    return { delta: null };
  }

  /* ---------- Comparaison de deux fichiers ---------- */

  function compareTables(oracleRows, snowRows, options) {
    const opts = Object.assign({}, DEFAULT_OPTIONS, options || {});
    const oracle = buildTable(oracleRows);
    const snow = buildTable(snowRows);
    if (oracle.error || snow.error) {
      return {
        error: [
          oracle.error && 'Oracle : ' + oracle.error,
          snow.error && 'Snowflake : ' + snow.error,
        ]
          .filter(Boolean)
          .join(' '),
      };
    }

    // Colonnes (comparaison insensible à la casse et à l'ordre)
    const common = [];
    const oracleOnly = [];
    oracle.norm.forEach((h, i) => {
      if (i === oracle.keyIndex) return;
      if (oracle.colIndex.get(h) !== i) return; // en-tête dupliqué
      if (snow.colIndex.has(h) && snow.colIndex.get(h) !== snow.keyIndex) {
        common.push({ name: oracle.headers[i], o: i, s: snow.colIndex.get(h) });
      } else {
        oracleOnly.push(oracle.headers[i]);
      }
    });
    const snowOnly = [];
    snow.norm.forEach((h, i) => {
      if (i === snow.keyIndex || snow.colIndex.get(h) !== i) return;
      if (!oracle.colIndex.has(h)) snowOnly.push(snow.headers[i]);
    });

    const onlyOracle = oracle.order.filter((k) => !snow.map.has(k));
    const onlySnow = snow.order.filter((k) => !oracle.map.has(k));

    const diffRows = [];
    const colCounts = new Map();
    let identical = 0;
    for (const key of oracle.order) {
      const so = snow.map.get(key);
      if (!so) continue;
      const ro = oracle.map.get(key);
      const diffs = [];
      for (const c of common) {
        const vo = ro[c.o];
        const vs = so[c.s];
        const d = compareValues(vo, vs, opts);
        if (d) {
          diffs.push({ col: c.name, o: vo == null ? '' : vo, s: vs == null ? '' : vs, delta: d.delta });
          colCounts.set(c.name, (colCounts.get(c.name) || 0) + 1);
        }
      }
      if (diffs.length) diffRows.push({ key, diffs });
      else identical++;
    }

    const columnStats = common
      .filter((c) => colCounts.has(c.name))
      .map((c) => ({ col: c.name, count: colCounts.get(c.name) }))
      .sort((a, b) => b.count - a.count);

    const commonRows = oracle.order.length - onlyOracle.length;
    const ok =
      !diffRows.length &&
      !onlyOracle.length &&
      !onlySnow.length &&
      !oracle.duplicates.length &&
      !snow.duplicates.length &&
      !oracleOnly.length &&
      !snowOnly.length;

    return {
      ok,
      oracle,
      snow,
      columns: { common, oracleOnly, snowOnly },
      diffColumns: common.filter((c) => colCounts.has(c.name)).map((c) => c.name),
      onlyOracle,
      onlySnow,
      diffRows,
      columnStats,
      counts: {
        oracle: oracle.rowCount,
        snowflake: snow.rowCount,
        commonRows,
        identical,
        withDiffs: diffRows.length,
        onlyOracle: onlyOracle.length,
        onlySnow: onlySnow.length,
        dupOracle: oracle.duplicates.length,
        dupSnow: snow.duplicates.length,
        diffCells: diffRows.reduce((n, r) => n + r.diffs.length, 0),
      },
    };
  }

  const api = { DEFAULT_OPTIONS, normalize, compareValues, buildTable, compareTables };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DataCompare = api;
})(this);
