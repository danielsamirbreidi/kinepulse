"""
Tests du système de sauvegarde/retour-arrière avant site_change
(core/backup.py).
"""


def test_save_then_get_last_backup_round_trips(isolated_backup):
    b = isolated_backup
    b.save_backup("pages/massage.html", "<p>ancien contenu</p>", details="test")
    last = b.get_last_backup("pages/massage.html")
    assert last is not None
    assert last["content"] == "<p>ancien contenu</p>"
    assert last["file"] == "pages/massage.html"


def test_get_last_backup_returns_none_when_nothing_saved(isolated_backup):
    b = isolated_backup
    assert b.get_last_backup("pages/inexistant.html") is None


def test_get_last_backup_returns_the_most_recent_version(isolated_backup):
    b = isolated_backup
    b.save_backup("index.html", "version 1")
    b.save_backup("index.html", "version 2")
    b.save_backup("index.html", "version 3")
    assert b.get_last_backup("index.html")["content"] == "version 3"


def test_prune_keeps_only_last_10_versions_per_file(isolated_backup):
    b = isolated_backup
    for i in range(15):
        b.save_backup("index.html", f"version {i}")
    with open(b.BACKUP_FILE, encoding="utf-8") as f:
        import json
        rows = [json.loads(l) for l in f if l.strip()]
    same_file = [r for r in rows if r["file"] == "index.html"]
    assert len(same_file) == 10
    # Les 10 gardées doivent être les plus récentes (5 à 14), pas les plus anciennes.
    assert same_file[0]["content"] == "version 5"
    assert same_file[-1]["content"] == "version 14"


def test_prune_does_not_touch_backups_of_other_files(isolated_backup):
    b = isolated_backup
    b.save_backup("a.html", "a-contenu")
    for i in range(12):
        b.save_backup("b.html", f"b-{i}")
    # a.html n'a qu'une seule sauvegarde — ne doit jamais être éliminée par
    # le pruning de b.html (bug classique : pruning qui regarde tout le
    # fichier au lieu de filtrer par nom de fichier).
    assert b.get_last_backup("a.html")["content"] == "a-contenu"
    assert b.get_last_backup("b.html")["content"] == "b-11"
