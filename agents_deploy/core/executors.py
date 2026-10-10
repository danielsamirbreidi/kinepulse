"""
Un exécuteur par type d'action. Branchés un par un aux APIs réelles.
Google Ads : branché (mot-clé négatif, pause annonce, pause/reprise campagne,
changement de budget, création de nouvelle campagne, nouvelle annonce/créatif).
Site (changements à faire sur kinepulse.ca) : notifie Dandoun avec les détails
complets sur Telegram pour qu'il demande l'implémentation (pas d'accès direct
au code du site depuis l'agent).
Meta/Instagram, messages, avis Google : pas encore branchés (bloqués ou à venir).
"""
from google.api_core import protobuf_helpers
from core import telegram


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
            telegram.notify("❌ add_negative_keyword : campagne introuvable.")
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
        telegram.notify(f"❌ Erreur en ajoutant le mot-clé négatif '{keyword}' : {e}")
        return False


def pause_ad(action):
    try:
        from core.google_ads_api import get_client, customer_id, find_campaign, find_ad_group_ad
        client = get_client()
        campaign = find_campaign(client)
        if not campaign:
            print("[ERREUR] pause_ad : campagne introuvable")
            telegram.notify("❌ pause_ad : campagne introuvable.")
            return False
        ad = find_ad_group_ad(client, campaign["resource_name"])
        if not ad:
            print("[ERREUR] pause_ad : annonce introuvable")
            telegram.notify("❌ pause_ad : annonce introuvable.")
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
        telegram.notify(f"❌ Erreur en mettant l'annonce en pause : {e}")
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
            telegram.notify("❌ budget_change : campagne introuvable.")
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
        telegram.notify(f"❌ Erreur en changeant le budget : {e}")
        return False


def _set_campaign_status(status_name):
    def _run(action):
        try:
            from core.google_ads_api import get_client, customer_id, find_campaign
            client = get_client()
            campaign = find_campaign(client)
            if not campaign:
                print(f"[ERREUR] campagne introuvable")
                telegram.notify(f"❌ Changement de statut ({status_name}) : campagne introuvable.")
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
            telegram.notify(f"❌ Erreur en changeant le statut de la campagne ({status_name}) : {e}")
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



def new_creative(action):
    """Ajoute une nouvelle annonce (variante créative) au groupe d'annonces
    existant, avec de nouveaux titres/descriptions. L'annonce est activée
    immédiatement — Google fait automatiquement tourner les variantes et
    privilégie les meilleures avec le temps. Ne crée pas de nouvelle dépense
    en soi (reste dans le même budget de campagne)."""
    payload = action.get("payload", {})
    headlines = payload.get("headlines", [])
    descriptions = payload.get("descriptions", [])
    final_url = payload.get("final_url", "https://kinepulse.ca")

    if len(headlines) < 3 or len(descriptions) < 2:
        print("[ERREUR] new_creative : il faut au moins 3 titres et 2 descriptions")
        return False

    try:
        from core.google_ads_api import get_client, customer_id, find_campaign, find_ad_group
        client = get_client()
        cid = customer_id()
        campaign = find_campaign(client)
        if not campaign:
            print("[ERREUR] new_creative : campagne introuvable")
            return False
        ad_group = find_ad_group(client, campaign["resource_name"])
        if not ad_group:
            print("[ERREUR] new_creative : groupe d'annonces introuvable")
            return False

        service = client.get_service("AdGroupAdService")
        op = client.get_type("AdGroupAdOperation")
        ad_group_ad = op.create
        ad_group_ad.ad_group = ad_group["resource_name"]
        ad_group_ad.status = client.enums.AdGroupAdStatusEnum.ENABLED
        ad_group_ad.ad.final_urls.append(final_url)
        for h in headlines[:15]:
            headline = client.get_type("AdTextAsset")
            headline.text = h
            ad_group_ad.ad.responsive_search_ad.headlines.append(headline)
        for d in descriptions[:4]:
            desc = client.get_type("AdTextAsset")
            desc.text = d
            ad_group_ad.ad.responsive_search_ad.descriptions.append(desc)
        service.mutate_ad_group_ads(customer_id=cid, operations=[op])
        print(f"[FAIT] Nouvelle annonce créée avec {len(headlines)} titres et {len(descriptions)} descriptions")
        return True
    except Exception as e:
        print(f"[ERREUR] new_creative : {e}")
        return False


def site_change(action):
    """Modifie réellement un fichier du site sur GitHub (ce qui met à jour
    kinepulse.ca automatiquement). Le payload doit contenir 'file' (chemin
    du fichier), 'find' (texte exact actuel à remplacer, doit apparaître
    UNE SEULE fois) et 'replace' (nouveau texte). Si ce format précis n'est
    pas fourni (ex: changement trop complexe pour un simple find/replace),
    on envoie les détails sur Telegram à la place, pour implémentation manuelle."""
    payload = action.get("payload", {})
    file_path = payload.get("file")
    find = payload.get("find")
    replace = payload.get("replace")
    details = payload.get("details") or action.get("description", "")

    if not (file_path and find and replace):
        try:
            telegram.notify(
                "🌐 Changement de site proposé (trop complexe pour une exécution automatique) — "
                "à demander à Claude pour l'implémenter :\n\n" + details
            )
            print("[FAIT] Détails du changement de site envoyés sur Telegram (implémentation manuelle)")
            return True
        except Exception as e:
            print(f"[ERREUR] site_change (notification) : {e}")
            return False

    try:
        from core.github_api import get_file, update_file
        from core import backup
        current = get_file(file_path)
        if not current:
            telegram.notify(f"❌ site_change : fichier introuvable sur GitHub : {file_path}")
            print(f"[ERREUR] site_change : fichier introuvable : {file_path}")
            return False

        count = current["content"].count(find)
        if count != 1:
            telegram.notify(
                f"❌ site_change : le texte à remplacer apparaît {count} fois dans {file_path} "
                f"(il en faut exactement 1) — changement annulé par sécurité.\n\nDétails : {details}"
            )
            print(f"[ERREUR] site_change : 'find' trouvé {count} fois, attendu 1")
            return False

        new_content = current["content"].replace(find, replace)

        from core.html_check import is_html_balanced
        if file_path.endswith(".html") and not is_html_balanced(new_content):
            telegram.notify(
                f"❌ site_change annulé par sécurité : le remplacement casserait une balise HTML "
                f"dans {file_path} (balises mal équilibrées après le changement).\n\nDétails : {details}"
            )
            print(f"[ERREUR] site_change : HTML mal équilibré après remplacement dans {file_path}, annulé")
            return False

        # Sauvegarde du contenu AVANT modification, pour pouvoir revenir en arrière
        backup.save_backup(file_path, current["content"], details)

        update_file(
            file_path, new_content, current["sha"],
            message=f"Agent Conversion : {details[:200]}"
        )
        telegram.notify(f"✅ Site modifié : {file_path}\n\n{details}\n\n(une sauvegarde de l'ancienne version a été gardée — dis \"annule le dernier changement de {file_path}\" pour revenir en arrière)")
        print(f"[FAIT] {file_path} modifié directement sur GitHub (sauvegarde créée)")
        return True
    except Exception as e:
        telegram.notify(f"❌ Erreur en modifiant le site : {e}")
        print(f"[ERREUR] site_change : {e}")
        return False


def site_rollback(action):
    """Restaure la dernière version sauvegardée d'un fichier du site (avant
    le dernier site_change effectué sur ce fichier). Payload : {'file': '...'}"""
    payload = action.get("payload", {})
    file_path = payload.get("file")
    if not file_path:
        print("[ERREUR] site_rollback : 'file' manquant dans payload")
        return False
    try:
        from core.github_api import get_file, update_file
        from core import backup
        last = backup.get_last_backup(file_path)
        if not last:
            telegram.notify(f"❌ Aucune sauvegarde trouvée pour {file_path} — impossible de revenir en arrière.")
            print(f"[ERREUR] site_rollback : aucune sauvegarde pour {file_path}")
            return False
        current = get_file(file_path)
        if not current:
            telegram.notify(f"❌ site_rollback : fichier introuvable sur GitHub : {file_path}")
            return False
        update_file(
            file_path, last["content"], current["sha"],
            message=f"Retour arrière demandé par Dandoun : {file_path}"
        )
        telegram.notify(f"↩️ {file_path} restauré à la version d'avant le dernier changement (sauvegardée le {last['date']}).")
        print(f"[FAIT] {file_path} restauré depuis la sauvegarde du {last['date']}")
        return True
    except Exception as e:
        telegram.notify(f"❌ Erreur en restaurant le site : {e}")
        print(f"[ERREUR] site_rollback : {e}")
        return False


EXECUTORS = {
    "add_negative_keyword": add_negative_keyword,   # Google Ads — branché
    "pause_ad": pause_ad,                            # Google Ads — branché
    "pause_campaign": pause_campaign,                 # Google Ads — branché
    "enable_campaign": enable_campaign,               # Google Ads — branché
    "budget_change": budget_change,                   # Google Ads — branché
    "new_campaign": new_campaign,                     # Google Ads — branché (créée EN PAUSE)
    "new_creative": new_creative,                     # Google Ads — branché (nouvelle annonce/variante)
    "site_change": site_change,                       # Branché (modifie le site, garde une sauvegarde avant)
    "site_rollback": site_rollback,                   # Branché (restaure la dernière sauvegarde d'un fichier)
    "post_content": _todo,     # Meta — à venir
    "reply_review": _todo,     # Bloqué : Google restreint cet accès API aux grandes plateformes
    "send_message": _todo,     # Meta — à venir
    "log_report": lambda a: True,
}
