# Collecte des données réelles pour chaque agent. Aucun chiffre inventé :
# tout vient directement de Notion (lecture seule). Les agents sans source
# branchée (aucune campagne active pour l'instant) reçoivent une note claire
# plutôt que des données fictives.

import os
import requests
from datetime import datetime, timedelta

NOTION_VERSION = "2025-09-03"
DS_RENDEZVOUS = "3aa36ea7-3613-8049-82d0-000b6ac93dea"
DS_LEADS_EMS = "bb23ddce-e51d-487e-9eb5-4c20590d5889"
DS_CLIENTS = "39936ea7-3613-8005-86b9-000b8195be50"
DS_EMS_MEMBERSHIP = "3aa36ea7-3613-8009-844c-000b3b0dc38d"

SOURCE_OPTIONS = [
    "Recherche Google",
    "Facebook / Instagram",
    "Ami ou famille",
    "Passage devant la clinique",
    "Recommandation d'un professionnel de la santé",
    "Autre",
]


def _notion_headers():
    token = os.environ.get("NOTION_TOKEN", "")
    return {
        "Authorization": f"Bearer {token}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    }


def _query_data_source(data_source_id, body=None, timeout=20):
    """Interroge une base Notion. Retourne une liste vide en cas d'erreur
    (jamais d'exception qui casserait tout l'agent pour un problème réseau)."""
    url = f"https://api.notion.com/v1/data_sources/{data_source_id}/query"
    try:
        res = requests.post(url, headers=_notion_headers(), json=body or {}, timeout=timeout)
        if res.status_code >= 300:
            return {"error": f"Notion {res.status_code}: {res.text[:300]}", "results": []}
        return res.json()
    except Exception as e:
        return {"error": str(e), "results": []}


def _title_text(prop):
    if not prop or not prop.get("title"):
        return ""
    return "".join(t.get("plain_text", "") for t in prop["title"])


def _count_by_source(results, source_property="Source", date_property="Date", days=30):
    """Compte les entrées par source, sur les N derniers jours."""
    cutoff = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    counts = {opt: 0 for opt in SOURCE_OPTIONS}
    counts["(non renseignée)"] = 0
    total_in_window = 0

    for page in results:
        props = page.get("properties", {})
        date_val = (props.get(date_property) or {}).get("date") or {}
        date_start = date_val.get("start", "")
        if date_start and date_start < cutoff:
            continue
        total_in_window += 1

        source_val = (props.get(source_property) or {}).get("select")
        source_name = source_val.get("name") if source_val else None
        if source_name in counts:
            counts[source_name] += 1
        else:
            counts["(non renseignée)"] += 1

    return counts, total_in_window


def _collect_tracking():
    rdv_data = _query_data_source(DS_RENDEZVOUS)
    ems_data = _query_data_source(DS_LEADS_EMS)

    if rdv_data.get("error") or ems_data.get("error"):
        return {
            "erreur": True,
            "detail_rendezvous": rdv_data.get("error"),
            "detail_leads_ems": ems_data.get("error"),
            "note": "Échec de lecture Notion — vérifier le token et le partage des bases.",
        }

    rdv_counts, rdv_total = _count_by_source(rdv_data.get("results", []), date_property="Date", days=30)
    ems_counts, ems_total = _count_by_source(ems_data.get("results", []), date_property="Date de la demande", days=30)

    return {
        "periode": "30 derniers jours",
        "depenses_publicitaires": "Aucune campagne active — pas encore de coût par client à calculer",
        "reservations_massage_kine": {"total": rdv_total, "par_source": rdv_counts},
        "demandes_ems": {"total": ems_total, "par_source": ems_counts},
    }


def _collect_retention():
    clients_data = _query_data_source(DS_CLIENTS)
    ems_data = _query_data_source(DS_EMS_MEMBERSHIP)

    if clients_data.get("error"):
        return {"erreur": True, "detail": clients_data.get("error"), "note": "Échec de lecture Notion (base Clients)."}

    today = datetime.now()
    buckets = {"25-35 jours": [], "55-65 jours": [], "85-95 jours": []}
    total_clients = 0

    for page in clients_data.get("results", []):
        props = page.get("properties", {})
        total_clients += 1
        last_visit = ((props.get("Dernière visite") or {}).get("date") or {}).get("start")
        if not last_visit:
            continue
        try:
            days_since = (today - datetime.strptime(last_visit, "%Y-%m-%d")).days
        except ValueError:
            continue
        nom = _title_text(props.get("Nom complet"))
        if 25 <= days_since <= 35:
            buckets["25-35 jours"].append(nom)
        elif 55 <= days_since <= 65:
            buckets["55-65 jours"].append(nom)
        elif 85 <= days_since <= 95:
            buckets["85-95 jours"].append(nom)

    renewals_soon = []
    if not ems_data.get("error"):
        limit = today + timedelta(days=5)
        for page in ems_data.get("results", []):
            props = page.get("properties", {})
            statut = ((props.get("Statut") or {}).get("select") or {}).get("name", "")
            if "Actif" not in statut:
                continue
            renewal = ((props.get("Date renouvellement") or {}).get("date") or {}).get("start")
            if not renewal:
                continue
            try:
                renewal_date = datetime.strptime(renewal, "%Y-%m-%d")
            except ValueError:
                continue
            if today <= renewal_date <= limit:
                renewals_soon.append({"membre": _title_text(props.get("Membre")), "date": renewal})

    return {
        "note_avis_google": "Non branché — nécessite la connexion à l'API Google Business Profile, pas encore configurée. Ne pas inventer de nombre d'avis.",
        "total_clients_actifs": total_clients,
        "candidats_relance_inactivite": {
            "30_jours": len(buckets["25-35 jours"]),
            "60_jours": len(buckets["55-65 jours"]),
            "90_jours": len(buckets["85-95 jours"]),
        },
        "renouvellements_ems_sous_5_jours": renewals_soon,
    }



def _collect_google():
    """Données réelles de la campagne Google Ads (7 et 30 derniers jours)."""
    try:
        from core.google_ads_api import get_client, customer_id, find_campaign
    except Exception as e:
        return {"erreur": True, "note": f"Librairie google-ads non installée ou erreur d'import : {e}"}

    try:
        client = get_client()
    except KeyError as e:
        return {"erreur": True, "note": f"Variable d'environnement manquante ({e}) — API Google Ads pas configurée."}

    try:
        campaign = find_campaign(client)
    except Exception as e:
        return {"erreur": True, "note": f"Échec de connexion à l'API Google Ads : {e}"}

    if not campaign:
        return {"erreur": True, "note": "Aucune campagne 'KinéPulse' trouvée sur le compte Google Ads."}

    ga_service = client.get_service("GoogleAdsService")

    def period(days):
        query = f"""
            SELECT metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
            FROM campaign
            WHERE campaign.resource_name = '{campaign["resource_name"]}'
                AND segments.date DURING LAST_{days}_DAYS
        """
        impr = clicks = 0
        conv = 0.0
        cost = 0.0
        for row in ga_service.search(customer_id=customer_id(), query=query):
            impr += row.metrics.impressions
            clicks += row.metrics.clicks
            conv += row.metrics.conversions
            cost += row.metrics.cost_micros / 1_000_000
        return {
            "impressions": impr,
            "clics": clicks,
            "cout_cad": round(cost, 2),
            "conversions": round(conv, 2),
            "cpc_moyen_cad": round(cost / clicks, 2) if clicks else None,
            "ctr_pct": round(100 * clicks / impr, 2) if impr else None,
        }

    neg_query = f"""
        SELECT campaign_criterion.keyword.text
        FROM campaign_criterion
        WHERE campaign.resource_name = '{campaign["resource_name"]}'
            AND campaign_criterion.negative = TRUE
            AND campaign_criterion.type = 'KEYWORD'
    """
    negatives = [r.campaign_criterion.keyword.text
                 for r in ga_service.search(customer_id=customer_id(), query=neg_query)]

    budget_query = f"""
        SELECT campaign_budget.amount_micros
        FROM campaign_budget
        WHERE campaign_budget.resource_name = '{campaign["budget_resource_name"]}'
    """
    budget_rows = list(ga_service.search(customer_id=customer_id(), query=budget_query))
    budget_cad = round(budget_rows[0].campaign_budget.amount_micros / 1_000_000, 2) if budget_rows else None

    return {
        "campagne": "KinéPulse - Massothérapie - Search",
        "statut": campaign["status"],
        "budget_quotidien_cad": budget_cad,
        "derniers_7_jours": period(7),
        "derniers_30_jours": period(30),
        "mots_cles_negatifs_actuels": negatives,
    }


def collect(agent_name):
    if agent_name == "tracking":
        return _collect_tracking()
    if agent_name == "retention":
        return _collect_retention()
    if agent_name == "google":
        return _collect_google()
    if agent_name == "director":
        return {
            "suivi": _collect_tracking(),
            "fidelisation": _collect_retention(),
            "google_ads": _collect_google(),
        }
    return {"note": "Sources de données pas encore branchées pour cet agent (aucune campagne publicitaire active à lire)."}
