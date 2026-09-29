# 🏸 Application de Pointage Badminton

Une application web 100% mobile pour simplifier le pointage des présences lors des séances de badminton et automatiser la mise à jour des plannings Excel, **avec préservation des styles XLSX via le backend Python ou le fallback local**.

**Incrément Drive local (28/09/2026, non déployé)** : chargement explicite du
XLSX central après authentification, sans pointage actif ; secours manuel conservé.
Contrat binaire, configuration future et recette : [docs/drive-source.md](docs/drive-source.md).
Aucune clé Google réelle créée ou installée. Assets locaux : `2026.09.28.5`.

Production : https://mrchabou.github.io/bad_pointage/

**État au 27/09/2026 : production déployée au commit `892a8d8` sur `main`.**
Selon le PILOTE, GitHub Pages et PythonAnywhere utilisent le nouveau frontend et
le nouveau `flask_app.py`, avec `/health` OK. Cache commun : `2026.09.27.2`.
Les validations UI ci-dessous sont celles du PILOTE, distinctes des tests automatisés.


---

## 🎯 Problématique

La gestion des présences pour les créneaux de badminton se fait souvent via des fichiers Excel complexes, avec des mises en page, des couleurs et des formules spécifiques. Les solutions de pointage existantes ou les scripts JavaScript simples ont une limitation majeure : lors de la modification et de l'export du fichier Excel, **tous les styles et formatages sont perdus**, rendant le fichier final difficile à lire et à réutiliser.

De plus, le processus manuel (pointer sur papier, puis reporter dans Excel) est source d'erreurs et de perte de temps.

## ✨ La Solution

Cette application adopte une approche hybride pour résoudre ce problème :

1.  **Un Frontend Léger et Mobile (`index.html`) :** Une interface simple et tactile, utilisable sur n'importe quel smartphone via un navigateur. Elle gère le chargement du fichier, la sélection de la session et l'interface de pointage.

2.  **Un Backend Puissant en Python (`flask_app.py`) :** Un micro-service hébergé gratuitement sur PythonAnywhere. Lorsque l'utilisateur exporte les présences, le frontend envoie le fichier Excel original et la liste des présents au backend. Le backend utilise la bibliothèque **Openpyxl**, qui est capable de modifier le contenu des cellules **en préservant les styles et les éléments hors des cellules de pointage traitées**.

Le classeur est traité en mémoire et téléchargé ; le fichier source reste inchangé.

---

## ⭐ Fonctionnalités Principales

-   **📱 Interface 100% Mobile :** Gros boutons, textes lisibles, actions tactiles et prévention du zoom pour une utilisation optimale sur le terrain.
-   **⚙️ Gestion de Session Simplifiée :**
    -   Chargez un planning `.xlsx` compatible (nom en B, prénom en C, participants dès la ligne 4).
    -   L'application détecte automatiquement les onglets (créneaux) et les dates.
    -   La date du jour est présélectionnée pour un démarrage rapide.
-   **👥 Extraction Intelligente des Joueurs :**
    -   Lit la première liste : **inscrits et essais admissibles pour la date choisie**, depuis les colonnes B et C du fichier.
    -   S'arrête au séparateur « LISTE D'ATTENTE » détecté en A:D, y compris dans une cellule fusionnée ancrée en A. La détection normalise la casse, les apostrophes typographiques et les espaces insécables/multiples.
    -   Les exports backend et local arrêtent également leurs écritures au séparateur. Le fallback XLSX préserve désormais les styles.
-   **👆 Pointage Tactile et Intuitif :**
    -   Recherche rapide par nom/prénom.
    -   Un énorme bouton pour pointer/annuler.
    -   **Annulation possible** pendant une courte période après le pointage.
-   **🗓️ Dates Excel :** Les jours calendaires sont lus et affichés indépendamment du fuseau horaire, avec prise en compte des calendriers Excel 1900 et 1904.
-   **🧑 Participants ESSAI :** Les marqueurs `ESSAI`, `ESSAI PRESENT` et `ESSAI ABSENT` identifient les essais. Une personne ayant un marqueur sur une date détectée n’est proposée que si la date sélectionnée porte aussi un de ces marqueurs. Les deux exports écrivent `ESSAI PRESENT` ou `ESSAI ABSENT` dans la cellule d’essai de cette date.
-   **🎨 Export avec styles :** Le backend Python/Openpyxl renvoie le classeur complet ; il écrit `V` pour les inscrits présents et vide les cellules des absents dans la colonne sélectionnée, avant la liste d’attente.
-   **🌐 Export local de secours :** Si le serveur backend est indisponible ou si sa requête échoue, le fallback modifie directement l’archive XLSX source en préservant les styles (`local_maj_...`).
-   **💾 Persistance des Données :** La session, les participants et les pointages sont sauvegardés dans le navigateur. Après F5, la recherche fonctionne immédiatement sans premier pointage préalable. Les octets originaux du fichier source sont conservés dans IndexedDB et restaurés après F5, avec contrôle SHA-256 et de la cible de session. Un réimport est requis seulement si la source ne peut pas être restaurée ou validée.

---

## 🚀 Workflow Utilisateur

L'utilisation de l'application est conçue pour être la plus simple possible :

1.  **Onglet "Admin" :**
    -   Cliquez sur "Charger le planning" et sélectionnez votre fichier Excel.
    -   Choisissez le créneau (onglet) et la date de la session.
    -   Cliquez sur "Démarrer la session".

2.  **Onglet "Participants" (Optionnel) :**
    -   Visualisez les inscrits et les essais de la date sélectionnée ; pointez ou annulez depuis cette liste.

3.  **Onglet "Pointer" :**
    -   L'application est prête à recevoir les joueurs.
    -   Recherchez le nom d'un joueur.
    -   Touchez le grand bouton pour marquer sa présence.

4.  **Onglet "Admin" (en fin de session) :**
    -   Après F5, attendez la restauration automatique de la source. Si elle échoue, rechargez le planning source dans Admin **sans redémarrer la session** : les pointages sont conservés. L’export contrôle l’identité du fichier et la cible de session.
    -   Cliquez sur "Télécharger le planning mis à jour".
    -   Récupérez le classeur mis à jour pour la date de session, avec les styles XLSX préservés via le backend ou le fallback local.

---

## 🛠️ Stack Technique

-   **Frontend :** HTML5, Tailwind CSS, JavaScript (ES6+)
-   **Librairie Excel (Frontend) :** [SheetJS/xlsx](https://sheetjs.com/)
-   **Backend :** Python (validation locale initiale : 3.12.3)
-   **Framework Backend :** Flask
-   **Librairie Excel (Backend) :** [Openpyxl](https://openpyxl.readthedocs.io/)
-   **Hébergement :** GitHub Pages (Frontend) & PythonAnywhere (Backend)

---

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

Ouvrir `http://127.0.0.1:8000/index.html` (pas un fichier `file://`).
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
Après F5, la session, les participants, la recherche et les pointages sont restaurés.
La source est restaurée depuis IndexedDB ; son SHA-256 et sa compatibilité avec
la session sont vérifiés. En cas d’échec, réimporter le fichier dans Admin
**sans redémarrer la session**. Les deux exports attendent une source valide.
Un fichier différent, même de même nom, ne remplace pas la source de la session.
Si IndexedDB échoue, l’export reste possible en mémoire, mais un réimport peut
être nécessaire après F5. Reset efface source, session, participants et journal.
Le stockage navigateur n’est pas une sauvegarde ; HTTPS ou localhost est requis
pour le calcul SHA-256. Les anciennes sessions sans hash exigent un réimport
compatible avec leur date et leurs participants.

`index.html` est la source frontend canonique du projet.
Structure du frontend sans étape de build :

- `index.html` : structure HTML et gestionnaires inline existants.
- `css/app.css` : styles personnalisés extraits sans modification.
- `js/state.js` : configuration backend, état partagé et stockage navigateur.
- `js/ui.js` : navigation, affichage et disponibilité de l’export.
- `js/pointage.js` : participants, recherche, pointage et annulation.
- `js/planning-storage.js` : accès IndexedDB sérialisés, sauvegarde et effacement de la source.
- `js/planning-source.js` : import, SHA-256, contrôle source/session, restauration et Reset.
- `js/planning.js` : dates, participants, essais par date et démarrage de session.
- `js/export-styles.js` : modification de l’archive XLSX et contraste du fallback.
- `js/export.js` : disponibilité backend et exports backend/local.
- `js/app.js` : initialisation et branchement des événements.

Les scripts classiques sont chargés en fin de page dans l’ordre : `state`, `ui`,
`pointage`, `planning-storage`, `planning-source`, `planning`, `export-styles`,
`export`, `app`. Les fonctions globales restent accessibles
aux gestionnaires inline. Publier `index.html`, `css/app.css` et les neuf fichiers
JS ensemble, en conservant les chemins relatifs utilisables sous `/bad_pointage/`.
Tailwind et SheetJS sont chargés par CDN.

- `main:index.html` est la version servie par GitHub Pages.
- `dev/local-test-cycle` est une branche historique ; le run actuel est intégré à `main`.
- Frontend canonique : `index.html` ; backend canonique actif : `flask_app.py`.
- Le backend utilise Flask local en développement et Flask/PythonAnywhere en production.
- Les fichiers datés ne sont plus des sources de vérité. Le frontend daté est
  archivé dans `old_bad/260907_badminton.html`, hors du contenu suivi de la branche.
- `old_bad/` sert uniquement d'archive locale ignorée par Git ; `En ligne/` reste
  également local et ignoré. Aucun changement du déploiement.
Les anciens états navigateur créés avant les correctifs de sélection des participants
peuvent nécessiter un nouvel import et un démarrage de session pour reconstruire la
liste. Cette migration se distingue d’un simple F5 dans la version actuelle.

### Export par ID et contraste

Le frontend transmet `{id, nom, prenom}` ; l’ID contient l’index SheetJS en base 0
(`P034` → ligne openpyxl 35). Les deux exports valident ID, identité et ligne
participant avant LISTE D’ATTENTE. Le fallback nom/prénom seul est réservé aux
anciennes entrées sans ID ; un ID invalide ou incompatible refuse l’export.
Pour `V`, `ESSAI PRESENT` et `ESSAI ABSENT`, un contraste calculé < 4,5:1 remplace
uniquement la couleur de police par le noir ou le blanc offrant le meilleur
contraste. Les styles déjà lisibles et les autres propriétés restent inchangés.
Le backend copie la police openpyxl ; le fallback modifie le XML de la feuille
et ajoute les seuls styles nécessaires dans l’archive XLSX source.
Le badge Nouveau (vert uni explicite en B/C/D) n’influence pas la présence ni ESSAI.

### Limites actuelles

- Le fallback XLSX préserve les styles et efface effectivement les absents.
  Seule la conversion locale d’un ancien `.xls` conserve une perte des styles annoncée.
- Couleurs non résolubles, motifs et dégradés : pas de recoloration arbitraire.
  Les mises en forme conditionnelles peuvent modifier le rendu.
- L’import peut afficher une ligne avec un nom seul, mais les deux exports ignorent
  les lignes sans nom ou sans prénom.
- Les dates reconnues sont numériques, dans les 10 premières lignes et 20 premières
  colonnes, avec une plage de séries 1900 strictement entre 40000 et 50000 et une
  année inférieure à 2030. Les dates stockées en texte ne sont pas prises en charge.

---

## 🔧 Guide de Déploiement

Le déploiement est effectué et validé en production. Les étapes ci-dessous
restent la procédure de référence pour les prochains déploiements.

Validation réelle du PILOTE au 27/09 : local avec backend OK, y compris F5 ;
local sans backend OK avec styles XLSX préservés ; PythonAnywhere à jour et
`/health` OK ; production Edge et Safari iPhone OK. L’export réel `maj_...`
contient les trois marqueurs visibles. Le symptôme « trois pointages, deux V »
était dû au style source de G35, pas à une perte de présence.
Les validations antérieures (ESSAI et 46 participants hors attente le mercredi)
restent consignées dans [le journal](journal_dev.md).

Dernier run automatisé : 45 tests frontend et 9 backend réussis, contrôles du
classeur réel inclus (`BAD_POINTAGE_REFERENCE`). Il ne constitue pas une
validation UI ; aucune suite métier n’est rejouée pour cette clôture documentaire.

### 1. Backend (PythonAnywhere)

1. Mettre à jour le backend déployé avec le fichier canonique `flask_app.py`.
2. Installer les dépendances de `requirements.txt` dans l’environnement de la Web App.
3. Vérifier que la configuration WSGI charge l’objet `app` de `flask_app`.
4. Vérifier la liste `CORS(app, origins=[...])` : l’origine de production actuelle
   est `https://mrchabou.github.io` ; adapter cette liste pour un autre hébergement.
5. Recharger la Web App puis contrôler `/health` et un export avec styles et essais.

### 2. Frontend (GitHub Pages)

1. Après fusion autorisée, publier depuis `main` le HTML, le CSS et les neuf fichiers
   JavaScript décrits ci-dessus.
2. La constante `BACKEND_URL` se trouve dans `js/state.js` : elle sélectionne Flask
   local sur `localhost`/`127.0.0.1`, et PythonAnywhere sur les autres hôtes.
   Adapter l’URL de production dans ce fichier pour un autre déploiement.
3. Vérifier en production le chargement des ressources, les dates, l’exclusion de
   LISTE D’ATTENTE, les essais par date, la restauration après F5, le contraste
   et les exports backend/local. Si la restauration échoue, vérifier le réimport.
4. Tous les assets CSS/JS locaux utilisent `?v=2026.09.27.2` dans `index.html`.
   Incrémenter cette version commune à chaque changement CSS/JS ; changer seulement
   la query string de la page ne renouvelle pas les URL de ses scripts.

---
## 💡 Évolutions Possibles

-   Gestion d'erreurs plus détaillée.
-   Authentification pour protéger l'accès à la section Admin.
-   Transformation en Progressive Web App (PWA) pour une utilisation hors-ligne.
-   Un tableau de bord pour visualiser les statistiques de présence.

---

Développé avec ❤️ par **MrChaBou**.


### Retour de pointage par mail (incrément local, recette à faire)

Envoi volontaire du XLSX courant avec note et récapitulatif. Configuration SMTP
privée, mode test obligatoire pour la recette : [documentation](docs/pointage-mail.md).
Le téléchargement reste indépendant ; aucun envoi ni Reset automatique.
