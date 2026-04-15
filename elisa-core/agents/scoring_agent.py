from .base import BaseAgent, STYLE
from utils.helpers import decimal_to_float

class ScoringAgent(BaseAgent):
    def run(self, sujet, question, messages, data, extra=""):
        profiles = data.get('profiles', {})
        segments = data.get('segments', {})
        
        # Convertir les Decimal en float
        score_moyen = decimal_to_float(profiles.get('score_achat_moyen', 0))
        churn_moyen = decimal_to_float(profiles.get('risque_churn_moyen', 0))
        nb_segment_a = segments.get('A', {}).get('nb_clients', 0)
        panier_a = decimal_to_float(segments.get('A', {}).get('panier_moyen', 0))
        
        score_a = min(85, int(score_moyen or 70))
        churn_a = max(20, int(churn_moyen or 30))
        
        return self._call_llm(f"""Tu es Scoring Agent. Tu DONNES DES SCORES et PROPOSES DES SEUILS.

Sujet: {sujet}
Question: {question}

Contexte: {self._ctx(messages, 3)}

DONNÉES:
- Score achat moyen: {score_moyen}/100
- Risque churn moyen: {churn_moyen}/100
- Segment A: {nb_segment_a} clients, panier {panier_a}€

{STYLE}

TABLEAU SCORES:
| Segment | Score /100 | Churn risk | Priorité |
|---------|------------|------------|----------|
| A       | {score_a}         | {churn_a}          | HAUTE     |
| B       | 65         | 45         | MOYENNE   |
| C       | 45         | 65         | BASSE     |

💡 ACTION PROPOSÉE:
- Activer le segment A en priorité (score élevé, churn bas)
- QUESTION: On pourrait remonter le seuil d'activation à score>75 pour plus de rentabilité ?
- PROPOSITION: Tester un emailing avec seuil à 70 vs 75

PROCHAIN: Product Agent pour construire l'offre.""", 400)