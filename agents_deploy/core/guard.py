import json, os, datetime, yaml
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CFG = yaml.safe_load(open(os.path.join(BASE, "config.yaml"), encoding="utf-8"))
STATE = os.path.join(BASE, "state.json")

def _load():
    try:
        return json.load(open(STATE))
    except Exception:
        return {}

def _month():
    return datetime.date.today().strftime("%Y-%m")

def committed_this_month():
    return float(_load().get(_month(), 0.0))

def record_commit(amount):
    s = _load(); s[_month()] = s.get(_month(), 0.0) + float(amount)
    json.dump(s, open(STATE, "w"))

def decide(action):
    """Retourne 'auto', 'ask' ou 'block'. Les règles viennent de config.yaml, pas de l'agent.

    RÈGLE DE SÉCURITÉ ABSOLUE, verrouillée ici dans le code (pas seulement dans
    config.yaml) : AUCUNE action qui coûte plus de 0$ ne peut jamais être 'auto'.
    Même si quelqu'un modifie config.yaml par erreur pour mettre une action
    payante dans auto_actions, cette ligne l'empêche de s'exécuter sans
    l'approbation de Dandoun sur Telegram. Seules les actions à coût nul ou
    négatif (ne dépensent rien, ou réduisent une dépense) peuvent être automatiques.
    """
    t = action.get("type")
    cost = float(action.get("cost_cad") or 0)
    if committed_this_month() + cost > CFG["budget"]["monthly_cap_cad"]:
        return "block"
    if cost > 0:
        return "ask" if t in CFG["ask_actions"] or t in CFG["auto_actions"] else "block"
    if t in CFG["auto_actions"]:
        return "auto"
    if t in CFG["ask_actions"]:
        return "ask"
    return "block"   # type inconnu = refusé
