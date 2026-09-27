# PRD — Application de Pointage Badminton

**Auteur :** MrChaBou
**Dernière mise à jour :** 2026-09-27

## État de référence en production

Le déploiement sur `main`, commit `892a8d8`, est validé manuellement par le PILOTE.
GitHub Pages sert le nouveau frontend ; PythonAnywhere utilise le nouveau
`flask_app.py`, avec `/health` OK. Cache commun : `2026.09.27.2`.
Ce document décrit cette version ; les validations UI sont celles du PILOTE.

## Objectif et utilisateurs

Permettre aux joueurs et organisateurs de pointer les présences sur mobile, puis
aux administrateurs de télécharger le planning Excel complet mis à jour pour
un créneau et une date. Le backend préserve les styles du classeur ; il travaille
en mémoire et ne remplace pas le fichier source.

## Import et sélection de session

- Charger le planning `.xlsx` officiel, choisir son onglet et sa date, puis
  démarrer une session.
- Lire les noms en B et les prénoms en C à partir de la ligne 4 ; ignorer les
  lignes sans nom. Les IDs sont dérivés du numéro de ligne.
- Arrêter la lecture avant « LISTE D’ATTENTE », détectée en A:D, y compris dans
  une cellule fusionnée ancrée en A. Normaliser casse, apostrophes typographiques
  et espaces insécables/multiples. Appliquer cette frontière aux deux exports.
- Lire les dates numériques Excel dans les 10 premières lignes et 20 premières
  colonnes. La conversion et l’affichage conservent le jour calendaire quel que
  soit le fuseau horaire, pour les calendriers Excel 1900 et 1904 ; la fraction
  horaire est ignorée. Les dates sont triées et le jour local courant est
  présélectionné lorsqu’il existe dans le planning.
- Limites de détection : série ramenée au calendrier 1900 strictement entre
  40000 et 50000, année strictement entre 2000 et 2030. Les dates textuelles
  ne sont pas reconnues.

## Participants ESSAI par date

Les marqueurs reconnus, après suppression des espaces de bord et conversion en
majuscules, sont `ESSAI`, `ESSAI PRESENT` et `ESSAI ABSENT`.

Une ligne portant l’un de ces marqueurs dans une des colonnes de date détectées
est une ligne d’essai. Elle est proposée uniquement si la cellule de la date
sélectionnée porte elle aussi un de ces marqueurs. Une ligne sans marqueur sur
les dates détectées est considérée comme inscrite. La liste d’attente reste exclue.

Les essais admissibles participent à la recherche, au pointage et aux compteurs.
À l’export, une cellule cible portant un marqueur d’essai devient `ESSAI PRESENT`
si la personne est pointée, sinon `ESSAI ABSENT`, dans les deux modes d’export.
Ces marqueurs ne créent pas automatiquement des pointages dans le journal importé.

## Interface et pointage

- **Pointer** : recherche par nom ou prénom dès deux caractères, sans distinction
  de casse ; sélection parmi plusieurs résultats, fiche joueur, pointage et
  annulation avec retour visuel.
- **Participants** : liste des inscrits et essais de la date, compteurs et
  pointage/annulation depuis la liste.
- **Journal** : consultation des présences de la session active avec heure.
- **Admin** : chargement du planning, choix du créneau et de la date, démarrage
  de session, statut backend, téléchargement et réinitialisation de l’application.

Il n’existe plus de parcours de génération d’une colonne à coller. Le journal
n’a pas d’export séparé ni de bouton d’effacement propre. La réinitialisation
supprime source, session, participants et journal ; elle ne charge pas de joueurs par défaut.

## Persistance et reprise après F5

La session, les participants et le journal sont stockés dans `localStorage`,
propre à l’origine du navigateur. Au chargement, la liste utilisée par la recherche
est reconstruite depuis les participants sauvegardés : **aucun premier pointage
n’est nécessaire**. `BUG-UI-SEARCH-DELAY` est corrigé pour cette restauration.

Les octets originaux et métadonnées de la source active sont conservés dans
IndexedDB (`bad-pointage-source` / `sources` / `active`), avec SHA-256. Après F5,
le classeur est reconstruit depuis une copie, sans resérialiser les octets source.
Les deux exports attendent le contrôle du hash (`sourceHash` de la session), de
la taille, du créneau et de la cellule de date. Un autre fichier, même de même
nom, ne remplace pas silencieusement la source active.
Si la restauration échoue, réimporter la source **sans redémarrer la session** ;
les pointages sont conservés. Une ancienne session sans hash exige un réimport
compatible avec sa date et ses participants avant rattachement.
Un échec IndexedDB laisse l’export en mémoire possible, mais peut imposer un
réimport après F5. Reset efface aussi la source ; les accès sérialisés et les
contrôles d’opération empêchent les résultats obsolètes de la réinstaller.
Stockage propre au navigateur/origine, effaçable ; HTTPS ou localhost requis.

## Export du planning complet

- Le frontend envoie le fichier source encodé en base64, le créneau, la colonne
  cible et les présents `{id, nom, prenom}` de la session à `POST /update-planning`.
  L’ID est l’index SheetJS en base 0, complété à au moins trois chiffres :
  `P034` vise la ligne Excel/openpyxl 35. Les deux exports valident ID, identité
  normalisée et ligne participant avant LISTE D’ATTENTE avant toute écriture.
  Un ID invalide/incompatible refuse l’export (HTTP 400 côté backend) ; le fallback
  nom/prénom seul est réservé aux anciennes entrées sans champ ID.
- Flask/openpyxl renvoie le classeur complet : `V` pour un inscrit présent,
  cellule vidée pour un absent, ou marqueur d’essai mis à jour selon la présence.
  Les écritures sont limitées à la colonne sélectionnée avant la liste d’attente.
- La préservation des styles, des fusions et des formules hors cible est assurée
  par le parcours backend sur les classeurs validés ; les cellules de pointage
  ciblées sont remplacées.
- Si le backend est indisponible ou sa requête échoue, le fallback XLSX modifie
  directement l’archive source via SheetJS/CFB et le DOM XML : feuille ciblée et
  styles dérivés nécessaires, autres parties inchangées. Les styles sont préservés
  et les absents effectivement effacés. Sorties : `maj_...` / `local_maj_...`.
  L’ancien `.xls` local reste converti avec perte des styles annoncée.
- Les deux exports ignorent les lignes sans nom ou sans prénom, alors que
  l’import peut afficher une ligne avec un nom seul.

Pour `V`, `ESSAI PRESENT` et `ESSAI ABSENT`, un contraste calculé < 4,5:1 sur
fond connu change seulement la couleur de police en noir/blanc selon le meilleur
contraste ; thème/RGB/index et teintes sont résolus avant comparaison. Le backend
copie la police openpyxl, le fallback duplique le style nécessaire. Les styles déjà
lisibles et leurs autres propriétés restent intacts. Couleurs non résolubles,
motifs et dégradés sont conservés ; le rendu conditionnel n’est pas évalué.
Le badge Nouveau (vert uni RGB explicite en B/C/D) reste indépendant de la présence
et d’ESSAI ; il est recalculé à la restauration compatible sans perdre les pointages.

## Architecture et exploitation

Frontend canonique : `index.html`, styles dans `css/app.css`, sans build.
Scripts classiques chargés dans cet ordre :

| Fichier | Responsabilité |
| --- | --- |
| `js/state.js` | Configuration backend, état partagé, stockage |
| `js/ui.js` | Navigation, affichage et disponibilité de l’export |
| `js/pointage.js` | Participants, recherche, pointage et annulation |
| `js/planning-storage.js` | Accès IndexedDB sérialisés, sauvegarde et effacement |
| `js/planning-source.js` | Import, SHA-256, contrôle source/session, restauration et Reset |
| `js/planning.js` | Dates, participants, essais et démarrage de session |
| `js/export-styles.js` | Archive XLSX et contraste du fallback |
| `js/export.js` | Statut backend et exports |
| `js/app.js` | Initialisation et événements |

Backend canonique : `flask_app.py`, Flask/openpyxl, dépendances fixées dans
`requirements.txt`. Le stockage navigateur permet la reprise du pointage ;
les styles XLSX sont préservés avec le backend comme avec le fallback local.

En local, frontend HTTP sur `127.0.0.1:8000`, backend sur `127.0.0.1:5000`.
`BACKEND_URL`, dans `js/state.js`, choisit le backend local sur `localhost` ou
`127.0.0.1`, sinon `https://mrchabou.eu.pythonanywhere.com`.
CORS autorise les deux origines locales sur le port 8000 et
`https://mrchabou.github.io`. Tailwind et SheetJS sont chargés par CDN ; une
connexion Internet reste nécessaire. Commandes : [README](readme.md#cycle-de-développement-et-test-local).

GitHub Pages sert la version de `main` déployée au commit `892a8d8`. Pour les
prochains déploiements, publier ensemble le HTML, le CSS et les neuf scripts après
fusion, puis mettre à jour et recharger PythonAnywhere. Tous les assets locaux
partagent `?v=2026.09.27.2`, à incrémenter ensemble à chaque changement CSS/JS.
Les archives `old_bad/` et `En ligne/` restent locales, ignorées par Git.

## Validation et points restant à suivre

La validation locale frontend/backend et le push de la branche sont confirmés
par le pilote. L’historique Git contient les correctifs de dates, le refactor,
la restauration de recherche, les essais par date et le contrôle après F5.
Cet audit relit le code et la documentation ; il ne rejoue pas les tests métier.

Validation manuelle historique du 09/09/2026, confirmée par le pilote :

- Frontend chargé sans erreur ; backend disponible, `/health` HTTP 200 avec
  `{"status":"ok"}`.
- Export normal : `V` dans la bonne colonne ; `ESSAI PRESENT` et `ESSAI ABSENT` validés.
- Après F5 : session et recherche restaurées ; export bloqué jusqu’au rechargement
  du planning, puis réactivé sans perte des pointages.
- LISTE D’ATTENTE exclue : 46 participants sur le cas Mercredi 20H–21H45.

Validation réelle du PILOTE au 27/09/2026 : local avec backend et F5 OK ; fallback
XLSX sans backend OK, styles préservés ; PythonAnywhere à jour et `/health` OK ;
GitHub Pages déployé depuis `main` (`892a8d8`), production Edge et Safari iPhone OK.
L’export réel `maj_...` contient trois marqueurs visibles : P032/P033/P034 étaient
bien écrits en G33/G34/G35 ; le symptôme venait du style source invisible de G35,
pas d’une perte de présence. Ces validations UI proviennent du PILOTE.
Dernier run automatisé : 45 tests frontend et 9 backend réussis, contrôles
facultatifs du vrai classeur inclus (`BAD_POINTAGE_REFERENCE`), sans affichage
d’identités. Ce résultat est distinct de la validation UI ; détails dans le journal.

Les signalements historiques sur le tri et les prénoms n’ont pas de clôture
explicite documentée ; leur statut reste à confirmer, sans les déclarer bugs actifs.
