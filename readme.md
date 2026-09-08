# 🏸 Application de Pointage Badminton

Une application web 100% mobile pour simplifier le pointage des présences lors des séances de badminton et automatiser la mise à jour des plannings Excel, **tout en préservant intégralement le formatage et les styles du fichier d'origine**.

https://mrchabou.github.io/bad_pointage/


---

## 🎯 Problématique

La gestion des présences pour les créneaux de badminton se fait souvent via des fichiers Excel complexes, avec des mises en page, des couleurs et des formules spécifiques. Les solutions de pointage existantes ou les scripts JavaScript simples ont une limitation majeure : lors de la modification et de l'export du fichier Excel, **tous les styles et formatages sont perdus**, rendant le fichier final difficile à lire et à réutiliser.

De plus, le processus manuel (pointer sur papier, puis reporter dans Excel) est source d'erreurs et de perte de temps.

## ✨ La Solution

Cette application adopte une approche hybride pour résoudre ce problème :

1.  **Un Frontend Léger et Mobile (`index.html`) :** Une interface simple et tactile, utilisable sur n'importe quel smartphone via un navigateur. Elle gère le chargement du fichier, la sélection de la session et l'interface de pointage.

2.  **Un Backend Puissant en Python (`flask_app.py`) :** Un micro-service hébergé gratuitement sur PythonAnywhere. Lorsque l'utilisateur exporte les présences, le frontend envoie le fichier Excel original et la liste des présents au backend. Le backend utilise la bibliothèque **Openpyxl**, qui est capable de modifier le contenu des cellules **sans jamais altérer les styles, les formules ou les cellules fusionnées**.

Cette architecture garantit une expérience utilisateur fluide tout en produisant un fichier Excel final parfait.

---

## ⭐ Fonctionnalités Principales

-   **📱 Interface 100% Mobile :** Gros boutons, textes lisibles, actions tactiles et prévention du zoom pour une utilisation optimale sur le terrain.
-   **⚙️ Gestion de Session Simplifiée :**
    -   Chargez n'importe quel planning Excel.
    -   L'application détecte automatiquement les onglets (créneaux) et les dates.
    -   La date du jour est présélectionnée pour un démarrage rapide.
-   **👥 Extraction Intelligente des Joueurs :**
    -   Lit uniquement la première liste d'**inscrits**, depuis les colonnes B et C du fichier.
    -   S'arrête au séparateur « LISTE D'ATTENTE » détecté en A:D, y compris dans une cellule fusionnée ancrée en A. La détection normalise la casse, les apostrophes typographiques et les espaces insécables/multiples.
    -   Les exports backend et local arrêtent également leurs écritures au séparateur. Le mode local conserve sa limitation de préservation des styles.
-   **👆 Pointage Tactile et Intuitif :**
    -   Recherche rapide par nom/prénom.
    -   Un énorme bouton pour pointer/annuler.
    -   **Annulation possible** pendant une courte période après le pointage.
-   **🎨 Préservation Parfaite des Styles :** Grâce au backend Python/Openpyxl, le fichier Excel exporté est identique à l'original, avec seulement les 'V' de présence ajoutés.
-   **🌐 Fallback Automatique :** Si le serveur backend est indisponible, l'application peut toujours effectuer une mise à jour locale du fichier (en avertissant l'utilisateur que les styles seront perdus).
-   **💾 Persistance des Données :** La session active et le journal des présences sont sauvegardés dans le navigateur, vous pouvez donc fermer et rouvrir la page sans perdre votre travail.

---

## 🚀 Workflow Utilisateur

L'utilisation de l'application est conçue pour être la plus simple possible :

1.  **Onglet "Admin" :**
    -   Cliquez sur "Charger le planning" et sélectionnez votre fichier Excel.
    -   Choisissez le créneau (onglet) et la date de la session.
    -   Cliquez sur "Démarrer la session".

2.  **Onglet "Participants" (Optionnel) :**
    -   Visualisez uniquement les inscrits de la première liste du créneau sélectionné.

3.  **Onglet "Pointer" :**
    -   L'application est prête à recevoir les joueurs.
    -   Recherchez le nom d'un joueur.
    -   Touchez le grand bouton pour marquer sa présence.

4.  **Onglet "Admin" (en fin de session) :**
    -   Cliquez sur "Télécharger le planning mis à jour".
    -   Récupérez le fichier Excel parfaitement formaté avec les présences du jour.

---

## 🛠️ Stack Technique

-   **Frontend :** HTML5, Tailwind CSS, JavaScript (ES6+)
-   **Librairie Excel (Frontend) :** [SheetJS/xlsx](https://sheetjs.com/)
-   **Backend :** Python 3.10
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
Après un rechargement de page, recharger le planning et redémarrer la session :
la restauration complète n'est pas corrigée dans cette étape.

`index.html` est la source frontend canonique du projet.
Structure du frontend sans étape de build :

- `index.html` : structure HTML et gestionnaires inline existants.
- `css/app.css` : styles personnalisés extraits sans modification.
- `js/app.js` : script classique, chargé en fin de page ; fonctions globales
  conservées pour les gestionnaires `onclick`/`onchange`.

Les chemins relatifs `css/app.css` et `js/app.js` fonctionnent également sous
`/bad_pointage/`. Publier les trois fichiers ensemble. Les dépendances Tailwind
et SheetJS restent chargées par CDN dans leur ordre initial.

- `main:index.html` est la version servie par GitHub Pages.
- `dev/local-test-cycle:index.html` est la version de développement/test.
- Frontend canonique : `index.html` ; backend canonique actif : `flask_app.py`.
- Le backend utilise Flask local en développement et Flask/PythonAnywhere en production.
- Les fichiers datés ne sont plus des sources de vérité. Le frontend daté est
  archivé dans `old_bad/260907_badminton.html`, hors du contenu suivi de la branche.
- `old_bad/` sert uniquement d'archive locale ignorée par Git ; `En ligne/` reste
  également local et ignoré. Aucun changement du déploiement.
Le correctif du 07/09/2026 exclut la liste d'attente du chargement et des écritures de présence.
Après sa mise en place, recharger le planning et redémarrer la session pour remplacer
la liste conservée dans le navigateur. Aucun refactor ni traitement des essais, du tri
ou des prénoms n'est inclus.

---

## 🔧 Guide de Déploiement

Pour déployer votre propre version de l'application :

### 1. Backend (sur PythonAnywhere)

1.  Créez un compte gratuit sur [PythonAnywhere](https://www.pythonanywhere.com) (choisissez le serveur le plus proche, ex: Europe).
2.  Dans l'onglet **"Web"**, créez une nouvelle "Web App" avec le framework **Flask** et **Python 3.10**.
3.  Dans "Virtualenv", entrez un chemin (ex: `/home/VOTRE_NOM/.venv`) et laissez PythonAnywhere créer l'environnement virtuel pour Python 3.10.
4.  **Rechargez** l'application web pour l'activer.
5.  Ouvrez une console **depuis le lien du virtualenv** sur l'onglet "Web". Dans cette console, installez les dépendances :
    ```bash
    pip install flask flask-cors openpyxl
    ```
6.  Dans l'onglet **"Files"**, naviguez et ouvrez le fichier `flask_app.py`. Collez-y le contenu de votre fichier `flask_app.py`.
7.  **IMPORTANT (CORS) :** Dans `flask_app.py`, modifiez la ligne `CORS(app, origins='*')`. Pour la production, remplacez `*` par l'URL de votre page GitHub (ex: `'https://MrChaBou.github.io'`).
8.  Retournez sur l'onglet **"Web"** et cliquez sur **"Reload"**. Votre backend est en ligne !

### 2. Frontend (sur GitHub Pages)

1.  Créez un nouveau dépôt sur GitHub.
2.  Ajoutez `index.html`, `css/app.css` et `js/app.js` au dépôt.
3.  **IMPORTANT :** Dans `js/app.js`, modifiez la constante `BACKEND_URL` pour qu'elle corresponde à votre URL PythonAnywhere :
    ```javascript
    const BACKEND_URL = 'https://VOTRE_NOM.eu.pythonanywhere.com';
    ```
4.  Dans les paramètres de votre dépôt GitHub (`Settings` -> `Pages`), activez GitHub Pages pour la branche `main`.
5.  Votre application sera accessible à l'adresse `https://VOTRE_NOM_GITHUB.github.io/NOM_DU_DEPOT/index.html`.

---
## 💡 Évolutions Possibles

-   Gestion d'erreurs plus détaillée.
-   Authentification pour protéger l'accès à la section Admin.
-   Transformation en Progressive Web App (PWA) pour une utilisation hors-ligne.
-   Un tableau de bord pour visualiser les statistiques de présence.

---

Développé avec ❤️ par **MrChaBou**.
