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

## Comment ça marche

```
carousel_pipeline.py (ton serveur)
  1. Claude API écrit le contenu (titre, points, caption, hashtags)
  2. Playwright rend chaque slide en PNG (template HTML/CSS aux couleurs
     du site : Fraunces/Inter, teal + laiton)
  3. Les PNG sont copiés dans le dossier public (nginx)
  4. POST vers CarouselApproval.gs (projet Apps Script DÉDIÉ, séparé de
     celui de la vidéo)
        |
        v
CarouselApproval.gs (nouveau projet Apps Script, sa propre Sheet)
  5. Email d'approbation groupé (miniatures des slides + caption + hashtags)
  6. Ton clic "Approuver" (ou 6h sans réponse) marque le lot approuvé —
     ne publie PAS tout de suite
  7. Au prochain créneau de pointe du compte, publication automatique sur
     Facebook + Instagram (carrousel natif)
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

Ce sont les **mêmes valeurs** que celles déjà utilisées dans ton projet
Apps Script vidéo (les tokens Meta ne changent pas selon le type de
contenu) — copie-les simplement d'un projet à l'autre.

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
- la publication au créneau de pointe (toutes les heures)

### Test rapide

Exécute `testEmailCarouselKinePulse` — tu dois recevoir un email
d'approbation avec 3 images de test et les boutons Approuver/Rejeter.

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

```bash
python carousel_pipeline.py kinepulse "Les bienfaits du massage thérapeutique"
python carousel_pipeline.py kinesportif "<thème>"
```

Tu reçois l'email d'approbation habituel. Rien n'est publié avant ton clic
(ou 6h d'attente automatique), et même après approbation, la publication
n'a lieu qu'au prochain créneau de pointe du compte.

## Étape 11 (optionnel) — Automatiser avec un dossier de thèmes + cron

Comme pour la vidéo, dépose un fichier `.txt` (un thème par ligne) dans :

- `./themes_a_traiter_kinepulse/`
- `./themes_a_traiter_kinesportif/`

Puis cron (exemple : tous les jours à 7h) :

```bash
0 7 * * * cd /chemin/vers/le/script && python3 carousel_pipeline.py daily kinepulse
5 7 * * * cd /chemin/vers/le/script && python3 carousel_pipeline.py daily kinesportif
```

Chaque run traite le thème le plus ancien en attente, génère le carrousel,
et le déplace vers `themes_traitees/` une fois fait.

## Limites actuelles

- **TikTok n'est pas inclus** pour le carrousel (Instagram + Facebook
  seulement, comme demandé).
- **Format des slides** : 1080×1350 (ratio 4:5, recommandé par Instagram
  pour maximiser l'espace dans le fil).
- **4 à 6 slides de contenu** générées par Claude, plus une couverture et
  une fermeture (donc 6 à 8 images au total) — ajustable dans le prompt de
  `generate_carousel_content()` si tu veux plus ou moins.
