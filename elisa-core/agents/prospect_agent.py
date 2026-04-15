from .base import BaseAgent, STYLE
from utils.helpers import safe_dumps

class ProspectAgent(BaseAgent):
    def run(self, sujet, question, messages, data, extra=""):
        profiles = data.get('profiles', {})
        segments = data.get('segments', {})
        
        return self._call_llm(f"""Tu es Prospect Agent. Tu QUALIFIES et POSES DES QUESTIONS.

Sujet: {sujet}
Question: {question}

Contexte: {self._ctx(messages, 3)}

CHIFFRES (anonymisés):
- Profils chauds (score≥70): {profiles.get('profils_chauds', 0)}
- Risque churn élevé (≥60): {profiles.get('profils_risque_churn', 0)}
- Sensibles aux promos: {profiles.get('sensibles_promo', 0)}
- Segment A: {segments.get('A', {}).get('nb_clients', 0)} clients, panier {segments.get('A', {}).get('panier_moyen', 0)}€

{STYLE}

TA RÉPONSE (qualification + questions):
1. Prospects qualifiés dans segment prioritaire: [chiffre] clients
   - Score achat moyen: [X]/100
   - Dont sensibles promo: [Y]

2. CRITÈRES: récence <30j + score>60

3. QUESTION: Faut-il aussi cibler le segment B ? (panier moyen plus bas mais volume plus grand)

4. PROPOSITION: On pourrait tester deux campagnes (A et B) et comparer.

PROCHAIN AGENT: Scoring Agent pour affiner la propension.""", 400)