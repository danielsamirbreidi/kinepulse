"""
Vérifie automatiquement la propriété de kinepulse.ca auprès de Google
Search Console : demande le jeton, l'insère dans index.html via GitHub,
attend que le site soit à jour, puis confirme la vérification et
enregistre le site. À exécuter UNE SEULE FOIS.
Usage : python3 verify_search_console.py
"""
import time
from dotenv import load_dotenv
load_dotenv()
from core import search_console_api as sc
from core.github_api import get_file, update_file

print("1) Demande du jeton de vérification à Google...")
token = sc.get_verification_token()
print(f"   Jeton reçu : {token}")

print("2) Insertion de la balise meta dans index.html...")
current = get_file("index.html")
if not current:
    raise SystemExit("❌ index.html introuvable sur GitHub")

meta_tag = f'<meta name="google-site-verification" content="{token}" />'
if meta_tag in current["content"]:
    print("   Déjà présente, on passe à l'étape suivante.")
else:
    if "<head>" not in current["content"]:
        raise SystemExit("❌ Balise <head> introuvable dans index.html — insertion manuelle requise.")
    new_content = current["content"].replace("<head>", f"<head>\n    {meta_tag}", 1)
    update_file("index.html", new_content, current["sha"], message="Ajout de la vérification Google Search Console")
    print("   Balise ajoutée et poussée sur GitHub.")

print("3) Attente de 30 secondes que le site se mette à jour...")
time.sleep(30)

print("4) Confirmation de la vérification auprès de Google...")
try:
    sc.confirm_verification()
    print("   ✅ Site vérifié avec succès !")
except Exception as e:
    print(f"   ❌ Échec : {e}")
    print("   Si le site prend plus de temps à se mettre à jour (CDN, cache), relance ce script dans 1-2 minutes.")
    raise SystemExit(1)

print("5) Enregistrement du site dans Search Console...")
if sc.add_site_to_search_console():
    print("   ✅ kinepulse.ca est maintenant enregistré dans Search Console.")
else:
    print("   ⚠️ Déjà enregistré ou avertissement mineur — vérification elle-même a réussi.")

print("\nTerminé. Les vraies données de recherche (positions, clics, impressions) seront visibles dans 1-2 jours (délai normal de Google).")
