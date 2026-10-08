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
    SELECT conversion_action.id, conversion_action.name, conversion_action.status,
           conversion_action.tag_snippets
    FROM conversion_action
"""
rows = list(ga_service.search(customer_id=CUSTOMER_ID, query=query))
print(f"{len(rows)} action(s) de conversion trouvée(s) :\n")
for row in rows:
    ca = row.conversion_action
    print(f"- {ca.name} (id={ca.id}, statut={ca.status.name})")
    for tag in ca.tag_snippets:
        print(f"  Event snippet :\n{tag.event_snippet}\n")
