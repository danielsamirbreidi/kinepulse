"""
Génère un refresh token pour l'API Google Business Profile (avis Google).
Usage : python3 get_business_token.py <CLIENT_ID> <CLIENT_SECRET>
"""
import sys
import urllib.parse
import requests

if len(sys.argv) != 3:
    print("Usage : python3 get_business_token.py <CLIENT_ID> <CLIENT_SECRET>")
    sys.exit(1)

CLIENT_ID = sys.argv[1]
CLIENT_SECRET = sys.argv[2]
REDIRECT_URI = "http://localhost:8080"
SCOPE = "https://www.googleapis.com/auth/business.manage"

params = {
    "client_id": CLIENT_ID,
    "redirect_uri": REDIRECT_URI,
    "response_type": "code",
    "scope": SCOPE,
    "access_type": "offline",
    "prompt": "consent",
}
url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode(params)

print("\n1) Ouvre ce lien DANS TON NAVIGATEUR (sur ton ordinateur, pas sur la VM) :\n")
print(url)
print("\n2) Connecte-toi avec le compte Google qui gère ta fiche KinéPulse sur Google Maps/Business.")
print("3) Accepte les permissions.")
print("4) Le navigateur va essayer d'ouvrir une page 'localhost' qui ne charge PAS (erreur de connexion) — C'EST NORMAL.")
print("5) Regarde la BARRE D'ADRESSE de ton navigateur à ce moment-là. Elle contient quelque chose comme :")
print("   http://localhost:8080/?code=XXXXXXXXX&scope=...")
print("6) Copie SEULEMENT la partie entre 'code=' et le '&' suivant (ou la fin de l'adresse s'il n'y a pas de '&').\n")

code = input("Colle ici le code que tu as copié : ").strip()

resp = requests.post("https://oauth2.googleapis.com/token", data={
    "client_id": CLIENT_ID,
    "client_secret": CLIENT_SECRET,
    "code": code,
    "grant_type": "authorization_code",
    "redirect_uri": REDIRECT_URI,
})

data = resp.json()
if "refresh_token" in data:
    print("\n✅ SUCCÈS ! Voici ton refresh token (garde-le précieusement) :\n")
    print(data["refresh_token"])
    print("\nAjoute ces 3 lignes dans ton fichier .env :\n")
    print(f"GOOGLE_BUSINESS_CLIENT_ID={CLIENT_ID}")
    print(f"GOOGLE_BUSINESS_CLIENT_SECRET={CLIENT_SECRET}")
    print(f"GOOGLE_BUSINESS_REFRESH_TOKEN={data['refresh_token']}")
else:
    print("\n❌ Erreur :")
    print(data)
