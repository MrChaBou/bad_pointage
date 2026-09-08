# PRD — Application de Pointage Badminton

**Auteur :** MrChaBou
**Dernière mise à jour :** 2026-09-07

---

## 🎯 Objectif

Mettre à disposition des joueurs et des organisateurs un outil simple de **pointage en ligne** qui :

* Permet aux joueurs de marquer leur présence facilement.
* Alimente automatiquement un **planning Excel existant** (par créneau et date) sans altérer son format ni sa mise en page.
* Supprime la nécessité d’exporter manuellement des journaux : tout passe par l’intégration avec le planning.

---

## 👥 Utilisateurs cibles

* **Joueurs** : marquer leur présence en quelques clics depuis un smartphone.
* **Administrateurs (orga du club)** : gérer la liste des joueurs et mettre à jour le planning officiel.

---

## ⚙️ Fonctionnalités principales

### 1. Pointage joueur (UI simple et rapide)

* Recherche rapide par nom ou prénom (2-3 lettres mini).
* Affichage d’une fiche joueur → coche “Présent” (case à cocher stylisée).
* Confirmation visuelle immédiate (“✅ Présence enregistrée !”).
* Réinitialisation automatique après quelques secondes pour enchaîner les pointages.

### 2. Journal (consultation / gestion interne)

* Liste chronologique des présences enregistrées.
* Option pour effacer tout le journal.
* **Note** : plus d’export Excel depuis le journal (fonction supprimée).

### 3. Admin (gestion avancée)

#### a) Import des joueurs

* Import d’un fichier Excel contenant les colonnes **Nom** et **Prénom**.
* Génération automatique d’IDs uniques.
* Aperçu de la liste des joueurs importés.
* Règle du 07/09/2026 : charger uniquement la première liste du créneau, depuis la ligne 4 jusqu'au séparateur « LISTE D'ATTENTE » exclu. Détecter ce texte en A:D en normalisant casse, apostrophes typographiques et espaces insécables/multiples ; ignorer les places sans nom.
* Appliquer la même frontière aux écritures de présence des exports backend et local. La limitation existante du mode local concernant les styles demeure. Aucun traitement particulier des participants « essai » dans ce correctif.
* Après mise à jour, recharger le planning et redémarrer la session pour renouveler la liste sauvegardée dans le navigateur.

#### b) Mise à jour du planning (nouvelle logique “colonne à coller”)

* Import du fichier **planning officiel** (Excel multi-onglets, un onglet par créneau).
* Lecture automatique des onglets → affichage dans un menu déroulant (“Créneau”).
* Détection automatique des colonnes de date dans la ligne d’en-tête → affichage dans un menu déroulant (“Date”).
* Génération d’un fichier Excel contenant **une seule colonne** (avec entête = date choisie, lignes = “✗” ou vide selon présence).
* L’admin colle cette colonne directement dans l’onglet/date correspondants du planning → aucune mise en page ou formule n’est altérée.

#### c) Réinitialisation

* Effacement complet des données (joueurs + journal).
* Réinitialisation avec un set de joueurs par défaut.

---

## 🖥️ Interface utilisateur

### Onglet **Pointage**

* Champ recherche joueur.
* Carte joueur + case à cocher présence.
* Message de succès.
* Footer : *“Dev par MrChaBou avec ❤️”*.

### Onglet **Journal**

* Liste des présences (nom, prénom, date/heure).
* Bouton “Effacer le journal”.
* Footer : *“Dev par MrChaBou avec ❤️”*.

### Onglet **Admin**

* **Import joueurs** : bouton choisir fichier + aperçu.
* **Mise à jour du planning** :

  * Bouton importer fichier planning.
  * Bouton “Lire les créneaux” → liste des onglets.
  * Menu déroulant “Créneau (onglet)”.
  * Menu déroulant “Date”.
  * Bouton “Générer la colonne ✗/✓ à coller”.
  * Bouton “Télécharger la colonne” (active après génération).
* **Réinitialisation** : bouton rouge “Tout réinitialiser”.
* Footer : *“Dev par MrChaBou avec ❤️”*.

---

## 🔄 Flux d’utilisation admin (mise à jour planning)

1. Admin → onglet **Admin**.
2. Import du **fichier planning officiel**.
3. Cliquer sur **“Lire les créneaux”** → affichage des onglets (créneaux).
4. Choisir un **créneau/onglet**.
5. Choisir une **date** (dans les entêtes de la ligne planning).
6. Cliquer sur **“Générer la colonne”**.
7. Télécharger le fichier colonne générée.
8. Dans Excel → coller la colonne dans la colonne de la date sélectionnée (du bon onglet).

---

## 🚫 Ce qui a été supprimé

* **Export du journal des présences** en Excel → remplacé par l’intégration directe avec le planning via colonnes générées.

---

## ✅ Contraintes et exigences

* Ne jamais modifier la mise en page, formules, couleurs ou bordures du planning Excel officiel.
* Gérer correctement les **noms avec accents / majuscules / espaces** (normalisation).
* Les entêtes de colonnes de dates doivent être de **vraies dates Excel** ou du texte reconnu (“05-sept”, “12/09/2025”, etc.).
* Compatibilité mobile (iOS Safari, Android Chrome).
* Stockage local (localStorage) suffisant, pas besoin de serveur externe.

---


## Extension du 07/09/2026 — Cycle de dev/test local

Cette extension décrit uniquement le cycle local ; les fonctionnalités métier
historiques ci-dessus ne sont pas révisées à cette étape. Pour ce cycle, un
backend Flask local est nécessaire à l'export avec openpyxl, malgré la mention
historique « pas besoin de serveur externe ».

`index.html` est la source frontend canonique du projet.

- `main:index.html` est la version servie par GitHub Pages.
- `dev/local-test-cycle:index.html` est la version de développement/test.
- `260907_badminton.html` reste présent à titre transitoire ; il n'est plus la
  source de vérité et ne doit pas remplacer `index.html`.
- Le backend de travail reste `260907_flask_app.py` : Flask local en développement,
  Flask sur PythonAnywhere en production.
- Les fichiers datés et `En ligne/` existent toujours ; aucune suppression ni
  modification du déploiement n'est effectuée.
- Frontend HTTP sur `127.0.0.1:8000` ; backend sur `127.0.0.1:5000`.
- Sur `localhost` ou `127.0.0.1`, le frontend sélectionne le backend local ;
  sur GitHub Pages, il conserve `https://mrchabou.eu.pythonanywhere.com`.
- CORS : autoriser `http://127.0.0.1:8000`, `http://localhost:8000` et
  `https://mrchabou.github.io`.
- Installation et commandes exactes : section « Cycle de développement et test
  local » du README (`readme.md`) et de `journal_dev.md`.
- Dépendances backend déclarées dans `requirements.txt` ; CDN frontend
  nécessitant une connexion Internet.
- Critères de validation : GET `/health` en HTTP 200, frontend servi en HTTP,
  appels vers le backend local, CORS autorisé pour les trois origines et POST
  `/update-planning` renvoyant un classeur modifié en mémoire.
- `En ligne/` et le comportement métier restent inchangés ; aucun déploiement.
- Refactor, tests de non-régression durables et bugs Excel/tri/prénom restent
  hors périmètre. La restauration complète après rechargement reste une limite.
