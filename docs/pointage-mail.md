# Envoi volontaire du retour de pointage

Incrément local du 29/09/2026, recette PILOTE encore nécessaire. Aucun mail réel
n'a été envoyé pendant le développement. Aucun déploiement effectué.

Dans Créneau, saisir facultativement la note (2 000 caractères maximum), puis
« Envoyer le pointage par mail ». Une confirmation indique explicitement le mode
test ou production. Le téléchargement reste indépendant, y compris son fallback
local. L'envoi utilise la génération backend existante, avec la source figée et
les présences courantes ; aucune lecture ni écriture Drive pendant cet envoi.
Le corps contient le créneau, la date, l'heure UTC de tentative, la modification
Drive disponible, le hash source, les compteurs, la note et le nom du fichier.

La source IndexedDB et l'état local sont sauvegardés avant la requête d'envoi.
Un stockage indisponible empêche l'envoi. La note et le résultat survivent à F5,
au réimport compatible et à la déconnexion ; Reset/nouveau pointage les effacent.
La note ne modifie jamais les participants.

Les routes `GET /mail-status` et `POST /send-pointage` exigent l'auth responsable.
La première n'expose que disponibilité et mode. Le backend ignore tout destinataire
fourni par le client. Une divergence de mode entre confirmation et serveur refuse
l'envoi. Le fichier XLSX est généré et attaché en mémoire, sans copie serveur durable.

## Configuration PythonAnywhere

Charger ces variables dans l'environnement de l'application WSGI **avant son
import**, hors dépôt et hors répertoire public, puis recharger l'application :

| Variable | Valeur / usage |
| --- | --- |
| `BAD_POINTAGE_MAIL_MODE` | `test` par défaut ; `production` uniquement après validation PILOTE |
| `BAD_POINTAGE_MAIL_TEST_TO` | Adresse dédiée aux tests, obligatoire en mode test |
| `BAD_POINTAGE_MAIL_PRODUCTION_TO` | Destinataire réel, uniquement côté backend |
| `BAD_POINTAGE_MAIL_FROM` | Adresse expéditrice autorisée par le serveur SMTP |
| `BAD_POINTAGE_MAIL_HOST` | Serveur SMTP |
| `BAD_POINTAGE_MAIL_PORT` | `587` (STARTTLS, défaut) ou `465` (TLS implicite) |
| `BAD_POINTAGE_MAIL_USER` | Identifiant SMTP |
| `BAD_POINTAGE_MAIL_PASSWORD` | Secret SMTP / mot de passe d'application |

Aucune nouvelle dépendance Python. Déployer `pointage_mail.py` avec `flask_app.py`
et les assets frontend versionnés `2026.09.29.4`. La configuration auth existante
`BAD_POINTAGE_AUTH_FILE` reste requise. Son répertoire privé (mode 0700) doit être
accessible en écriture aux workers : une base `<auth-file>.mail.sqlite3` adjacente
est créée pour les reçus anti-doublon (UUID, empreinte de requête, état uniquement).
Ne pas publier ni supprimer cette base pendant l'exploitation : sa suppression
perd la protection contre le rejeu d'anciennes requêtes. Aucun classeur, note,
identité, adresse ou secret n'y est enregistré. Ce n'est pas une file de mails.

SMTP Gmail constitue une option sans abonnement supplémentaire pour un faible
volume, à valider sur le compte d'hébergement :
[PythonAnywhere documente l'exception Gmail pour les comptes gratuits](https://helpdev.pythonanywhere.com/pages/SMTPForFreeUsers).
[Google indique une limite de 500 mails/jour pour Gmail personnel](https://support.google.com/mail/answer/22839).
Utiliser un compte approprié avec un mot de passe d'application lorsque disponible,
sans inscrire ses valeurs dans Git. Le choix effectif du compte/fournisseur et
l'adéquation du quota au volume du club restent à valider par le PILOTE.
Aucun fournisseur payant n'est imposé.

En test, seule `TEST_TO` est utilisée ; aucun repli sur `PRODUCTION_TO`. Si les
deux adresses configurées sont identiques (hors casse), le mode test est refusé.
Le PILOTE doit choisir une véritable boîte dédiée, distincte des alias du destinataire
réel : le serveur ne peut pas détecter les redirections de boîte mail.

## Résultat et limites

- `sent` : accepté par le serveur SMTP, sans garantie de livraison en boîte.
- `not_sent` : envoi non effectué, nouvel essai volontaire possible.
- `uncertain` : réponse perdue, timeout pendant SMTP ou worker interrompu ; vérifier
  la réception avant de confirmer un nouvel envoi, qui pourrait créer un doublon.

Le double clic est bloqué. Le rejeu du même identifiant ne refait pas l'envoi,
y compris entre workers. Chaque nouvelle action utilisateur crée une nouvelle
tentative ; après succès ou incertitude, un avertissement précède le renvoi.
Un identifiant SMTP ne garantit pas à lui seul une livraison exactement une fois.
La session reste ouverte, sans Reset automatique. L'état affiché décrit la dernière
tentative ; des modifications ultérieures du pointage demandent un nouvel envoi.
Timeout navigateur : 60 s ; timeout socket SMTP : 20 s par opération.
Taille maximale de requête mail : 16 Mio (base64 compris).
Les erreurs techniques n'incluent ni contenu libre ni exceptions SMTP détaillées.

## Recette PILOTE

1. Configurer uniquement une destination de test ; vérifier la mention de mode test.
2. Envoyer un pointage connu, avec ESSAI et note ; vérifier réception, compteurs,
   bonne date/colonne, styles, limite de liste d'attente et absence de modification Drive.
3. Simuler un refus SMTP puis une coupure réseau ; vérifier résultat, F5,
   pointages/note conservés, téléchargement et nouvel essai volontaire.
4. Vérifier double clic, renvoi après succès/incertitude, Reset, nouveau pointage,
   déconnexion/reconnexion et réimport compatible sur Edge et Safari iPhone.
5. Valider compte SMTP gratuit, quotas et accès réseau PythonAnywhere ; basculer
   explicitement en production seulement après recette du mail de test.
