# Pipeline Carrousel — Guide de déploiement

Ce guide t'explique comment activer la génération + publication (avec ton
approbation) de carrousels Instagram/Facebook.

**Important : ce système est complètement SÉPARÉ de ton pipeline vidéo.**
Sa propre Google Sheet, son propre projet Apps Script, son propre email
d'approbation, sa propre variable d'environnement. Rien n'est partagé —
aucun risque de casser ou de mélanger les deux.

**Coût : 0$ fixe.** Seule l'API Claude coûte quelques centimes par carrousel
généré (texte court). Le rendu des slides utilise Playwright (Chromium
headless, gratuit) directement sur ton serveur.

**Un seul thème envoyé = les deux carrousels générés.** Tu n'envoies le
sujet qu'une fois (en français) — KinéPulse le reçoit tel quel, et
KinéSportif reçoit une version traduite/adaptée en arabe, générée par
Claude à partir du même thème. Deux emails d'approbation séparés arrivent
(un par compte), chacun publié à son propre créneau de pointe.

## Comment ça marche

```
carousel_pipeline.py (ton serveur)
  1. Claude API écrit le contenu — DEUX FOIS à partir du même thème :
     KinéPulse en français (tel quel), KinéSportif en arabe (traduit/adapté)
  2. Playwright rend chaque slide en PNG (template HTML/CSS aux couleurs
     du site : Fraunces/Inter, teal + laiton) — pour les deux comptes
  3. Les PNG sont copiés dans le dossier public (nginx)
  4. POST vers CarouselApproval.gs — une fois par compte (projet Apps
     Script DÉDIÉ, séparé de celui de la vidéo)
        |
        v
CarouselApproval.gs (nouveau projet Apps Script, sa propre Sheet)
  5. Un email d'approbation par compte (miniatures des slides + caption +
     hashtags) — donc 2 emails au total pour 1 thème envoyé
  6. Ton clic "Approuver" (ou 6h sans réponse) marque le lot approuvé —
     ne publie PAS tout de suite
  7. Au prochain créneau de pointe DE CE compte, publication automatique
     sur Facebook + Instagram (carrousel natif)
```

## Étape 1 — Créer une NOUVELLE Google Sheet (dédiée au carrousel)

1. Va sur [sheets.google.com](https://sheets.google.com), crée une feuille
   vide, nomme-la par exemple **"KinéPulse — Carrousels"**.
2. Copie son ID depuis l'URL — la partie entre `/d/` et `/edit` :
   `https://docs.google.com/spreadsheets/d/CET_ID_ICI/edit`

## Étape 2 — Créer un NOUVEAU projet Apps Script (dédié, séparé de la vidéo)

1. Va sur [script.google.com](https://script.google.com) → **Nouveau projet**
2. Renomme-le `KinéPulse Carrousel Backend`
3. Supprime le code par défaut, colle le contenu de **`CarouselApproval.gs`**
   fourni dans ce dossier
4. En haut du fichier, remplace :
   - `SHEET_ID` par l'ID copié à l'étape 1
   - `WEBAPP_URL` — laisse tel quel pour l'instant, tu le rempliras à
     l'étape 4 après le premier déploiement

## Étape 3 — Ajouter tes clés (Paramètres du projet → Propriétés du script)

| Propriété | Valeur |
|---|---|
| `APPROVAL_EMAIL` | ton courriel, pour recevoir les demandes d'approbation |
| `IG_BUSINESS_ACCOUNT_ID` | ID Instagram KinéPulse (même valeur que dans ton projet vidéo) |
| `IG_ACCESS_TOKEN` | token Instagram KinéPulse (`IGAA...`) |
| `FB_PAGE_ID` | ID Page Facebook KinéPulse |
| `FB_PAGE_TOKEN` | token Page Facebook KinéPulse |
| `IG_BUSINESS_ACCOUNT_ID_KINESPORTIF` | ID Instagram KinéSportif |
| `IG_ACCESS_TOKEN_KINESPORTIF` | token Instagram KinéSportif |
| `FB_PAGE_ID_KINESPORTIF` | ID Page Facebook KinéSportif |
| `FB_PAGE_TOKEN_KINESPORTIF` | token Page Facebook KinéSportif |
| `FB_APP_SECRET` | secret de ton App Meta (nécessaire pour le renouvellement automatique des tokens) |
| `FB_USER_TOKEN` | ton token utilisateur Facebook long-lived (idem) |

Ce sont les **mêmes valeurs** que celles déjà utilisées dans ton projet
Apps Script vidéo (les tokens Meta ne changent pas selon le type de
contenu) — copie-les simplement d'un projet à l'autre.

**Pourquoi copier `FB_APP_SECRET`/`FB_USER_TOKEN` aussi ?** Ce projet a son
propre stockage de propriétés, séparé de celui de la vidéo — sans ça, les
tokens copiés ici resteraient figés et finiraient par expirer, puisque le
renouvellement automatique du pipeline vidéo ne peut rafraîchir que ses
propres tokens à lui. `setupTriggers()` (étape 5) installe un renouvellement
hebdomadaire dédié au carrousel, complètement indépendant.

## Étape 4 — Déployer comme application Web

1. **Déployer** → **Nouveau déploiement** → Type : **Application Web**
2. Exécuter en tant que : **Moi** — Qui a accès : **Tout le monde**
3. **Déployer**, autorise l'accès à Gmail/Sheets si demandé
4. Copie l'**URL de l'application Web** (`https://script.google.com/macros/s/.../exec`)
5. Colle cette URL dans la constante `WEBAPP_URL` en haut du code
6. Redéploie une deuxième fois (**Nouvelle version**) pour que le code à
   jour (avec la bonne URL) soit actif

## Étape 5 — Activer les déclencheurs automatiques

Dans l'éditeur Apps Script, sélectionne **`setupTriggers`** dans le menu
déroulant en haut, clique **▶ Exécuter**. À faire **une seule fois** — ça
active :
- la vérification des approbations en attente (toutes les 30 min)
- le renouvellement des tokens Meta (chaque semaine)
- la publication au créneau de pointe (toutes les heures)

### Test rapide

Exécute `testEmailCarouselKinePulse` — tu dois recevoir un email
d'approbation avec 3 images de test et les boutons Approuver/Rejeter.

Exécute aussi `testRenewal` une fois pour vérifier que le renouvellement
des tokens fonctionne — regarde les logs (menu **Exécutions** ou
**Affichage → Journaux**) : tu dois voir les 4 tokens renouvelés, sans
erreur.

## Étape 6 — Installer Playwright sur ton serveur

Sur le même serveur (Oracle Cloud) qui fait déjà tourner `kinepulse_pipeline.py` :

```bash
pip install playwright requests --break-system-packages
playwright install chromium --with-deps
```

## Étape 7 — Configurer les variables d'environnement

```bash
export ANTHROPIC_API_KEY="..."                                  # même clé que la vidéo
export CAROUSEL_APPSCRIPT_WEBAPP_URL="https://script.google.com/macros/s/.../exec"  # URL de l'étape 4 — PAS celle de la vidéo
export PUBLIC_MEDIA_BASE_URL="https://ton-domaine.com/media"    # ou la même valeur que PUBLIC_VIDEO_BASE_URL
export PUBLIC_MEDIA_DIR="/var/www/media"                         # dossier local servi par nginx
```

## Étape 8 — Copier le script et les templates

Copie `carousel_pipeline.py` et le dossier `templates/` sur ton serveur.

## Étape 9 — Tester avant de publier pour de vrai

```bash
python carousel_pipeline.py test kinepulse "5 signes qu'il faut consulter en kinésithérapie"
```

Ça génère les images localement dans `./carousel_output/` **sans** les
publier ni les mettre en file d'attente — regarde-les avant de continuer.

## Étape 10 — Générer et mettre en file d'attente pour de vrai

Un seul thème (en français) génère automatiquement les deux carrousels :

```bash
python carousel_pipeline.py both "Les bienfaits du massage thérapeutique"
```

Tu reçois **deux** emails d'approbation (un pour KinéPulse en français, un
pour KinéSportif en arabe traduit/adapté par Claude à partir du même
thème). Rien n'est publié avant ton clic sur chacun (ou 6h d'attente
automatique), et même après approbation, la publication n'a lieu qu'au
prochain créneau de pointe de chaque compte.

Pour générer un seul des deux (ajustement manuel/ciblé) :
```bash
python carousel_pipeline.py kinepulse "<thème>"
python carousel_pipeline.py kinesportif "<thème>"
```

## Étape 11 (optionnel) — Automatiser avec un dossier de thèmes + cron

Comme pour la vidéo, dépose un fichier `.txt` (un thème par ligne) dans :

- `./themes_a_traiter/`

Puis cron (exemple : tous les jours à 7h) :

```bash
0 7 * * * cd /chemin/vers/le/script && python3 carousel_pipeline.py daily
```

Chaque run traite le thème le plus ancien en attente, génère les **deux**
carrousels à partir de lui, et déplace le fichier vers `themes_traitees/`
une fois fait.

## Étape 12 (optionnel) — Ajouter les thèmes depuis ton téléphone (Telegram)

Comme pour la vidéo, mais avec **un bot Telegram séparé** (pas celui de la
vidéo) — deux processus qui écoutent le même bot se marchent dessus, donc
un deuxième bot (gratuit) évite le problème plutôt que de le contourner.

1. Ouvre Telegram, cherche **@BotFather**, envoie `/newbot`, suis les
   instructions (nom + identifiant du bot) — tu reçois un token
2. Envoie n'importe quel message à ton nouveau bot pour l'activer
3. Trouve ton `chat_id` : va sur
   `https://api.telegram.org/bot<TON_TOKEN>/getUpdates` dans un navigateur
   juste après avoir envoyé ton message — le `chat_id` apparaît dans la
   réponse JSON
4. Ajoute à tes variables d'environnement :
   ```bash
   export CAROUSEL_TELEGRAM_BOT_TOKEN="123456:ABC-..."
   export CAROUSEL_TELEGRAM_CHAT_ID="123456789"
   ```
5. Cron (toutes les 20 minutes par exemple) :
   ```bash
   */20 * * * * cd /chemin/vers/le/script && python3 carousel_pipeline.py check-telegram
   ```

**Format des messages** que tu envoies au bot :
- `Les bienfaits du massage thérapeutique` → un seul thème ajouté à la file
- Un message avec **plusieurs lignes** → plusieurs thèmes ajoutés d'un coup :
  ```
  Les bienfaits du massage thérapeutique
  Pourquoi consulter en kinésithérapie
  Comment fonctionne l'EMS
  ```
- Une liste numérotée avec des en-têtes de catégorie fonctionne aussi — la
  numérotation est retirée et les en-têtes (ex: `Massage détente (16)`)
  sont ignorés automatiquement
- `status` → répond combien de thèmes sont en attente

Le(s) thème(s) partent dans le même dossier que le mode manuel
(`themes_a_traiter/`) — le cron de l'étape 11 (`daily`) les traite un par
jour, dans l'ordre où ils ont été ajoutés.

⚠️ **Limite Telegram : ~4096 caractères par message.** Pour une longue
liste (calendrier de contenu de dizaines de thèmes), le message serait
tronqué ou refusé — utilise plutôt l'import en masse ci-dessous.

## Étape 13 (optionnel) — Importer une longue liste de thèmes en masse

Pas de limite de longueur ici, contrairement à Telegram — utile pour un
calendrier de contenu préparé à l'avance (ex: 100 thèmes organisés par
catégorie). Même logique de nettoyage que le bot (numérotation retirée,
en-têtes de catégorie ignorés).

Sur ton serveur :

```bash
cd ~/carousel-pipeline
cat > /tmp/mes_themes.txt <<'EOF'
Massage détente (16)

1. Pourquoi le corps a besoin de relâcher, pas juste de se reposer
2. Le lien entre stress chronique et tension dans les épaules
...colle ici toute ta liste...
EOF

python3 carousel_pipeline.py import-themes < /tmp/mes_themes.txt
```

Ça affiche le nombre de thèmes importés (ex: `100 thème(s) importé(s)`).
Le cron `daily` de l'étape 11 les traitera ensuite un par jour, dans
l'ordre — pour 100 thèmes à raison d'un par jour, compte environ 3 mois
pour tous les publier.

## Limites actuelles

- **TikTok n'est pas inclus** pour le carrousel (Instagram + Facebook
  seulement, comme demandé).
- **Format des slides** : 1080×1350 (ratio 4:5, recommandé par Instagram
  pour maximiser l'espace dans le fil).
- **4 images au total** : couverture (accroche/question), 2 slides de
  contenu (titre percutant + description courte), fermeture — format
  volontairement condensé, façon publicité plutôt qu'article informatif.
  Ajustable dans le prompt de `generate_carousel_content()` si tu veux
  plus de slides.
