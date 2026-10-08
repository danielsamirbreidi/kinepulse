import os
from dotenv import load_dotenv
load_dotenv()
from google.ads.googleads.client import GoogleAdsClient

CUSTOMER_ID = os.environ["GOOGLE_ADS_CUSTOMER_ID"].replace("-", "")
client = GoogleAdsClient.load_from_dict({
    "client_id": os.environ["GOOGLE_ADS_CLIENT_ID"],
    "client_secret": os.environ["GOOGLE_ADS_CLIENT_SECRET"],
    "refresh_token": os.environ["GOOGLE_ADS_REFRESH_TOKEN"],
    "use_proto_plus": True,
})

ga_service = client.get_service("GoogleAdsService")
query = """
    SELECT conversion_action.name, segments.date, segments.conversion_action_category,
           metrics.conversions, metrics.all_conversions
    FROM conversion_action
    WHERE segments.date DURING TODAY
"""
rows = list(ga_service.search(customer_id=CUSTOMER_ID, query=query))
if not rows:
    print("Aucune conversion enregistrée aujourd'hui pour l'instant (normal, délai de quelques heures possible).")
else:
    for row in rows:
        print(f"{row.conversion_action.name} — {row.segments.date} — conversions: {row.metrics.conversions}, all_conversions: {row.metrics.all_conversions}")
