import json
import re
from .base import BaseAgent, load_params, adapt_params
from utils.helpers import decimal_to_float

class CentralAgent(BaseAgent):
    def __init__(self):
        super().__init__("central")

    def run(self, sujet: str, question: str, messages: list, data: dict) -> dict:
        """
        Central orchestre la conversation.
        'question' contient le dernier message d'un agent spécialiste,
        ou 'START' si c'est le tout début.
        """
        if question == "START":
            return self._demarrer(sujet, data)
        
        last_agent = self._dernier_agent(messages)
        return self._decider(sujet, question, last_agent, messages, data)

    # ------------------------------------------------------------------
    # DÉMARRAGE
    # ------------------------------------------------------------------
    def _demarrer(self, sujet: str, data: dict) -> dict:
        summary = self._format_data_summary(data)
        prompt  = f"""Tu es Central, le chef d'orchestre d'ELISA — un système multi-agents qui analyse des données e-commerce pour trouver les prospects les plus susceptibles d'acheter un produit.

On vient de recevoir une demande : trouver les meilleurs prospects pour **"{sujet}"**.

Voici un aperçu rapide des données disponibles :
{summary}

Parle naturellement, comme quelqu'un qui réfléchit à voix haute (3-4 phrases max). 
- Dis ce que tu penses du produit et du marché potentiel
- Annonce que tu demandes à Data Agent d'aller chercher dans la base
- Sois direct et humain, sans jargon

Exemple de ton : "Intéressant, une louche — ça fait partie des ustensiles de cuisine. Avant d'aller plus loin, je demande à Data de voir ce qu'on a dans la base sur ce produit et les catégories proches. Data, tu peux creuser ça ?"
"""
        message = self._call_llm(prompt, 200)
        return {
            "message":    message or f"Ok, on cherche les meilleurs prospects pour '{sujet}'. Data Agent, tu peux aller voir ce qu'on a dans la base ?",
            "next_agent": "data",
            "params":     {"sujet": sujet, "phase": "init"},
            "question":   None,
        }

    # ------------------------------------------------------------------
    # DÉCISION DYNAMIQUE
    # ------------------------------------------------------------------
    def _decider(self, sujet: str, last_response: str, last_agent: str, messages: list, data: dict) -> dict:
        ctx     = self._ctx(messages, 8)
        p       = self.params
        summary = self._format_data_summary(data)

        prompt = f"""Tu es Central, l'orchestrateur d'ELISA.

**Produit analysé :** {sujet}
**Dernier agent qui t'a parlé :** {last_agent}
**Ce qu'il t'a dit :**
{last_response}

**Contexte de la conversation :**
{ctx}

**Données globales :**
{summary}

**Agents disponibles :** data, prospect, scoring, product, marketing, optimization

**Ta mission :** Lire ce que l'agent t'a dit, réfléchir, et décider quoi faire ensuite.

Règles de décision :
- Si Data dit qu'il n'a pas trouvé le produit exact → demande-lui de chercher dans la catégorie parente (ex: louche → cuisine, sacoche → bagagerie)
- Si Data revient avec des données de catégorie → passe à prospect
- Si Prospect dit qu'il y a moins de {p.get('min_prospects', 5)} prospects qualifiés → dis STOP avec explication
- Si Scoring donne un score moyen < {p.get('min_score_go', 60)} → dis STOP
- Si tout est bon → continue vers le prochain agent logique
- Si optimization a parlé → donne ton verdict final (GO / À TESTER / STOP) et explique pourquoi

Réponds de façon très naturelle, comme dans une vraie conversation entre collègues.
À la fin de ta réponse, indique en JSON sur la dernière ligne :
{{"next": "nom_agent_ou_STOP_ou_FIN", "note": "info utile pour le prochain agent"}}

Exemple :
"Ok Data, j'ai compris — pas de louche dans la base. Mais les gens qui achètent des ustensiles de cuisine, c'est exactement le profil qu'on cherche. Retourne voir dans la catégorie cuisine et remonte-moi les clients les plus actifs là-dessus.
{{"next": "data", "note": "chercher categorie cuisine, pas louche directement"}}"
"""
        raw = self._call_llm(prompt, 350)
        return self._parse_response(raw, sujet)

    # ------------------------------------------------------------------
    # PARSING RÉPONSE CENTRAL
    # ------------------------------------------------------------------
    def _parse_response(self, raw: str, sujet: str) -> dict:
        if not raw:
            return {"message": "Je continue l'analyse...", "next_agent": "data", "params": {}, "question": None}

        # Extraire le JSON de directive en fin de réponse
        next_agent = "FIN"
        note       = ""
        
        json_match = re.search(r'\{[^}]*"next"\s*:[^}]+\}', raw)
        if json_match:
            try:
                directive  = json.loads(json_match.group())
                next_agent = directive.get("next", "FIN")
                note       = directive.get("note", "")
                # Retirer le JSON du message affiché
                message = raw[:json_match.start()].strip()
            except:
                message    = raw
        else:
            message = raw
            # Détection fallback par mots-clés
            if "STOP" in raw.upper():
                next_agent = "STOP"
            elif "GO" in raw and "optimization" not in raw.lower():
                next_agent = "FIN"

        # Si c'est FIN → adapter les params (self-learning)
        if next_agent in ("FIN", "STOP"):
            verdict = "GO" if next_agent == "FIN" else "STOP"
            adapt_params(verdict)

        return {
            "message":    message,
            "next_agent": next_agent,
            "params":     {"note": note},
            "question":   None,
        }

    def _dernier_agent(self, messages: list) -> str:
        for m in reversed(messages):
            if m.get("agent_key") != "central":
                return m.get("agent_name", m.get("agent_key", "inconnu"))
        return "personne"