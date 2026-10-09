"""
Agent conversationnel : écoute Telegram en continu et répond/agit directement
quand Dandoun lui écrit. Lance avec : python3 chat.py
Laisse tourner en arrière-plan avec : nohup python3 chat.py > chat.log 2>&1 &
"""
import os, time, json
from dotenv import load_dotenv
load_dotenv()
import requests
from core import guard, telegram
from core.agent import run_chat
from core.executors import EXECUTORS
from core.data_sources import collect

BASE = os.path.dirname(os.path.abspath(__file__))
OFFSET_FILE = os.path.join(BASE, "chat_offset.json")
AGENT_NAME = "director"   # le chat parle au Directeur, qui a la vue d'ensemble (Google + suivi + fidélisation)


def _api():
    return f"https://api.telegram.org/bot{os.environ['TELEGRAM_MKT_TOKEN']}"


def _load_offset():
    try:
        return json.load(open(OFFSET_FILE)).get("offset")
    except Exception:
        return None


def _save_offset(offset):
    json.dump({"offset": offset}, open(OFFSET_FILE, "w"))


def handle_message(text):
    print(f"Reçu : {text}")
    data = collect(AGENT_NAME)
    res = run_chat(AGENT_NAME, text, data)
    reply = res.get("reply") or res.get("report") or "..."
    telegram.notify(reply)
    for a in res.get("actions", []):
        d = guard.decide(a)
        label = f"[{AGENT_NAME}] {a['type']} ({a.get('cost_cad', 0)} $/mois)\n{a['description']}"
        if d == "block":
            telegram.notify("⛔ Bloqué (plafond ou action non permise)\n" + label)
        elif d == "auto" or (d == "ask" and telegram.ask(label)):
            ok = EXECUTORS[a["type"]](a)
            telegram.notify("✅ Fait." if ok else "❌ Erreur lors de l'exécution.")
            if ok:
                guard.record_commit(a.get("cost_cad", 0))


def main():
    print("Agent en écoute sur Telegram — écris-lui directement dans ton chat Telegram.")
    offset = _load_offset()
    chat_id = str(os.environ["TELEGRAM_CHAT_ID"])
    while True:
        try:
            r = requests.get(_api() + "/getUpdates", timeout=45, params={
                "timeout": 30, "offset": offset,
                "allowed_updates": json.dumps(["message"])}).json()
            for up in r.get("result", []):
                offset = up["update_id"] + 1
                _save_offset(offset)
                msg = up.get("message")
                if not msg or "text" not in msg:
                    continue
                if str(msg["chat"]["id"]) != chat_id:
                    continue
                text = msg["text"].strip()
                if text.startswith("/"):
                    continue
                handle_message(text)
        except Exception as e:
            print(f"[ERREUR boucle] {e}")
            time.sleep(5)


if __name__ == "__main__":
    main()
