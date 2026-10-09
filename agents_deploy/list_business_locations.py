"""
Liste les comptes et fiches (locations) Google Business Profile accessibles
avec ce jeton, pour trouver l'ID de la fiche KinéPulse.
Usage : python3 list_business_locations.py
"""
import os
from dotenv import load_dotenv
load_dotenv()
import requests

def get_access_token():
    resp = requests.post("https://oauth2.googleapis.com/token", data={
        "client_id": os.environ["GOOGLE_BUSINESS_CLIENT_ID"],
        "client_secret": os.environ["GOOGLE_BUSINESS_CLIENT_SECRET"],
        "refresh_token": os.environ["GOOGLE_BUSINESS_REFRESH_TOKEN"],
        "grant_type": "refresh_token",
    })
    data = resp.json()
    if "access_token" not in data:
        print("❌ Erreur d'authentification :", data)
        raise SystemExit(1)
    return data["access_token"]

token = get_access_token()
headers = {"Authorization": f"Bearer {token}"}

print("=== Comptes accessibles ===")
accounts_resp = requests.get(
    "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
    headers=headers,
)
accounts = accounts_resp.json()
print(accounts)

for acc in accounts.get("accounts", []):
    acc_name = acc["name"]  # ex: accounts/1234567890
    print(f"\n=== Fiches (locations) pour {acc_name} ===")
    loc_resp = requests.get(
        f"https://mybusinessbusinessinformation.googleapis.com/v1/{acc_name}/locations",
        headers=headers,
        params={"readMask": "name,title,storefrontAddress"},
    )
    print(loc_resp.json())
