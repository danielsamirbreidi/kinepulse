"""
Un exécuteur par type d'action. Branchés un par un aux APIs réelles.
Google Ads : branché (mot-clé négatif, pause annonce, pause/reprise campagne,
changement de budget, création de nouvelle campagne).
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


def _set_campaign_status(status_name):
    def _run(action):
        try:
            from core.google_ads_api import get_client, customer_id, find_campaign
            client = get_client()
            campaign = find_campaign(client)
            if not campaign:
                print(f"[ERREUR] campagne introuvable")
                return False
            service = client.get_service("CampaignService")
            op = client.get_type("CampaignOperation")
            op.update.resource_name = campaign["resource_name"]
            op.update.status = getattr(client.enums.CampaignStatusEnum, status_name)
            op.update_mask.CopyFrom(protobuf_helpers.field_mask(None, op.update._pb))
            service.mutate_campaigns(customer_id=customer_id(), operations=[op])
            print(f"[FAIT] Campagne mise au statut {status_name}")
            return True
        except Exception as e:
            print(f"[ERREUR] changement de statut campagne ({status_name}) : {e}")
            return False
    return _run


pause_campaign = _set_campaign_status("PAUSED")
enable_campaign = _set_campaign_status("ENABLED")


def new_campaign(action):
    """Crée une nouvelle campagne Search Google Ads, toujours EN PAUSE pour
    sécurité — doit être activée séparément via 'enable_campaign' (approbation
    distincte) avant de dépenser quoi que ce soit."""
    payload = action.get("payload", {})
    name = payload.get("name")
    daily_budget_cad = payload.get("daily_budget_cad")
    final_url = payload.get("final_url", "https://kinepulse.ca")
    keywords = payload.get("keywords", [])
    negative_keywords = payload.get("negative_keywords", [])
    headlines = payload.get("headlines", [])
    descriptions = payload.get("descriptions", [])

    if not name or not daily_budget_cad or not keywords or not headlines or not descriptions:
        print("[ERREUR] new_campaign : payload incomplet (name, daily_budget_cad, keywords, headlines, descriptions requis)")
        return False

    try:
        from core.google_ads_api import get_client, customer_id
        client = get_client()
        cid = customer_id()

        budget_service = client.get_service("CampaignBudgetService")
        budget_op = client.get_type("CampaignBudgetOperation")
        budget = budget_op.create
        budget.name = f"Budget {name} {__import__('time').time():.0f}"
        budget.amount_micros = int(float(daily_budget_cad) * 1_000_000)
        budget.delivery_method = client.enums.BudgetDeliveryMethodEnum.STANDARD
        budget_resp = budget_service.mutate_campaign_budgets(customer_id=cid, operations=[budget_op])
        budget_resource_name = budget_resp.results[0].resource_name

        campaign_service = client.get_service("CampaignService")
        campaign_op = client.get_type("CampaignOperation")
        campaign = campaign_op.create
        campaign.name = name
        campaign.advertising_channel_type = client.enums.AdvertisingChannelTypeEnum.SEARCH
        campaign.status = client.enums.CampaignStatusEnum.PAUSED
        campaign.campaign_budget = budget_resource_name
        campaign.network_settings.target_google_search = True
        campaign.network_settings.target_search_network = False
        campaign.network_settings.target_content_network = False
        campaign.network_settings.target_partner_search_network = False
        campaign.manual_cpc.enhanced_cpc_enabled = False
        campaign_resp = campaign_service.mutate_campaigns(customer_id=cid, operations=[campaign_op])
        campaign_resource_name = campaign_resp.results[0].resource_name

        criterion_service = client.get_service("CampaignCriterionService")
        geo_op = client.get_type("CampaignCriterionOperation")
        geo_op.create.campaign = campaign_resource_name
        geo_op.create.location.geo_target_constant = "geoTargetConstants/1002316"  # Montréal, QC
        lang_op = client.get_type("CampaignCriterionOperation")
        lang_op.create.campaign = campaign_resource_name
        lang_op.create.language.language_constant = "languageConstants/1002"  # français
        criterion_service.mutate_campaign_criteria(customer_id=cid, operations=[geo_op, lang_op])

        if negative_keywords:
            neg_ops = []
            for kw in negative_keywords:
                op = client.get_type("CampaignCriterionOperation")
                op.create.campaign = campaign_resource_name
                op.create.negative = True
                op.create.keyword.text = kw
                op.create.keyword.match_type = client.enums.KeywordMatchTypeEnum.BROAD
                neg_ops.append(op)
            criterion_service.mutate_campaign_criteria(customer_id=cid, operations=neg_ops)

        ad_group_service = client.get_service("AdGroupService")
        ag_op = client.get_type("AdGroupOperation")
        ag_op.create.name = f"{name} - groupe principal"
        ag_op.create.campaign = campaign_resource_name
        ag_op.create.status = client.enums.AdGroupStatusEnum.ENABLED
        ag_op.create.cpc_bid_micros = 2_500_000
        ag_resp = ad_group_service.mutate_ad_groups(customer_id=cid, operations=[ag_op])
        ad_group_resource_name = ag_resp.results[0].resource_name

        kw_service = client.get_service("AdGroupCriterionService")
        kw_ops = []
        for kw in keywords:
            op = client.get_type("AdGroupCriterionOperation")
            op.create.ad_group = ad_group_resource_name
            op.create.status = client.enums.AdGroupCriterionStatusEnum.ENABLED
            op.create.keyword.text = kw
            op.create.keyword.match_type = client.enums.KeywordMatchTypeEnum.EXACT
            kw_ops.append(op)
        kw_service.mutate_ad_group_criteria(customer_id=cid, operations=kw_ops)

        ad_group_ad_service = client.get_service("AdGroupAdService")
        ad_op = client.get_type("AdGroupAdOperation")
        ad_group_ad = ad_op.create
        ad_group_ad.ad_group = ad_group_resource_name
        ad_group_ad.status = client.enums.AdGroupAdStatusEnum.ENABLED
        ad_group_ad.ad.final_urls.append(final_url)
        for h in headlines:
            headline = client.get_type("AdTextAsset")
            headline.text = h
            ad_group_ad.ad.responsive_search_ad.headlines.append(headline)
        for d in descriptions:
            desc = client.get_type("AdTextAsset")
            desc.text = d
            ad_group_ad.ad.responsive_search_ad.descriptions.append(desc)
        ad_group_ad_service.mutate_ad_group_ads(customer_id=cid, operations=[ad_op])

        print(f"[FAIT] Nouvelle campagne créée EN PAUSE : {name} ({campaign_resource_name})")
        return True
    except Exception as e:
        print(f"[ERREUR] new_campaign : {e}")
        return False


EXECUTORS = {
    "add_negative_keyword": add_negative_keyword,   # Google Ads — branché
    "pause_ad": pause_ad,                            # Google Ads — branché
    "pause_campaign": pause_campaign,                 # Google Ads — branché
    "enable_campaign": enable_campaign,               # Google Ads — branché
    "budget_change": budget_change,                   # Google Ads — branché
    "new_campaign": new_campaign,                     # Google Ads — branché (créée EN PAUSE)
    "new_creative": _todo,     # Meta — prochaine étape
    "post_content": _todo,     # Google Business Profile / Meta
    "reply_review": _todo,     # Google Business Profile
    "send_message": _todo,
    "site_change": _todo,
    "log_report": lambda a: True,
}
