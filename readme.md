# 🏸 Application de Pointage Badminton

Une application web 100% mobile pour simplifier le pointage des présences lors des séances de badminton et automatiser la mise à jour des plannings Excel, **avec préservation des styles via le backend Python**.

Production : https://mrchabou.github.io/bad_pointage/

**État au 09/09/2026 : production déployée et validée manuellement par le pilote.**
`main` a été fast-forwardée jusqu’à `29337bb`, puis poussée sur GitHub ; GitHub Pages
sert la nouvelle version. `flask_app.py` a été mis à jour sur PythonAnywhere et
la Web App rechargée. `/health` répond HTTP 200 avec `{"status":"ok"}`.


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
    -   Les exports backend et local arrêtent également leurs écritures au séparateur. Le mode local conserve sa limitation de préservation des styles.
-   **👆 Pointage Tactile et Intuitif :**
    -   Recherche rapide par nom/prénom.
    -   Un énorme bouton pour pointer/annuler.
    -   **Annulation possible** pendant une courte période après le pointage.
-   **🗓️ Dates Excel :** Les jours calendaires sont lus et affichés indépendamment du fuseau horaire, avec prise en compte des calendriers Excel 1900 et 1904.
-   **🧑 Participants ESSAI :** Les marqueurs `ESSAI`, `ESSAI PRESENT` et `ESSAI ABSENT` identifient les essais. Une personne ayant un marqueur sur une date détectée n’est proposée que si la date sélectionnée porte aussi un de ces marqueurs. Les deux exports écrivent `ESSAI PRESENT` ou `ESSAI ABSENT` dans la cellule d’essai de cette date.
-   **🎨 Export avec styles :** Le backend Python/Openpyxl renvoie le classeur complet ; il écrit `V` pour les inscrits présents et vide les cellules des absents dans la colonne sélectionnée, avant la liste d’attente.
-   **🌐 Export local de secours :** Si le serveur backend est indisponible, l'application peut toujours effectuer une mise à jour locale du fichier (en avertissant l'utilisateur que les styles seront perdus).
-   **💾 Persistance des Données :** La session, les participants et les pointages sont sauvegardés dans le navigateur. Après F5, la recherche fonctionne immédiatement sans premier pointage préalable. Le fichier Excel source, conservé uniquement en mémoire, doit être rechargé avant export ; le bouton reste désactivé avec un message explicite jusque-là.

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
    -   Après F5, rechargez le planning source dans Admin **sans redémarrer la session** : les pointages sont conservés. L’export vérifie la présence du créneau et la compatibilité de la cellule de date avec la session restaurée.
    -   Cliquez sur "Télécharger le planning mis à jour".
    -   Récupérez le classeur mis à jour pour la date de session, avec les styles préservés via le backend.

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
Après F5, la session, les participants, la recherche et les pointages sont restaurés.
Recharger le fichier source dans Admin **sans redémarrer la session** pour exporter.
Les exports backend et local sont bloqués tant que le classeur manque ou que
la cible de session est incompatible.

`index.html` est la source frontend canonique du projet.
Structure du frontend sans étape de build :

- `index.html` : structure HTML et gestionnaires inline existants.
- `css/app.css` : styles personnalisés extraits sans modification.
- `js/state.js` : configuration backend, état partagé et stockage navigateur.
- `js/ui.js` : navigation, affichage et disponibilité de l’export.
- `js/pointage.js` : participants, recherche, pointage et annulation.
- `js/planning.js` : import, dates, essais par date, session et contrôle avant export.
- `js/export.js` : disponibilité backend et exports backend/local.
- `js/app.js` : initialisation et branchement des événements.

Les scripts classiques sont chargés en fin de page dans l’ordre : `state`, `ui`,
`pointage`, `planning`, `export`, `app`. Les fonctions globales restent accessibles
aux gestionnaires inline. Publier `index.html`, `css/app.css` et les six fichiers
JS ensemble, en conservant les chemins relatifs utilisables sous `/bad_pointage/`.
Tailwind et SheetJS sont chargés par CDN.

- `main:index.html` est la version servie par GitHub Pages.
- `dev/local-test-cycle:index.html` est la version de développement/test.
- Frontend canonique : `index.html` ; backend canonique actif : `flask_app.py`.
- Le backend utilise Flask local en développement et Flask/PythonAnywhere en production.
- Les fichiers datés ne sont plus des sources de vérité. Le frontend daté est
  archivé dans `old_bad/260907_badminton.html`, hors du contenu suivi de la branche.
- `old_bad/` sert uniquement d'archive locale ignorée par Git ; `En ligne/` reste
  également local et ignoré. Aucun changement du déploiement.
Les anciens états navigateur créés avant les correctifs de sélection des participants
peuvent nécessiter un nouvel import et un démarrage de session pour reconstruire la
liste. Cette migration se distingue d’un simple F5 dans la version actuelle.

### Limites actuelles

- Le mode local ne préserve pas les styles ; l’effacement d’une ancienne présence
  par écriture de `null` a été signalé comme non effectif dans le journal et n’a
  pas de correctif identifié. Privilégier le backend pour l’export complet.
- L’import peut afficher une ligne avec un nom seul, mais les deux exports ignorent
  les lignes sans nom ou sans prénom.
- Les dates reconnues sont numériques, dans les 10 premières lignes et 20 premières
  colonnes, avec une plage de séries 1900 strictement entre 40000 et 50000 et une
  année inférieure à 2030. Les dates stockées en texte ne sont pas prises en charge.

---

## 🔧 Guide de Déploiement

Le déploiement est effectué et validé en production. Les étapes ci-dessous
restent la procédure de référence pour les prochains déploiements.

Validation manuelle confirmée par le pilote : frontend chargé sans erreur, backend
disponible, export normal avec `V` dans la bonne colonne, `ESSAI PRESENT` et
`ESSAI ABSENT`. Après F5, session et recherche restaurées, export bloqué jusqu’au
rechargement du planning puis réactivé sans perte des pointages. LISTE D’ATTENTE
exclue : 46 participants sur le cas Mercredi 20H–21H45.

### 1. Backend (PythonAnywhere)

1. Mettre à jour le backend déployé avec le fichier canonique `flask_app.py`.
2. Installer les dépendances de `requirements.txt` dans l’environnement de la Web App.
3. Vérifier que la configuration WSGI charge l’objet `app` de `flask_app`.
4. Vérifier la liste `CORS(app, origins=[...])` : l’origine de production actuelle
   est `https://mrchabou.github.io` ; adapter cette liste pour un autre hébergement.
5. Recharger la Web App puis contrôler `/health` et un export avec styles et essais.

### 2. Frontend (GitHub Pages)

1. Après fusion autorisée, publier depuis `main` le HTML, le CSS et les six fichiers
   JavaScript décrits ci-dessus.
2. La constante `BACKEND_URL` se trouve dans `js/state.js` : elle sélectionne Flask
   local sur `localhost`/`127.0.0.1`, et PythonAnywhere sur les autres hôtes.
   Adapter l’URL de production dans ce fichier pour un autre déploiement.
3. Vérifier en production le chargement des ressources, les dates, l’exclusion de
   LISTE D’ATTENTE, les essais par date, la recherche après F5, le blocage de
   l’export puis sa reprise après rechargement du fichier source.

---
## 💡 Évolutions Possibles

-   Gestion d'erreurs plus détaillée.
-   Authentification pour protéger l'accès à la section Admin.
-   Transformation en Progressive Web App (PWA) pour une utilisation hors-ligne.
-   Un tableau de bord pour visualiser les statistiques de présence.

---

Développé avec ❤️ par **MrChaBou**.
