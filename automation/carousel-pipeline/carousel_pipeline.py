#!/usr/bin/env python3
"""
KinéPulse / KinéSportif — Carousel Pipeline (Instagram + Facebook)
====================================================================

Génère un carrousel d'images informatives à partir d'UN SEUL thème, envoyé
UNE FOIS — il produit automatiquement les DEUX versions :
  - KinéPulse : en français, tel quel
  - KinéSportif : en arabe (Claude traduit/adapte le même thème — pas de
    traduction littérale mot à mot)

Étapes internes :
  1. Claude API écrit le contenu des slides (titre, points, caption, hashtags)
     — une fois par compte, dans sa langue
  2. Chaque slide est rendue en PNG (Playwright + template HTML/CSS de marque
     — mêmes couleurs/polices que kinepulse.ca)
  3. Les PNG sont copiées dans le dossier que ton serveur sert publiquement
  4. Chaque carrousel (un par compte) est mis en file d'attente pour
     approbation via un projet Apps Script DÉDIÉ (voir CarouselApproval.gs
     dans ce dossier — complètement séparé du pipeline vidéo) — un clic
     "Approuver" publie au prochain créneau de pointe DE CE compte. Rien
     n'est publié automatiquement sans ton accord.

Usage:
  Test (génère et sauvegarde localement, ne met PAS en file d'attente,
  un seul compte à la fois) :
    python carousel_pipeline.py test kinepulse "5 signes qu'il faut consulter en kinésithérapie"

  Génère les DEUX carrousels depuis un seul thème (usage normal) :
    python carousel_pipeline.py both "Les bienfaits du massage thérapeutique"

  Génère UN SEUL des deux carrousels (ajustement manuel/ciblé) :
    python carousel_pipeline.py kinepulse "<thème>"
    python carousel_pipeline.py kinesportif "<thème>"

  Mode dossier (comme la vidéo) — traite le thème le plus ancien en attente,
  génère les DEUX carrousels à partir de lui :
    python carousel_pipeline.py daily
    (dépose un fichier .txt contenant un thème, une ligne, dans
    ./themes_a_traiter/)

  Depuis ton téléphone (bot Telegram DÉDIÉ, séparé de celui de la vidéo) :
    python carousel_pipeline.py check-telegram
    (cron toutes les 15-30 min — chaque message envoyé au bot ajoute un
    thème à la file ; "status" répond le nombre de thèmes en attente)

Requirements (en plus de celles déjà utilisées pour la vidéo) :
  pip install playwright requests --break-system-packages
  playwright install chromium --with-deps

Variables d'environnement :
  ANTHROPIC_API_KEY      -> réutilise la même clé que le pipeline vidéo
  CAROUSEL_APPSCRIPT_WEBAPP_URL -> URL /exec du projet Apps Script DÉDIÉ au
                             carrousel (CarouselApproval.gs) — PAS la même
                             URL que le pipeline vidéo
  PUBLIC_MEDIA_BASE_URL   -> URL HTTPS publique du dossier servi par nginx
                             (peut être la même valeur que PUBLIC_VIDEO_BASE_URL
                             si ton nginx sert déjà un dossier public générique)
  PUBLIC_MEDIA_DIR        -> chemin ABSOLU de ce dossier sur le serveur (là où
                             les PNG sont copiés pour devenir accessibles)
  ALERT_EMAIL_FROM / ALERT_EMAIL_APP_PASSWORD / ALERT_EMAIL_TO (optionnel,
                             réutilise les mêmes valeurs que la vidéo)
  CAROUSEL_TELEGRAM_BOT_TOKEN / CAROUSEL_TELEGRAM_CHAT_ID (optionnel — un
                             DEUXIÈME bot Telegram, distinct de celui de la
                             vidéo, pour ajouter des thèmes depuis ton
                             téléphone sans SSH)
"""
from __future__ import annotations

import html
import json
import os
import re
import shutil
import smtplib
import sys
import time
import traceback
from datetime import datetime
from email.message import EmailMessage
from pathlib import Path

import requests

# ──────────────────────────────────────────────────────────────────────────
# CONFIG
# ──────────────────────────────────────────────────────────────────────────

WORKDIR = Path("./carousel_output")
WORKDIR.mkdir(exist_ok=True)

TEMPLATE_PATH = Path(__file__).parent / "templates" / "slide.html"
SLIDE_TEMPLATE = TEMPLATE_PATH.read_text(encoding="utf-8")

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL = "claude-sonnet-4-6"

# NOTE : projet Apps Script SÉPARÉ du pipeline vidéo (CarouselApproval.gs,
# sa propre Google Sheet, son propre déploiement) — volontairement une
# variable d'environnement différente de celle du pipeline vidéo
# (APPSCRIPT_WEBAPP_URL) pour ne jamais mélanger les deux systèmes.
CAROUSEL_APPSCRIPT_WEBAPP_URL = os.environ.get("CAROUSEL_APPSCRIPT_WEBAPP_URL", "")

PUBLIC_MEDIA_BASE_URL = os.environ.get("PUBLIC_MEDIA_BASE_URL", os.environ.get("PUBLIC_VIDEO_BASE_URL", ""))
PUBLIC_MEDIA_DIR = os.environ.get("PUBLIC_MEDIA_DIR", "")

ALERT_EMAIL_FROM = os.environ.get("ALERT_EMAIL_FROM", "")
ALERT_EMAIL_APP_PASSWORD = os.environ.get("ALERT_EMAIL_APP_PASSWORD", "")
ALERT_EMAIL_TO = os.environ.get("ALERT_EMAIL_TO", ALERT_EMAIL_FROM)

# Bot Telegram DÉDIÉ au carrousel — volontairement un bot séparé de celui de
# la vidéo (CAROUSEL_TELEGRAM_BOT_TOKEN, pas TELEGRAM_BOT_TOKEN). Deux
# process qui interrogent (getUpdates) le MÊME bot se marchent dessus : côté
# Telegram, un offset envoyé par l'un des deux fait "oublier" les messages
# pour l'autre aussi — donc un deuxième bot, gratuit, évite ce problème
# plutôt que de le contourner.
CAROUSEL_TELEGRAM_BOT_TOKEN = os.environ.get("CAROUSEL_TELEGRAM_BOT_TOKEN", "")
CAROUSEL_TELEGRAM_CHAT_ID = os.environ.get("CAROUSEL_TELEGRAM_CHAT_ID", "")
TELEGRAM_STATE_FILE = WORKDIR / "telegram_last_update_id.txt"

SLIDE_WIDTH = 1080
SLIDE_HEIGHT = 1350

ACCOUNT_LABELS = {"kinepulse": "KinéPulse", "kinesportif": "KinéSportif"}

# Slide de fermeture — texte fixe (pas généré par l'IA), cohérent avec l'appel
# à l'action déjà utilisé dans les captions vidéo (KINEPULSE_CTA).
CLOSING_SLIDE = {
    "kinepulse": {
        "heading": "Prenez rendez-vous",
        "body": "Clinique KinéPulse — Pointe-aux-Trembles, Montréal",
        "cta": "kinepulse.ca",
    },
    "kinesportif": {
        "heading": "تابعونا لمزيد من المحتوى",
        "body": "KinéSportif",
        "cta": "",
    },
}

# UN SEUL dossier de thèmes en attente — chaque thème génère AUTOMATIQUEMENT
# les deux carrousels (KinéPulse en français tel quel, KinéSportif en arabe
# traduit/adapté par Claude). Pas besoin d'envoyer le sujet deux fois.
THEMES_FOLDER = Path("./themes_a_traiter")
THEMES_PROCESSED = Path("./themes_traitees")
THEMES_FOLDER.mkdir(exist_ok=True)
THEMES_PROCESSED.mkdir(exist_ok=True)


# ──────────────────────────────────────────────────────────────────────────
# STEP 1 — Génération du contenu (Claude API)
# ──────────────────────────────────────────────────────────────────────────

def generate_carousel_content(topic: str, account: str) -> dict:
    """Retourne {"slides": [{"heading","body"}, ...], "caption", "hashtags"}.
    "slides" ne contient QUE les slides de contenu — la couverture est
    construite depuis le premier élément, la fermeture est fixe (voir
    CLOSING_SLIDE)."""
    lang = "fr" if account == "kinepulse" else "ar"

    if lang == "fr":
        instruction = (
            "Tu es un expert en marketing de contenu pour réseaux sociaux. Tu "
            "écris le contenu d'un carrousel Instagram/Facebook COURT et "
            "percutant pour KinéPulse, une clinique de kinésithérapie/"
            "massothérapie/EMS à Montréal. Règle absolue : chaque texte doit "
            "être scannable en 2 secondes — AUCUN paragraphe, aucune phrase "
            "longue. On vise l'impact d'une accroche publicitaire, pas un texte "
            "informatif classique. Réponds UNIQUEMENT avec un objet JSON valide "
            "(rien d'autre, pas de ```), au format EXACT :\n"
            '{"cover_heading": "accroche de couverture, SOUS FORME DE QUESTION '
            'qui pique la curiosité et donne envie de swiper (ex: \'Ton dos '
            'te fait mal après 8h de bureau ?\'), 6-12 mots maximum", '
            '"slides": [{"heading": "titre percutant, 3-5 mots maximum, comme '
            'un titre de magazine", '
            '"body": "UNE seule phrase courte et concrète, 10-15 mots maximum '
            '— jamais un paragraphe, jamais deux phrases"}], '
            '"caption": "UNE seule phrase courte et accrocheuse avec un vrai '
            'crochet (hook) qui donne envie de réagir ou de lire la suite — '
            'JAMAIS un paragraphe de 2-3 phrases, style expert en copywriting '
            'marketing, pas de ton corporatif plat", '
            '"hashtags": "exactement 5 hashtags spécifiques et professionnels '
            'liés au sujet précis (évite les hashtags génériques trop larges '
            'comme #sante ou #bienetre), en français, séparés par des espaces, '
            'précédés de #"}\n'
            'Génère EXACTEMENT 2 éléments dans "slides" (le carrousel aura donc '
            "4 images au total : couverture + 2 points + fermeture). Contenu "
            "factuel mais ultra condensé — si une idée demande plus qu'une "
            "phrase pour être comprise, simplifie-la ou coupe-la. Ne donne "
            "JAMAIS de conseil médical personnalisé ni de diagnostic."
        )
    else:
        instruction = (
            "You are a social media content marketing expert. You write the "
            "content for a SHORT, punchy Instagram/Facebook carousel for "
            "KinéSportif, a sports/kinesiology academy account testing market "
            "interest in Lebanon. Absolute rule: every piece of text must be "
            "scannable in 2 seconds — NO paragraphs, no long sentences. Aim "
            "for the impact of an ad headline, not an informative article. The "
            "topic you're given may be written in French (it's the same topic "
            "used for the sister French account, KinéPulse) — translate and "
            "adapt it naturally into Modern Standard Arabic (fusha), don't "
            "translate literally word for word. ALL text content (cover_heading, "
            "every slide's heading and body, caption) MUST be written in "
            "Arabic script — only the hashtags are in English. Reply ONLY with "
            "a valid JSON object (nothing else, no ```), in this EXACT format:\n"
            '{"cover_heading": "cover hook, PHRASED AS A QUESTION that creates '
            'curiosity and makes people want to swipe, in Arabic, 6-12 words max", '
            '"slides": [{"heading": "punchy title in Arabic, 3-5 words max, '
            'like a magazine headline", '
            '"body": "ONE short concrete sentence in Arabic, 10-15 words max '
            '— never a paragraph, never two sentences"}], '
            '"caption": "ONE short, catchy sentence in Arabic with a real hook '
            'that makes people want to react or keep reading — NEVER a 2-3 '
            'sentence paragraph, expert marketing copywriter style, not flat '
            'corporate tone", '
            '"hashtags": "exactly 5 specific, professional hashtags relevant '
            'to this precise topic (avoid overly generic ones), in English, '
            'space-separated, prefixed with #"}\n'
            'Generate EXACTLY 2 items in "slides" (the carousel will therefore '
            "have 4 images total: cover + 2 points + closing). Factual but "
            "ultra condensed content — if an idea needs more than one sentence "
            "to land, simplify or cut it. NEVER give personalized medical "
            "advice or a diagnosis."
        )

    resp = requests.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": CLAUDE_MODEL,
            "max_tokens": 1500,
            "system": instruction,
            "messages": [{"role": "user", "content": f"Thème / Topic: {topic}"}],
        },
    )
    resp.raise_for_status()
    text = resp.json()["content"][0]["text"].strip()
    # Retire un éventuel bloc ```json ... ``` si le modèle en ajoute un malgré la consigne
    if text.startswith("```"):
        text = text.strip("`")
        text = text.split("\n", 1)[1] if "\n" in text else text
        if text.lower().startswith("json"):
            text = text[4:].lstrip()
    return json.loads(text)


# ──────────────────────────────────────────────────────────────────────────
# STEP 2 — Rendu des slides (Playwright -> PNG)
# ──────────────────────────────────────────────────────────────────────────

def _build_slide_html(kind: str, slide_num: int, total: int, account: str,
                       heading: str, body: str = "", cta_label: str = "") -> str:
    brand_label = ACCOUNT_LABELS[account]
    slide_class = {"cover": "cover-slide", "content": "content-slide", "cta": "cta-slide"}[kind]

    if kind == "cover":
        badge_markup = ""
        heading_markup = f"<h1>{html.escape(heading)}</h1>"
        body_markup = f'<p class="subheading">{html.escape(body)}</p>' if body else ""
        cta_markup = ""
    elif kind == "content":
        badge_markup = f'<div class="slide-number-badge">{slide_num - 1}</div>'
        heading_markup = f"<h2>{html.escape(heading)}</h2>"
        body_markup = f'<p class="body-text">{html.escape(body)}</p>'
        cta_markup = ""
    else:  # cta
        badge_markup = ""
        heading_markup = f"<h1>{html.escape(heading)}</h1>"
        body_markup = f'<p class="subheading">{html.escape(body)}</p>' if body else ""
        cta_markup = f'<span class="cta-button">{html.escape(cta_label)}</span>' if cta_label else ""

    out = SLIDE_TEMPLATE
    out = out.replace("{{SLIDE_CLASS}}", slide_class)
    out = out.replace("{{BRAND_LABEL}}", brand_label)
    out = out.replace("{{SLIDE_NUM}}", str(slide_num))
    out = out.replace("{{TOTAL}}", str(total))
    out = out.replace("{{SLIDE_NUMBER_BADGE}}", badge_markup)
    out = out.replace("{{HEADING_MARKUP}}", heading_markup)
    out = out.replace("{{BODY_MARKUP}}", body_markup)
    out = out.replace("{{CTA_BUTTON_MARKUP}}", cta_markup)
    out = out.replace("{{BRAND_MARK}}", brand_label)
    return out


def render_carousel(content: dict, account: str, prefix: str) -> list[Path]:
    """Construit le HTML de chaque slide (couverture + points + fermeture),
    les rend en PNG via Playwright, retourne la liste des chemins locaux."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        raise RuntimeError(
            "Playwright n'est pas installé. Lance :\n"
            "  pip install playwright --break-system-packages\n"
            "  playwright install chromium --with-deps"
        )

    tip_slides = content["slides"]
    total = 1 + len(tip_slides) + 1  # couverture + points + fermeture
    closing = CLOSING_SLIDE[account]

    slide_html_list = []
    slide_html_list.append(_build_slide_html(
        "cover", 1, total, account,
        heading=content["cover_heading"], body="",
    ))
    for i, tip in enumerate(tip_slides):
        slide_html_list.append(_build_slide_html(
            "content", i + 2, total, account,
            heading=tip["heading"], body=tip["body"],
        ))
    slide_html_list.append(_build_slide_html(
        "cta", total, total, account,
        heading=closing["heading"], body=closing["body"], cta_label=closing["cta"],
    ))

    out_paths = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": SLIDE_WIDTH, "height": SLIDE_HEIGHT})
        for i, slide_html in enumerate(slide_html_list, start=1):
            page.set_content(slide_html, wait_until="networkidle")
            # networkidle alone doesn't guarantee webfonts (Fraunces/Inter/IBM
            # Plex Mono, loaded via @import) have finished swapping in —
            # without this wait, screenshots can randomly fall back to the
            # system sans-serif font.
            page.evaluate("document.fonts.ready")
            out_path = WORKDIR / f"{prefix}_slide{i:02d}.png"
            page.screenshot(path=str(out_path))
            out_paths.append(out_path)
        browser.close()

    return out_paths


# ──────────────────────────────────────────────────────────────────────────
# STEP 3 — Hébergement public (copie vers le dossier servi par nginx)
# ──────────────────────────────────────────────────────────────────────────

def publish_images_publicly(image_paths: list[Path]) -> list[str]:
    if not PUBLIC_MEDIA_DIR or not PUBLIC_MEDIA_BASE_URL:
        raise RuntimeError(
            "PUBLIC_MEDIA_DIR / PUBLIC_MEDIA_BASE_URL ne sont pas configurés — "
            "impossible d'héberger les images publiquement."
        )
    dest_dir = Path(PUBLIC_MEDIA_DIR)
    dest_dir.mkdir(parents=True, exist_ok=True)

    urls = []
    for path in image_paths:
        dest = dest_dir / path.name
        shutil.copy(path, dest)
        urls.append(f"{PUBLIC_MEDIA_BASE_URL}/{path.name}")
    return urls


# ──────────────────────────────────────────────────────────────────────────
# STEP 4 — Mise en file d'attente pour approbation (Apps Script)
# ──────────────────────────────────────────────────────────────────────────

def queue_carousel_for_approval(account: str, image_urls: list[str], caption: str, hashtags: str) -> dict | None:
    """POST vers le projet Apps Script DÉDIÉ au carrousel (CarouselApproval.gs
    — complètement séparé du pipeline vidéo). Même logique de redirection
    que côté vidéo — voir la note dans kinepulse_pipeline.py sur pourquoi
    les redirections sont suivies manuellement, sans en-têtes."""
    if not CAROUSEL_APPSCRIPT_WEBAPP_URL:
        print("  (CAROUSEL_APPSCRIPT_WEBAPP_URL non configuré — impossible de mettre en file d'attente)")
        return None

    resp = requests.post(CAROUSEL_APPSCRIPT_WEBAPP_URL, json={
        "account": account,
        "platforms": ["facebook", "instagram"],
        "media_urls": image_urls,
        "caption": caption,
        "hashtags": hashtags,
    }, allow_redirects=False)

    # doPost() a déjà fini de s'exécuter (et donc déjà créé le lot + envoyé
    # l'email) au moment où ce 302 initial arrive — tout ce qui suit ne sert
    # qu'à récupérer la confirmation JSON, pas à déclencher le travail.
    # Le deuxième saut (googleusercontent.com/echo) se comporte parfois de
    # façon peu fiable en dehors d'un navigateur (il peut retomber sur une
    # page HTML au lieu du JSON) — donc une confirmation manquante ou non-JSON
    # ici est traitée comme un avertissement, pas une erreur fatale : le
    # courriel d'approbation est le signal fiable que ça a fonctionné.
    if resp.status_code in (301, 302, 303, 307, 308) and "Location" in resp.headers:
        try:
            resp = requests.get(resp.headers["Location"], timeout=15)
        except requests.exceptions.RequestException as e:
            print(f"  (avertissement : impossible de confirmer la mise en file d'attente ({e}) — "
                  f"vérifie quand même ton courriel, le lot a probablement été créé)")
            return None

    try:
        resp.raise_for_status()
        result = resp.json()
    except (requests.exceptions.RequestException, ValueError) as e:
        print(f"  (avertissement : réponse de confirmation illisible ({e}) — "
              f"vérifie quand même ton courriel, le lot a probablement été créé)")
        return None

    if not result.get("success"):
        print(f"  (Apps Script queue error: {result.get('error')})")
    return result


# ──────────────────────────────────────────────────────────────────────────
# ALERTES
# ──────────────────────────────────────────────────────────────────────────

def send_failure_alert(context: str, error: Exception):
    if not ALERT_EMAIL_FROM or not ALERT_EMAIL_APP_PASSWORD:
        print("  (pas d'email d'alerte configuré — notification ignorée)")
        return
    msg = EmailMessage()
    msg["Subject"] = f"⚠️ Carousel pipeline failed: {context}"
    msg["From"] = ALERT_EMAIL_FROM
    msg["To"] = ALERT_EMAIL_TO
    msg.set_content(
        f"Le pipeline carrousel a échoué ({datetime.now()}).\n\n"
        f"Étape : {context}\n\nErreur :\n{error}\n\n"
        f"Traceback complet :\n{traceback.format_exc()}"
    )
    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
            smtp.login(ALERT_EMAIL_FROM, ALERT_EMAIL_APP_PASSWORD)
            smtp.send_message(msg)
        print("  (email d'alerte envoyé)")
    except Exception as email_err:
        print(f"  (impossible d'envoyer l'email d'alerte : {email_err})")


# ──────────────────────────────────────────────────────────────────────────
# EXTRACTION DE THÈMES — un message/fichier peut contenir plusieurs thèmes,
# un par ligne (ex: une liste copiée depuis un calendrier de contenu).
# Partagé entre le bot Telegram et l'import en masse (import-themes).
# ──────────────────────────────────────────────────────────────────────────

_NUMBERED_LINE = re.compile(r'^\d+[.)]\s*(.+)')
_CATEGORY_HEADER = re.compile(r'\(\d+\)\s*$')  # ex: "Massage détente (16)"


def extract_topics_from_text(text: str) -> list[str]:
    """Découpe un texte en une liste de thèmes, un par ligne :
      - lignes vides -> ignorées
      - lignes d'en-tête de catégorie du style "Nom (16)" -> ignorées
      - lignes numérotées ("1. ", "12) ") -> la numérotation est retirée
      - toute autre ligne -> gardée telle quelle (permet d'envoyer un seul
        thème sans aucune numérotation, comme avant)
    """
    topics = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        numbered = _NUMBERED_LINE.match(line)
        if numbered:
            topics.append(numbered.group(1).strip())
        elif not _CATEGORY_HEADER.search(line):
            topics.append(line)
    return topics


# ──────────────────────────────────────────────────────────────────────────
# TELEGRAM — dépose un ou plusieurs thèmes depuis ton téléphone, sans SSH
# ──────────────────────────────────────────────────────────────────────────

def check_telegram_and_create_topics():
    """Cron this every 15-30 min. Format des messages envoyés au bot :
      <thème>          -> ajouté à la file (un seul thème -> les DEUX
                          carrousels, KinéPulse français + KinéSportif arabe)
      <thème 1>
      <thème 2>
      ...              -> plusieurs lignes -> plusieurs thèmes ajoutés
                          d'un coup (voir extract_topics_from_text)
      status           -> répond avec le nombre de thèmes en attente

    NOTE : Telegram limite un message texte à ~4096 caractères — pour une
    liste plus longue (ex: un calendrier de contenu de 100 thèmes), utilise
    plutôt `python carousel_pipeline.py import-themes` directement sur le
    serveur (voir README), qui n'a pas cette limite.
    """
    if not CAROUSEL_TELEGRAM_BOT_TOKEN:
        print("  (pas de CAROUSEL_TELEGRAM_BOT_TOKEN configuré — étape ignorée)")
        return

    last_id = 0
    if TELEGRAM_STATE_FILE.exists():
        last_id = int(TELEGRAM_STATE_FILE.read_text(encoding="utf-8").strip() or 0)

    resp = requests.get(
        f"https://api.telegram.org/bot{CAROUSEL_TELEGRAM_BOT_TOKEN}/getUpdates",
        params={"offset": last_id + 1, "timeout": 5},
    )
    resp.raise_for_status()
    updates = resp.json().get("result", [])

    if not updates:
        print("  (aucun nouveau message Telegram)")
        return

    highest_id = last_id
    created = 0
    for update in updates:
        highest_id = max(highest_id, update["update_id"])
        message = update.get("message", {})
        chat_id = str(message.get("chat", {}).get("id", ""))
        raw_text = message.get("text", "").strip()

        if CAROUSEL_TELEGRAM_CHAT_ID and chat_id != CAROUSEL_TELEGRAM_CHAT_ID:
            continue  # ignore les messages de quelqu'un d'autre

        if not raw_text:
            continue

        if raw_text.lower() == "status":
            send_telegram_reply(chat_id, build_topic_status_message())
            continue

        topics = extract_topics_from_text(raw_text)
        for i, topic in enumerate(topics):
            filename = f"telegram_{update['update_id']}_{i:03d}.txt"
            (THEMES_FOLDER / filename).write_text(topic, encoding="utf-8")
            created += 1
        if topics:
            print(f"  {len(topics)} thème(s) créé(s) depuis le message {update['update_id']}")

    TELEGRAM_STATE_FILE.write_text(str(highest_id), encoding="utf-8")
    print(f"Traité {len(updates)} message(s), créé {created} thème(s) au total.")


def send_telegram_reply(chat_id: str, text: str):
    requests.post(
        f"https://api.telegram.org/bot{CAROUSEL_TELEGRAM_BOT_TOKEN}/sendMessage",
        json={"chat_id": chat_id, "text": text},
    )


def build_topic_status_message() -> str:
    count = len(list(THEMES_FOLDER.glob("*.txt")))

    if count == 0:
        return "📭 Aucun thème en attente. Envoie un message pour en ajouter."

    return (
        f"📋 {count} thème(s) en attente (chacun génère KinéPulse + KinéSportif)\n\n"
        f"Traités automatiquement par le cron quotidien."
    )


# ──────────────────────────────────────────────────────────────────────────
# ORCHESTRATION
# ──────────────────────────────────────────────────────────────────────────

def run_carousel(account: str, topic: str, test_mode: bool = False):
    print(f"1/4 génération du contenu (Claude API) — thème : {topic!r}")
    content = generate_carousel_content(topic, account)
    print(f"   -> {len(content['slides'])} slides de contenu générées")

    print("2/4 rendu des slides (Playwright)...")
    prefix = f"{account}_{int(time.time())}"
    image_paths = render_carousel(content, account, prefix)
    print(f"   -> {len(image_paths)} images générées dans {WORKDIR}/")

    if test_mode:
        print("3/4 mode test — pas d'hébergement public, pas de mise en file d'attente.")
        print(f"\nRelis les images ici :\n  " + "\n  ".join(str(p) for p in image_paths))
        print(f"\nCaption générée :\n{content['caption']}\n\nHashtags :\n{content['hashtags']}")
        return

    print("3/4 hébergement public des images...")
    image_urls = publish_images_publicly(image_paths)

    print("4/4 mise en file d'attente pour approbation...")
    queue_carousel_for_approval(account, image_urls, content["caption"], content["hashtags"])
    print("   (vérifie ton courriel pour le bouton Approuver/Rejeter — "
          "la publication a lieu au prochain créneau de pointe du compte, pas immédiatement)")


def run_carousel_both(topic: str):
    """Un seul thème -> les DEUX carrousels : KinéPulse en français (le
    thème tel quel) et KinéSportif en arabe (Claude traduit/adapte le même
    thème — voir l'instruction dans generate_carousel_content). Chaque
    compte est indépendant : si l'un échoue, l'autre continue quand même."""
    for account in ("kinepulse", "kinesportif"):
        try:
            print(f"=== {ACCOUNT_LABELS[account]} ===")
            run_carousel(account, topic)
        except Exception as e:
            print(f"  ÉCHEC pour {account} : {e}")
            send_failure_alert(f"run_carousel_both ({account})", e)


def get_next_theme() -> Path | None:
    candidates = [p for p in THEMES_FOLDER.iterdir() if p.is_file() and p.suffix.lower() == ".txt"]
    if not candidates:
        return None
    return min(candidates, key=lambda p: p.stat().st_mtime)


def run_carousel_daily():
    theme_file = get_next_theme()
    if theme_file is None:
        msg = (f"Aucun thème en attente dans {THEMES_FOLDER.resolve()} — "
               f"dépose un fichier .txt (un thème par ligne) avant le prochain run.")
        print(msg)
        send_failure_alert("daily carousel — dossier vide", Exception(msg))
        return

    topic = theme_file.read_text(encoding="utf-8").strip().splitlines()[0].strip()
    print(f"Thème repris depuis {theme_file.name} : {topic!r}")
    run_carousel_both(topic)

    processed_path = THEMES_PROCESSED / theme_file.name
    shutil.move(str(theme_file), str(processed_path))
    print(f"Déplacé {theme_file.name} -> {processed_path}")


def import_themes_from_text(text: str) -> int:
    """Importe en masse : un thème par ligne, avec la même logique de
    nettoyage que le bot Telegram (ignore les lignes vides et les en-têtes
    de catégorie du style "Nom (16)", retire la numérotation). Retourne le
    nombre de thèmes créés."""
    topics = extract_topics_from_text(text)
    timestamp = int(time.time())
    for i, topic in enumerate(topics):
        filename = f"import_{timestamp}_{i:03d}.txt"
        (THEMES_FOLDER / filename).write_text(topic, encoding="utf-8")
    return len(topics)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    if sys.argv[1] == "test":
        if len(sys.argv) < 4:
            print('Usage: python carousel_pipeline.py test <kinepulse|kinesportif> "<thème>"')
            sys.exit(1)
        run_carousel(sys.argv[2], sys.argv[3], test_mode=True)

    elif sys.argv[1] == "daily":
        try:
            run_carousel_daily()
        except Exception as e:
            print(f"PIPELINE FAILED: {e}")
            send_failure_alert("run_carousel_daily", e)

    elif sys.argv[1] == "both":
        # Génère les deux carrousels (KinéPulse fr + KinéSportif ar) depuis
        # un seul thème donné en ligne de commande, sans passer par la file
        # d'attente de fichiers .txt.
        if len(sys.argv) < 3:
            print('Usage: python carousel_pipeline.py both "<thème>"')
            sys.exit(1)
        run_carousel_both(sys.argv[2])

    elif sys.argv[1] in ("kinepulse", "kinesportif"):
        # Génère UN SEUL des deux carrousels — utile pour un ajustement
        # manuel ou un test ciblé sur un seul compte.
        if len(sys.argv) < 3:
            print(f'Usage: python carousel_pipeline.py {sys.argv[1]} "<thème>"')
            sys.exit(1)
        try:
            run_carousel(sys.argv[1], sys.argv[2])
        except Exception as e:
            print(f"PIPELINE FAILED: {e}")
            send_failure_alert(f"run_carousel ({sys.argv[1]})", e)
            sys.exit(1)

    elif sys.argv[1] == "check-telegram":
        try:
            check_telegram_and_create_topics()
        except Exception as e:
            print(f"CHECK-TELEGRAM FAILED: {e}")
            send_failure_alert("check_telegram_and_create_topics", e)

    elif sys.argv[1] == "import-themes":
        # Lit une liste de thèmes depuis l'entrée standard (pas de limite de
        # longueur, contrairement à un message Telegram) — voir README.
        text = sys.stdin.read()
        count = import_themes_from_text(text)
        print(f"{count} thème(s) importé(s) dans {THEMES_FOLDER}/")

    else:
        print(__doc__)
        sys.exit(1)
