# Comparateur Oracle / Snowflake

Outil web qui compare, table par table, les exports CSV d'Oracle et de Snowflake
pour valider une migration. Il montre les lignes absentes d'un côté, les cellules
dont la valeur diffère, les doublons de clé et les colonnes non communes.

## Confidentialité

- Le site est **statique** : HTML, CSS et JavaScript, sans serveur ni base de données.
- Les CSV sont lus **par votre navigateur** et restent en mémoire dans l'onglet. Ils ne sont
  envoyés nulle part et ne sont pas conservés : fermer l'onglet les efface.
- La page déclare une politique de sécurité (`Content-Security-Policy`) qui **interdit
  toute requête réseau** (`connect-src 'none'`) et tout script externe. Même par erreur,
  elle ne peut pas transmettre de données.
- Seuls les noms des tables et les règles de comparaison sont mémorisés dans le navigateur
  (`localStorage`) pour la prochaine visite.

## Utilisation

Deux possibilités, sans Node ni installation :

1. **En ligne** via GitHub Pages (voir ci-dessous).
2. **En local** : télécharger le dépôt (bouton *Code → Download ZIP*), le décompresser,
   puis double-cliquer sur `index.html`.

Ensuite :

1. Cliquer sur **+ Ajouter une table** et la nommer (D6, D7…).
2. Déposer le CSV Oracle et le CSV Snowflake dans les deux zones, par glisser-déposer
   ou par clic. La comparaison se lance automatiquement.
3. Le **tableau de bord** résume chaque table. Cliquer sur une ligne ouvre le **détail** :
   - *Écarts par ligne* : grille avec la valeur Oracle (orange) et la valeur Snowflake
     (bleu) surlignées en rouge pour chaque cellule différente ;
   - *Synthèse par colonne* : nombre de lignes en écart par colonne, utile pour repérer
     une règle de calcul fausse (cliquer sur une colonne filtre la grille) ;
   - *Lignes manquantes* et *Doublons de CLE*.
   - *Données brutes* : contenu complet du fichier Oracle ou Snowflake, avec recherche,
     cellules en écart surlignées et lignes absentes de l'autre source mises en évidence.
4. **Exporter** les écarts au format CSV (séparateur `;`, compatible Excel FR).

Des fichiers d'exemple se trouvent dans `exemples/`.

### Format des fichiers

- CSV séparé par des virgules, encodé en UTF-8, avec une ligne d'en-tête.
- Une colonne **`CLE`** identifie la ligne de façon unique, par exemple
  `siret_number|buic_number|rrdi_number`.
- Les colonnes sont associées par leur nom, sans tenir compte de la casse ni de l'ordre.

### Règles de comparaison (modifiables dans l'interface)

| Règle | Par défaut | Exemple considéré comme égal |
|---|---|---|
| Tolérance numérique | 0,01 | `1200.00` = `1200.004` |
| Zéros non significatifs | ignorés | `0010` = `10`, `1.50` = `1.5` |
| Dates | normalisées | `29/10/2026` = `2026-10-29 00:00:00.000` |
| Vide = NULL | oui | `` = `NULL` |
| Espaces en début et fin | ignorés | ` abc ` = `abc` |
| Casse | respectée | `ABC` ≠ `abc` |

## Mise en ligne avec GitHub Pages

1. Sur GitHub : *Settings → Pages*.
2. *Source* : **Deploy from a branch**. Choisir la branche, puis le dossier **/ (root)**.
   Enregistrer.
3. Après une à deux minutes, le site est disponible à l'adresse
   `https://<utilisateur>.github.io/data-compare-csv/`.

> GitHub Pages sur un dépôt **privé** nécessite un abonnement GitHub payant. Dans tous les
> cas, le site publié est public, mais il ne contient que le code : vos données n'y
> sont jamais.

## Tests (développeurs)

```bash
node --test tests/*.test.js
```
