# Pipeline Carrousel — Guide de déploiement

Ce guide t'explique comment activer la génération + publication (avec ton
approbation) de carrousels Instagram/Facebook, en réutilisant exactement la
même mécanique que ton pipeline vidéo (mêmes comptes, mêmes créneaux de
pointe, même Sheet "Queue", même email d'approbation).

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
  4. POST vers PipelineApproval.gs (même Apps Script que la vidéo)
        |
        v
PipelineApproval.gs (Apps Script, déjà en place)
  5. Email d'approbation groupé (miniatures des slides + caption + hashtags)
  6. Ton clic "Approuver" (ou 6h sans réponse) marque le lot approuvé —
     ne publie PAS tout de suite
  7. Au prochain créneau de pointe du compte, publication automatique sur
     Facebook + Instagram (carrousel natif)
```

## Étape 1 — Mettre à jour ton script Apps Script existant

1. Ouvre le projet Apps Script qui contient déjà ton flux d'approbation
   vidéo (celui avec `queueBatchForApproval`, `publishToInstagram`, etc.).
2. Remplace tout le contenu de `Code.gs` (ou le fichier équivalent) par le
   contenu de **`PipelineApproval.gs`** fourni dans ce dossier. Il contient
   tout ton code existant, inchangé, plus le support carrousel.
3. Redéploie : **Déployer** → **Gérer les déploiements** → icône crayon →
   **Nouvelle version** → **Déployer**. L'URL reste la même.

### Si ta feuille Google Sheet "Queue" existe déjà

Ouvre-la et ajoute deux colonnes d'en-tête sur la ligne 1 (n'importe où,
l'ordre n'a pas d'importance) :

| Nouvelle colonne | Rôle |
|---|---|
| `media_type` | `video` ou `carousel` (les anciennes lignes vidéo peuvent rester vides — traité comme `video` par défaut) |
| `media_urls` | JSON des URLs d'images, seulement pour les lignes `carousel` |

Ou lance une fois la fonction `fixHeaderRow()` depuis l'éditeur Apps Script
(menu déroulant en haut → sélectionne `fixHeaderRow` → ▶ Exécuter) — elle
réécrit l'en-tête complet automatiquement.

### Test rapide

Dans l'éditeur Apps Script, exécute `testEmailCarouselKinePulse` — tu dois
recevoir un email d'approbation avec 3 images de test (picsum.photos) et
les boutons Approuver/Rejeter.

## Étape 2 — Installer Playwright sur ton serveur

Sur le même serveur (Oracle Cloud) qui fait déjà tourner `kinepulse_pipeline.py` :

```bash
pip install playwright requests --break-system-packages
playwright install chromium --with-deps
```

## Étape 3 — Configurer les variables d'environnement

Réutilise les variables déjà en place pour la vidéo (`ANTHROPIC_API_KEY`,
`APPSCRIPT_WEBAPP_URL`, `PIPELINE_SECRET`, alertes email) et ajoute :

```bash
export PUBLIC_MEDIA_BASE_URL="https://ton-domaine.com/media"   # ou la même valeur que PUBLIC_VIDEO_BASE_URL
export PUBLIC_MEDIA_DIR="/var/www/media"                        # dossier local servi par nginx
```

Si ton nginx sert déjà un dossier public générique (pas seulement les
vidéos), tu peux simplement pointer `PUBLIC_MEDIA_DIR` vers ce même dossier.

## Étape 4 — Copier le script et les templates

Copie `carousel_pipeline.py` et le dossier `templates/` sur ton serveur,
au même niveau que `kinepulse_pipeline.py`.

## Étape 5 — Tester avant de publier pour de vrai

```bash
python carousel_pipeline.py test kinepulse "5 signes qu'il faut consulter en kinésithérapie"
```

Ça génère les images localement dans `./carousel_output/` **sans** les
publier ni les mettre en file d'attente — regarde-les avant de continuer.

## Étape 6 — Générer et mettre en file d'attente pour de vrai

```bash
python carousel_pipeline.py kinepulse "Les bienfaits du massage thérapeutique"
python carousel_pipeline.py kinesportif "<thème>"
```

Tu reçois l'email d'approbation habituel. Rien n'est publié avant ton clic
(ou 6h d'attente automatique), et même après approbation, la publication
n'a lieu qu'au prochain créneau de pointe du compte.

## Étape 7 (optionnel) — Automatiser avec un dossier de thèmes + cron

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
  seulement, comme demandé). TikTok supporte les posts photo via une API
  séparée — possible à ajouter plus tard si besoin.
- **Format des slides** : 1080×1350 (ratio 4:5, recommandé par Instagram
  pour maximiser l'espace dans le fil). Toutes les slides d'un même
  carrousel gardent le même ratio.
- **4 à 6 slides de contenu** générées par Claude, plus une couverture et
  une fermeture (donc 6 à 8 images au total) — ajustable dans le prompt de
  `generate_carousel_content()` si tu veux plus ou moins.
