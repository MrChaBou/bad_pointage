# Socle backend responsable — incrément 1

Le socle est maintenant relié au frontend responsable. La recette locale est
décrite dans [local-auth-test.md](local-auth-test.md). Aucune API Admin. Ne pas
déployer un ancien frontend avec ce backend : il ne fournit pas de Bearer et
son fallback historique ne traite pas les refus d'authentification.

## Configuration privée

`BAD_POINTAGE_AUTH_FILE` est un chemin absolu serveur, hors dépôt et hors de tout
répertoire servi par le web. Aucun chemin de secours ni code par défaut.
Créer un répertoire dédié accessible uniquement au compte du backend (0700).
Le fichier et son verrou sont 0600. Utiliser le même chemin pour tous les workers.
Ne pas placer l'état dans un répertoire temporaire effacé au redémarrage.

Configurer cette variable dans l'environnement WSGI **avant** l'import de
`flask_app`. Pour initialiser une seule fois, lancer `python init_auth.py` avec
la même variable : saisie interactive masquée, confirmation, code 12–256
caractères. Utiliser un code long imprévisible. Aucun secret en argument shell.
L'outil refuse d'écraser un fichier existant ; une corruption ne réinitialise
jamais automatiquement l'état. Aucun secret réel n'est inclus dans le dépôt.

## Stockage et concurrence

JSON versionné : empreinte scrypt salée (`32768:8:1`), génération, sessions
(empreinte SHA-256 de 32 octets aléatoires encodés en URL-safe, rôle, échéance),
horodatages des tentatives. Aucun nom, IP, classeur ou donnée métier.

Verrou POSIX `flock` exclusif sur un fichier `.lock` stable et distinct, conservé
entre opérations. Tous les accès passent par ce verrou ; aucune copie en cache
par worker. Attente maximale de verrou 2 secondes, puis 503. Ne jamais supprimer
le fichier de verrou pendant que des workers fonctionnent.

Écriture temporaire dans le même répertoire, flush/fsync, remplacement atomique,
puis fsync du répertoire. Le verrou couvre toute la transaction, y compris login
et vérification du hash. Un échec après remplacement peut laisser un état écrit
sans réponse de succès ; l'accès reste fermé et un retry peut être nécessaire.
Les sessions expirées/anciennes générations sont purgées lors du login.

Limitation globale : 10 tentatives (succès compris) par fenêtre glissante de
5 minutes, commune aux workers et conservée au redémarrage. Aucun identifiant
personnel. Ce compromis très simple peut empêcher temporairement tout le groupe
de se connecter si un tiers épuise le quota. Un succès ne remet pas le quota à
zéro. Maximum de 1000 sessions conservées ; pas de durée glissante.

## API

- POST `/auth/login`, JSON `code` : succès 200 avec `token`, `token_type`,
  `role`, `expires_at`. Le Bearer brut est transmis uniquement dans cette réponse
  HTTPS (HTTP loopback pour les tests locaux), jamais journalisé ni persisté.
  Code erroné/malformé 401 ; quota 429 avec
  Retry-After ; état/configuration indisponible 503.
- GET `/auth/session`, Authorization Bearer : rôle et échéance absolue UTC Unix.
- POST `/auth/logout`, Authorization Bearer : révoque ce jeton, 204. Un jeton
  déjà révoqué/expiré reçoit 401. Aucun effet sur le pointage du navigateur.
- POST `/update-planning` : vérification avant décodage et traitement XLSX.
- GET `/health` : public, liveness uniquement ; ne certifie pas l'état auth.

Les jetons responsables expirent après 4 heures absolues. Génération vérifiée
à chaque appel ; pas de route de rotation/invalidation Admin dans cet incrément.
Pas de cookie, ni polling, ni logique de retour au premier plan. HTTPS obligatoire
en production. CORS conserve les trois origines existantes et autorise
Authorization/Content-Type ; preflight public, erreurs accessibles à l'origine
autorisée, Retry-After exposé. Réponses auth/export avec Cache-Control: no-store.
Ne pas activer des logs proxy/APM capturant corps ou Authorization.

## Vérification PythonAnywhere avant déploiement

Le test local du verrou entre deux processus et du remplacement atomique a
réussi sur WSL (workspace et /tmp). **Cela ne valide pas PythonAnywhere/NFS.**
Sur PythonAnywhere, employer un répertoire de test privé sur le même stockage
persistant que l'état futur, sans toucher au vrai fichier d'authentification.
Lancer les tests depuis le dépôt avec ce répertoire comme TMPDIR :

```sh
PYTHONDONTWRITEBYTECODE=1 python -B -m unittest discover -s tests -p 'test_auth.py' -v
```

Vérifier notamment les tests multi-processus, le timeout/libération après mort,
les écritures atomiques et les permissions. Tous les workers doivent partager
les mêmes garanties de verrouillage ; vérifier leur topologie effective auprès
de l'hébergeur si nécessaire. Un test sur une seule machine ne prouve pas une
exclusion entre plusieurs hôtes. Si le test échoue, ne pas activer cette auth et
ne pas remplacer implicitement le stockage par SQLite.

Tests synthétiques export : `python -B -m unittest discover -s tests -p 'test_*.py'`.
Ils utilisent une vraie connexion de test et un état temporaire isolé, sans
contournement de la protection en production. Les tests UI restent au PILOTE.

## Contrôles frontend intégrés

`node --test tests/*.test.cjs` couvre le verrouillage initial, la revalidation F5,
les refus sans fallback, le nouveau créneau soumis au serveur et la conservation
métier après logout/expiration. Le harness utilise des fixtures authentifiées
explicites pour les tests métier historiques ; les tests auth démarrent verrouillés.

`tests/browser-auth-check.cjs` est un contrôle optionnel avec Chromium/Playwright
et le vrai backend Flask : il démarre temporairement les ports 8000/5000 uniquement
s'ils sont libres, utilise un état privé temporaire et un classeur synthétique,
puis ferme ses serveurs et supprime cet état. Il ne touche pas au profil navigateur
du PILOTE. Pour l'exécuter avec une installation Playwright extérieure au projet :

```bash
BAD_POINTAGE_PLAYWRIGHT_MODULE=/chemin/vers/node_modules/playwright node tests/browser-auth-check.cjs
```

Si les navigateurs Playwright sont installés hors du chemin standard, définir
également `PLAYWRIGHT_BROWSERS_PATH`. Ce contrôle fournit le bundle SheetJS local
et un substitut CSS minimal au CDN Tailwind pour être déterministe : il valide
le parcours fonctionnel et le verrouillage du DOM, **pas l'apparence graphique**.
La validation manuelle Edge/Safari iPhone et du vrai Excel reste au PILOTE.
