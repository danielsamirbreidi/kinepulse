"""
Tests du suivi de santé des agents (core/health.py) — décide quand
alerter Dandoun sur un agent en échec persistant.
"""


def test_single_failure_does_not_alert(isolated_health):
    h = isolated_health
    h.record_failure("google", "erreur réseau temporaire")
    assert h.should_alert("google") is False


def test_two_consecutive_failures_do_alert(isolated_health):
    h = isolated_health
    h.record_failure("google", "erreur 1")
    h.record_failure("google", "erreur 2")
    assert h.should_alert("google") is True


def test_success_resets_the_failure_streak(isolated_health):
    h = isolated_health
    h.record_failure("google", "erreur 1")
    h.record_success("google")
    h.record_failure("google", "erreur 2")
    # Une seule panne depuis le dernier succès — pas encore d'alerte.
    assert h.should_alert("google") is False


def test_consecutive_failures_counter_increments_correctly(isolated_health):
    h = isolated_health
    n1 = h.record_failure("seo", "e1")
    n2 = h.record_failure("seo", "e2")
    n3 = h.record_failure("seo", "e3")
    assert (n1, n2, n3) == (1, 2, 3)


def test_agents_are_tracked_independently(isolated_health):
    h = isolated_health
    h.record_failure("google", "e1")
    h.record_failure("google", "e2")
    h.record_failure("meta", "e1")  # un seul échec pour meta
    assert h.should_alert("google") is True
    assert h.should_alert("meta") is False


def test_should_alert_on_unknown_agent_is_false():
    from core import health
    assert health.should_alert("agent_qui_nexiste_pas") is False
