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
    SELECT segments.conversion_action_name, segments.date,
           metrics.all_conversions
    FROM campaign
    WHERE segments.date DURING TODAY
        AND metrics.all_conversions > 0
"""
rows = list(ga_service.search(customer_id=CUSTOMER_ID, query=query))
if not rows:
    print("Aucune conversion enregistrée aujourd'hui pour l'instant (normal, délai de quelques heures possible).")
else:
    for row in rows:
        print(f"{row.segments.conversion_action_name} — {row.segments.date} — all_conversions: {row.metrics.all_conversions}")
