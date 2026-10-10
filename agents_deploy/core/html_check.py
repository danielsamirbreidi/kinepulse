"""
Vérification basique que le HTML reste bien formé (balises équilibrées)
après un site_change — avant de publier, pas après (trouvé lors de l'audit
du 2026-10-09 : rien ne vérifiait qu'un remplacement de texte ne cassait
pas une balise)."""
from html.parser import HTMLParser

VOID_TAGS = {
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr",
}


class _TagBalanceChecker(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack = []
        self.ok = True

    def handle_starttag(self, tag, attrs):
        if tag not in VOID_TAGS:
            self.stack.append(tag)

    def handle_endtag(self, tag):
        if tag in self.stack:
            while self.stack and self.stack[-1] != tag:
                self.stack.pop()
            if self.stack:
                self.stack.pop()
        else:
            self.ok = False


def is_html_balanced(html_content):
    """True si les balises semblent bien équilibrées. Vérification
    approximative (pas un validateur complet) mais attrape le cas courant :
    une balise ouverte/fermée cassée par un find/replace mal ciblé."""
    checker = _TagBalanceChecker()
    try:
        checker.feed(html_content)
        checker.close()
    except Exception:
        return False
    return checker.ok and not checker.stack
