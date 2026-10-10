# Tests automatisés

Couvre les composants les plus critiques pour la sécurité et l'argent réel :
le garde-fou budgétaire (`core/guard.py`), la détection de campagne/annonce
ambiguë (`core/google_ads_api.py`), la validation HTML avant publication
(`core/html_check.py`), la sauvegarde/retour-arrière (`core/backup.py`) et
le suivi de santé des agents (`core/health.py`).

Aucun test n'appelle une vraie API externe (Google Ads, Telegram, Notion,
GitHub) ni ne touche aux vrais fichiers de production (`state.json`,
`memory/health.json`, `memory/site_backups.jsonl`) — tout est isolé dans
des fichiers temporaires via les fixtures de `conftest.py`.

## Lancer les tests

```bash
cd agents_deploy
pip install -r requirements.txt --break-system-packages   # une seule fois
python3 -m pytest tests/ -v
```

## À faire avant tout déploiement de changement touchant à core/

Lancer `python3 -m pytest tests/` et vérifier que tout est vert — surtout
pour un changement à `guard.py` (budget) ou `google_ads_api.py` (campagnes).
Ça ne remplace pas l'approbation Telegram, mais ça attrape une régression
avant qu'elle n'atteigne la production.
