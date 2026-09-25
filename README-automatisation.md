# Automatisation KinéPulse — Guide de déploiement

Ce guide t'explique comment activer le système de réservation automatique
(Google Calendar + Notion + courriels), gratuitement, en ~10 minutes.

## Étape 1 — Connecter l'intégration Notion à tes bases

L'intégration `KinéPulse Site` doit avoir accès à **4 bases** :

1. **Rendez-Vous**
2. **Clients CRM**
3. **Services**
4. **Leads EMS** (nouvelle base, déjà créée)

Pour chacune : ouvre la base en plein écran dans Notion → `•••` en haut à
droite → **Connexions** → cherche et connecte `KinéPulse Site`.

## Étape 2 — Créer le projet Google Apps Script

1. Va sur **https://script.google.com**
2. **Nouveau projet**
3. Renomme-le `KinéPulse Backend`
4. Supprime le code par défaut dans `Code.gs` et colle le contenu du
   fichier `Code.gs` fourni avec ce site.

## Étape 3 — Ajouter tes clés secrètes (sécurisé, jamais visibles publiquement)

Dans l'éditeur Apps Script : **Paramètres du projet** (icône ⚙️ à
gauche) → descends à **Propriétés du script** → **Ajouter une
propriété du script**, ajoute :

| Propriété | Valeur |
|---|---|
| `NOTION_TOKEN` | ton token Notion (`ntn_...`) |
| `OWNER_EMAIL` | ton courriel, pour recevoir une notification à chaque demande |
| `CLINIC_ADDRESS` | l'adresse de la clinique (optionnel, apparaît dans les courriels de confirmation) |

## Étape 4 — Déployer comme application Web

1. En haut à droite : **Déployer** → **Nouveau déploiement**
2. Type : **Application Web**
3. Exécuter en tant que : **Moi**
4. Qui a accès : **Tout le monde**
5. **Déployer**
6. La première fois, Google va demander d'autoriser le script à accéder
   à ton Calendar et Gmail — accepte (c'est ton propre script, sur ton
   propre compte).
7. Copie l'**URL de l'application Web** (ça ressemble à
   `https://script.google.com/macros/s/AKfycb.../exec`)

## Étape 5 — Brancher le site sur ton script

Ouvre `assets/js/booking.js` et remplace la ligne :

```js
const BOOKING_API_URL = "REMPLACER_PAR_URL_DU_WEB_APP";
```

par ton URL copiée à l'étape 4, puis pousse le changement sur GitHub
(ou demande à Claude de le faire).

## Étape 6 — Activer les rappels et alertes automatiques quotidiens

Dans l'éditeur Apps Script (script.google.com), en haut à côté du bouton
**Exécuter**, choisis la fonction **`setupDailyTrigger`** dans le menu
déroulant, puis clique **▶ Exécuter**. Ça active, chaque jour à 9h00 :

- un rappel automatique par courriel aux clients qui ont un massage le lendemain
- un résumé pour toi des forfaits EMS qui arrivent à renouvellement dans les 5 prochains jours

À faire **une seule fois** — le déclencheur reste actif ensuite.

## Ce qui se passe automatiquement une fois branché

**Réservation massage** → le client choisit un créneau réellement
libre (calculé depuis ton Google Calendar) → l'événement est créé
directement dans ton Calendar + une fiche dans Notion "Rendez-Vous"
(liée au bon client et au bon service) + une fiche "Facture" liée est
créée automatiquement (statut "En attente" — il ne te reste qu'à
cliquer "Payée" quand le client te paie) → le client reçoit une
confirmation immédiate par courriel → tu reçois une notification.

**La veille du rendez-vous** → le client reçoit un rappel automatique.

**Demande EMS** → aucun rendez-vous n'est créé → une fiche est ajoutée
dans Notion "Leads EMS" avec le statut "À contacter" → le client reçoit
un courriel "nous vous contacterons" → tu reçois une notification pour
savoir qu'il faut le rappeler.

**Forfait EMS qui approche du renouvellement** → tu reçois un résumé
par courriel 5 jours avant, automatiquement.

## Étape 7 — Campagne de réactivation (base de patients dormante)

Ce système envoie un courriel de relance à d'anciens patients, avec des
garde-fous pour ne **jamais** envoyer aux vrais patients par accident.

### 7.1 — Préparer la liste

1. Importe ton fichier Excel/CSV dans **Google Sheets** (Fichier → Importer).
2. Renomme l'onglet exactement **`Patients`**.
3. Assure-toi que les colonnes sont dans cet ordre :
   `A: Nom | B: Courriel | C: Téléphone | D: Statut | E: Date envoi`
   (laisse D et E vides — le script les remplit automatiquement).
4. Copie l'**ID du Google Sheet** depuis l'URL :
   `https://docs.google.com/spreadsheets/d/CET_ID_ICI/edit`

### 7.2 — Ajouter le fichier au projet Apps Script

Dans l'éditeur Apps Script (script.google.com, même projet `KinéPulse
Backend`) : **+** à côté de "Fichiers" → **Script** → colle le contenu de
`google-apps-script/ReactivationCampaign.gs`.

### 7.3 — Configurer les propriétés du script

**Paramètres du projet** → **Propriétés du script** → ajoute :

| Propriété | Valeur |
|---|---|
| `REACTIVATION_SHEET_ID` | l'ID copié à l'étape 7.1 |
| `REACTIVATION_TEST_EMAILS` | tes courriels de test, séparés par des virgules |

**Ne mets PAS encore `REACTIVATION_CONFIRM_SEND`** — tant que cette
propriété n'existe pas (ou n'est pas exactement `OUI_ENVOYER`), l'envoi réel
est bloqué par le script, même si tu exécutes la fonction par erreur.

### 7.4 — Valider le message AVANT tout envoi

Dans l'ordre :

1. Exécute **`previewReactivationEmail`** → regarde le résultat dans
   **Exécutions** / **Journaux** (`Ctrl+Entrée` ou menu Affichage → Journaux).
   Ça n'envoie rien, ça montre juste le sujet et le corps du courriel.
2. Édite le texte dans `buildReactivationEmail_()` (dans
   `ReactivationCampaign.gs`) — en particulier la ligne `[OFFRE DE LANCEMENT
   À CONFIRMER]`, à remplacer par ta vraie offre.
3. Exécute **`sendReactivationTest`** → envoie le courriel réel, mais
   seulement à tes adresses de test. Vérifie le rendu dans ta boîte de
   réception (mobile ET ordinateur).
4. Répète 2-3 jusqu'à ce que le message te convienne.

### 7.5 — Lancer l'envoi réel (seulement quand tu es prêt)

1. Ajoute la propriété de script `REACTIVATION_CONFIRM_SEND` avec la valeur
   exacte `OUI_ENVOYER`.
2. Exécute **`sendReactivationCampaign`** manuellement pour le premier lot
   (max ~450 courriels/jour pour rester sous la limite Gmail).
3. Optionnel : exécute **`setupReactivationTrigger`** une fois pour que le
   script envoie automatiquement un lot chaque jour à 9h jusqu'à ce que la
   liste soit épuisée (statut "Envoyé" sur toutes les lignes).
4. Exécute **`processReactivationUnsubscribes`** de temps en temps (ou
   ajoute-la aussi à un déclencheur quotidien) pour marquer automatiquement
   "Désabonné" les patients qui répondent "ARRÊT".

### Pour arrêter la campagne

Supprime la propriété `REACTIVATION_CONFIRM_SEND` (ou change sa valeur) —
`sendReactivationCampaign` refusera de s'exécuter tant qu'elle n'est pas
remise à `OUI_ENVOYER`. Supprime aussi le déclencheur dans **Déclencheurs**
(icône horloge à gauche) si tu en as créé un.

## Si tu dois modifier l'horaire des créneaux plus tard

Dans `Code.gs`, modifie la section `MASSAGE_SLOTS` en haut du fichier,
puis redéploie (**Déployer** → **Gérer les déploiements** → icône
crayon → **Nouvelle version** → **Déployer**). L'URL reste la même,
pas besoin de la remettre à jour sur le site.
