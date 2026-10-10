"""
Suivi de la santé de chaque agent : détecte quand un agent échoue
(données manquantes, API indisponible, erreur d'exécution) et n'alerte
Dandoun sur Telegram que si le problème persiste (pas de bruit sur une
erreur isolée/temporaire).
"""
import os
import json
import datetime

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HEALTH_FILE = os.path.join(BASE, "memory", "health.json")
ALERT_AFTER = 2  # nombre d'échecs consécutifs avant d'alerter Dandoun


def _load():
    try:
        with open(HEALTH_FILE, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {}


def _save(data):
    os.makedirs(os.path.dirname(HEALTH_FILE), exist_ok=True)
    with open(HEALTH_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def record_success(agent):
    data = _load()
    data[agent] = {"consecutive_failures": 0, "last_ok": datetime.date.today().isoformat()}
    _save(data)


def record_failure(agent, error_text):
    data = _load()
    entry = data.get(agent, {"consecutive_failures": 0})
    entry["consecutive_failures"] = entry.get("consecutive_failures", 0) + 1
    entry["last_error"] = str(error_text)[:300]
    entry["last_failure"] = datetime.date.today().isoformat()
    data[agent] = entry
    _save(data)
    return entry["consecutive_failures"]


def should_alert(agent):
    data = _load()
    return data.get(agent, {}).get("consecutive_failures", 0) >= ALERT_AFTER
