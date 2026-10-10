import json, os, datetime, yaml, fcntl
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CFG = yaml.safe_load(open(os.path.join(BASE, "config.yaml"), encoding="utf-8"))
STATE = os.path.join(BASE, "state.json")
LOCK_FILE = STATE + ".lock"


def _locked(fn):
    """Exécute fn() avec un verrou exclusif sur state.json — empêche le cron
    du matin (main.py) et le bot conversationnel (chat.py) d'écraser l'un
    l'autre s'ils tournent au même moment (trouvé lors de l'audit du 2026-10-09)."""
    os.makedirs(os.path.dirname(LOCK_FILE), exist_ok=True) if os.path.dirname(LOCK_FILE) else None
    with open(LOCK_FILE, "w") as lf:
        fcntl.flock(lf, fcntl.LOCK_EX)
        try:
            return fn()
        finally:
            fcntl.flock(lf, fcntl.LOCK_UN)


def _load():
    try:
        return json.load(open(STATE))
    except Exception:
        return {}


def _month():
    return datetime.date.today().strftime("%Y-%m")


def committed_this_month():
    return _locked(lambda: float(_load().get(_month(), 0.0)))


def _channel_key(channel):
    return f"{_month()}::{channel}"


def committed_this_month_by_channel(channel):
    return _locked(lambda: float(_load().get(_channel_key(channel), 0.0)))


def record_commit(amount, channel=None):
    def _do():
        s = _load()
        s[_month()] = s.get(_month(), 0.0) + float(amount)
        if channel:
            s[_channel_key(channel)] = s.get(_channel_key(channel), 0.0) + float(amount)
        json.dump(s, open(STATE, "w"))
    _locked(_do)


# Vérifications de cohérence entre ce que l'agent DÉCLARE comme coût (cost_cad)
# et ce que son propre payload implique réellement. Trouvé lors de l'audit du
# 2026-10-09 : rien ne recoupait ces deux chiffres — un agent qui sous-déclare
# cost_cad pouvait faire passer une dépense bien plus grande que ce que le
# plafond mensuel est censé garantir. Ces règles sont volontairement
# conservatrices (mieux bloquer une action légitime par erreur que laisser
# passer une dépense mal déclarée).
_MONTHLY_DAYS = 30
_TOLERANCE = 0.9  # cost_cad peut être légèrement inférieur (arrondis), pas largement


def _declared_cost_is_plausible(action):
    t = action.get("type")
    payload = action.get("payload") or {}
    cost = float(action.get("cost_cad") or 0)

    daily = None
    if t == "new_campaign":
        daily = payload.get("daily_budget_cad")
    elif t == "budget_change":
        daily = payload.get("new_daily_budget_cad")

    if daily is None:
        return True  # rien à recouper pour ce type d'action

    try:
        daily = float(daily)
    except (TypeError, ValueError):
        return False  # payload malformé = refusé par précaution

    implied_monthly = daily * _MONTHLY_DAYS
    return cost >= implied_monthly * _TOLERANCE


def format_action_params(action):
    """Rend les paramètres structurés exacts qui vont réellement s'exécuter
    (tout sauf type/description/cost_cad), pour que l'approbation Telegram
    montre ce qui va VRAIMENT se passer, pas seulement le résumé en texte
    libre que l'agent a choisi d'écrire (audit du 2026-10-09, constat #2 :
    jusqu'ici un agent aurait pu écrire une description rassurante alors
    que les vrais paramètres faisaient autre chose — rien ne les comparait
    avant de montrer le bouton Approuver)."""
    hidden = {"type", "description", "cost_cad"}
    params = {k: v for k, v in action.items() if k not in hidden}
    if not params:
        return ""
    lines = "\n".join(f"  {k} = {v}" for k, v in params.items())
    return f"\nParamètres réels :\n{lines}"


def decide(action):
    """Retourne 'auto', 'ask' ou 'block'. Les règles viennent de config.yaml, pas de l'agent.

    RÈGLE DE SÉCURITÉ ABSOLUE, verrouillée ici dans le code (pas seulement dans
    config.yaml) : AUCUNE action qui coûte plus de 0$ ne peut jamais être 'auto'.
    Même si quelqu'un modifie config.yaml par erreur pour mettre une action
    payante dans auto_actions, cette ligne l'empêche de s'exécuter sans
    l'approbation de Dandoun sur Telegram. Seules les actions à coût nul ou
    négatif (ne dépensent rien, ou réduisent une dépense) peuvent être automatiques.

    Deuxième verrou (ajouté suite à l'audit du 2026-10-09) : si le payload
    contient un budget quotidien explicite (new_campaign, budget_change), le
    cost_cad déclaré par l'agent doit être cohérent avec ce budget — sinon
    blocage automatique, quel que soit le plafond restant.

    Troisième verrou (idem) : la répartition par canal décrite dans
    prompts/_context.md (≈250 $ Google / 200 $ Meta / 50 $ tests) n'était
    qu'une intention écrite, jamais vérifiée par le code — un agent (ou le
    Directeur, qui peut proposer une action Google via le chat) aurait pu
    dépenser tout le plafond de 500 $ sur un seul canal sans que rien ne
    l'arrête. Le canal se déduit du TYPE d'action (action_channel dans
    config.yaml), pas de qui la propose.
    """
    t = action.get("type")
    cost = float(action.get("cost_cad") or 0)

    if not _declared_cost_is_plausible(action):
        return "block"

    if committed_this_month() + cost > CFG["budget"]["monthly_cap_cad"]:
        return "block"

    channel = CFG.get("action_channel", {}).get(t)
    if channel and cost > 0:
        cap = CFG["budget"].get("channel_caps_cad", {}).get(channel)
        if cap is not None and committed_this_month_by_channel(channel) + cost > cap:
            return "block"

    if cost > 0:
        return "ask" if t in CFG["ask_actions"] or t in CFG["auto_actions"] else "block"
    if t in CFG["auto_actions"]:
        return "auto"
    if t in CFG["ask_actions"]:
        return "ask"
    return "block"   # type inconnu = refusé
