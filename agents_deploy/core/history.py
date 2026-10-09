"""
Historique quotidien des chiffres clés (pas des actions — ça c'est memory.py).
Permet à l'équipe de voir si ça s'améliore ou empire semaine après semaine,
au lieu de juste voir une photo du moment présent.
"""
import os
import json
import datetime

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HISTORY_FILE = os.path.join(BASE, "memory", "google_history.jsonl")


def record_snapshot(metrics):
    """Ajoute un instantané du jour. Un seul par jour : si on en a déjà un
    pour aujourd'hui, on le remplace plutôt que d'en ajouter un deuxième."""
    os.makedirs(os.path.dirname(HISTORY_FILE), exist_ok=True)
    today = datetime.date.today().isoformat()
    rows = []
    try:
        with open(HISTORY_FILE, encoding="utf-8") as f:
            rows = [json.loads(l) for l in f if l.strip()]
    except FileNotFoundError:
        pass
    rows = [r for r in rows if r.get("date") != today]
    rows.append({"date": today, **metrics})
    with open(HISTORY_FILE, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def read_history(days=21):
    try:
        with open(HISTORY_FILE, encoding="utf-8") as f:
            rows = [json.loads(l) for l in f if l.strip()]
    except FileNotFoundError:
        return []
    return rows[-days:]
