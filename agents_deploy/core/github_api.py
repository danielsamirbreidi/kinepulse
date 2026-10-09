"""
Accès au dépôt GitHub du site (kinepulse.ca) pour lire et modifier des
fichiers réels — utilisé par l'agent Conversion pour agir directement sur
le site au lieu de seulement proposer.
"""
import os
import base64
import requests

API = "https://api.github.com"


def _repo():
    return os.environ.get("GITHUB_REPO", "danielsamirbreidi/kinepulse")


def _headers():
    return {
        "Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}",
        "Accept": "application/vnd.github+json",
    }


def get_file(path, ref="main"):
    """Retourne {"content": str, "sha": str} ou None si le fichier n'existe pas."""
    url = f"{API}/repos/{_repo()}/contents/{path}"
    resp = requests.get(url, headers=_headers(), params={"ref": ref}, timeout=20)
    if resp.status_code != 200:
        return None
    data = resp.json()
    content = base64.b64decode(data["content"]).decode("utf-8")
    return {"content": content, "sha": data["sha"]}


def update_file(path, new_content, sha, message, branch="main"):
    """Remplace le contenu d'un fichier existant et commit directement sur main."""
    url = f"{API}/repos/{_repo()}/contents/{path}"
    body = {
        "message": message,
        "content": base64.b64encode(new_content.encode("utf-8")).decode("ascii"),
        "sha": sha,
        "branch": branch,
    }
    resp = requests.put(url, headers=_headers(), json=body, timeout=20)
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"GitHub {resp.status_code}: {resp.text[:300]}")
    return resp.json()
