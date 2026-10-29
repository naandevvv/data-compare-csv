/* Applique le thème mémorisé avant l'affichage, pour éviter un flash de couleurs. */
(function () {
  try {
    var t = localStorage.getItem('data-compare-csv.theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* ignore */ }
})();
