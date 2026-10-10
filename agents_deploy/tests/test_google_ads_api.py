"""
Tests de la logique anti-ambiguïté de core/google_ads_api.py — sans
appeler la vraie API Google Ads (le client et le service sont simulés).

Le risque réel que ça protège : avant l'audit du 2026-10-09, un simple
LIMIT 1 pouvait faire agir le système sur la MAUVAISE campagne/annonce/
groupe d'annonces dès qu'une deuxième existe (ex. EMS en plus de
Massothérapie) — silencieusement, sans jamais le signaler.
"""
import pytest
from core.google_ads_api import (
    find_campaign, find_ad_group, find_ad_group_ad, AmbiguousCampaignError,
)


class _Row:
    """Simule une ligne de résultat GoogleAdsService.search()."""
    def __init__(self, **kwargs):
        for section, fields in kwargs.items():
            setattr(self, section, _Obj(**fields))


class _Obj:
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)


class _FakeStatus:
    def __init__(self, name):
        self.name = name


class _FakeService:
    """Simule GoogleAdsService : retourne des lignes pré-fabriquées selon
    le nombre voulu, peu importe la requête SQL exacte (on teste la
    logique de find_*, pas la construction de la requête)."""
    def __init__(self, rows):
        self._rows = rows
        self.calls = []

    def search(self, customer_id, query, timeout=None):
        self.calls.append({"customer_id": customer_id, "query": query, "timeout": timeout})
        return self._rows


class _FakeClient:
    def __init__(self, rows):
        self._service = _FakeService(rows)

    def get_service(self, name):
        return self._service


# ── find_campaign : LIKE ambigu doit lever, nom exact jamais ───────────────

def test_find_campaign_single_match_returns_it(fake_google_ads_env):
    row = _Row(campaign={
        "resource_name": "customers/1/campaigns/1", "id": 1,
        "status": _FakeStatus("ENABLED"), "campaign_budget": "customers/1/campaignBudgets/1",
        "name": "KinéPulse - Massothérapie - Search",
    })
    client = _FakeClient([row])
    result = find_campaign(client, name_like="KinéPulse")
    assert result["id"] == 1
    assert result["status"] == "ENABLED"


def test_find_campaign_no_match_returns_none(fake_google_ads_env):
    client = _FakeClient([])
    assert find_campaign(client, name_like="KinéPulse") is None


def test_find_campaign_ambiguous_match_raises_instead_of_picking_one(fake_google_ads_env):
    rows = [
        _Row(campaign={"resource_name": "c/1", "id": 1, "status": _FakeStatus("ENABLED"),
                        "campaign_budget": "b/1", "name": "KinéPulse - Massothérapie"}),
        _Row(campaign={"resource_name": "c/2", "id": 2, "status": _FakeStatus("PAUSED"),
                        "campaign_budget": "b/2", "name": "KinéPulse - EMS"}),
    ]
    client = _FakeClient(rows)
    with pytest.raises(AmbiguousCampaignError):
        find_campaign(client, name_like="KinéPulse")


def test_find_campaign_with_exact_name_never_raises_even_if_multiple_would_match_like(fake_google_ads_env):
    # exact_name utilise une requête WHERE name = '...' (jamais LIKE), donc
    # le FakeService n'a qu'une ligne possible ici — ce test vérifie juste
    # que le chemin exact_name ne déclenche jamais la vérification d'ambiguïté.
    row = _Row(campaign={"resource_name": "c/2", "id": 2, "status": _FakeStatus("PAUSED"),
                          "campaign_budget": "b/2", "name": "KinéPulse - EMS"})
    client = _FakeClient([row])
    result = find_campaign(client, exact_name="KinéPulse - EMS")
    assert result["id"] == 2


# ── find_ad_group / find_ad_group_ad : même principe, même protection ──────

def test_find_ad_group_single_match_returns_it(fake_google_ads_env):
    row = _Row(ad_group={"resource_name": "ag/1", "status": _FakeStatus("ENABLED")})
    client = _FakeClient([row])
    result = find_ad_group(client, "customers/1/campaigns/1")
    assert result["resource_name"] == "ag/1"


def test_find_ad_group_multiple_in_same_campaign_raises(fake_google_ads_env):
    rows = [
        _Row(ad_group={"resource_name": "ag/1", "status": _FakeStatus("ENABLED")}),
        _Row(ad_group={"resource_name": "ag/2", "status": _FakeStatus("ENABLED")}),
    ]
    client = _FakeClient(rows)
    with pytest.raises(AmbiguousCampaignError):
        find_ad_group(client, "customers/1/campaigns/1")


def test_find_ad_group_no_match_returns_none(fake_google_ads_env):
    client = _FakeClient([])
    assert find_ad_group(client, "customers/1/campaigns/1") is None


def test_find_ad_group_ad_multiple_ads_raises(fake_google_ads_env):
    rows = [
        _Row(ad_group_ad={"resource_name": "aga/1", "status": _FakeStatus("ENABLED")}),
        _Row(ad_group_ad={"resource_name": "aga/2", "status": _FakeStatus("ENABLED")}),
    ]
    client = _FakeClient(rows)
    with pytest.raises(AmbiguousCampaignError):
        find_ad_group_ad(client, "customers/1/campaigns/1")


def test_find_ad_group_ad_single_match_returns_it(fake_google_ads_env):
    row = _Row(ad_group_ad={"resource_name": "aga/1", "status": _FakeStatus("ENABLED")})
    client = _FakeClient([row])
    result = find_ad_group_ad(client, "customers/1/campaigns/1")
    assert result["resource_name"] == "aga/1"


# ── Timeout explicite sur chaque appel (constat #14 de l'audit) ────────────

def test_every_search_call_passes_an_explicit_timeout(fake_google_ads_env):
    row = _Row(campaign={"resource_name": "c/1", "id": 1, "status": _FakeStatus("ENABLED"),
                          "campaign_budget": "b/1", "name": "KinéPulse"})
    client = _FakeClient([row])
    find_campaign(client, name_like="KinéPulse")
    assert client._service.calls[0]["timeout"] is not None
    assert client._service.calls[0]["timeout"] > 0
