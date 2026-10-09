"""
Mémoire partagée de l'équipe : garde une trace de ce qui a été fait (actions
exécutées, refusées, bloquées) pour que les agents ne recommencent pas à
zéro à chaque appel et puissent s'appuyer sur ce qui a déjà été essayé.
Fichier local sur la VM (pas versionné dans le dépôt) — grandit avec le temps,
tronqué automatiquement à la lecture pour rester raisonnable dans le prompt.
"""
import os
import datetime

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MEMORY_FILE = os.path.join(BASE, "memory", "team_memory.md")
MAX_CHARS = 8000  # garde l'historique récent, tronque le plus vieux


def read_memory():
    try:
        content = open(MEMORY_FILE, encoding="utf-8").read().strip()
    except FileNotFoundError:
        return "(aucun historique pour l'instant — c'est la première fois que l'équipe travaille sur ce dossier)"
    if not content:
        return "(aucun historique pour l'instant)"
    if len(content) > MAX_CHARS:
        content = "...(historique plus ancien tronqué)...\n" + content[-MAX_CHARS:]
    return content


def log(agent_name, text):
    os.makedirs(os.path.dirname(MEMORY_FILE), exist_ok=True)
    date = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    with open(MEMORY_FILE, "a", encoding="utf-8") as f:
        f.write(f"- [{date}] [{agent_name}] {text}\n")
