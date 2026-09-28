# PRD — Application de Pointage Badminton

**Statut :** document de référence fonctionnelle et technique
**Dernière mise à jour :** 2026-09-28

## 1. Rôle de ce document

Ce PRD est la source fonctionnelle et technique de référence de Bad Pointage.

Il distingue explicitement :

- **la production actuelle validée**, qui ne doit pas être régressée ;
- **la cible approuvée du prochain chantier**, qui n'est pas encore considérée comme livrée tant que le PILOTE ne l'a pas validée manuellement dans le navigateur.

Le dépôt GitHub du projet étant public, ce document ne doit contenir :

- aucun nom ou prénom de personne réelle ;
- aucune adresse e-mail réelle ;
- aucun mot de passe, jeton, clé API ou secret ;
- aucun identifiant sensible permettant d'accéder à un service privé.

Les rôles utilisés dans ce document sont :

- **PILOTE** : l'utilisateur du projet. Il est seul responsable des validations manuelles réelles dans le navigateur / UI : chargement du vrai Excel, navigation, recherche, pointage, export, téléchargement, réception de mail de test, inspection visuelle et DevTools si nécessaire.
- **CODEX** : agent de développement ayant accès au projet local. Il est source de vérité pour l'état des fichiers locaux, `git status`, `git diff`, le working tree et les tests automatisés locaux. Un test automatisé de CODEX ne remplace jamais une validation UI du PILOTE.
- **RESPONSABLE DE RÉCONCILIATION** : personne chargée de maintenir le fichier central de planning et de réconcilier les retours issus des différents modes de pointage.
- **RESPONSABLE DE CRÉNEAU** : personne réalisant un pointage, avec Bad Pointage ou par un autre moyen.

---

# PARTIE A — PRODUCTION ACTUELLE VALIDÉE

## 2. État de référence en production

Le déploiement sur `main`, commit `892a8d8`, est validé manuellement par le PILOTE.

GitHub Pages sert le frontend canonique ; PythonAnywhere utilise le backend canonique `flask_app.py`, avec `/health` OK. Cache commun : `2026.09.27.2`.

La production actuelle reste la référence de non-régression pendant le chantier suivant.

## 3. Objectif actuel et utilisateurs

Permettre aux joueurs et organisateurs de pointer les présences sur mobile, puis aux administrateurs de télécharger le planning Excel complet mis à jour pour un créneau et une date.

Le backend préserve les styles du classeur ; il travaille en mémoire et ne remplace pas le fichier source.

## 4. Import et sélection de session — comportement actuel

- Charger manuellement le planning `.xlsx` officiel, choisir son onglet et sa date, puis démarrer une session.
- Lire les noms en B et les prénoms en C à partir de la ligne 4 ; ignorer les lignes sans nom.
- Les IDs sont dérivés du numéro de ligne.
- Arrêter la lecture avant `LISTE D’ATTENTE`, détectée en A:D, y compris dans une cellule fusionnée ancrée en A.
- Normaliser casse, apostrophes typographiques et espaces insécables/multiples pour cette détection.
- Appliquer cette frontière aux deux exports.
- Lire les dates numériques Excel dans les 10 premières lignes et 20 premières colonnes.
- La conversion et l'affichage conservent le jour calendaire quel que soit le fuseau horaire, pour les calendriers Excel 1900 et 1904 ; la fraction horaire est ignorée.
- Les dates sont triées et le jour local courant est présélectionné lorsqu'il existe dans le planning.
- Limites de détection actuelles : série ramenée au calendrier 1900 strictement entre 40000 et 50000, année strictement entre 2000 et 2030.
- Les dates textuelles ne sont pas reconnues.

## 5. Participants ESSAI par date — comportement actuel

Les marqueurs reconnus, après suppression des espaces de bord et conversion en majuscules, sont :

- `ESSAI`
- `ESSAI PRESENT`
- `ESSAI ABSENT`

Une ligne portant l'un de ces marqueurs dans une des colonnes de date détectées est une ligne d'essai.

Elle est proposée uniquement si la cellule de la date sélectionnée porte elle aussi un de ces marqueurs.

Une ligne sans marqueur sur les dates détectées est considérée comme inscrite. La liste d'attente reste exclue.

Les essais admissibles participent à la recherche, au pointage et aux compteurs.

À l'export, une cellule cible portant un marqueur d'essai devient `ESSAI PRESENT` si la personne est pointée, sinon `ESSAI ABSENT`, dans les deux modes d'export.

Ces marqueurs ne créent pas automatiquement des pointages dans le journal importé.

## 6. Interface et pointage — comportement actuel

- **Pointer** : recherche par nom ou prénom dès deux caractères, sans distinction de casse ; sélection parmi plusieurs résultats, fiche joueur, pointage et annulation avec retour visuel.
- **Participants** : liste des inscrits et essais de la date, compteurs et pointage/annulation depuis la liste.
- **Journal** : consultation des présences de la session active avec heure.
- **Onglet actuel « Admin »** : nom historique de l'écran de gestion de session accessible aux utilisateurs de l'application ; il permet le chargement du planning, le choix du créneau et de la date, le démarrage de session, le statut backend, le téléchargement et la réinitialisation. **Cet onglet historique ne doit pas être confondu avec le futur mode Admin sécurisé réservé au PILOTE.**

Il n'existe plus de parcours de génération d'une colonne à coller.

Le journal n'a pas d'export séparé ni de bouton d'effacement propre.

La réinitialisation supprime source, session, participants et journal ; elle ne charge pas de joueurs par défaut.

## 7. Persistance et reprise après F5 — comportement actuel

La session, les participants et le journal sont stockés dans `localStorage`, propre à l'origine du navigateur.

Au chargement, la liste utilisée par la recherche est reconstruite depuis les participants sauvegardés : aucun premier pointage n'est nécessaire.

`BUG-UI-SEARCH-DELAY` est corrigé pour cette restauration.

Les octets originaux et métadonnées de la source active sont conservés dans IndexedDB (`bad-pointage-source` / `sources` / `active`), avec SHA-256.

Après F5, le classeur est reconstruit depuis une copie, sans resérialiser les octets source.

Les deux exports attendent le contrôle du hash (`sourceHash` de la session), de la taille, du créneau et de la cellule de date.

Un autre fichier, même de même nom, ne remplace pas silencieusement la source active.

Si la restauration échoue, réimporter la source sans redémarrer la session ; les pointages sont conservés.

Une ancienne session sans hash exige un réimport compatible avec sa date et ses participants avant rattachement.

Un échec IndexedDB laisse l'export en mémoire possible, mais peut imposer un réimport après F5.

Reset efface aussi la source ; les accès sérialisés et les contrôles d'opération empêchent les résultats obsolètes de la réinstaller.

Stockage propre au navigateur/origine, effaçable ; HTTPS ou localhost requis.

## 8. Export du planning complet — comportement actuel

- Le frontend envoie le fichier source encodé en base64, le créneau, la colonne cible et les présents `{id, nom, prenom}` de la session à `POST /update-planning`.
- L'ID est l'index SheetJS en base 0, complété à au moins trois chiffres : `P034` vise la ligne Excel/openpyxl 35.
- Les deux exports valident ID, identité normalisée et ligne participant avant `LISTE D’ATTENTE` avant toute écriture.
- Un ID invalide/incompatible refuse l'export (HTTP 400 côté backend).
- Le fallback nom/prénom seul est réservé aux anciennes entrées sans champ ID.
- Flask/openpyxl renvoie le classeur complet : `V` pour un inscrit présent, cellule vidée pour un absent, ou marqueur d'essai mis à jour selon la présence.
- Les écritures sont limitées à la colonne sélectionnée avant la liste d'attente.
- La préservation des styles, des fusions et des formules hors cible est assurée par le parcours backend sur les classeurs validés ; les cellules de pointage ciblées sont remplacées.
- Si le backend est indisponible ou sa requête échoue, le fallback XLSX modifie directement l'archive source via SheetJS/CFB et le DOM XML : feuille ciblée et styles dérivés nécessaires, autres parties inchangées.
- Les styles sont préservés et les absents effectivement effacés.
- Sorties : `maj_...` / `local_maj_...`.
- L'ancien `.xls` local reste converti avec perte des styles annoncée.
- Les deux exports ignorent les lignes sans nom ou sans prénom, alors que l'import peut afficher une ligne avec un nom seul.

Pour `V`, `ESSAI PRESENT` et `ESSAI ABSENT`, un contraste calculé < 4,5:1 sur fond connu change seulement la couleur de police en noir/blanc selon le meilleur contraste.

Thème/RGB/index et teintes sont résolus avant comparaison.

Le backend copie la police openpyxl ; le fallback duplique le style nécessaire.

Les styles déjà lisibles et leurs autres propriétés restent intacts.

Couleurs non résolubles, motifs et dégradés sont conservés ; le rendu conditionnel n'est pas évalué.

Le badge Nouveau (vert uni RGB explicite en B/C/D) reste indépendant de la présence et d'ESSAI ; il est recalculé à la restauration compatible sans perdre les pointages.

## 9. Architecture actuelle

Frontend canonique : `index.html`, styles dans `css/app.css`, sans build.

Scripts classiques chargés dans cet ordre :

| Fichier | Responsabilité |
| --- | --- |
| `js/state.js` | Configuration backend, état partagé, stockage |
| `js/ui.js` | Navigation, affichage et disponibilité de l'export |
| `js/pointage.js` | Participants, recherche, pointage et annulation |
| `js/planning-storage.js` | Accès IndexedDB sérialisés, sauvegarde et effacement |
| `js/planning-source.js` | Import, SHA-256, contrôle source/session, restauration et Reset |
| `js/planning.js` | Dates, participants, essais et démarrage de session |
| `js/export-styles.js` | Archive XLSX et contraste du fallback |
| `js/export.js` | Statut backend et exports |
| `js/app.js` | Initialisation et événements |

Backend canonique : `flask_app.py`, Flask/openpyxl, dépendances fixées dans `requirements.txt`.

En local : frontend HTTP sur `127.0.0.1:8000`, backend sur `127.0.0.1:5000`.

`BACKEND_URL`, dans `js/state.js`, choisit le backend local sur `localhost` ou `127.0.0.1`, sinon `https://mrchabou.eu.pythonanywhere.com`.

CORS autorise les deux origines locales sur le port 8000 et `https://mrchabou.github.io`.

Tailwind et SheetJS sont chargés par CDN ; une connexion Internet reste nécessaire.

GitHub Pages sert la version de `main` déployée au commit `892a8d8`.

Pour les prochains déploiements, publier ensemble le HTML, le CSS et les neuf scripts après fusion, puis mettre à jour et recharger PythonAnywhere.

Tous les assets locaux partagent `?v=2026.09.27.2`, à incrémenter ensemble à chaque changement CSS/JS.

Les archives `old_bad/` et `En ligne/` restent locales, ignorées par Git.

## 10. Validation actuelle

Validation manuelle historique du 09/09/2026, confirmée par le PILOTE :

- frontend chargé sans erreur ; backend disponible, `/health` HTTP 200 avec `{"status":"ok"}` ;
- export normal : `V` dans la bonne colonne ; `ESSAI PRESENT` et `ESSAI ABSENT` validés ;
- après F5 : session et recherche restaurées ; export bloqué jusqu'au rechargement du planning, puis réactivé sans perte des pointages ;
- `LISTE D’ATTENTE` exclue : 46 participants sur le cas Mercredi 20H–21H45.

Validation réelle du PILOTE au 27/09/2026 :

- local avec backend et F5 OK ;
- fallback XLSX sans backend OK, styles préservés ;
- PythonAnywhere à jour et `/health` OK ;
- GitHub Pages déployé depuis `main` (`892a8d8`) ;
- production Edge et Safari iPhone OK ;
- export réel `maj_...` : P032/P033/P034 écrits en G33/G34/G35 ; le symptôme observé venait du style source invisible de G35, pas d'une perte de présence.

Ces validations UI proviennent du PILOTE.

Dernier run automatisé documenté : 45 tests frontend et 9 backend réussis, contrôles facultatifs du vrai classeur inclus (`BAD_POINTAGE_REFERENCE`), sans affichage d'identités.

Ce résultat automatisé est distinct de la validation UI.

Les signalements historiques sur le tri et les prénoms n'ont pas de clôture explicite documentée ; leur statut reste à confirmer, sans les déclarer bugs actifs.

---

# PARTIE B — ÉVOLUTION APPROUVÉE À DÉVELOPPER

## 11. Décision métier validée

Le fonctionnement suivant est validé :

1. Le fichier `.xlsx` présent dans le Google Drive du club devient **la source centrale de référence du planning**.
2. Les usages hors Bad Pointage restent possibles : papier, fichier téléchargé, copie personnelle ou autre méthode de pointage.
3. Toute modification qui doit devenir officielle doit finalement être reportée dans le fichier central du Drive.
4. Les personnes qui modifient directement le fichier Drive doivent respecter un contrat minimal de structure compatible avec Bad Pointage.
5. Les droits actuels du Drive doivent être corrigés : l'autorisation générale de type « toute personne ayant le lien = éditeur » doit être supprimée avant mise en production de cette évolution.
6. Le RESPONSABLE DE RÉCONCILIATION continue à recevoir les retours de pointage des différents responsables et à les **réconcilier manuellement** avec le fichier central.
7. Les retours Bad Pointage comportent, en plus du fichier mis à jour, un récapitulatif et un champ de commentaire libre permettant notamment de signaler les personnes présentes absentes de la liste initiale ou toute information utile sur l'état du pointage.

Cette évolution ne supprime donc pas la réconciliation humaine du fichier central.

## 12. Objectifs de la cible

La cible doit permettre à un RESPONSABLE DE CRÉNEAU de :

1. ouvrir Bad Pointage depuis son URL habituelle ;
2. franchir un contrôle d'accès simple réservé aux responsables ;
3. charger automatiquement la dernière version disponible du planning central depuis Google Drive ;
4. sélectionner le créneau et la date ;
5. effectuer le pointage avec les fonctions déjà validées ;
6. saisir facultativement une note libre de fin de pointage ;
7. produire le classeur de retour mis à jour sans modifier le fichier central ;
8. transmettre le classeur de retour accompagné d'un récapitulatif au destinataire de réconciliation configuré ;
9. conserver le pointage et le fichier de retour si l'envoi échoue ;
10. permettre au PILOTE de changer facilement le code d'accès responsables via un mode Admin sécurisé.

## 13. Non-objectifs explicites de cette évolution

Cette évolution ne doit pas :

- écrire directement dans le fichier central Google Drive ;
- effectuer une réconciliation automatique entre plusieurs retours de pointage ;
- supprimer les pointages papier ou les copies personnelles ;
- imposer un compte Google à chaque responsable utilisant Bad Pointage ;
- créer une base de comptes individuels des responsables pour la première version ;
- considérer qu'un utilisateur de Bad Pointage est nécessairement un éditeur du planning Drive ;
- ajouter automatiquement au planning central une personne signalée uniquement dans le champ libre ;
- remplacer silencieusement la source d'une session en cours si le fichier Drive change pendant le pointage ;
- créer une console d'administration générale du serveur ;
- stocker durablement le planning central ou les exports de pointage sur le backend.

## 14. Source Google Drive

### 14.1 Source de vérité

La source métier est le fichier Excel central stocké dans Google Drive.

Le fichier actuel est un vrai `.xlsx` stocké dans Drive, et non un Google Sheets natif.

Le backend Bad Pointage doit accéder à cette source avec une **identité technique disposant uniquement du droit nécessaire en lecture**.

Les responsables Bad Pointage n'ont pas besoin d'avoir eux-mêmes accès au Drive.

### 14.2 Configuration et secrets

Les identifiants techniques Google Drive, compte technique, jetons, clés, secrets et paramètres de connexion ne doivent jamais être intégrés au frontend ni committés dans le dépôt public.

Ils doivent être configurés côté backend via variables d'environnement ou mécanisme de secret adapté à l'hébergement.

L'identifiant du fichier Drive cible doit être configurable côté backend et non codé dans l'interface utilisateur.

### 14.3 Chargement dynamique

Lorsqu'un responsable authentifié demande le planning, le backend récupère la **version courante** du `.xlsx` depuis Google Drive.

Le backend ne conserve pas de copie permanente du planning dans une base ou un répertoire applicatif.

Le traitement serveur du classeur doit rester en mémoire ou utiliser uniquement un fichier temporaire supprimé après traitement lorsque la bibliothèque ou l'hébergement l'impose.

Le frontend reçoit les données ou le fichier nécessaires au fonctionnement courant après contrôle d'accès.

### 14.4 Gel de la source pendant une session

Une fois une session de pointage démarrée, Bad Pointage doit conserver l'identité exacte de la source utilisée pour cette session :

- hash SHA-256 du fichier ;
- taille ;
- créneau ;
- date / cellule cible ;
- date de dernière modification Drive lorsque disponible ;
- identifiant de révision Drive lorsque disponible.

Si le fichier central change ensuite sur Drive, la session en cours ne doit pas basculer silencieusement vers la nouvelle version.

Un nouveau chargement doit être une action explicite et ne doit pas compromettre les pointages déjà saisis.

## 15. Contrat minimal de structure du fichier central

La première implémentation doit préserver les règles déjà validées en production et formaliser un contrôle de compatibilité avant démarrage d'une session.

Le contrat minimal comprend au moins :

- classeur `.xlsx` lisible ;
- onglets de créneaux exploitables ;
- noms en colonne B et prénoms en colonne C à partir de la ligne 4 selon le format actuel ;
- détection des dates selon les règles actuelles ;
- détection et exclusion de `LISTE D’ATTENTE` selon les règles actuelles ;
- prise en charge des marqueurs ESSAI existants ;
- préservation des styles, fusions et formules hors cellules de pointage ciblées lors de l'export ;
- cohérence entre la structure importée et la structure utilisée à l'export.

La couleur verte « Nouveau » reste une information visuelle indépendante du mécanisme de chargement dynamique. Bad Pointage ne doit pas dépendre de cette couleur pour déterminer la liste officielle des participants.

Les évolutions purement visuelles du classeur ne doivent pas être bloquées si elles ne cassent pas le contrat machine.

Toute évolution structurelle incompatible doit être détectée avant un pointage ou un export risqué.

## 16. Validation de structure et diagnostic

Bad Pointage doit préférer **refuser proprement** un planning incompatible plutôt que continuer avec une interprétation incertaine.

En cas d'échec de validation :

- ne pas démarrer une nouvelle session avec des données ambiguës ;
- ne pas produire un fichier de retour potentiellement faux ;
- afficher à l'utilisateur un message court et compréhensible ;
- produire un diagnostic technique exploitable ;
- conserver les pointages d'une session déjà active lorsqu'une erreur ultérieure n'impose pas leur suppression.

Le diagnostic doit être conçu pour ne contenir aucune donnée personnelle du planning.

Il peut contenir notamment :

- version de Bad Pointage ;
- étape en échec ;
- code d'erreur ;
- hash ou identifiant technique de la source ;
- date de modification / révision Drive ;
- nom technique ou index d'onglet seulement si nécessaire et s'il ne contient pas de donnée personnelle ;
- structure attendue et structure détectée ;
- compteurs non nominatifs ;
- environnement navigateur/backend utile au diagnostic.

Il ne doit pas contenir de noms, prénoms, adresses mail ou contenu libre saisi par les responsables.

Lorsque le backend et le réseau sont disponibles, l'application doit tenter d'envoyer automatiquement ce diagnostic au canal de support configuré.

Si cet envoi automatique échoue, l'utilisateur doit pouvoir copier le diagnostic manuellement.

## 17. Authentification des responsables

### 17.1 Principe

La première version utilise un **code secret commun aux responsables autorisés**.

Il n'existe pas de base de comptes individuels à maintenir pour cette version.

Connaître l'URL publique de Bad Pointage ne doit pas suffire pour :

- récupérer le planning ;
- voir les données personnelles ;
- démarrer une session ;
- générer un fichier de retour ;
- envoyer un pointage ;
- déclencher les fonctions protégées du backend.

### 17.2 Vérification côté serveur

Le code responsable ne doit jamais être embarqué, vérifié ni comparé uniquement dans le JavaScript public.

La vérification doit être réalisée par le backend.

Le code doit être stocké sous forme non réversible adaptée à l'authentification, hors dépôt public.

Une authentification réussie délivre une session ou un jeton temporaire permettant d'appeler les routes protégées du backend.

La solution doit fonctionner avec le frontend GitHub Pages et les navigateurs mobiles ciblés, notamment Safari iPhone.

L'implémentation ne doit pas dépendre de cookies tiers si ceux-ci compromettent ce fonctionnement cross-origin.

### 17.3 Session responsable

La session d'accès doit :

- expirer ;
- pouvoir être supprimée côté navigateur par une action de déconnexion ;
- être requise sur toutes les routes backend manipulant le planning ou un pointage ;
- ne jamais être confondue avec la persistance métier de la session de pointage ;
- pouvoir être invalidée globalement par le PILOTE via le mode Admin.

Le backend doit limiter raisonnablement les tentatives répétées d'authentification.

### 17.4 Données locales après authentification

La reprise après F5 reste un objectif important.

Les données de pointage locales ne doivent pas être affichées dans l'interface protégée tant que l'accès responsable n'a pas été réautorisé.

L'action de Reset continue à supprimer source, session, participants, journal et note libre associée.

Une action explicite de déconnexion doit au minimum supprimer le jeton/session d'accès.

La déconnexion ne doit pas supprimer automatiquement un pointage métier en cours sans confirmation explicite, afin d'éviter une perte accidentelle.

## 18. Mode Admin

### 18.1 Objectif

Le PILOTE doit pouvoir changer facilement le code partagé des responsables sans modifier le code source, sans commit Git et sans manipulation manuelle de fichier de configuration PythonAnywhere à chaque rotation.

Le mode Admin est volontairement minimal. Il n'est pas une console d'administration générale.

### 18.2 Accès Admin

L'accès Admin repose sur un **secret administrateur distinct** du code partagé des responsables.

Le secret administrateur :

- n'est jamais stocké dans le dépôt public ;
- n'est jamais envoyé au frontend autrement que lors de sa saisie par le PILOTE ;
- est vérifié côté backend ;
- ne doit pas pouvoir être déduit du code responsable ;
- doit être modifiable exceptionnellement via la configuration serveur si nécessaire.

Le mode Admin est **réservé au PILOTE** et ne doit pas être exposé dans le parcours normal des RESPONSABLES DE CRÉNEAU.

En V1 :

- aucun bouton « Administration » ne doit apparaître dans la navigation principale ou les écrans courants des responsables ;
- l'accès du PILOTE doit rester simple, par exemple via une entrée dédiée pouvant être conservée comme favori / signet ou un mécanisme équivalent validé pendant l'implémentation ;
- le chemin d'accès exact n'est pas une mesure de sécurité et peut être découvert dans le code public ;
- seule l'authentification Admin côté backend autorise les fonctions d'administration ;
- un responsable utilisant normalement l'application ne doit recevoir ni invitation ni message permanent concernant ce mode.

La discrétion demandée est donc une contrainte d'ergonomie et de sobriété UI, jamais un substitut à la sécurité.

### 18.3 Fonctions Admin V1

Le mode Admin V1 permet uniquement :

1. **changer le code responsable** ;
2. **invalider immédiatement toutes les sessions responsables actives** ;
3. consulter un état technique synthétique des services nécessaires : backend, accès Drive, configuration mail, sans exposer de secret ni de donnée personnelle.

Le changement de code responsable doit automatiquement invalider toutes les sessions responsables déjà émises.

Le nouveau code n'est jamais affiché de nouveau après validation ; le PILOTE le communique ensuite par le canal qu'il juge approprié.

### 18.4 Stockage de l'état d'authentification

Le code responsable étant modifiable depuis l'interface Admin, son empreinte et la version d'authentification nécessaire à l'invalidation des sessions doivent être persistées dans un stockage **privé au backend**, non servi par le web et non committé dans Git.

Il ne s'agit pas d'une base d'utilisateurs.

L'implémentation exacte — petit fichier privé atomique, SQLite minimal ou mécanisme équivalent — doit être choisie après audit de l'hébergement par CODEX et validée par le PILOTE avant développement de cette partie.

Le stockage doit contenir le minimum nécessaire et aucune donnée personnelle des responsables.

## 19. Parcours cible et UI

### 19.1 Principes UI

L'interface doit rester légère et adaptée au mobile.

Pendant les tests, les actions doivent être **sans ambiguïté** ; en production, elles doivent rester courtes et ne pas saturer l'utilisateur de messages permanents.

Privilégier :

- des libellés courts ;
- un retour immédiat après action ;
- des messages uniquement lorsqu'une action, erreur ou choix le nécessite ;
- un affichage technique détaillé uniquement dans le mode Admin ou dans un diagnostic.

Les libellés définitifs sont validés pendant les tests UI par le PILOTE.

### 19.2 Entrée

À l'ouverture de l'application :

- aucune donnée personnelle du planning n'est chargée avant autorisation ;
- un écran simple demande le code responsable ;
- l'action principale peut être libellée **« Accéder »** ou équivalent court ;
- après autorisation, l'utilisateur accède à l'application normale ;
- aucune entrée vers le mode Admin sécurisé n'est affichée dans le parcours normal ; le PILOTE y accède séparément par le mécanisme dédié prévu à la section 18.2, puis saisit le secret Admin distinct.

### 19.3 Administration du planning

Après authentification responsable, l'interface permet :

- de charger / actualiser la dernière version du planning Drive ;
- d'afficher discrètement la date de dernière modification connue de la source ;
- de choisir le créneau ;
- de choisir la date ;
- de démarrer une session ;
- de conserver le chargement manuel actuel comme parcours de secours pendant la migration, sans remplacer silencieusement une source active.

Le parcours manuel de secours reste lui aussi réservé aux utilisateurs authentifiés.

Un libellé court tel que **« Actualiser le planning »** est préféré à un texte explicatif permanent.

### 19.4 Session active

Les fonctions déjà validées restent disponibles :

- recherche ;
- pointage ;
- annulation ;
- participants ;
- compteur ;
- journal ;
- reprise après F5 selon les garanties de source existantes.

### 19.5 Note libre de pointage

Une session dispose d'un champ texte facultatif, par exemple **« Note pour la réconciliation »**.

Ce champ sert notamment à signaler :

- une personne présente mais absente de la liste initiale ;
- un changement constaté sur place ;
- une difficulté de pointage ;
- toute information utile à la réconciliation.

Le champ est libre et n'entraîne aucune modification automatique de la liste centrale.

Il est sauvegardé avec l'état local de la session pour survivre à un F5.

Il est inclus dans le récapitulatif transmis avec le fichier de retour.

## 20. Génération du fichier de retour

Le mécanisme actuel de production du classeur complet mis à jour reste la base de la cible.

Le fichier de retour doit être généré à partir de la **source exacte figée au démarrage / rattachement de la session**, et non à partir d'une nouvelle version Drive téléchargée au moment de l'export.

Le fichier central Drive n'est jamais modifié par cette opération.

Les règles actuelles d'écriture, de validation d'identité, de gestion ESSAI, de frontière `LISTE D’ATTENTE` et de préservation des styles restent applicables.

Le téléchargement local du fichier généré doit rester possible indépendamment de l'envoi mail.

## 21. Transmission du retour

### 21.1 Principe

Après le pointage, l'application doit permettre une action explicite de fin de parcours, par exemple **« Terminer et envoyer »**.

Cette action :

1. génère le fichier de retour à partir de la source figée ;
2. prépare le récapitulatif ;
3. **sécurise localement l'état finalisé avant toute tentative d'envoi** ;
4. tente l'envoi au destinataire configuré côté backend ;
5. affiche un résultat court et non ambigu.

L'adresse du destinataire n'est pas modifiable librement par un RESPONSABLE DE CRÉNEAU et n'est pas codée dans le frontend.

### 21.2 Mode test obligatoire

Pendant le développement et les validations :

- aucun envoi ne doit partir vers le destinataire réel de réconciliation ;
- une adresse de test dédiée est configurée côté backend ;
- le backend doit distinguer explicitement **mode test** et **mode production** ;
- une configuration de test ne doit pas pouvoir envoyer accidentellement vers l'adresse de production ;
- l'UI doit rendre le mode test identifiable sans encombrer l'écran, par exemple par une mention courte uniquement sur l'écran de fin de pointage ou dans le mode Admin.

Le passage en mode production du destinataire mail est une action explicite de déploiement validée par le PILOTE.

Aucune adresse réelle n'est documentée dans ce PRD ni committée dans Git.

### 21.3 Contenu minimal du récapitulatif

Le récapitulatif doit comprendre au moins :

- créneau ;
- date du créneau ;
- date et heure de fin / tentative d'envoi ;
- date de dernière modification de la source Drive utilisée, si disponible ;
- identifiant ou hash technique de la source ;
- nombre de participants proposés ;
- nombre de présents pointés ;
- nombre d'absents déduits ;
- nombre d'ESSAI concernés si pertinent ;
- note libre de réconciliation ;
- nom du fichier joint.

Le mail ne doit pas recopier inutilement la liste complète des participants dans son corps.

La note libre peut volontairement contenir les noms de personnes présentes mais absentes de la liste, car elle est destinée à la réconciliation métier. Cette note ne doit jamais être recopiée dans les logs techniques ou diagnostics automatiques.

### 21.4 Politique en cas d'échec d'envoi

Un échec d'envoi **ne clôt jamais la session de pointage et ne déclenche jamais de Reset**.

Avant la tentative d'envoi, l'application doit avoir conservé localement :

- la session de pointage ;
- le journal ;
- la note libre ;
- l'identité de la source ;
- les informations nécessaires pour régénérer le fichier de retour ;
- l'état de finalisation / d'envoi.

En cas d'échec :

- afficher clairement **« Envoi non effectué »** ou équivalent court ;
- conserver le pointage en l'état ;
- conserver la possibilité de régénérer / télécharger le fichier ;
- permettre un nouvel essai d'envoi ;
- éviter les doubles envois involontaires ;
- ne jamais effacer automatiquement le pointage.

Le téléchargement local du fichier reste disponible comme solution de secours.

Après F5, la session et son état d'envoi doivent être restaurés selon les garanties de persistance existantes.

La première version ne requiert pas de file d'attente serveur persistante des mails. En conséquence, la garantie de reprise repose sur le stockage local du navigateur tant que le PILOTE n'a pas validé un besoin de persistance serveur supplémentaire.

L'interface doit rendre cet état explicite : **non envoyé**, **envoyé**, ou **état incertain** si la réponse du serveur ne permet pas de conclure.

### 21.5 Après envoi réussi

Un envoi réussi ne doit pas effacer automatiquement la session.

L'utilisateur voit un accusé de réussite court et peut encore télécharger le fichier.

Le Reset ou le démarrage d'une nouvelle session reste une action distincte et explicite.

## 22. Mécanisme mail et coût

Le mécanisme de mail retenu pour la V1 doit être **utilisable gratuitement au volume normal attendu du projet** et ne doit pas imposer un abonnement payant pour le fonctionnement nominal.

Le choix peut être SMTP ou API mail, sous réserve :

- compatibilité avec PythonAnywhere et l'architecture retenue ;
- authentification stockée uniquement côté backend ;
- quota gratuit suffisant pour les volumes attendus ;
- possibilité de séparer destinataire de test et destinataire de production ;
- comportement fiable avec pièce jointe `.xlsx` ;
- documentation simple pour le PILOTE.

Si aucune option gratuite compatible n'est disponible au moment de l'implémentation, CODEX doit le signaler au PILOTE avant d'intégrer un fournisseur payant ou de modifier l'architecture.

Le PRD ne fixe pas encore le fournisseur ; ce choix intervient après audit technique et vérification des conditions gratuites en vigueur.

## 23. Réconciliation métier

Le fichier central Google Drive reste la seule source officielle du planning.

Après réception d'un retour Bad Pointage, le RESPONSABLE DE RÉCONCILIATION continue à effectuer la réconciliation manuelle avec le fichier central, comme pour les autres retours papier ou fichiers reçus.

Bad Pointage ne doit jamais présenter son fichier de retour comme une nouvelle version autoritative du planning central.

La coexistence suivante est volontaire et durable :

```text
Planning central Google Drive
        ├──> Bad Pointage -> fichier de retour + récapitulatif -> réconciliation
        ├──> téléchargement / copie personnelle -> retour -> réconciliation
        └──> impression papier -> retour -> réconciliation

Tous les retours sont réconciliés manuellement dans le planning central.
```

## 24. Sécurité et confidentialité

Avant mise en production de la cible :

- supprimer le partage général permettant à « toute personne ayant le lien » de modifier le Drive ;
- limiter les droits d'édition Drive aux personnes réellement chargées de maintenir le planning ;
- attribuer au backend uniquement un accès de lecture au fichier/dossier nécessaire ;
- conserver secrets Google, empreinte du code responsable, secret Admin, clés de session et paramètres mail uniquement côté serveur ;
- ne jamais stocker ces secrets dans `index.html`, les scripts publics ou Git ;
- n'envoyer aucune donnée personnelle au navigateur avant authentification ;
- protéger toutes les routes sensibles du backend ;
- protéger séparément les routes Admin ;
- limiter CORS aux origines nécessaires ;
- utiliser HTTPS en production ;
- limiter raisonnablement les tentatives d'authentification responsable et Admin ;
- ne pas journaliser noms, prénoms, adresses mail, contenu du classeur ou note libre dans les logs techniques ;
- ne pas inclure de données personnelles dans les diagnostics automatiques ;
- ne pas conserver durablement de copie du planning ou des exports sur le backend Bad Pointage.

L'envoi par mail constitue volontairement un canal de transmission du fichier de retour ; les copies conservées par les boîtes mail ne sont pas un stockage géré par Bad Pointage.

## 25. Architecture cible

Architecture logique souhaitée :

```text
                     GOOGLE DRIVE DU CLUB
                     fichier .xlsx central
                              |
                    lecture seule backend
                              |
                              v
+------------------+    +-------------------------+
| GitHub Pages     |    | Backend PythonAnywhere  |
| frontend public  |--->| - auth responsables     |
| sans secret      |    | - mode Admin sécurisé   |
+------------------+    | - accès Drive lecture   |
        ^               | - validation XLSX       |
        |               | - export XLSX           |
        |               | - envoi mail            |
        |               | - diagnostic            |
        |               +-------------------------+
        |                           |
        +---------------------------+
               API protégée HTTPS
```

Le frontend peut rester publiquement téléchargeable : la sécurité repose sur l'absence de secrets dans le frontend et sur le refus du backend de servir les données et opérations protégées sans autorisation valide.

Le mode Admin n'implique aucune base d'utilisateurs. Il gère uniquement un état d'authentification minimal côté backend.

## 26. Contraintes de non-régression

Le chantier ne doit pas casser les comportements déjà validés, notamment :

- import / parsing du vrai classeur ;
- sélection créneau/date ;
- recherche dès deux caractères ;
- pointage / annulation ;
- participants et journal ;
- ESSAI par date ;
- exclusion `LISTE D’ATTENTE` ;
- dates 1900 / 1904 et stabilité de jour calendaire ;
- reprise après F5 ;
- liaison forte source/session par hash ;
- export backend ;
- fallback local tant qu'il reste dans le périmètre retenu ;
- préservation des styles ;
- contraste des marqueurs écrits ;
- badge Nouveau indépendant ;
- Edge et Safari iPhone en production.

Tout changement volontaire d'un comportement historique doit être explicitement documenté dans le PRD et validé par le PILOTE.

## 27. Ordre de réalisation recommandé

Le développement doit être découpé en incréments testables et réversibles.

### Étape 1 — Authentification responsable + mode Admin minimal

- Ajouter la vérification du code responsable côté serveur.
- Ajouter le mécanisme de session / jeton temporaire compatible GitHub Pages -> PythonAnywhere et Safari iPhone.
- Protéger les routes sensibles existantes.
- Ajouter l'accès Admin avec secret distinct, sans entrée visible dans la navigation normale des responsables.
- Permettre au PILOTE de changer le code responsable depuis l'Admin.
- Invalider toutes les sessions responsables lors d'une rotation du code.
- Ajouter un état technique synthétique sans PII.
- Ne pas modifier encore le mode de chargement du planning.
- Conserver le chargement manuel pour valider l'authentification isolément.

**Critère PILOTE :** sans code valide, impossible d'utiliser les fonctions protégées ; avec code valide, le fonctionnement actuel reste utilisable ; l'interface normale ne met pas en avant l'administration ; via son accès dédié, le PILOTE peut changer le code, et une ancienne session cesse d'être valable.

### Étape 2 — Lecture Google Drive en backend

- Configurer l'identité technique Google.
- Télécharger en lecture seule le fichier `.xlsx` configuré.
- Retourner métadonnées de source et contenu utile sans persistance serveur.
- Ajouter un état détaillé permettant au mode Admin de vérifier l'accès Drive sans exposer de donnée personnelle.

**Critère PILOTE :** après authentification, Bad Pointage peut récupérer la dernière version du fichier central sans téléchargement manuel préalable.

### Étape 3 — Validation de structure et chargement dynamique

- Appliquer au fichier Drive les contrôles de compatibilité.
- Afficher discrètement dernière modification / version source.
- Alimenter le parcours créneau/date depuis la source Drive.
- Geler hash et métadonnées de la source pour la session.
- Conserver le chargement manuel comme secours.

**Critère PILOTE :** une modification normale du planning central apparaît au prochain chargement ; une structure volontairement incompatible est refusée proprement.

### Étape 4 — Note libre et persistance

- Ajouter le champ « Note pour la réconciliation » ou libellé équivalent validé en UI.
- Le persister avec la session.
- Vérifier F5, Reset, nouvelle session et réimport compatible.

**Critère PILOTE :** la note survit à F5 et disparaît au Reset ; elle n'altère jamais la liste officielle.

### Étape 5 — Retour de pointage + envoi mail en mode test

- Réutiliser la génération du classeur complet validée.
- Générer le récapitulatif.
- Persister l'état final local avant envoi.
- Configurer uniquement un destinataire de test.
- Utiliser une solution mail gratuite au volume attendu.
- Envoyer fichier + récapitulatif au destinataire de test.
- Conserver le téléchargement local.
- Gérer échec, retry, état incertain, doubles clics et doubles envois.
- Ne jamais Reset automatiquement après envoi.

**Critère PILOTE :** le mail de test reçoit le bon fichier et le bon récapitulatif ; un échec d'envoi conserve intégralement le pointage et permet retry / téléchargement après F5.

### Étape 6 — Diagnostic automatique

- Générer des diagnostics sans PII.
- Envoyer automatiquement lorsqu'un canal est disponible.
- Prévoir copie manuelle en secours.

**Critère PILOTE :** une erreur structurelle simulée génère un diagnostic exploitable sans nom, prénom, mail ni note libre.

### Étape 7 — Durcissement et mise en production

- Corriger les droits Drive avant activation réelle.
- Vérifier secrets et configuration PythonAnywhere.
- Vérifier CORS et HTTPS.
- Vérifier le mécanisme de rotation du code responsable depuis Admin.
- Basculer explicitement le mail du destinataire de test vers le destinataire réel configuré côté backend.
- Rejouer tests automatisés.
- Faire valider manuellement par le PILOTE sur desktop et Safari iPhone.
- Mettre à jour README, PRD, cache assets et documentation de déploiement.

## 28. Critères d'acceptation globaux de la cible

La cible n'est considérée comme validée que si le PILOTE confirme manuellement au minimum :

1. l'URL publique ne donne accès à aucune donnée de planning sans code valide ;
2. le code valide donne accès sans compte Google individuel ;
3. le mode Admin exige un secret distinct et n'est pas présenté dans la navigation normale des responsables ;
4. le PILOTE peut néanmoins y accéder facilement par son mécanisme dédié et changer le code responsable ;
5. une rotation du code invalide les sessions responsables existantes ;
6. la dernière version Drive est récupérée dynamiquement ;
7. une session active reste liée à la version exacte chargée ;
8. le pointage historique fonctionne sans régression ;
9. la note libre fonctionne et survit à F5 ;
10. le fichier de retour est correct et le Drive central reste inchangé ;
11. en test, le fichier et le récapitulatif arrivent uniquement au destinataire de test ;
12. un échec mail conserve la session, le pointage, la note et la possibilité de télécharger / retenter après F5 ;
13. un envoi réussi ne déclenche pas automatiquement un Reset ;
14. une incompatibilité de structure bloque proprement et produit un diagnostic sans PII ;
15. le chargement manuel de secours fonctionne tant qu'il reste prévu dans la version ;
16. Edge et Safari iPhone sont validés en conditions réelles ;
17. aucun secret ni donnée personnelle réelle n'apparaît dans le dépôt public ou le PRD.

## 29. Points encore à décider pendant l'implémentation

Ces points ne nécessitent pas de nouvelle consultation métier pour commencer le développement, mais CODEX ne doit pas les figer silencieusement sans validation du PILOTE :

- forme exacte et durée de vie du jeton/session responsable ;
- mécanisme privé minimal de persistance de l'empreinte du code responsable et de la version d'authentification ;
- durée / mécanisme de la session Admin ;
- mécanisme d'accès discret au mode Admin pour le PILOTE (par exemple entrée dédiée à conserver en favori), sans ajout d'un bouton visible dans le parcours normal ;
- mécanisme SMTP ou API mail gratuit retenu après vérification de sa disponibilité et de ses limites en vigueur ;
- canal d'envoi des diagnostics développeur ;
- politique exacte des données locales à la déconnexion ou expiration d'authentification ;
- libellés UI définitifs des actions principales ;
- maintien définitif ou retrait ultérieur du fallback XLSX local une fois le nouveau parcours stabilisé.

Aucun de ces choix ne doit remettre en cause les principes validés :

- source Drive centrale ;
- lecture seule du Drive par Bad Pointage ;
- pas de comptes individuels en V1 ;
- code responsable partagé ;
- mode Admin séparé, réservé au PILOTE, absent de la navigation normale et permettant au PILOTE de faire tourner ce code facilement ;
- retour de pointage séparé ;
- réconciliation manuelle ;
- pas de perte automatique du pointage lors d'un échec d'envoi ;
- solution mail gratuite au volume attendu ;
- UI légère et non ambiguë.


## Incrément Drive local du 28/09/2026 — état d'implémentation

Sur décision PILOTE, première tranche limitée au chargement explicite après
authentification, sans pointage actif. Le chargement automatique reste ultérieur.
Le fichier central du Shared Drive est partagé directement en Lecteur au compte
de service dédié (confirmation PILOTE). Aucun rôle IAM projet ni délégation.

Implémentation : route Bearer `/planning-source`, XLSX binaire et métadonnées dans
un en-tête CORS, lectures `files.get` avec `supportsAllDrives=true`, fileId imposé
côté backend. Champs documentés sélectionnés explicitement, dont `version`,
`modifiedTime`, `md5Checksum` et `headRevisionId` optionnel ; aucun champ supposé
`revisionId`. Source figée pendant le pointage, aucun accès Drive à l'export.
Import manuel et export local conservés. Aucun ajout mail, Admin ou changement
de créneau. Contrat et limites : [docs/drive-source.md](docs/drive-source.md).

Tests simulés uniquement : aucun secret Google créé/installé, aucune configuration
PythonAnywhere ni recette UI PILOTE pour cet incrément. La création/dépose d'une
clé JSON exige une décision explicite distincte avant le premier test réel.
