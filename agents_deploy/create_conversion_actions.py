"""
Crée 2 actions de conversion Google Ads (Massothérapie 110$, EMS 165$) par API,
et affiche l'ID AW- + le label à utiliser dans le code du site.
"""
import os
from dotenv import load_dotenv
load_dotenv()

from google.ads.googleads.client import GoogleAdsClient
from google.ads.googleads.errors import GoogleAdsException

CUSTOMER_ID = os.environ["GOOGLE_ADS_CUSTOMER_ID"].replace("-", "")

client = GoogleAdsClient.load_from_dict({
    "client_id": os.environ["GOOGLE_ADS_CLIENT_ID"],
    "client_secret": os.environ["GOOGLE_ADS_CLIENT_SECRET"],
    "refresh_token": os.environ["GOOGLE_ADS_REFRESH_TOKEN"],
    "use_proto_plus": True,
})

ACTIONS = [
    {"name": "Réservation Massothérapie", "value": 110.0},
    {"name": "Demande EMS", "value": 165.0},
]


def create_action(name, value):
    service = client.get_service("ConversionActionService")
    op = client.get_type("ConversionActionOperation")
    action = op.create
    action.name = name
    action.type_ = client.enums.ConversionActionTypeEnum.WEBPAGE
    action.category = client.enums.ConversionActionCategoryEnum.BOOK_APPOINTMENT
    action.status = client.enums.ConversionActionStatusEnum.ENABLED
    action.value_settings.default_value = value
    action.value_settings.default_currency_code = "CAD"
    action.value_settings.always_use_default_value = True
    action.counting_type = client.enums.ConversionActionCountingTypeEnum.ONE_PER_CLICK
    resp = service.mutate_conversion_actions(customer_id=CUSTOMER_ID, operations=[op])
    resource_name = resp.results[0].resource_name

    # Récupère le tag_snippet (ID AW- + label) de l'action créée
    ga_service = client.get_service("GoogleAdsService")
    query = f"""
        SELECT conversion_action.resource_name,
               conversion_action.tag_snippets
        FROM conversion_action
        WHERE conversion_action.resource_name = '{resource_name}'
    """
    rows = list(ga_service.search(customer_id=CUSTOMER_ID, query=query))
    tag = rows[0].conversion_action.tag_snippets[0] if rows and rows[0].conversion_action.tag_snippets else None
    return resource_name, tag


if __name__ == "__main__":
    try:
        for a in ACTIONS:
            resource_name, tag = create_action(a["name"], a["value"])
            print(f"\n=== {a['name']} ===")
            print(f"Resource name : {resource_name}")
            if tag:
                print(f"Event snippet (global_site_tag) :\n{tag.global_site_tag}")
                print(f"Event snippet (event_snippet) :\n{tag.event_snippet}")
            else:
                print("Pas de tag_snippets retourné — va chercher manuellement dans Google Ads > Conversions.")
    except GoogleAdsException as ex:
        print(f"\n❌ ERREUR GOOGLE ADS (code {ex.error.code().name}):")
        for error in ex.failure.errors:
            print(f"  - {error.message}")
        raise
