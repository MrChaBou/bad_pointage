# PRD — Application de Pointage Badminton

**Auteur :** MrChaBou
**Dernière mise à jour :** 2026-09-08

## État de référence avant fusion

Ce document décrit le comportement actuel de `dev/local-test-cycle`, testée et
poussée. Le frontend et le backend sont validés localement selon le pilote.
`main` et PythonAnywhere ne sont pas encore mis à jour ; le déploiement et la
validation en production restent à effectuer. L’audit documentaire ne réalise
ni fusion, ni commit, ni push, ni déploiement.

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
supprime session, participants et journal ; elle ne charge pas de joueurs par défaut.

## Persistance et reprise après F5

La session, les participants et le journal sont stockés dans `localStorage`,
propre à l’origine du navigateur. Au chargement, la liste utilisée par la recherche
est reconstruite depuis les participants sauvegardés : **aucun premier pointage
n’est nécessaire**. `BUG-UI-SEARCH-DELAY` est corrigé pour cette restauration.

Le classeur et les octets du fichier Excel restent uniquement en mémoire. Après
F5, la session et les pointages sont restaurés et la recherche est utilisable,
mais l’export est désactivé avec un message demandant de recharger le planning
source dans Admin **sans redémarrer la session**. Les deux fonctions d’export
appliquent aussi ce contrôle. Le créneau, les coordonnées de la cellule de date
et son libellé doivent être compatibles avec la session avant de réactiver l’export.
Ce contrôle ne certifie pas l’identité complète du fichier source.

## Export du planning complet

- Le frontend envoie le fichier source encodé en base64, le créneau, la colonne
  cible et les présents de la session à `POST /update-planning`.
- Flask/openpyxl renvoie le classeur complet : `V` pour un inscrit présent,
  cellule vidée pour un absent, ou marqueur d’essai mis à jour selon la présence.
  Les écritures sont limitées à la colonne sélectionnée avant la liste d’attente.
- La préservation des styles, des fusions et des formules hors cible est assurée
  par le parcours backend sur les classeurs validés ; les cellules de pointage
  ciblées sont remplacées.
- Si le backend est déclaré indisponible, un export SheetJS local est proposé
  avec avertissement de perte des styles. L’effacement d’une ancienne présence
  par `null` reste une limite signalée, sans correctif identifié.
- Les deux exports ignorent les lignes sans nom ou sans prénom, alors que
  l’import peut afficher une ligne avec un nom seul.

## Architecture et exploitation

Frontend canonique : `index.html`, styles dans `css/app.css`, sans build.
Scripts classiques chargés dans cet ordre :

| Fichier | Responsabilité |
| --- | --- |
| `js/state.js` | Configuration backend, état partagé, stockage |
| `js/ui.js` | Navigation, affichage et disponibilité de l’export |
| `js/pointage.js` | Participants, recherche, pointage et annulation |
| `js/planning.js` | Import, dates, essais, session et contrôle avant export |
| `js/export.js` | Statut backend et exports |
| `js/app.js` | Initialisation et événements |

Backend canonique : `flask_app.py`, Flask/openpyxl, dépendances fixées dans
`requirements.txt`. Le stockage navigateur permet la reprise du pointage ;
un backend est nécessaire pour exporter avec les styles.

En local, frontend HTTP sur `127.0.0.1:8000`, backend sur `127.0.0.1:5000`.
`BACKEND_URL`, dans `js/state.js`, choisit le backend local sur `localhost` ou
`127.0.0.1`, sinon `https://mrchabou.eu.pythonanywhere.com`.
CORS autorise les deux origines locales sur le port 8000 et
`https://mrchabou.github.io`. Tailwind et SheetJS sont chargés par CDN ; une
connexion Internet reste nécessaire. Commandes : [README](readme.md#cycle-de-développement-et-test-local).

GitHub Pages sert la version de `main`. Publier ensemble le HTML, le CSS et les
six scripts après fusion, puis mettre à jour et recharger PythonAnywhere.
Les archives `old_bad/` et `En ligne/` restent locales, ignorées par Git.

## Validation et points restant à suivre

La validation locale frontend/backend et le push de la branche sont confirmés
par le pilote. L’historique Git contient les correctifs de dates, le refactor,
la restauration de recherche, les essais par date et le contrôle après F5.
Cet audit relit le code et la documentation ; il ne rejoue pas les tests métier.

La validation en production reste à effectuer après déploiement : `/health`,
export avec styles, dates, liste d’attente, essais et reprise après F5.
Les signalements historiques sur le tri et les prénoms n’ont pas de clôture
explicite documentée ; leur statut reste à confirmer, sans les déclarer bugs actifs.
