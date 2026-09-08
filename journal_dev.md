# Journal de développement — Bad Pointage

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

Depuis la racine du projet, dans Bash/WSL avec Python 3 :

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

Terminal 1 — backend Flask :

```bash
.venv/bin/python -m flask --app ./260907_flask_app.py:app run --host 127.0.0.1 --port 5000
```

Terminal 2 — frontend :

```bash
python3 -m http.server 8000 --bind 127.0.0.1
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
Après un rechargement de page, recharger le planning et redémarrer la session :
la restauration complète n'est pas corrigée dans cette étape.

`index.html` est la source frontend canonique du projet.
- `main:index.html` est la version servie par GitHub Pages.
- `dev/local-test-cycle:index.html` est la version de développement/test.
- `260907_badminton.html` reste présent à titre transitoire ; il n'est plus la
  source de vérité et ne doit pas remplacer `index.html`.
- Le backend de travail reste `260907_flask_app.py` : Flask local en développement,
  Flask sur PythonAnywhere en production.
- Les fichiers datés et `En ligne/` existent toujours ; aucune suppression ni
  modification du déploiement n'est effectuée.
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

- Correctif limité à `260907_badminton.html` et `260907_flask_app.py` :
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
  code, par exemple `http://127.0.0.1:8000/260907_badminton.html?v=20260908`.
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
