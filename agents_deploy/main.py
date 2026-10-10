import sys
from dotenv import load_dotenv
load_dotenv()
from core import guard, telegram, memory, health
from core.agent import run_agent
from core.executors import EXECUTORS
from core.data_sources import collect

def run(name, task="Analyse du jour et propositions d'actions."):
    try:
        data = collect(name)
        res = run_agent(name, task, data)
    except Exception as e:
        n = health.record_failure(name, e)
        print(f"[ERREUR] {name} : {e} (échec consécutif n°{n})")
        if health.should_alert(name):
            telegram.notify(f"⚠️ L'agent {name} échoue depuis {n} exécutions consécutives : {e}")
            memory.log(name, f"ÉCHEC PERSISTANT DE L'AGENT : {e}")
        return

    health.record_success(name)
    telegram.notify(f"[{name}] {res.get('report','')}")
    for a in res.get("actions", []):
        d = guard.decide(a)
        label = f"[{name}] {a['type']} ({a.get('cost_cad',0)} $/mois)\n{a['description']}"
        if d == "block":
            telegram.notify("⛔ Bloqué (plafond global, plafond par canal, ou action non permise)\n" + label)
            memory.log(name, f"BLOQUÉ : {a['type']} — {a['description']}")
        elif d == "auto" or (d == "ask" and telegram.ask(label)):
            ok = EXECUTORS[a["type"]](a)
            if ok:
                guard.record_commit(a.get("cost_cad", 0), channel=guard.CFG.get("action_channel", {}).get(a["type"]))
                memory.log(name, f"FAIT : {a['type']} — {a['description']}")
            else:
                memory.log(name, f"ÉCHEC D'EXÉCUTION : {a['type']} — {a['description']}")
        else:
            memory.log(name, f"REFUSÉ par Dandoun : {a['type']} — {a['description']}")

if __name__ == "__main__":
    for n in (sys.argv[1:] or ["director"]):
        run(n)
