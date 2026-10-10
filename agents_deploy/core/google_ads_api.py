"""
Client partagé pour l'API Google Ads — utilisé par data_sources.py (lecture)
et executors.py (actions réelles : mot-clé négatif, pause, budget).
"""
import os
from google.ads.googleads.client import GoogleAdsClient

CAMPAIGN_NAME_LIKE = "KinéPulse"


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
    rows = list(ga_service.search(customer_id=customer_id(), query=query))
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
    """Retourne l'annonce active de la campagne, ou None."""
    ga_service = client.get_service("GoogleAdsService")
    query = f"""
        SELECT ad_group_ad.resource_name, ad_group_ad.status
        FROM ad_group_ad
        WHERE campaign.resource_name = '{campaign_resource_name}'
        LIMIT 1
    """
    rows = list(ga_service.search(customer_id=customer_id(), query=query))
    if not rows:
        return None
    r = rows[0]
    return {"resource_name": r.ad_group_ad.resource_name, "status": r.ad_group_ad.status.name}


def find_ad_group(client, campaign_resource_name):
    """Retourne le premier groupe d'annonces de la campagne, ou None."""
    ga_service = client.get_service("GoogleAdsService")
    query = f"""
        SELECT ad_group.resource_name, ad_group.status
        FROM ad_group
        WHERE campaign.resource_name = '{campaign_resource_name}'
        LIMIT 1
    """
    rows = list(ga_service.search(customer_id=customer_id(), query=query))
    if not rows:
        return None
    r = rows[0]
    return {"resource_name": r.ad_group.resource_name, "status": r.ad_group.status.name}
