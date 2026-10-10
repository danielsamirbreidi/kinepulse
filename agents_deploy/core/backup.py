"""
Sauvegarde locale du contenu d'un fichier du site AVANT chaque site_change,
pour permettre un retour arrière si une modification pose problème.
Stocké en local sur le serveur (memory/site_backups.jsonl), pas sur GitHub,
pour ne jamais dépendre du fichier qu'on est en train de modifier.
"""
import os
import json
import datetime

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKUP_FILE = os.path.join(BASE, "memory", "site_backups.jsonl")
MAX_PER_FILE = 10  # on garde les 10 dernières versions par fichier


def save_backup(file_path, old_content, details=""):
    """Enregistre le contenu AVANT modification. À appeler juste avant update_file."""
    os.makedirs(os.path.dirname(BACKUP_FILE), exist_ok=True)
    entry = {
        "date": datetime.datetime.now().isoformat(timespec="seconds"),
        "file": file_path,
        "content": old_content,
        "details": details,
    }
    with open(BACKUP_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    _prune(file_path)


def _prune(file_path):
    """Garde seulement les MAX_PER_FILE dernières sauvegardes pour ce fichier
    (les autres fichiers ne sont pas touchés)."""
    try:
        with open(BACKUP_FILE, encoding="utf-8") as f:
            rows = [json.loads(l) for l in f if l.strip()]
    except FileNotFoundError:
        return
    same = [r for r in rows if r["file"] == file_path]
    other = [r for r in rows if r["file"] != file_path]
    same = same[-MAX_PER_FILE:]
    merged = other + same
    merged.sort(key=lambda r: r["date"])
    with open(BACKUP_FILE, "w", encoding="utf-8") as f:
        for r in merged:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")


def get_last_backup(file_path):
    """Retourne la dernière sauvegarde disponible pour ce fichier, ou None."""
    try:
        with open(BACKUP_FILE, encoding="utf-8") as f:
            rows = [json.loads(l) for l in f if l.strip()]
    except FileNotFoundError:
        return None
    same = [r for r in rows if r["file"] == file_path]
    return same[-1] if same else None
