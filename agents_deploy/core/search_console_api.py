"""
Accès à l'API Google Search Console (positions, clics, impressions réels
de kinepulse.ca dans les résultats de recherche GRATUITS de Google) et à
l'API Site Verification (pour prouver qu'on possède le site, étape requise
une seule fois avant de pouvoir lire les données).
"""
import os
import requests

SITE_URL = "https://kinepulse.ca/"


def _access_token():
    resp = requests.post("https://oauth2.googleapis.com/token", data={
        "client_id": os.environ["GOOGLE_SEARCH_CONSOLE_CLIENT_ID"],
        "client_secret": os.environ["GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET"],
        "refresh_token": os.environ["GOOGLE_SEARCH_CONSOLE_REFRESH_TOKEN"],
        "grant_type": "refresh_token",
    }, timeout=20)
    data = resp.json()
    if "access_token" not in data:
        raise RuntimeError(f"Échec d'authentification Search Console : {data}")
    return data["access_token"]


def _headers():
    return {"Authorization": f"Bearer {_access_token()}"}


def get_verification_token():
    """Demande à Google un jeton de vérification de type META TAG pour kinepulse.ca."""
    resp = requests.post(
        "https://www.googleapis.com/siteVerification/v1/token",
        headers=_headers(),
        json={
            "site": {"identifier": SITE_URL, "type": "SITE"},
            "verificationMethod": "META",
        },
        timeout=20,
    )
    data = resp.json()
    if "token" not in data:
        raise RuntimeError(f"Échec de demande du jeton de vérification : {data}")
    return data["token"]  # ex: "google-site-verification=XXXXX"


def confirm_verification():
    """Confirme la vérification auprès de Google (à appeler APRÈS avoir publié
    la balise meta sur la page d'accueil du site)."""
    resp = requests.post(
        "https://www.googleapis.com/siteVerification/v1/webResource?verificationMethod=META",
        headers=_headers(),
        json={"site": {"identifier": SITE_URL, "type": "SITE"}},
        timeout=20,
    )
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"Échec de confirmation de vérification : {resp.status_code} {resp.text[:300]}")
    return resp.json()


def add_site_to_search_console():
    """Enregistre kinepulse.ca comme propriété Search Console (sans effet si déjà fait)."""
    import urllib.parse
    encoded = urllib.parse.quote(SITE_URL, safe="")
    resp = requests.put(
        f"https://www.googleapis.com/webmasters/v3/sites/{encoded}",
        headers=_headers(),
        timeout=20,
    )
    return resp.status_code in (200, 204)


def get_search_analytics(days=28):
    """Retourne les vraies requêtes de recherche, clics, impressions et
    position moyenne des 'days' derniers jours. Retourne None si le site
    n'est pas encore vérifié/enregistré (pas une erreur bloquante)."""
    import datetime
    end = datetime.date.today() - datetime.timedelta(days=2)  # délai habituel de Google
    start = end - datetime.timedelta(days=days)
    import urllib.parse
    encoded = urllib.parse.quote(SITE_URL, safe="")
    resp = requests.post(
        f"https://www.googleapis.com/webmasters/v3/sites/{encoded}/searchAnalytics/query",
        headers=_headers(),
        json={
            "startDate": start.isoformat(),
            "endDate": end.isoformat(),
            "dimensions": ["query", "page"],
            "rowLimit": 25,
        },
        timeout=20,
    )
    if resp.status_code != 200:
        return {"disponible": False, "detail": f"{resp.status_code} {resp.text[:300]}"}
    data = resp.json()
    rows = []
    for r in data.get("rows", []):
        rows.append({
            "requete": r["keys"][0],
            "page": r["keys"][1],
            "clics": r.get("clicks", 0),
            "impressions": r.get("impressions", 0),
            "position_moyenne": round(r.get("position", 0), 1),
            "ctr_pct": round(r.get("ctr", 0) * 100, 2),
        })
    return {"disponible": True, "periode_jours": days, "requetes": rows}
