#!/usr/bin/env python3
"""
KinéPulse / KinéSportif — Carousel Pipeline (Instagram + Facebook)
====================================================================

Génère un carrousel d'images informatives à partir d'un thème :
  1. Claude API écrit le contenu des slides (titre, points, caption, hashtags)
  2. Chaque slide est rendue en PNG (Playwright + template HTML/CSS de marque
     — mêmes couleurs/polices que kinepulse.ca)
  3. Les PNG sont copiées dans le dossier que ton serveur sert publiquement
  4. Le lot est mis en file d'attente pour approbation via un projet Apps
     Script DÉDIÉ au carrousel (voir CarouselApproval.gs dans ce dossier —
     complètement séparé du pipeline vidéo : sa propre Google Sheet, son
     propre déploiement, son propre email) — un clic "Approuver" publie au
     prochain créneau de pointe du compte. Rien n'est publié automatiquement
     sans ton accord.

Usage:
  Test (génère et sauvegarde localement, ne met PAS en file d'attente) :
    python carousel_pipeline.py test kinepulse "5 signes qu'il faut consulter en kinésithérapie"

  Génère + met en file d'attente (Facebook + Instagram) :
    python carousel_pipeline.py kinepulse "Les bienfaits du massage thérapeutique"
    python carousel_pipeline.py kinesportif "<thème>"

  Mode dossier (comme la vidéo) — traite le thème le plus ancien en attente :
    python carousel_pipeline.py daily kinepulse
    python carousel_pipeline.py daily kinesportif
    (dépose un fichier .txt contenant un thème, une ligne, dans
    ./themes_a_traiter_kinepulse/ ou ./themes_a_traiter_kinesportif/)

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
"""
from __future__ import annotations

import html
import json
import os
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

DEFAULT_HASHTAGS_FR = "#kinesitherapie #massotherapie #Montreal #PointeAuxTrembles #sante"
DEFAULT_HASHTAGS_EN = "#physiotherapy #wellness #Lebanon #fitness #sport"

THEMES_FOLDER = {
    "kinepulse": Path("./themes_a_traiter_kinepulse"),
    "kinesportif": Path("./themes_a_traiter_kinesportif"),
}
THEMES_PROCESSED = Path("./themes_traitees")
for folder in list(THEMES_FOLDER.values()) + [THEMES_PROCESSED]:
    folder.mkdir(exist_ok=True)


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
            "Tu écris le contenu d'un carrousel Instagram/Facebook informatif "
            "pour KinéPulse, une clinique de kinésithérapie/massothérapie/EMS à "
            "Montréal. Réponds UNIQUEMENT avec un objet JSON valide (rien "
            "d'autre, pas de ```), au format EXACT :\n"
            '{"cover_heading": "titre accrocheur du carrousel, 4-8 mots", '
            '"slides": [{"heading": "titre court du point, 3-6 mots", '
            '"body": "1-2 phrases, claires et concrètes"}], '
            '"caption": "légende Instagram/Facebook, 2-3 phrases chaleureuses '
            'et professionnelles, ton de clinique (pas familier)", '
            '"hashtags": "exactement 5 hashtags pertinents au sujet précis du '
            'thème (pas génériques), en français, séparés par des espaces, '
            'précédés de #"}\n'
            'Génère entre 4 et 6 éléments dans "slides" (le carrousel aura donc '
            "6 à 8 images au total en comptant la couverture et la fermeture). "
            "Contenu factuel et utile. Ne donne JAMAIS de conseil médical "
            "personnalisé ni de diagnostic — reste général et informatif, et "
            "invite à consulter pour un avis personnalisé si pertinent."
        )
    else:
        instruction = (
            "You write the content for an informative Instagram/Facebook "
            "carousel for KinéSportif, a sports/kinesiology academy account "
            "testing market interest in Lebanon. Reply ONLY with a valid JSON "
            "object (nothing else, no ```), in this EXACT format:\n"
            '{"cover_heading": "catchy carousel title, 4-8 words", '
            '"slides": [{"heading": "short point title, 3-6 words", '
            '"body": "1-2 clear, concrete sentences"}], '
            '"caption": "Instagram/Facebook caption, 2-3 warm and engaging '
            'sentences", '
            '"hashtags": "exactly 5 hashtags relevant to this specific topic '
            '(not generic), in English, space-separated, prefixed with #"}\n'
            'Generate between 4 and 6 items in "slides" (the carousel will '
            "therefore have 6-8 images total counting cover + closing). "
            "Factual, useful content. NEVER give personalized medical advice "
            "or a diagnosis — stay general and informative."
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

    if resp.status_code in (301, 302, 303, 307, 308) and "Location" in resp.headers:
        resp = requests.get(resp.headers["Location"])

    resp.raise_for_status()
    result = resp.json()
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


def get_next_theme(account: str) -> Path | None:
    folder = THEMES_FOLDER[account]
    candidates = [p for p in folder.iterdir() if p.is_file() and p.suffix.lower() == ".txt"]
    if not candidates:
        return None
    return min(candidates, key=lambda p: p.stat().st_mtime)


def run_carousel_daily(account: str):
    theme_file = get_next_theme(account)
    if theme_file is None:
        msg = (f"Aucun thème en attente dans {THEMES_FOLDER[account].resolve()} — "
               f"dépose un fichier .txt (un thème par ligne) avant le prochain run.")
        print(msg)
        send_failure_alert(f"daily carousel ({account}) — dossier vide", Exception(msg))
        return

    topic = theme_file.read_text(encoding="utf-8").strip().splitlines()[0].strip()
    print(f"Thème repris depuis {theme_file.name} : {topic!r}")
    run_carousel(account, topic)

    processed_path = THEMES_PROCESSED / theme_file.name
    shutil.move(str(theme_file), str(processed_path))
    print(f"Déplacé {theme_file.name} -> {processed_path}")


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
        if len(sys.argv) < 3 or sys.argv[2] not in THEMES_FOLDER:
            print("Usage: python carousel_pipeline.py daily <kinepulse|kinesportif>")
            sys.exit(1)
        try:
            run_carousel_daily(sys.argv[2])
        except Exception as e:
            print(f"PIPELINE FAILED: {e}")
            send_failure_alert(f"run_carousel_daily ({sys.argv[2]})", e)

    elif sys.argv[1] in ("kinepulse", "kinesportif"):
        if len(sys.argv) < 3:
            print(f'Usage: python carousel_pipeline.py {sys.argv[1]} "<thème>"')
            sys.exit(1)
        try:
            run_carousel(sys.argv[1], sys.argv[2])
        except Exception as e:
            print(f"PIPELINE FAILED: {e}")
            send_failure_alert(f"run_carousel ({sys.argv[1]})", e)
            sys.exit(1)

    else:
        print(__doc__)
        sys.exit(1)
