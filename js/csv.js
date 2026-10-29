/*
 * Parseur CSV (RFC 4180) : guillemets, guillemets échappés ("") et retours
 * à la ligne à l'intérieur d'une valeur entre guillemets.
 */
(function (root) {
  'use strict';

  function parseCSV(text, sep) {
    sep = sep || ',';
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    const n = text.length;

    for (let i = 0; i < n; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === sep) {
        row.push(field);
        field = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += c;
      }
    }
    if (field !== '' || row.length) {
      row.push(field);
      rows.push(row);
    }
    // Ignore les lignes entièrement vides (ex. ligne finale).
    return rows.filter((r) => r.length > 1 || r[0].trim() !== '');
  }

  const api = { parseCSV };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DataCompareCSV = api;
})(this);
