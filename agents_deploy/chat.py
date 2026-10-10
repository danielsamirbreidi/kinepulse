"""
Agent conversationnel : écoute Telegram en continu et répond/agit directement
quand Dandoun lui écrit. Lance avec : python3 chat.py
Laisse tourner en arrière-plan avec : nohup python3 chat.py > chat.log 2>&1 &
"""
import os, time, json
from dotenv import load_dotenv
load_dotenv()
import requests
from core import guard, telegram, memory
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
    try:
        _handle_message_inner(text)
    except Exception as e:
        # Trouvé lors de l'audit du 2026-10-09 : avant ce garde-fou, une erreur
        # ici (ex. réseau coupé juste après une approbation Telegram) faisait
        # perdre l'action silencieusement — Dandoun croyait avoir approuvé
        # quelque chose qui n'avait jamais eu lieu, sans aucun message.
        print(f"[ERREUR interne handle_message] {e}")
        try:
            telegram.notify(
                "⚠️ Une erreur interne a interrompu le traitement de ton dernier message. "
                "Si tu avais approuvé une action juste avant, elle n'a PAS été exécutée — renvoie ta demande."
            )
            memory.log(AGENT_NAME, f"ERREUR INTERNE en traitant \"{text}\" : {e}")
        except Exception:
            pass


def _handle_message_inner(text):
    data = collect(AGENT_NAME)
    res = run_chat(AGENT_NAME, text, data)
    reply = res.get("reply") or res.get("report") or "..."
    telegram.notify(reply)
    memory.log(AGENT_NAME, f"Dandoun a dit : \"{text}\" — Réponse : {reply[:300]}")
    for a in res.get("actions", []):
        d = guard.decide(a)
        label = f"[{AGENT_NAME}] {a['type']} ({a.get('cost_cad', 0)} $/mois)\n{a['description']}"
        if d == "block":
            telegram.notify("⛔ Bloqué (plafond, action non permise, ou coût déclaré incohérent avec les paramètres)\n" + label)
            memory.log(AGENT_NAME, f"BLOQUÉ : {a['type']} — {a['description']}")
        elif d == "auto" or (d == "ask" and telegram.ask(label)):
            ok = EXECUTORS[a["type"]](a)
            telegram.notify("✅ Fait." if ok else "❌ Erreur lors de l'exécution.")
            if ok:
                guard.record_commit(a.get("cost_cad", 0), channel=guard.CFG.get("action_channel", {}).get(a["type"]))
                memory.log(AGENT_NAME, f"FAIT (demandé par Dandoun en conversation) : {a['type']} — {a['description']}")
            else:
                memory.log(AGENT_NAME, f"ÉCHEC D'EXÉCUTION : {a['type']} — {a['description']}")
        else:
            memory.log(AGENT_NAME, f"REFUSÉ par Dandoun : {a['type']} — {a['description']}")


def main():
    print("Agent en écoute sur Telegram — écris-lui directement dans ton chat Telegram.")
    offset = _load_offset()
    chat_id = str(os.environ["TELEGRAM_CHAT_ID"])
    while True:
        try:
            for pending_text in telegram.drain_pending_messages():
                if not pending_text.startswith("/"):
                    handle_message(pending_text)
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
