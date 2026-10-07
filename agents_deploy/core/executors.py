"""
Un exécuteur par type d'action. Branchés un par un aux APIs réelles.
Google Ads : branché (mot-clé négatif, pause, budget).
Meta/Instagram, site, messages, avis : pas encore branchés (prochaine étape).
"""
from google.api_core import protobuf_helpers


def _todo(action):
    print(f"[À BRANCHER] {action['type']}: {action['description']}")
    return False


def add_negative_keyword(action):
    payload = action.get("payload", {})
    keyword = payload.get("keyword")
    if not keyword:
        print("[ERREUR] add_negative_keyword : 'keyword' manquant dans payload")
        return False
    try:
        from core.google_ads_api import get_client, customer_id, find_campaign
        client = get_client()
        campaign = find_campaign(client)
        if not campaign:
            print("[ERREUR] add_negative_keyword : campagne introuvable")
            return False
        criterion_service = client.get_service("CampaignCriterionService")
        op = client.get_type("CampaignCriterionOperation")
        crit = op.create
        crit.campaign = campaign["resource_name"]
        crit.negative = True
        crit.keyword.text = keyword
        crit.keyword.match_type = client.enums.KeywordMatchTypeEnum.BROAD
        criterion_service.mutate_campaign_criteria(customer_id=customer_id(), operations=[op])
        print(f"[FAIT] Mot-clé négatif ajouté : {keyword}")
        return True
    except Exception as e:
        print(f"[ERREUR] add_negative_keyword : {e}")
        return False


def pause_ad(action):
    try:
        from core.google_ads_api import get_client, customer_id, find_campaign, find_ad_group_ad
        client = get_client()
        campaign = find_campaign(client)
        if not campaign:
            print("[ERREUR] pause_ad : campagne introuvable")
            return False
        ad = find_ad_group_ad(client, campaign["resource_name"])
        if not ad:
            print("[ERREUR] pause_ad : annonce introuvable")
            return False
        service = client.get_service("AdGroupAdService")
        op = client.get_type("AdGroupAdOperation")
        op.update.resource_name = ad["resource_name"]
        op.update.status = client.enums.AdGroupAdStatusEnum.PAUSED
        op.update_mask.CopyFrom(protobuf_helpers.field_mask(None, op.update._pb))
        service.mutate_ad_group_ads(customer_id=customer_id(), operations=[op])
        print("[FAIT] Annonce mise en pause")
        return True
    except Exception as e:
        print(f"[ERREUR] pause_ad : {e}")
        return False


def budget_change(action):
    payload = action.get("payload", {})
    new_budget = payload.get("new_daily_budget_cad")
    if new_budget is None:
        print("[ERREUR] budget_change : 'new_daily_budget_cad' manquant dans payload")
        return False
    try:
        from core.google_ads_api import get_client, customer_id, find_campaign
        client = get_client()
        campaign = find_campaign(client)
        if not campaign:
            print("[ERREUR] budget_change : campagne introuvable")
            return False
        service = client.get_service("CampaignBudgetService")
        op = client.get_type("CampaignBudgetOperation")
        op.update.resource_name = campaign["budget_resource_name"]
        op.update.amount_micros = int(float(new_budget) * 1_000_000)
        op.update_mask.CopyFrom(protobuf_helpers.field_mask(None, op.update._pb))
        service.mutate_campaign_budgets(customer_id=customer_id(), operations=[op])
        print(f"[FAIT] Budget quotidien changé à {new_budget} $ CAD")
        return True
    except Exception as e:
        print(f"[ERREUR] budget_change : {e}")
        return False


EXECUTORS = {
    "add_negative_keyword": add_negative_keyword,   # Google Ads — branché
    "pause_ad": pause_ad,                            # Google Ads — branché
    "budget_change": budget_change,                  # Google Ads — branché
    "new_campaign": _todo,     # Meta/Google — prochaine étape
    "new_creative": _todo,
    "post_content": _todo,     # Google Business Profile / Meta
    "reply_review": _todo,     # Google Business Profile
    "send_message": _todo,
    "site_change": _todo,
    "log_report": lambda a: True,
}
