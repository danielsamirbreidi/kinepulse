"""
Liste les avis Google de la fiche Clinique KinéPulse.
Usage : python3 list_reviews.py
"""
import os
from dotenv import load_dotenv
load_dotenv()
import requests

ACCOUNT_ID = "106362125780085271062"
LOCATION_ID = "7274093102959754222"

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

url = f"https://mybusiness.googleapis.com/v4/accounts/{ACCOUNT_ID}/locations/{LOCATION_ID}/reviews"
resp = requests.get(url, headers=headers)
print("Status:", resp.status_code)
print(resp.json())
