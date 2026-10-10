import os, time, json, requests

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PENDING_FILE = os.path.join(BASE, "pending_messages.json")


def _api():
    return f"https://api.telegram.org/bot{os.environ['TELEGRAM_MKT_TOKEN']}"


def notify(text):
    requests.post(_api() + "/sendMessage",
                  json={"chat_id": os.environ["TELEGRAM_CHAT_ID"], "text": text[:4000]}, timeout=20)


def _queue_pending_message(text):
    """Garde un message texte reçu PENDANT qu'une approbation attendait une
    réponse, pour que chat.py le traite dès qu'il redevient disponible — au
    lieu de le perdre silencieusement (trouvé lors de l'audit du 2026-10-09 :
    le filtre allowed_updates=['callback_query'] fait avancer l'offset global
    Telegram et peut faire disparaître un message texte arrivé en même temps)."""
    try:
        msgs = json.load(open(PENDING_FILE)) if os.path.exists(PENDING_FILE) else []
    except Exception:
        msgs = []
    msgs.append(text)
    json.dump(msgs, open(PENDING_FILE, "w"))


def drain_pending_messages():
    """Retourne et vide les messages mis en attente par ask() pendant une
    approbation. À appeler dans la boucle principale de chat.py."""
    try:
        msgs = json.load(open(PENDING_FILE)) if os.path.exists(PENDING_FILE) else []
    except Exception:
        msgs = []
    if msgs:
        json.dump([], open(PENDING_FILE, "w"))
    return msgs


def ask(text, timeout=3600):
    """Envoie Approuver/Refuser. Sans réponse dans le délai = refus (choix
    volontaire : en cas de doute, on ne dépense pas)."""
    kb = {"inline_keyboard": [[{"text": "✅ Approuver", "callback_data": "ok"},
                               {"text": "❌ Refuser", "callback_data": "no"}]]}
    r = requests.post(_api() + "/sendMessage", timeout=20,
                      json={"chat_id": os.environ["TELEGRAM_CHAT_ID"], "text": text[:4000], "reply_markup": kb}).json()
    mid = r["result"]["message_id"]
    chat_id = str(os.environ["TELEGRAM_CHAT_ID"])
    offset, end = None, time.time() + timeout
    while time.time() < end:
        u = requests.get(_api() + "/getUpdates", timeout=45, params={
            "timeout": 30, "offset": offset, "allowed_updates": json.dumps(["callback_query", "message"])}).json()
        for up in u.get("result", []):
            offset = up["update_id"] + 1
            cq = up.get("callback_query")
            if cq and cq["message"]["message_id"] == mid:
                requests.post(_api() + "/answerCallbackQuery", json={"callback_query_id": cq["id"]}, timeout=20)
                return cq["data"] == "ok"
            msg = up.get("message")
            if msg and "text" in msg and str(msg["chat"]["id"]) == chat_id:
                # Un message texte est arrivé pendant qu'on attendait une
                # approbation — on le garde pour plus tard plutôt que de le
                # laisser disparaître avec l'avancement de l'offset.
                _queue_pending_message(msg["text"].strip())
    return False
