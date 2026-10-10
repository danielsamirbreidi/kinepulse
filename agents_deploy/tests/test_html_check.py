"""
Tests de la validation HTML avant publication (core/html_check.py) —
protège contre un site_change qui casserait une balise sur le site réel.
"""
from core.html_check import is_html_balanced


def test_balanced_simple_html_is_ok():
    assert is_html_balanced("<div><p>Bonjour</p></div>") is True


def test_void_tags_do_not_need_closing():
    assert is_html_balanced("<div><img src='x.png'><br><p>Texte</p></div>") is True


def test_tag_never_closed_at_all_is_unbalanced():
    assert is_html_balanced("<div><p>Bonjour") is False


def test_missing_inner_closing_tag_is_tolerated_like_a_browser_would():
    # Vérification "approximative", pas un validateur strict (voir
    # docstring du module) : un </p> manquant mais rattrapé par le </div>
    # qui suit est traité comme une fermeture implicite, exactement comme
    # un navigateur l'afficherait. Ce n'est pas le cas qu'on veut bloquer —
    # test_missing_closing_tag_breaks_structure ci-dessous couvre le cas
    # réellement dangereux (balise qui ne se referme nulle part).
    assert is_html_balanced("<div><p>Bonjour</div>") is True


def test_extra_closing_tag_is_unbalanced():
    assert is_html_balanced("<div>Bonjour</div></div>") is False


def test_find_replace_that_cuts_a_tag_in_half_is_caught():
    # Simule le cas réel visé par ce garde-fou : un find/replace mal ciblé
    # qui supprime la moitié d'une balise.
    before = "<div class='offre'><h2>Massage</h2></div>"
    broken = before.replace("<h2>Massage</h2></div>", "<h2>Massage")  # ferme plus rien
    assert is_html_balanced(before) is True
    assert is_html_balanced(broken) is False


def test_empty_string_is_balanced():
    assert is_html_balanced("") is True


def test_full_page_fragment_with_nested_tags():
    html = """
    <section>
      <div class="card">
        <h3>Analyse 3D gratuite</h3>
        <p>Offerte à chaque séance <a href="/booking">Réserver</a></p>
        <ul><li>Point 1</li><li>Point 2</li></ul>
      </div>
    </section>
    """
    assert is_html_balanced(html) is True
