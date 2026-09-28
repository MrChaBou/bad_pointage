# Recette locale — accès responsable et fichier Excel manuel

État : parcours préparé pour une validation du PILOTE, pas une validation UI acquise.
Admin sécurisé, Drive et mail restent hors périmètre. Backend POSIX requis :
utiliser les terminaux **WSL/Linux** pour ces commandes, pas Python Windows natif.

## 1. Initialiser son code privé (une seule fois)

Depuis la racine du projet, dans un terminal WSL :

```bash
mkdir -p -m 700 "$HOME/.local/share/bad-pointage-private"
export BAD_POINTAGE_AUTH_FILE="$HOME/.local/share/bad-pointage-private/auth-state.json"
.venv/bin/python -B init_auth.py
```

Saisir deux fois le code choisi (12 à 256 caractères, suffisamment imprévisible).
La saisie est masquée. Ne pas écrire le code dans une commande, un fichier du
projet ou une capture. Le script refuse d'écraser un état existant.
Le dossier privé doit être en mode 0700, hors du projet et non servi sur le web.

## 2. Démarrer le backend

Dans le même terminal (ou réexporter la variable dans un nouveau terminal) :

```bash
.venv/bin/python -B -m flask --app flask_app:app run --host 127.0.0.1 --port 5000
```

Pas de mode debug. La variable doit être définie **avant** le lancement de Flask.
Dépendances : `requirements.txt` ; l'environnement local existant a été utilisé
pour les tests. Si nécessaire, installer ces dépendances dans le virtualenv.

## 3. Démarrer le frontend

Dans un second terminal WSL, depuis la racine du projet :

```bash
.venv/bin/python -B -m http.server 8000 --bind 127.0.0.1
```

Ouvrir **http://127.0.0.1:8000** dans Edge. Utiliser toujours cette même origine
pour retrouver les données locales ; localhost et 127.0.0.1 ont des stockages
différents. HTTP loopback est réservé au test local ; HTTPS en production.

## 4. Recette PILOTE avec le vrai Excel

1. Écran Code responsable seul ; mauvais code refusé, bon code accepté.
2. Onglet **Créneau** : charger le fichier, choisir créneau/date et démarrer.
3. Recherche, participants, pointage/annulation et export backend.
4. F5 : validation serveur avant affichage métier, pointage et source restaurés.
5. Se déconnecter : données masquées ; reconnecter avec le code et vérifier
   que le pointage est conservé. Aucun Reset automatique.
6. Avec un créneau ouvert, arrêter Flask (Ctrl+C). Continuer à pointer puis
   exporter : téléchargement local de secours. Un nouveau créneau est refusé,
   même après chargement manuel. Le créneau existant est conservé.
7. Pendant cette panne, F5 verrouille l'accès jusqu'au retour du backend.
   Redémarrer Flask puis se reconnecter (ou recharger pour revalider le jeton
   encore conservé) : retrouver le pointage.
8. Reset, après confirmation : source et pointage supprimés ; accès responsable
   conservé tant qu'il n'est pas expiré. Tester uniquement après avoir sauvegardé
   ce qui doit l'être.

Le retour au premier plan contrôle seulement l'expiration locale, sans requête
serveur imposée. Aucun polling. Une page quittée puis restaurée depuis le cache
historique du navigateur revalide son accès avant de réafficher le métier.
L'échéance responsable reste de 4 h absolues, y compris en panne réseau.
Une réponse 401 connue verrouille immédiatement, sans effacement métier.
Aucun secours XLSX sur 400/401/403/429. Aucun envoi mail dans cet incrément.

Les scénarios 401, expiration, réponses tardives, XSS et refus de nouveau créneau
sont aussi couverts automatiquement par des données synthétiques ; cela ne vaut
pas recette PILOTE. Safari iPhone réel et le verrou PythonAnywhere restent à
valider séparément. Ce lancement loopback ne rend pas le serveur accessible à
un iPhone sur le réseau local.
