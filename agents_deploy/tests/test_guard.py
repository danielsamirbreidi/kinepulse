"""
Tests du garde-fou budgétaire (core/guard.py) — le composant le plus
critique du système : c'est lui qui empêche une dépense non approuvée.
Chaque test ici protège directement de l'argent réel.
"""


def action(type_, cost_cad=0, payload=None, description="test"):
    return {"type": type_, "description": description, "cost_cad": cost_cad, "payload": payload or {}}


# ── Règle absolue : rien qui coûte > 0$ ne peut jamais être "auto" ──────────

def test_paid_action_is_never_auto_even_if_listed_in_auto_actions(isolated_state, monkeypatch):
    g = isolated_state
    # Même si on force add_negative_keyword (normalement gratuit) à coûter
    # quelque chose, la règle verrouillée dans le code doit bloquer "auto".
    a = action("add_negative_keyword", cost_cad=5)
    assert g.decide(a) != "auto"


def test_free_auto_action_is_auto(isolated_state):
    g = isolated_state
    a = action("add_negative_keyword", cost_cad=0)
    assert g.decide(a) == "auto"


def test_unknown_action_type_is_blocked(isolated_state):
    g = isolated_state
    a = action("delete_everything", cost_cad=0)
    assert g.decide(a) == "block"


def test_paid_action_in_ask_actions_asks(isolated_state):
    g = isolated_state
    # 2$/jour * 30 = 60$/mois ; cost_cad=60 est cohérent avec le payload
    # (pas de sous-déclaration), donc ce verrou-ci laisse passer vers "ask".
    a = action("budget_change", cost_cad=60, payload={"new_daily_budget_cad": 2})
    assert g.decide(a) == "ask"


# ── Recoupement cost_cad déclaré vs payload réel ────────────────────────────

def test_budget_change_with_cost_consistent_with_payload_is_allowed(isolated_state):
    g = isolated_state
    # 10$/jour * 30 jours = 300$/mois — cost_cad déclaré à 290$ est dans la
    # tolérance (0.9x) et doit passer ce verrou (le plafond global peut
    # ensuite bloquer séparément, mais pas ce verrou-ci).
    a = action("budget_change", cost_cad=290, payload={"new_daily_budget_cad": 10})
    assert g._declared_cost_is_plausible(a) is True


def test_budget_change_with_underdeclared_cost_is_blocked(isolated_state):
    g = isolated_state
    # 10$/jour * 30 jours = 300$/mois, mais l'agent déclare seulement 20$ —
    # sous-déclaration massive, doit être bloqué par ce verrou précis.
    a = action("budget_change", cost_cad=20, payload={"new_daily_budget_cad": 10})
    assert g._declared_cost_is_plausible(a) is False
    assert g.decide(a) == "block"


def test_new_campaign_with_malformed_daily_budget_is_blocked_by_precaution(isolated_state):
    g = isolated_state
    a = action("new_campaign", cost_cad=100, payload={"daily_budget_cad": "pas un nombre"})
    assert g._declared_cost_is_plausible(a) is False


def test_action_type_without_daily_budget_field_skips_this_check(isolated_state):
    g = isolated_state
    # add_negative_keyword n'a pas de champ budget quotidien à recouper —
    # ce verrou-ci ne doit rien bloquer pour ce type d'action.
    a = action("add_negative_keyword", cost_cad=0, payload={"keyword": "gratuit"})
    assert g._declared_cost_is_plausible(a) is True


# ── Plafond mensuel global ──────────────────────────────────────────────────

def test_action_exceeding_monthly_cap_is_blocked(isolated_state):
    g = isolated_state
    g.record_commit(480, channel=None)  # proche du plafond de 500$
    a = action("new_creative", cost_cad=30)  # 480 + 30 = 510 > 500
    assert g.decide(a) == "block"


def test_action_within_remaining_monthly_cap_is_allowed(isolated_state):
    g = isolated_state
    g.record_commit(100, channel=None)
    a = action("new_creative", cost_cad=30)  # 100 + 30 = 130 <= 500
    assert g.decide(a) == "ask"


# ── Plafonds par canal (Google / Meta / tests) ──────────────────────────────

def test_action_exceeding_its_channel_cap_is_blocked_even_under_global_cap(isolated_state):
    g = isolated_state
    # Plafond Google = 250$. On en commet déjà 240$ sur le canal google.
    g.record_commit(240, channel="google")
    # budget_change est mappé sur le canal "google" dans config.yaml.
    a = action("budget_change", cost_cad=20, payload={"new_daily_budget_cad": 1})
    # 240 + 20 = 260 > 250 (plafond du canal) alors que 240 + 20 = 260 < 500 (plafond global)
    assert g.decide(a) == "block"


def test_spending_on_one_channel_does_not_affect_another_channels_cap(isolated_state):
    g = isolated_state
    g.record_commit(240, channel="google")
    # post_content est mappé sur "meta" — indépendant du canal google.
    a = action("post_content", cost_cad=20)
    assert g.decide(a) == "ask"


# ── format_action_params : transparence de l'approbation Telegram ──────────

def test_format_action_params_shows_real_payload_not_just_description(isolated_state):
    g = isolated_state
    a = action("budget_change", cost_cad=50, payload={"new_daily_budget_cad": 10}, description="Augmente le budget")
    rendered = g.format_action_params(a)
    assert "new_daily_budget_cad" in rendered
    assert "10" in rendered


def test_format_action_params_empty_when_no_extra_params(isolated_state):
    g = isolated_state
    a = {"type": "pause_campaign", "description": "stop", "cost_cad": 0}
    assert g.format_action_params(a) == ""


# ── record_commit : état persistant correct ─────────────────────────────────

def test_record_commit_accumulates_across_calls(isolated_state):
    g = isolated_state
    g.record_commit(10, channel="google")
    g.record_commit(15, channel="google")
    assert g.committed_this_month() == 25
    assert g.committed_this_month_by_channel("google") == 25


def test_record_commit_without_channel_only_updates_global_total(isolated_state):
    g = isolated_state
    g.record_commit(10, channel=None)
    assert g.committed_this_month() == 10
    assert g.committed_this_month_by_channel("google") == 0
