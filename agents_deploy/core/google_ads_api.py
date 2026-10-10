"""
Client partagé pour l'API Google Ads — utilisé par data_sources.py (lecture)
et executors.py (actions réelles : mot-clé négatif, pause, budget).
"""
import os
from google.ads.googleads.client import GoogleAdsClient

CAMPAIGN_NAME_LIKE = "KinéPulse"

# Timeout explicite sur chaque appel Google Ads — sans ça, un appel lent ou
# bloqué pouvait geler toute la boucle de conversation Telegram (chat.py),
# empêchant même de répondre "je n'ai pas réussi à vérifier" (audit du
# 2026-10-09, constat #14).
API_TIMEOUT_SECONDS = 20


class AmbiguousCampaignError(Exception):
    """Levée quand plusieurs campagnes correspondent au nom recherché — on
    refuse d'agir plutôt que de choisir au hasard (trouvé lors de l'audit du
    2026-10-09 : un simple LIMIT 1 pouvait silencieusement toucher la mauvaise
    campagne dès qu'une 2e campagne KinéPulse existe, ex. EMS)."""
    pass


def get_client():
    return GoogleAdsClient.load_from_dict({
        "client_id": os.environ["GOOGLE_ADS_CLIENT_ID"],
        "client_secret": os.environ["GOOGLE_ADS_CLIENT_SECRET"],
        "refresh_token": os.environ["GOOGLE_ADS_REFRESH_TOKEN"],
        "use_proto_plus": True,
    })


def customer_id():
    return os.environ["GOOGLE_ADS_CUSTOMER_ID"].replace("-", "")


def find_campaign(client, name_like=CAMPAIGN_NAME_LIKE, exact_name=None):
    """Retourne les infos de la campagne correspondante, ou None si aucune.

    Si exact_name est fourni, cherche une correspondance EXACTE (sûr même
    avec plusieurs campagnes). Sinon, cherche par correspondance approximative
    (name_like) et lève AmbiguousCampaignError si PLUSIEURS campagnes
    correspondent — on ne choisit jamais au hasard entre deux campagnes
    réelles, on refuse et on le signale."""
    ga_service = client.get_service("GoogleAdsService")
    if exact_name:
        query = f"""
            SELECT campaign.resource_name, campaign.id, campaign.status, campaign.campaign_budget
            FROM campaign
            WHERE campaign.name = '{exact_name}'
            LIMIT 1
        """
    else:
        query = f"""
            SELECT campaign.resource_name, campaign.id, campaign.status, campaign.campaign_budget, campaign.name
            FROM campaign
            WHERE campaign.name LIKE '%{name_like}%'
        """
    rows = list(ga_service.search(customer_id=customer_id(), query=query, timeout=API_TIMEOUT_SECONDS))
    if not rows:
        return None
    if not exact_name and len(rows) > 1:
        names = [r.campaign.name for r in rows]
        raise AmbiguousCampaignError(
            f"{len(rows)} campagnes correspondent à '{name_like}' : {names}. "
            "Précise le nom exact de la campagne pour agir en sécurité."
        )
    r = rows[0]
    return {
        "resource_name": r.campaign.resource_name,
        "id": r.campaign.id,
        "status": r.campaign.status.name,
        "budget_resource_name": r.campaign.campaign_budget,
    }


def find_ad_group_ad(client, campaign_resource_name):
    """Retourne l'annonce active de la campagne. Lève AmbiguousCampaignError
    si plusieurs annonces existent dans cette campagne (trouvé lors de
    l'audit du 2026-10-09, même principe que find_campaign : ne jamais
    choisir au hasard entre deux objets réels)."""
    ga_service = client.get_service("GoogleAdsService")
    query = f"""
        SELECT ad_group_ad.resource_name, ad_group_ad.status
        FROM ad_group_ad
        WHERE campaign.resource_name = '{campaign_resource_name}'
    """
    rows = list(ga_service.search(customer_id=customer_id(), query=query, timeout=API_TIMEOUT_SECONDS))
    if not rows:
        return None
    if len(rows) > 1:
        raise AmbiguousCampaignError(
            f"{len(rows)} annonces trouvées dans la campagne {campaign_resource_name}. "
            "Précise laquelle cibler pour agir en sécurité."
        )
    r = rows[0]
    return {"resource_name": r.ad_group_ad.resource_name, "status": r.ad_group_ad.status.name}


def find_ad_group(client, campaign_resource_name):
    """Retourne le groupe d'annonces de la campagne. Lève
    AmbiguousCampaignError si plusieurs groupes d'annonces existent dans
    cette campagne (même principe que find_campaign)."""
    ga_service = client.get_service("GoogleAdsService")
    query = f"""
        SELECT ad_group.resource_name, ad_group.status
        FROM ad_group
        WHERE campaign.resource_name = '{campaign_resource_name}'
    """
    rows = list(ga_service.search(customer_id=customer_id(), query=query, timeout=API_TIMEOUT_SECONDS))
    if not rows:
        return None
    if len(rows) > 1:
        raise AmbiguousCampaignError(
            f"{len(rows)} groupes d'annonces trouvés dans la campagne {campaign_resource_name}. "
            "Précise lequel cibler pour agir en sécurité."
        )
    r = rows[0]
    return {"resource_name": r.ad_group.resource_name, "status": r.ad_group.status.name}
