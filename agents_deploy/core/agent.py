import os, json, re, anthropic
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-5")

def run_agent(name, task, data):
    client = anthropic.Anthropic()
    read = lambda f: open(os.path.join(BASE, "prompts", f), encoding="utf-8").read()
    system = read(f"{name}.md") + "\n\n" + read("_context.md") + "\n\n" + read("_rules.md")
    msg = client.messages.create(
        model=MODEL, max_tokens=4000, system=system,
        messages=[{"role": "user", "content": f"TÂCHE : {task}\nDONNÉES :\n{json.dumps(data, ensure_ascii=False)}"}])
    raw = next((b.text for b in msg.content if getattr(b, "type", None) == "text"), "")
    text = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.M).strip()
    try:
        return json.loads(text)
    except Exception:
        return {"report": "Réponse invalide de l'agent : " + text[:300], "actions": []}

CHAT_INSTRUCTIONS = """
MODE CONVERSATION DIRECTE AVEC DANDOUN (le propriétaire de la clinique) :
Tu lui réponds directement, en français québécois simple et direct, comme un employé compétent qui lui parle.
- S'il pose une question (sur les performances, les chiffres, pourquoi quelque chose s'est passé), réponds-y clairement en 2-6 phrases, avec les vrais chiffres fournis dans DONNÉES.
- S'il te demande de faire quelque chose (changer un budget, mettre en pause, créer une campagne, exclure un mot-clé, etc.), mets l'action demandée dans "actions" avec le format exact habituel (voir règles ci-dessus). Explique dans "reply" ce que tu vas faire et pourquoi, en 1-3 phrases.
- Si sa demande est ambiguë ou qu'il manque une information essentielle pour agir (ex: il dit "augmente le budget" sans dire de combien), ne propose PAS d'action : demande-lui la précision manquante dans "reply".
- Ne propose jamais une action hors de la liste de types permis.
Réponds TOUJOURS en JSON strict avec ce format exact, rien d'autre :
{"reply": "ta réponse en français pour Dandoun", "actions": [...]}
"""

def run_chat(name, user_message, data):
    client = anthropic.Anthropic()
    read = lambda f: open(os.path.join(BASE, "prompts", f), encoding="utf-8").read()
    system = read(f"{name}.md") + "\n\n" + read("_context.md") + "\n\n" + read("_rules.md") + "\n\n" + CHAT_INSTRUCTIONS
    msg = client.messages.create(
        model=MODEL, max_tokens=4000, system=system,
        messages=[{"role": "user", "content": f"MESSAGE DE DANDOUN :\n{user_message}\n\nDONNÉES ACTUELLES DU COMPTE :\n{json.dumps(data, ensure_ascii=False)}"}])
    raw = next((b.text for b in msg.content if getattr(b, "type", None) == "text"), "")
    text = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.M).strip()
    try:
        return json.loads(text)
    except Exception:
        print(f"[ERREUR JSON chat] Réponse brute reçue :\n{raw}")
        return {"reply": "Désolé, je n'ai pas bien compris, tu peux reformuler ? (" + text[:300] + ")", "actions": []}
