/*
 * Interface du comparateur. Les données des CSV restent en mémoire dans
 * l'onglet : seuls les noms de tables et les règles de comparaison sont
 * mémorisés (localStorage) pour la prochaine visite.
 */
(function () {
  'use strict';

  const { parseCSV } = window.DataCompareCSV;
  const { compareTables, DEFAULT_OPTIONS } = window.DataCompare;

  const STORAGE_KEY = 'data-compare-csv.v1';
  const SIDES = ['a', 'b'];
  const DEFAULT_NAMES = { a: 'Source A', b: 'Source B' };
  const MAX_GRID_CELLS = 200000;

  const state = {
    tables: [],
    options: Object.assign({}, DEFAULT_OPTIONS),
    names: Object.assign({}, DEFAULT_NAMES),
    selectedId: null,
    view: freshView(),
  };
  let nextId = 1;

  function freshView() {
    return { tab: 'ecarts', search: '', column: '', allCols: false, rawSide: 'a', rawSearch: '' };
  }

  const $ = (sel, el) => (el || document).querySelector(sel);
  const esc = (v) =>
    String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
  const fmt = (n) => Number(n).toLocaleString('fr-FR');
  const name = (side) => esc(state.names[side].trim() || DEFAULT_NAMES[side]);
  const cellText = (v) => (v === '' || v == null ? '<span class="empty">∅</span>' : esc(v));

  /* ---------- Persistance (noms et options uniquement, jamais les données) ---------- */

  function save() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ tables: state.tables.map((t) => t.name), options: state.options, names: state.names })
      );
    } catch (e) { /* stockage indisponible : sans conséquence */ }
  }

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved) {
        Object.assign(state.options, saved.options || {});
        Object.assign(state.names, saved.names || {});
        (saved.tables || []).forEach((name) => addTable(name, true));
      }
    } catch (e) { /* ignore */ }
    if (!state.tables.length) addTable('Table 1', true);
  }

  /* ---------- Gestion des tables ---------- */

  function addTable(name, silent) {
    const t = { id: nextId++, name: name || 'Table ' + (state.tables.length + 1), files: {}, result: null };
    state.tables.push(t);
    if (!silent) {
      save();
      renderTables();
      renderDashboard();
      const input = $('[data-id="' + t.id + '"] .name');
      if (input) { input.focus(); input.select(); }
    }
    return t;
  }

  function removeTable(id) {
    const t = findTable(id);
    if (!t) return;
    if ((t.files.a || t.files.b) && !confirm('Supprimer la table « ' + t.name + ' » ?')) return;
    state.tables = state.tables.filter((x) => x.id !== id);
    if (state.selectedId === id) state.selectedId = null;
    save();
    renderAll();
  }

  const findTable = (id) => state.tables.find((t) => t.id === id);

  function compute(t) {
    t.result = t.files.a && t.files.b
      ? compareTables(t.files.a.rows, t.files.b.rows, state.options)
      : null;
  }

  function status(t) {
    if (!t.files.a || !t.files.b) return { cls: 'pending', label: 'En attente' };
    if (t.result.error) return { cls: 'error', label: 'Erreur' };
    if (t.result.ok) return { cls: 'ok', label: 'Identique' };
    return { cls: 'ko', label: 'Écarts' };
  }

  async function loadFile(t, side, file) {
    if (!file) return;
    try {
      const text = await file.text();
      t.files[side] = { name: file.name, rows: parseCSV(text, ',') };
    } catch (e) {
      alert('Impossible de lire « ' + file.name + ' » : ' + e.message);
      return;
    }
    compute(t);
    if (t.result && !state.selectedId) state.selectedId = t.id;
    renderAll();
  }

  /* ---------- Rendu : cartes des tables ---------- */

  function renderTables() {
    $('#tables').innerHTML = state.tables.map((t) => {
      const st = status(t);
      return (
        '<div class="table-card" data-id="' + t.id + '">' +
          '<div class="card-head">' +
            '<input class="name" value="' + esc(t.name) + '" aria-label="Nom de la table" spellcheck="false">' +
            '<span class="badge ' + st.cls + '">' + st.label + '</span>' +
            '<button type="button" class="icon-btn remove" title="Supprimer la table" aria-label="Supprimer la table">✕</button>' +
          '</div>' +
          '<div class="drops">' +
            SIDES.map((s) => {
              const f = t.files[s];
              return (
                '<label class="drop ' + s + (f ? ' loaded' : '') + '" data-side="' + s + '">' +
                  '<input type="file" accept=".csv,text/csv" class="file-input">' +
                  '<span class="side">' + name(s) + '</span>' +
                  (f
                    ? '<span class="file" title="' + esc(f.name) + '">' + esc(f.name) + '</span>' +
                      '<span class="meta">' + fmt(Math.max(f.rows.length - 1, 0)) + ' lignes · ' + fmt(f.rows[0] ? f.rows[0].length : 0) + ' colonnes</span>'
                    : '<span class="file placeholder">Déposer le CSV ici ou cliquer</span>') +
                '</label>'
              );
            }).join('') +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  /* ---------- Rendu : tableau de bord ---------- */

  function num(n, cls) {
    return '<td class="num' + (n ? ' ' + cls : '') + '">' + fmt(n) + '</td>';
  }

  function renderDashboard() {
    const tables = state.tables;
    if (!tables.length) {
      $('#dashboard').innerHTML = '<p class="muted">Aucune table.</p>';
      return;
    }
    const rows = tables.map((t) => {
      const st = status(t);
      const r = t.result;
      const sel = t.id === state.selectedId ? ' selected' : '';
      const head =
        '<tr class="dash-row' + sel + (r ? ' clickable' : '') + '" data-id="' + t.id + '">' +
        '<th scope="row">' + esc(t.name) + '</th>' +
        '<td><span class="badge ' + st.cls + '">' + st.label + '</span></td>';
      if (!r) return head + '<td colspan="9" class="muted">Déposez les deux fichiers.</td></tr>';
      if (r.error) return head + '<td colspan="9" class="error-text">' + errorText(r) + '</td></tr>';
      const c = r.counts;
      const colIssues = r.columns.aOnly.length + r.columns.bOnly.length;
      return head +
        '<td class="num">' + fmt(c.a) + '</td>' +
        '<td class="num">' + fmt(c.b) + '</td>' +
        '<td class="num good">' + fmt(c.identical) + '</td>' +
        num(c.withDiffs, 'bad') +
        num(r.columnStats.length, 'bad') +
        num(c.onlyA, 'bad') +
        num(c.onlyB, 'bad') +
        num(c.dupA + c.dupB, 'warn') +
        num(colIssues, 'warn') +
        '</tr>';
    });
    $('#dashboard').innerHTML =
      '<div class="scroll"><table class="dash">' +
      '<thead><tr><th>Table</th><th>Statut</th><th class="num">Lignes ' + name('a') + '</th><th class="num">Lignes ' + name('b') + '</th>' +
      '<th class="num">Identiques</th><th class="num">Lignes en écart</th><th class="num">Colonnes en écart</th>' +
      '<th class="num">Absentes côté ' + name('b') + '</th><th class="num">Absentes côté ' + name('a') + '</th><th class="num">Doublons de CLE</th>' +
      '<th class="num">Colonnes non communes</th></tr></thead>' +
      '<tbody>' + rows.join('') + '</tbody></table></div>';
  }

  /* ---------- Rendu : détail d'une table ---------- */

  function renderDetail() {
    const panel = $('#detail-panel');
    const t = findTable(state.selectedId);
    if (!t || !t.result || t.result.error) {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    const r = t.result;
    const c = r.counts;
    const v = state.view;
    const colIssues = r.columns.aOnly.length + r.columns.bOnly.length;
    const tabs = [
      ['ecarts', 'Écarts par ligne', c.withDiffs],
      ['colonnes', 'Synthèse par colonne', r.columnStats.length + colIssues],
      ['manquantes', 'Lignes manquantes', c.onlyA + c.onlyB],
      ['doublons', 'Doublons de CLE', c.dupA + c.dupB],
      ['brut', 'Données brutes', null],
    ];

    let body = '';
    if (v.tab === 'ecarts') body = renderDiffGrid(r);
    else if (v.tab === 'colonnes') body = renderColumns(r);
    else if (v.tab === 'manquantes') body = renderMissing(r);
    else if (v.tab === 'brut') body = renderRaw(t, r);
    else body = renderDuplicates(r);

    $('#detail').innerHTML =
      '<div class="panel-head">' +
        '<h2>3. Détail : ' + esc(t.name) + '</h2>' +
        '<button type="button" class="btn export-one">Exporter les écarts de la table</button>' +
      '</div>' +
      '<div class="kpis">' +
        kpi('Lignes communes', c.commonRows, '') +
        kpi('Identiques', c.identical, 'good') +
        kpi('Lignes en écart', c.withDiffs, c.withDiffs ? 'bad' : '') +
        kpi('Cellules en écart', c.diffCells, c.diffCells ? 'bad' : '') +
        kpi('Absentes côté ' + name('b'), c.onlyA, c.onlyA ? 'bad' : '') +
        kpi('Absentes côté ' + name('a'), c.onlyB, c.onlyB ? 'bad' : '') +
      '</div>' +
      warnings(r) +
      '<div class="tabs" role="tablist">' +
        tabs.map(([id, label, n]) =>
          '<button type="button" role="tab" class="tab' + (v.tab === id ? ' active' : '') + '" data-tab="' + id + '" aria-selected="' + (v.tab === id) + '">' +
          label + (n == null ? '' : ' <span class="count' + (n ? ' nz' : '') + '">' + fmt(n) + '</span>') + '</button>'
        ).join('') +
      '</div>' +
      '<div class="tab-body">' + body + '</div>';

    document.querySelectorAll('#detail [data-w]').forEach((el) => {
      el.style.width = el.getAttribute('data-w') + '%';
    });
  }

  function kpi(label, n, cls) {
    return '<div class="kpi ' + cls + '"><span class="kpi-n">' + fmt(n) + '</span><span class="kpi-l">' + label + '</span></div>';
  }

  function errorText(r) {
    return [r.errorA && name('a') + ' : ' + esc(r.errorA), r.errorB && name('b') + ' : ' + esc(r.errorB)]
      .filter(Boolean).join(' ');
  }

  function warnings(r) {
    const w = [];
    SIDES.forEach((s) => {
      const bad = r[s].badRows;
      if (bad.length) w.push(name(s) + ' : ' + bad.length + ' ligne(s) avec un nombre de colonnes différent de l’en-tête (lignes ' + bad.slice(0, 5).join(', ') + (bad.length > 5 ? '…' : '') + ').');
    });
    if (r.columns.aOnly.length) w.push('Colonnes présentes uniquement dans ' + name('a') + ' : ' + r.columns.aOnly.map(esc).join(', ') + '.');
    if (r.columns.bOnly.length) w.push('Colonnes présentes uniquement dans ' + name('b') + ' : ' + r.columns.bOnly.map(esc).join(', ') + '.');
    return w.length ? '<ul class="warnings">' + w.map((x) => '<li>' + x + '</li>').join('') + '</ul>' : '';
  }

  function renderDiffGrid(r) {
    const v = state.view;
    if (!r.diffRows.length) {
      return '<p class="empty-state">Aucun écart de valeur sur les ' + fmt(r.counts.commonRows) + ' lignes communes.</p>';
    }
    const search = v.search.trim().toLowerCase();
    const rows = r.diffRows.filter((d) =>
      (!search || d.key.toLowerCase().includes(search)) &&
      (!v.column || d.diffs.some((x) => x.col === v.column))
    );
    let cols = v.allCols ? r.columns.common.map((c) => c.name) : v.column ? [v.column] : r.diffColumns;
    const colMap = new Map(r.columns.common.map((c) => [c.name, c]));
    let truncated = false;
    if (rows.length * cols.length > MAX_GRID_CELLS) {
      cols = cols.slice(0, Math.max(1, Math.floor(MAX_GRID_CELLS / rows.length)));
      truncated = true;
    }

    const controls =
      '<div class="controls">' +
        '<input type="search" class="search" placeholder="Filtrer par CLE…" value="' + esc(v.search) + '">' +
        '<select class="col-filter"><option value="">Toutes les colonnes en écart</option>' +
          r.columnStats.map((s) => '<option value="' + esc(s.col) + '"' + (s.col === v.column ? ' selected' : '') + '>' + esc(s.col) + ' (' + fmt(s.count) + ')</option>').join('') +
        '</select>' +
        '<label class="toggle"><input type="checkbox" class="all-cols"' + (v.allCols ? ' checked' : '') + '> Afficher toutes les colonnes</label>' +
        '<span class="muted">' + fmt(rows.length) + ' ligne(s) · ' + fmt(cols.length) + ' colonne(s)</span>' +
      '</div>' +
      '<p class="legend"><span class="sw sa"></span>' + name('a') + ' <span class="sw sb"></span>' + name('b') + '. Les cellules en rouge sont les écarts. Survolez une cellule pour voir l’écart numérique.</p>' +
      (truncated ? '<p class="warnings">Affichage limité aux ' + fmt(cols.length) + ' premières colonnes. Utilisez le filtre par colonne.</p>' : '');

    const head = '<thead><tr><th class="sticky-col">CLE</th>' + cols.map((c) => '<th>' + esc(c) + '</th>').join('') + '</tr></thead>';
    const body = rows.map((d) => {
      const dm = new Map(d.diffs.map((x) => [x.col, x]));
      const ra = r.a.map.get(d.key);
      return '<tr><th class="sticky-col key">' + esc(d.key) + '<span class="nb">' + d.diffs.length + ' écart' + (d.diffs.length > 1 ? 's' : '') + '</span></th>' +
        cols.map((col) => {
          const x = dm.get(col);
          if (!x) return '<td class="same">' + cellText(ra[colMap.get(col).a]) + '</td>';
          const tip = x.delta != null ? ' title="Écart ' + name('b') + ' − ' + name('a') + ' : ' + esc(fmtDelta(x.delta)) + '"' : '';
          return '<td class="diff"' + tip + '><div class="va">' + cellText(x.a) + '</div><div class="vb">' + cellText(x.b) + '</div></td>';
        }).join('') + '</tr>';
    }).join('');

    return controls + (rows.length
      ? '<div class="scroll grid-wrap"><table class="grid">' + head + '<tbody>' + body + '</tbody></table></div>'
      : '<p class="empty-state">Aucune ligne ne correspond au filtre.</p>');
  }

  function fmtDelta(d) {
    return (d > 0 ? '+' : '') + Number(d.toPrecision(12)).toLocaleString('fr-FR', { maximumFractionDigits: 10 });
  }

  function renderColumns(r) {
    const common = r.counts.commonRows || 1;
    let html = '';
    if (r.columnStats.length) {
      html += '<p class="hint">Cliquez sur une colonne pour voir les lignes concernées.</p>' +
        '<div class="scroll"><table class="cols"><thead><tr><th>Colonne</th><th class="num">Lignes en écart</th><th class="num">% des lignes communes</th><th></th></tr></thead><tbody>' +
        r.columnStats.map((s) => {
          const pct = (100 * s.count) / common;
          return '<tr class="clickable col-row" data-col="' + esc(s.col) + '"><th scope="row">' + esc(s.col) + '</th>' +
            '<td class="num bad">' + fmt(s.count) + '</td><td class="num">' + pct.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' %</td>' +
            '<td class="bar-cell"><div class="bar"><div class="bar-fill" data-w="' + pct.toFixed(2) + '"></div></div></td></tr>';
        }).join('') + '</tbody></table></div>';
    } else {
      html += '<p class="empty-state">Aucune colonne en écart sur les ' + fmt(r.columns.common.length) + ' colonnes communes.</p>';
    }
    if (r.columns.aOnly.length || r.columns.bOnly.length) {
      html += '<div class="two-cols">' +
        listBlock('Uniquement dans ' + name('a'), r.columns.aOnly) +
        listBlock('Uniquement dans ' + name('b'), r.columns.bOnly) + '</div>';
    }
    return html;
  }

  function listBlock(title, items) {
    return '<div><h3>' + title + ' <span class="count' + (items.length ? ' nz' : '') + '">' + items.length + '</span></h3>' +
      (items.length ? '<ul class="tags">' + items.map((i) => '<li>' + esc(i) + '</li>').join('') + '</ul>' : '<p class="muted">Aucune.</p>') + '</div>';
  }

  function rowsTable(table, keys) {
    const h = table.headers;
    const order = [table.keyIndex].concat(h.map((_, i) => i).filter((i) => i !== table.keyIndex));
    return '<div class="scroll grid-wrap"><table class="grid">' +
      '<thead><tr>' + order.map((i, n) => '<th' + (n === 0 ? ' class="sticky-col"' : '') + '>' + esc(h[i]) + '</th>').join('') + '</tr></thead><tbody>' +
      keys.map((k) => {
        const row = table.map.get(k);
        return '<tr>' + order.map((i, n) => n === 0
          ? '<th class="sticky-col key">' + esc(row[i]) + '</th>'
          : '<td>' + cellText(row[i]) + '</td>').join('') + '</tr>';
      }).join('') + '</tbody></table></div>';
  }

  function renderMissing(r) {
    const section = (title, table, keys) =>
      '<h3>' + title + ' <span class="count' + (keys.length ? ' nz' : '') + '">' + fmt(keys.length) + '</span></h3>' +
      (keys.length ? rowsTable(table, keys) : '<p class="muted">Aucune.</p>');
    return section('Présentes dans ' + name('a') + ', absentes côté ' + name('b'), r.a, r.onlyA) +
      section('Présentes dans ' + name('b') + ', absentes côté ' + name('a'), r.b, r.onlyB);
  }

  function renderDuplicates(r) {
    const block = (title, list) =>
      '<div><h3>' + title + ' <span class="count' + (list.length ? ' nz' : '') + '">' + fmt(list.length) + '</span></h3>' +
      (list.length
        ? '<table class="cols"><thead><tr><th>CLE</th><th class="num">Occurrences</th></tr></thead><tbody>' +
          list.map((d) => '<tr><th scope="row">' + esc(d.key) + '</th><td class="num warn">' + d.count + '</td></tr>').join('') + '</tbody></table>'
        : '<p class="muted">Aucun.</p>') + '</div>';
    return '<p class="hint">En cas de doublon, seule la première occurrence est comparée.</p>' +
      '<div class="two-cols">' + block(name('a'), r.a.duplicates) + block(name('b'), r.b.duplicates) + '</div>';
  }

  function renderRaw(t, r) {
    const v = state.view;
    const side = v.rawSide;
    const table = r[side];
    const rows = t.files[side].rows;
    const headers = rows[0];
    const search = v.rawSearch.trim().toLowerCase();

    // Repérage des écarts : index de colonne (dans ce fichier) par CLE
    const colIdx = new Map(r.columns.common.map((c) => [c.name, c[side]]));
    const diffCells = new Map(r.diffRows.map((d) => [d.key, new Set(d.diffs.map((x) => colIdx.get(x.col)))]));
    const missing = new Set(side === 'a' ? r.onlyA : r.onlyB);
    const dups = new Set(table.duplicates.map((d) => d.key));

    let data = rows.slice(1).map((row, i) => ({ row, line: i + 2 }));
    if (search) data = data.filter((d) => d.row.some((x) => String(x).toLowerCase().includes(search)));
    let cols = headers.map((_, i) => i).filter((i) => i !== table.keyIndex);
    let truncated = false;
    if (data.length * cols.length > MAX_GRID_CELLS) {
      data = data.slice(0, Math.max(1, Math.floor(MAX_GRID_CELLS / cols.length)));
      truncated = true;
    }

    const controls =
      '<div class="controls">' +
        '<div class="seg" role="group" aria-label="Source">' +
          SIDES.map((s) => '<button type="button" class="seg-btn ' + s + (side === s ? ' active' : '') + '" data-raw-side="' + s + '" aria-pressed="' + (side === s) + '">' + name(s) + '</button>').join('') +
        '</div>' +
        '<input type="search" class="search" data-field="rawSearch" placeholder="Rechercher une valeur…" value="' + esc(v.rawSearch) + '">' +
        '<span class="muted">' + esc(t.files[side].name) + ' · ' + fmt(data.length) + ' ligne(s) · ' + fmt(headers.length) + ' colonne(s)</span>' +
      '</div>' +
      '<p class="legend"><span class="sw diff-sw"></span>Valeur en écart <span class="sw miss-sw"></span>Ligne absente de l\u2019autre source <span class="sw dup-sw"></span>CLE en doublon</p>' +
      (truncated ? '<p class="warnings">Affichage limité aux ' + fmt(data.length) + ' premières lignes. Utilisez la recherche.</p>' : '');

    const head = '<thead><tr><th class="sticky-col">CLE</th><th class="num">Ligne</th>' +
      cols.map((i) => '<th>' + esc(headers[i]) + '</th>').join('') + '</tr></thead>';
    const body = data.map(({ row, line }) => {
      const key = String(row[table.keyIndex] == null ? '' : row[table.keyIndex]).trim();
      const dc = diffCells.get(key);
      const cls = missing.has(key) ? ' class="row-missing"' : dups.has(key) ? ' class="row-dup"' : '';
      return '<tr' + cls + '><th class="sticky-col key">' + esc(key) + '</th><td class="num muted">' + line + '</td>' +
        cols.map((i) => '<td' + (dc && dc.has(i) ? ' class="diff-raw"' : '') + '>' + cellText(row[i]) + '</td>').join('') + '</tr>';
    }).join('');

    return controls + (data.length
      ? '<div class="scroll grid-wrap"><table class="grid raw">' + head + '<tbody>' + body + '</tbody></table></div>'
      : '<p class="empty-state">Aucune ligne ne correspond à la recherche.</p>');
  }

  /* ---------- Export CSV (séparateur « ; » + BOM pour Excel FR) ---------- */

  function csvCell(v) {
    const s = String(v == null ? '' : v);
    return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function exportLines(t) {
    const r = t.result;
    const out = [];
    if (!r || r.error) return out;
    r.columns.aOnly.forEach((c) => out.push([t.name, 'COLONNE_ABSENTE_B', '', c, '', '', '']));
    r.columns.bOnly.forEach((c) => out.push([t.name, 'COLONNE_ABSENTE_A', '', c, '', '', '']));
    r.onlyA.forEach((k) => out.push([t.name, 'LIGNE_ABSENTE_B', k, '', '', '', '']));
    r.onlyB.forEach((k) => out.push([t.name, 'LIGNE_ABSENTE_A', k, '', '', '', '']));
    r.a.duplicates.forEach((d) => out.push([t.name, 'DOUBLON_A', d.key, '', d.count, '', '']));
    r.b.duplicates.forEach((d) => out.push([t.name, 'DOUBLON_B', d.key, '', '', d.count, '']));
    r.diffRows.forEach((d) => d.diffs.forEach((x) =>
      out.push([t.name, 'ECART_VALEUR', d.key, x.col, x.a, x.b, x.delta == null ? '' : String(x.delta).replace('.', ',')])));
    return out;
  }

  function download(tables, filename) {
    const lines = [].concat(...tables.map(exportLines));
    if (!lines.length) {
      alert(tables.some((t) => t.result && !t.result.error) ? 'Aucun écart à exporter.' : 'Aucune table comparée.');
      return;
    }
    const label = (s) => state.names[s].trim() || DEFAULT_NAMES[s];
    const header = ['Table', 'Type', 'CLE', 'Colonne', 'Valeur ' + label('a') + ' (A)', 'Valeur ' + label('b') + ' (B)', 'Écart numérique (B − A)'];
    const csv = '﻿' + [header].concat(lines).map((l) => l.map(csvCell).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const safeName = (s) => String(s).replace(/[^\w.-]+/g, '_');

  /* ---------- Options ---------- */

  function bindOptions() {
    const tol = $('#opt-tolerance');
    tol.value = state.options.tolerance;
    tol.addEventListener('change', () => {
      const v = parseFloat(String(tol.value).replace(',', '.'));
      state.options.tolerance = isFinite(v) && v >= 0 ? v : 0;
      tol.value = state.options.tolerance;
      optionsChanged();
    });
    ['ignoreLeadingZeros', 'normalizeDates', 'nullEquivalent', 'trim', 'ignoreCase'].forEach((k) => {
      const el = $('#opt-' + k);
      el.checked = !!state.options[k];
      el.addEventListener('change', () => {
        state.options[k] = el.checked;
        optionsChanged();
      });
    });
  }

  function bindNames() {
    SIDES.forEach((s) => {
      const el = $('#name-' + s);
      el.value = state.names[s];
      el.placeholder = DEFAULT_NAMES[s];
      el.addEventListener('input', () => {
        state.names[s] = el.value;
        save();
        renderAll();
      });
    });
  }

  /* ---------- Thème clair / sombre ---------- */

  function bindTheme() {
    const btn = $('#theme-toggle');
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const current = () => document.documentElement.getAttribute('data-theme') || (media.matches ? 'dark' : 'light');
    const sync = () => {
      const dark = current() === 'dark';
      btn.textContent = dark ? '☀️' : '🌙';
      btn.title = dark ? 'Passer en thème clair' : 'Passer en thème sombre';
      btn.setAttribute('aria-label', btn.title);
    };
    btn.addEventListener('click', () => {
      const next = current() === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('data-compare-csv.theme', next); } catch (e) { /* ignore */ }
      sync();
    });
    media.addEventListener('change', sync);
    sync();
  }

  function optionsChanged() {
    state.tables.forEach(compute);
    save();
    renderAll();
  }

  /* ---------- Événements ---------- */

  function bindEvents() {
    $('#add-table').addEventListener('click', () => addTable());
    $('#export-all').addEventListener('click', () => download(state.tables, 'ecarts_' + stamp() + '.csv'));

    const tablesEl = $('#tables');
    const cardOf = (el) => findTable(Number(el.closest('.table-card').getAttribute('data-id')));

    tablesEl.addEventListener('input', (e) => {
      if (!e.target.classList.contains('name')) return;
      cardOf(e.target).name = e.target.value;
      save();
      renderDashboard();
      if (state.selectedId === cardOf(e.target).id) renderDetail();
    });
    tablesEl.addEventListener('click', (e) => {
      if (e.target.closest('.remove')) removeTable(cardOf(e.target).id);
    });
    tablesEl.addEventListener('change', (e) => {
      if (!e.target.classList.contains('file-input')) return;
      const side = e.target.closest('.drop').getAttribute('data-side');
      loadFile(cardOf(e.target), side, e.target.files[0]);
    });
    tablesEl.addEventListener('dragover', (e) => {
      const drop = e.target.closest('.drop');
      if (!drop) return;
      e.preventDefault();
      drop.classList.add('over');
    });
    tablesEl.addEventListener('dragleave', (e) => {
      const drop = e.target.closest('.drop');
      if (drop && !drop.contains(e.relatedTarget)) drop.classList.remove('over');
    });
    tablesEl.addEventListener('drop', (e) => {
      const drop = e.target.closest('.drop');
      if (!drop) return;
      e.preventDefault();
      drop.classList.remove('over');
      loadFile(cardOf(drop), drop.getAttribute('data-side'), e.dataTransfer.files[0]);
    });
    // Empêche le navigateur d'ouvrir un fichier lâché hors d'une zone de dépôt.
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => e.preventDefault());

    $('#dashboard').addEventListener('click', (e) => {
      const row = e.target.closest('.dash-row.clickable');
      if (!row) return;
      selectTable(Number(row.getAttribute('data-id')));
      $('#detail-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    const detail = $('#detail');
    detail.addEventListener('click', (e) => {
      const tab = e.target.closest('.tab');
      if (tab) {
        state.view.tab = tab.getAttribute('data-tab');
        renderDetail();
        return;
      }
      const sideBtn = e.target.closest('[data-raw-side]');
      if (sideBtn) {
        state.view.rawSide = sideBtn.getAttribute('data-raw-side');
        renderDetail();
        return;
      }
      const colRow = e.target.closest('.col-row');
      if (colRow) {
        Object.assign(state.view, { tab: 'ecarts', column: colRow.getAttribute('data-col'), allCols: false });
        renderDetail();
        return;
      }
      if (e.target.closest('.export-one')) {
        const t = findTable(state.selectedId);
        download([t], 'ecarts_' + safeName(t.name) + '_' + stamp() + '.csv');
      }
    });
    let searchTimer = null;
    detail.addEventListener('input', (e) => {
      if (!e.target.classList.contains('search')) return;
      state.view[e.target.getAttribute('data-field') || 'search'] = e.target.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        const pos = $('#detail .search').selectionStart;
        renderDetail();
        const input = $('#detail .search');
        input.focus();
        input.setSelectionRange(pos, pos);
      }, 250);
    });
    detail.addEventListener('change', (e) => {
      if (e.target.classList.contains('col-filter')) state.view.column = e.target.value;
      else if (e.target.classList.contains('all-cols')) state.view.allCols = e.target.checked;
      else return;
      renderDetail();
    });
  }

  function selectTable(id) {
    if (state.selectedId !== id) {
      state.selectedId = id;
      state.view = freshView();
    }
    renderDashboard();
    renderDetail();
  }

  function renderAll() {
    renderTables();
    renderDashboard();
    renderDetail();
  }

  load();
  bindTheme();
  bindNames();
  bindOptions();
  bindEvents();
  renderAll();
})();
