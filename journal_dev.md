# Journal de développement — Bad Pointage

## 08/09/2026 — État actuel avant fusion vers main

- Branche `dev/local-test-cycle` testée et poussée ; frontend et backend validés
  localement selon le pilote. À l’ouverture de cet audit, arbre propre et HEAD
  synchronisé avec la référence locale `origin/dev/local-test-cycle` (`e1669d2`).
- `main` et PythonAnywhere ne sont pas encore mis à jour. Le déploiement et la
  validation en production restent à effectuer.
- Sources canoniques : `index.html` et `flask_app.py`. CSS dans `css/app.css` ;
  scripts classiques dans l’ordre `js/state.js`, `js/ui.js`, `js/pointage.js`,
  `js/planning.js`, `js/export.js`, `js/app.js` (état, UI, pointage, planning,
  export, initialisation).
- `f67b112` : dates Excel corrigées indépendamment du fuseau horaire, avec
  conversion calendaire et affichage UTC, calendriers 1900/1904 pris en compte.
- `d47d043` : JavaScript réparti par responsabilité dans les six fichiers.
- `594d82d` : recherche restaurée après F5 par reconstruction de `players`
  depuis les participants sauvegardés. Aucun premier pointage nécessaire.
- `72a25fd` : essais par date. Les marqueurs `ESSAI`, `ESSAI PRESENT` et
  `ESSAI ABSENT` identifient les essais ; seuls ceux admissibles à la date
  sélectionnée sont proposés. Les deux exports écrivent `ESSAI PRESENT` ou
  `ESSAI ABSENT` dans la cellule d’essai cible. LISTE D’ATTENTE reste exclue.
- `e1669d2` : après F5, session, participants et pointages restaurés ; fichier
  Excel source à recharger dans Admin **sans redémarrer la session**. Export
  désactivé avec message explicite et contrôlé dans les deux parcours tant que
  le fichier manque ou que la cible de session est incompatible.
- Audit documentaire : README et PRD alignés sur ce fonctionnement ; ancienne
  description de BUG-UI-SEARCH-DELAY remplacée par son état corrigé. Relecture
  du code et de l’historique, sans nouvelle exécution des tests métier.
- Limites conservées : styles perdus et effacement par `null` signalé comme
  non effectif dans l’export local ; lignes sans prénom affichables à l’import
  mais ignorées par les exports. Dates textuelles non reconnues et détection
  limitée à la zone/plage décrite dans le PRD. Le contrôle avant export vérifie
  la cible de session, pas l’identité complète du fichier rechargé.
- Tri/prénoms : signalements historiques sans clôture explicite ; statut à
  confirmer, sans les qualifier de bugs actifs sur cette seule base.
- Cette intervention modifie uniquement `readme.md`, `PRD_MAJ.md` et
  `journal_dev.md` ; aucun code, commit, push ou changement de `main`.

Les sections suivantes conservent l’historique de chaque étape. Les mentions
« hors périmètre », « aucun refactor » ou « aucun push » décrivent uniquement
l’étape passée ; l’état actuel de référence est celui présenté ci-dessus.

## Architecture et périmètre

- Frontend HTML/JavaScript : lecture du planning avec SheetJS, sélection de
  session, pointage et stockage navigateur.
- Backend Flask/openpyxl : reçoit le classeur et les présences, traite le
  fichier en mémoire et renvoie un téléchargement sans écrire le fichier source.
- Hébergement de production : GitHub Pages pour le frontend, PythonAnywhere
  pour le backend. Le mode local utilise deux serveurs HTTP séparés.
- L'export local de secours ne garantit pas la préservation des styles.
- Les données réelles et les archives restent locales et ne sont pas versionnées.

# Relance du dev 07/09/2026

## problème constaté par un utilisateur
J'ai chargé la liste des participants 'Pointage des créneaux - 2026-2027-2.xlsx' et je constate que la liste n'est plus triée ou pas triable par alpha et qu'un bon nombre d'items affiche le nom patronymique sans le prénom.

## Cycle de développement et test local

Depuis la racine du projet. Utiliser un environnement virtuel créé pour le
système utilisé ; un virtualenv Windows n'est pas interchangeable avec WSL.

### Windows / Git Bash

```bash
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt
```

Terminal 1 — backend :

```bash
.venv/Scripts/python.exe -m flask --app ./flask_app.py:app run --host 127.0.0.1 --port 5000
```

Terminal 2 — frontend :

```bash
.venv/Scripts/python.exe -m http.server 8000 --bind 127.0.0.1
```

### Linux / WSL / macOS

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

Terminal 1 — backend :

```bash
.venv/bin/python -m flask --app ./flask_app.py:app run --host 127.0.0.1 --port 5000
```

Terminal 2 — frontend :

```bash
.venv/bin/python -m http.server 8000 --bind 127.0.0.1
```

Ouvrir `http://127.0.0.1:8000/index.html?v=260908` (pas un fichier `file://`).
Le frontend servi sur `localhost` ou `127.0.0.1` appelle `http://127.0.0.1:5000`.
Sur GitHub Pages, il conserve `https://mrchabou.eu.pythonanywhere.com`.
Le backend autorise les origines `http://127.0.0.1:8000`,
`http://localhost:8000` et `https://mrchabou.github.io`.

Contrôle HTTP du backend :

```bash
curl -i http://127.0.0.1:5000/health
```

Résultat attendu : HTTP 200 et `{"status":"ok"}`. Dans les outils réseau du
navigateur, vérifier que `/health` et le POST `/update-planning` à l'export
ciblent `http://127.0.0.1:5000`, sans erreur CORS.
Charger un planning `.xlsx`, sélectionner un créneau et une date, démarrer une
session, pointer puis exporter. Le fichier source n'est pas écrit par le backend :
il reçoit et renvoie le classeur en mémoire. Arrêter les serveurs avec Ctrl+C.

Les dépendances backend sont dans `requirements.txt`. Tailwind et SheetJS sont
chargés par CDN : une connexion Internet reste nécessaire. Les données navigateur
sont propres à chaque origine ; garder la même adresse pour les essais.
Consigne actuelle après F5 : la session et les pointages sont restaurés. Recharger
le planning source dans Admin sans redémarrer la session avant d’exporter.
La limite de restauration observée au début du cycle a depuis été corrigée.

`index.html` est la source frontend canonique du projet.
- `main:index.html` est la version servie par GitHub Pages.
- `dev/local-test-cycle:index.html` est la version de développement/test.
- Frontend canonique : `index.html` ; backend canonique actif : `flask_app.py`.
- Le backend utilise Flask local en développement et Flask/PythonAnywhere en production.
- Les fichiers datés ne sont plus des sources de vérité. Le frontend daté est
  archivé dans `old_bad/260907_badminton.html`, hors du contenu suivi de la branche.
- `old_bad/` sert uniquement d'archive locale ignorée par Git ; `En ligne/` reste
  également local et ignoré. Aucun changement du déploiement.
Aucun refactor ni correctif Excel/tri/prénom ne fait partie de cette étape.

### Validation de cette étape

- Environnement testé : Python 3.12.3 ; Flask 3.1.3, flask-cors 6.0.5,
  openpyxl 3.1.5 (versions fixées dans `requirements.txt`).
- GET `/health` : HTTP 200 ; CORS GET et précontrôle OPTIONS validés pour
  les trois origines prévues. Une origine non autorisée ne reçoit pas
  d'en-tête `Access-Control-Allow-Origin`.
- Frontend servi en HTTP et vérifié dans Chromium sur `127.0.0.1:8000` et
  `localhost:8000` : appel automatique `/health` vers Flask local ; POST
  synthétique exécuté depuis la page avec succès, sans erreur CORS.
- POST avec classeur synthétique en mémoire : présence V, absence effacée,
  remplissage de cellule, formule hors cible et fusion préservés.
- Sélection de l'URL PythonAnywhere vérifiée avec une origine GitHub Pages
  simulée, sans appeler la production. Aucun parcours métier complet validé.
- Dépôt de référence récupéré ; branche `dev/local-test-cycle` créée sur
  `origin/main` (92f9852). Le dépôt distant suit uniquement `index.html`,
  récupéré sans remplacement des fichiers locaux. Les autres fichiers
  restent non suivis ; aucun ajout à l'index, commit ou push effectué.
- `En ligne/` inchangé ; aucun correctif Excel/tri/prénom.

## 07/09/2026 — Exclusion de la liste d'attente

- Correctif limité à `260907_badminton.html` et `flask_app.py` :
  `startSession()`, `update_planning()` et `downloadLocally()` s'arrêtent avant
  le séparateur « LISTE D'ATTENTE » détecté en A:D. Normalisation de la casse,
  des apostrophes typographiques et des espaces insécables/multiples.
- Cause : séparateur fusionné A:S, texte stocké en A alors que la recherche
  précédente portait sur B:D. Le frontend continuait également à charger les
  personnes en attente même en cas de détection.
- Vérifications en mémoire sur le classeur 2026-2027-2 : fonctions JS réelles
  exécutées sous Node avec SheetJS 0.18.5 et interface simulée ; route Flask
  exécutée via son client de test. Aucun test visuel dans le navigateur.
- Chargement : mercredi 20h00 à 21h45 = 46 ; mardi 17h30 à 19h00 = 15.
  Les 30 onglets chargent uniquement les lignes portant un nom avant le
  séparateur ; aucune personne après celui-ci n'est importée.
- Exports des deux créneaux : données témoins après le séparateur préservées,
  même avec une présence d'une personne en attente envoyée explicitement.
  Comparaison des valeurs/formules à partir du séparateur pour l'export local ;
  comparaison des valeurs/formules/styles et fusions pour le backend.
- Normalisation : 16 variantes (quatre apostrophes, colonnes A à D, casse et
  espaces ordinaires/insécables multiples) validées dans les trois parcours.
- Limites préexistantes hors périmètre : styles non préservés en mode local ;
  `sheet_add_aoa([[null]])` ne vide pas une ancienne valeur lors du test d'absence
  en export local. Le backend efface correctement l'absence avant le séparateur.
- Recharger le planning et redémarrer la session après mise à jour pour remplacer
  les participants conservés dans le navigateur. Aucun traitement des essais,
  refactor, déploiement, commit ou modification de `En ligne/`.
- README et PRD actualisés pour documenter la règle de la première liste seule.


## 08/09/2026 — Checkpoint avant refactor

- Correctif « LISTE D'ATTENTE » validé manuellement en local par le pilote :
  créneau Mercredi 20h00 à 21h45, 46 inscrits chargés et compteur Participants
  à 46 ; la liste d'attente n'est plus chargée.
- Le navigateur avait initialement servi une ancienne version du HTML en cache.
  Une URL avec une query string a permis de confirmer l'exécution du nouveau
  code. Pour le frontend désormais canonique, utiliser
  `http://127.0.0.1:8000/index.html?v=20260908`.
  En cas de doute, changer cette valeur, ou désactiver le cache dans les outils
  de développement puis recharger la page. Recharger ensuite le planning et
  redémarrer la session pour renouveler les participants conservés.
- Message de démarrage clarifié : « Session démarrée. 46 inscrits chargés.
  La liste d'attente a été ignorée. » Le nombre reste dynamique.
- README et PRD vérifiés : la règle de la première liste seule et la frontière
  des exports sont déjà documentées ; aucune modification nécessaire.
- Aucun traitement des essais, du tri, des prénoms ou des autres bugs ;
  aucun refactor, aucune modification de `En ligne/`, aucun push.
- Vérifications du checkpoint : syntaxe JS et comparaison avant/après confirmant
  que seul le message a changé dans le HTML ; fonction `startSession()` réelle
  exécutée sous Node avec DOM et utilitaires d'adressage simulés, cellules du
  classeur réel lues par openpyxl : 30 onglets contrôlés, dont Mercredi 20h00
  à 21h45 = 46 ; message dynamique vérifié. Pas de nouveau test visuel.
- Client de test Flask : `/health` et CORS/OPTIONS sur les trois origines ;
  POST sur classeurs synthétiques, 16 variantes de séparateur en A:D :
  présence avant la frontière écrite, valeurs/formules après inchangées.
- Empreintes de `En ligne/` et des archives inchangées ; backend, README et
  PRD identiques à leur état au début du checkpoint.
- Périmètre du commit : fichiers de développement, dépendances, `.gitignore`
  et documentation, jusque-là non suivis. Classeurs, archives et copies de
  production restent hors du commit.

## 08/09/2026 — Convergence vers la source frontend canonique

- Décision : développer désormais dans `index.html` sur la branche dev, en
  conservant `main:index.html` comme frontend servi par GitHub Pages.
- Report limité des correctifs validés : URL backend local/prod, arrêt avant
  LISTE D'ATTENTE en A:D dans le chargement et l'export local, message dynamique.
- Recherche multi-résultats, pointage depuis Participants, compteurs et autres
  fonctions de production conservés. Backend inchangé.
- Fichier frontend daté transitoire et dossier `En ligne/` toujours présents.
- Aucun traitement des essais, du tri ou des prénoms ; aucun refactor.
- Validation manuelle de convergence confirmée par le pilote sur
  `http://127.0.0.1:8000/index.html?v=260908` : Mercredi 20h00 à 21h45,
  46 inscrits et liste d'attente ignorée ; recherche multi-résultats et sélection,
  pointage/annulation depuis Participants, compteurs et journal validés.
- Export validé manuellement : liste d'attente inchangée. Dans Network,
  `http://127.0.0.1:5000/health` répond HTTP 200 OK.
- Tests automatisés de convergence : code JS réel sous Node avec DOM et
  utilitaires SheetJS simulés, cellules du classeur réel lues par openpyxl ;
  30 onglets exercés, dont Mercredi 20h00 à 21h45 = 46 inscrits.
- Recherche multi-résultats, sélection, pointage/annulation depuis Participants
  et compteurs vérifiés ; URL backend vérifiée pour les trois hôtes.
- Chargement/export local : 16 variantes de séparateur vérifiées. Client Flask :
  health/CORS sur trois origines et POST sur 16 variantes, attente inchangée.
- Comparaison du code : HTML/UI et fonctions hors des deux fonctions modifiées
  et de la configuration backend inchangés. Aucun nouveau test navigateur.


## Extraction mécanique du frontend — étape 1

- CSS inline transféré tel quel dans `css/app.css` ; JavaScript inline
  transféré tel quel dans `js/app.js`.
- `index.html` charge ces fichiers par chemins relatifs. Le script reste
  classique, en fin de page, sans module ni changement des gestionnaires inline.
- Structure documentée dans README et PRD ; aucun changement fonctionnel.
- Fichiers datés, backend, données Excel et `En ligne/` inchangés.
- Tests manuels du refactor validés par le pilote avant création du commit.
- Contrôles : CSS/JS identiques octet pour octet aux blocs initiaux ;
  reconstruction de l'ancien HTML exacte ; syntaxe JS et fonctions globales OK.
- Scénarios de non-régression repris dans des scripts temporaires (les anciens
  scripts temporaires ne sont plus disponibles) : 30 onglets avec SheetJS 0.18.5
  réel, dont Mercredi 20h00 à 21h45 = 46 ; 16 variantes de séparateur au
  chargement et à l'export, recherche/sélection, pointage/annulation et compteurs.
  Le DOM est simulé ; aucun nouveau test visuel navigateur.
- Serveur HTTP temporaire : HTML/CSS/JS en HTTP 200 avec types MIME corrects
  à la racine et sous `/bad_pointage/`. Serveur arrêté après vérification.
- `index.html` passe de 1 011 lignes / 44 653 octets à 162 lignes / 10 036 octets.

## BUG-UI-SEARCH-DELAY — corrigé localement le 08/09/2026

- Le signalement initial associait le déblocage de la recherche à un premier
  pointage depuis Participants. Cette interprétation est obsolète et ne doit
  plus servir de consigne utilisateur.
- Le correctif `594d82d` reconstruit `players` lors de la restauration du stockage
  depuis `allParticipants` ; les inscrits et, depuis `72a25fd`, les essais
  admissibles sont disponibles pour la recherche après F5.
- État actuel : recherche restaurée, aucun premier pointage préalable requis.
  Validation locale confirmée par le pilote ; déploiement en production à venir.
- Le rechargement du fichier Excel avant export est une exigence distincte :
  le fichier n’est pas persisté dans le navigateur.

## Normalisation du backend et archivage du frontend daté

- Backend renommé en `flask_app.py`, contenu strictement identique ; il devient
  le backend canonique actif. Toutes les références documentaires au backend
  utilisent ce nom, y compris les descriptions des étapes antérieures.
- Frontend daté déplacé vers `old_bad/260907_badminton.html`, archive locale
  ignorée et retirée du suivi Git ; `index.html` reste inchangé.
- Commandes locales séparées pour Windows/Git Bash et Linux/WSL/macOS.
- Aucun changement métier, aucun correctif de BUG-UI-SEARCH-DELAY ni changement du backend déployé sur
  PythonAnywhere ; aucune modification de `En ligne/`, main ou GitHub Pages.
- Validation manuelle confirmée par le pilote : `/health` HTTP 200, pointage et
  mise à jour Excel fonctionnels, export avec mise en forme préservée et liste
  d’attente correctement exclue.
- À cette étape, commit et push n’étaient pas encore effectués. La normalisation
  a depuis été intégrée dans `9d41420` et poussée avec la branche dev.
- Vérifications répétées à la reprise du 08/09/2026, avec comparaison à
  `f16e451` : backend identique octet pour octet à sa
  version datée ; archive frontend identique à l'original ; index/CSS/JS inchangés.
- Démarrage réel avec `.venv/bin/python -m flask --app ./flask_app.py:app run
  --host 127.0.0.1 --port 5000` validé ; GET `/health` HTTP 200 ; CORS GET et
  OPTIONS validés pour les deux origines locales et GitHub Pages.
- POST HTTP `/update-planning` : 48 requêtes réussies (16 variantes du séparateur
  en A:D sur chacune des trois origines CORS), présence et absence traitées avant
  la frontière ; séparateur, valeurs et formules après inchangés, style testé conservé.
  Classeurs synthétiques en mémoire ; serveur arrêté après les tests.
- Le frontend utilise les mêmes routes et le même contrat JSON ; le nom du
  fichier Python n'intervient pas dans ses requêtes. Pas de nouveau test navigateur.
- À la reprise, les sockets ont nécessité une exécution autorisée hors du bac
  à sable. Le premier délai de démarrage de 5 secondes était insuffisant ;
  le test a réussi avec un délai maximal de 30 secondes, sans modification du backend.
- La commande Windows/Git Bash est documentée ; les tests automatisés ci-dessus
  ont été réalisés sous WSL. Les tests manuels demandés sont terminés selon le pilote.
