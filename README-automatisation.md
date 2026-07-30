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

## Ce qui se passe automatiquement une fois branché

**Réservation massage** → le client choisit un créneau réellement
libre (calculé depuis ton Google Calendar) → l'événement est créé
directement dans ton Calendar + une fiche dans Notion "Rendez-Vous"
(liée au bon client et au bon service) → le client reçoit une
confirmation immédiate par courriel → tu reçois une notification.

**Demande EMS** → aucun rendez-vous n'est créé → une fiche est ajoutée
dans Notion "Leads EMS" avec le statut "À contacter" → le client reçoit
un courriel "nous vous contacterons" → tu reçois une notification pour
savoir qu'il faut le rappeler.

## Si tu dois modifier l'horaire des créneaux plus tard

Dans `Code.gs`, modifie la section `MASSAGE_SLOTS` en haut du fichier,
puis redéploie (**Déployer** → **Gérer les déploiements** → icône
crayon → **Nouvelle version** → **Déployer**). L'URL reste la même,
pas besoin de la remettre à jour sur le site.
