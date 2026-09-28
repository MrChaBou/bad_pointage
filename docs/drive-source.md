# Premier incrément Drive — chargement explicite

Implémentation locale, tests Google simulés uniquement. Aucune clé réelle créée,
aucun secret installé, aucun déploiement PythonAnywhere et aucune recette UI
PILOTE effectués pour cet incrément. Le partage Lecteur du fichier du Shared
Drive au compte de service a été confirmé par le PILOTE.

## Parcours

Après authentification, sans pointage actif, « Charger le planning central »
récupère le fichier configuré. Le choix créneau/date et le démarrage restent
explicites. « Importer un fichier — secours » utilise le même parseur et le même
calcul d'identité. Aucun chargement automatique après login, F5 ou reconnexion.

Le bouton Drive est masqué dès qu'un pointage est actif ; la fonction refuse
également un appel direct dans cet état. Le backend n'enregistre pas les sessions
métier : cette règle est portée par le frontend, pas par un état serveur ajouté.
Les octets et métadonnées sont figés au démarrage, conservés dans IndexedDB et
liés à la session par SHA-256. Export backend et local utilisent ces octets, sans
appel Drive. Un réimport manuel exact peut réparer une source perdue et conserve
alors les métadonnées Drive figées dans la session. Les anciennes sources manuelles
restent compatibles. Aucun changement de créneau n'est ajouté.

## Contrat HTTP

`GET /planning-source`, avec `Authorization: Bearer <jeton responsable>`.
Le fichier est imposé côté serveur ; les paramètres de requête ne sélectionnent
jamais un autre fichier. La validation responsable précède tout accès Google.

Succès : HTTP 200, corps binaire strictement identique au XLSX téléchargé.

- `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- `Content-Length` : taille du corps.
- `Cache-Control: no-store`
- `X-Planning-Metadata` : JSON ASCII (`ensure_ascii=True`), exposé par CORS aux
  origines déjà autorisées. Le nom Unicode est décodé par `JSON.parse`.

Champs du JSON : `name`, `size` (entier), `sha256` (hexadécimal), `modifiedTime`,
`driveVersion` (chaîne), `headRevisionId`, `md5Checksum`. Les trois métadonnées
optionnelles `modifiedTime`, `headRevisionId`, `md5Checksum` peuvent être nulles.
Aucun fileId, identifiant du compte ou secret n'est envoyé au navigateur.
Pas de base64, multipart ni en-tête Content-Disposition à interpréter.

Erreurs : JSON `{"error":"code"}`, avec `Cache-Control: no-store`.

| HTTP | Code |
| --- | --- |
| 401 | `unauthorized` (session responsable uniquement) |
| 503 | `auth_unavailable` (stockage responsable indisponible) |
| 503 | `drive_not_configured` |
| 503 | `drive_credentials_invalid` |
| 502 | `drive_access_denied` |
| 502 | `drive_file_unavailable` |
| 504 | `drive_timeout` |
| 503 | `drive_unavailable` |
| 422 | `planning_invalid` |
| 409 | `drive_source_changed` |

Google 404 ne permet pas de distinguer absence et invisibilité du fichier.
Les quotas Google, y compris certains 403, sont traités comme indisponibilité.
Une erreur Google ne révoque pas l'accès responsable. Le frontend garde sa source
précédente si Drive échoue, propose de réessayer ou d'importer manuellement, et
ignore une réponse devenue obsolète après logout, Reset ou autre import.

## API Google et intégrité

Trois lectures `files.get` sur le fileId configuré, toutes avec
`supportsAllDrives=true` : métadonnées, contenu `alt=media`, métadonnées de contrôle.
Aucun listing du Shared Drive et aucune écriture, conversion ou API `files.export`.

Sélection exacte des champs :

```text
name,mimeType,size,trashed,version,modifiedTime,md5Checksum,headRevisionId,capabilities(canDownload)
```

`revisionId` n'est pas un champ utilisé. `headRevisionId` est documenté sur File
pour les fichiers binaires et reste optionnel. `version` est une chaîne numérique
Drive, distincte de la version interne 1 des enregistrements IndexedDB.

Références : [files.get](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/get),
[ressource File](https://developers.google.com/workspace/drive/api/reference/rest/v3/files).

Contrôles : droit de téléchargement, fichier non supprimé, type XLSX, taille
annoncée et reçue, version stable pendant la récupération, MD5 si fourni par
Drive, calcul SHA-256 local. Une évolution pendant la récupération produit un
409 et impose une nouvelle action explicite. Une modification ultérieure sur
Drive n'affecte pas la source déjà reçue.

Le backend valide l'archive et son ouverture openpyxl sans la sauvegarder.
Plafonds : 10 Mio téléchargés par défaut, 50 Mio décompressés, 10 000 entrées ZIP.
Les créneaux/dates/participants restent interprétés par les fonctions frontend
existantes ; un classeur sans cible exploitable est refusé. Le démarrage d'une
cible Drive avec identité incomplète est refusé. Ce n'est pas un nouveau schéma
universel de validation de tous les formats Excel.

Délais réseau : 5 secondes maximum par attente réseau, contrôle d'un budget de
30 secondes entre étapes et blocs reçus ; une attente déjà engagée peut terminer
après ce budget. Le navigateur annule son attente à 35 secondes. Pas de boucle
applicative de retry. Les bibliothèques Google gèrent leur échange OAuth.
Aucun planning ni export n'est conservé sur le serveur. Les diagnostics de la
route contiennent uniquement le code d'erreur applicatif.

## Configuration future — non effectuée

Dépendances directes ajoutées : `google-auth==2.58.1`, `requests==2.34.2`.
Elles nécessitent Python >= 3.10 ; tests locaux sous Python 3.12. Vérifier le
Python du virtualenv de la Web App avant toute installation sur PythonAnywhere.
Les bibliothèques Google sont chargées seulement à l'appel de la route Drive.

Variables à définir avant import WSGI de `flask_app` :

- `BAD_POINTAGE_DRIVE_FILE_ID` : ID du fichier, extrait de son lien Drive.
- `BAD_POINTAGE_GOOGLE_CREDENTIALS_FILE` : chemin absolu du JSON privé.
- `BAD_POINTAGE_DRIVE_MAX_BYTES` : optionnelle, défaut 10485760.

Compte de service dédié déjà validé par le PILOTE, avec partage direct Lecteur
sur le seul fichier nécessaire. Scope unique `drive.readonly`, sans rôle IAM
projet ni délégation de domaine. Pas de login Google des responsables.

La création et l'installation de la clé JSON nécessitent une autorisation
PILOTE distincte. Le fichier devra être hors dépôt et hors répertoire servi,
0600 dans un répertoire 0700, distinct de l'état auth responsable. Ne jamais le
copier dans le projet ou les logs. Les jetons OAuth restent en mémoire.

Avant le premier test réel : autorisation de la clé, configuration privée du
fileId et du chemin, vérification Python/dépendances, puis accès sortant OAuth
et Drive depuis la Web App PythonAnywhere. Aucune de ces opérations n'a été
réalisée ici. La correction du partage général éditeur prévue au PRD reste un
prérequis à l'activation en production.

## Tests et recette

Tests automatisés : `python -B -m unittest discover -s tests -p 'test_*.py'` et
`node --test tests/*.test.cjs`. Les nouveaux tests Drive interdisent le transport
HTTP réel et utilisent un XLSX synthétique en mémoire, sans clé Google.

Après activation autorisée, le PILOTE vérifiera dans le navigateur : chargement
explicite, choix/démarrage, conservation après F5/reconnexion, exports avec vrai
Excel, import de secours et absence de remplacement du pointage actif. Les essais
de modification/incompatibilité doivent utiliser une copie Drive dédiée. Ces
contrôles manuels ne sont pas remplacés par les tests automatisés.
