"""
Fixtures partagées : isolent chaque test de l'état réel sur disque
(state.json, memory/health.json, memory/site_backups.jsonl) pour ne
JAMAIS toucher aux vraies données de production pendant les tests.
"""
import sys
import os

# Permet "from core import ..." quand pytest est lancé depuis n'importe où
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest


@pytest.fixture
def isolated_state(tmp_path, monkeypatch):
    """Redirige core.guard vers un state.json/lock jetables."""
    from core import guard
    state_file = tmp_path / "state.json"
    monkeypatch.setattr(guard, "STATE", str(state_file))
    monkeypatch.setattr(guard, "LOCK_FILE", str(state_file) + ".lock")
    return guard


@pytest.fixture
def isolated_backup(tmp_path, monkeypatch):
    """Redirige core.backup vers un site_backups.jsonl jetable."""
    from core import backup
    backup_file = tmp_path / "site_backups.jsonl"
    monkeypatch.setattr(backup, "BACKUP_FILE", str(backup_file))
    return backup


@pytest.fixture
def isolated_health(tmp_path, monkeypatch):
    """Redirige core.health vers un health.json jetable."""
    from core import health
    health_file = tmp_path / "health.json"
    monkeypatch.setattr(health, "HEALTH_FILE", str(health_file))
    return health


@pytest.fixture
def fake_google_ads_env(monkeypatch):
    """Fournit de fausses variables d'environnement Google Ads — les tests
    de core/google_ads_api.py simulent le client/service (aucun appel réseau
    réel), mais customer_id() lit l'environnement à chaque appel."""
    monkeypatch.setenv("GOOGLE_ADS_CUSTOMER_ID", "123-456-7890")
