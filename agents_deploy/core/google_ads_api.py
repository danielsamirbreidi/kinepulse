"""
Client partagé pour l'API Google Ads — utilisé par data_sources.py (lecture)
et executors.py (actions réelles : mot-clé négatif, pause, budget).
"""
import os
from google.ads.googleads.client import GoogleAdsClient

CAMPAIGN_NAME_LIKE = "KinéPulse"


def get_client():
    return GoogleAdsClient.load_from_dict({
        "client_id": os.environ["GOOGLE_ADS_CLIENT_ID"],
        "client_secret": os.environ["GOOGLE_ADS_CLIENT_SECRET"],
        "refresh_token": os.environ["GOOGLE_ADS_REFRESH_TOKEN"],
        "use_proto_plus": True,
    })


def customer_id():
    return os.environ["GOOGLE_ADS_CUSTOMER_ID"].replace("-", "")


def find_campaign(client, name_like=CAMPAIGN_NAME_LIKE):
    """Retourne les infos de la première campagne correspondante, ou None."""
    ga_service = client.get_service("GoogleAdsService")
    query = f"""
        SELECT campaign.resource_name, campaign.id, campaign.status, campaign.campaign_budget
        FROM campaign
        WHERE campaign.name LIKE '%{name_like}%'
        LIMIT 1
    """
    rows = list(ga_service.search(customer_id=customer_id(), query=query))
    if not rows:
        return None
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
