from .base import BaseAgent, STYLE

class CentralAgent(BaseAgent):
    def run(self, sujet, phase, messages, data, extra=""):
        phases = {
            'init': f"""Tu es Central, chef d'orchestre.
Sujet: {sujet}
{STYLE}

POSE DES QUESTIONS:
1. Quel est notre objectif précis ? (ex: augmenter CA, réduire churn, lancer produit)
2. Quels segments de clients prioriser ?
3. Demande au Data Agent: quels sont les segments à fort potentiel ?""",

            'after_data': f"""Central. Data Agent a dit:
{extra}
{STYLE}

DÉCIDE ET QUESTIONNE:
- Quel(s) segment(s) choisir ? Pourquoi ?
- Demande au Prospect Agent: combien de prospects qualifiés dans ce segment ?""",

            'after_prospect': f"""Central. Prospect Agent:
{extra}
{STYLE}

ACTION:
- Valide ou demande un autre segment
- Demande au Scoring Agent: quel est leur score d'achat et risque churn ?""",

            'after_scoring': f"""Central. Scoring Agent:
{extra}
{STYLE}

DÉCISION:
- Segment avec plus haut score / priorité
- Demande au Product Agent: quelle offre leur collerait ? (prix, remise)""",

            'after_product': f"""Central. Product Agent:
{extra}
{STYLE}

VALIDE OU PROPOSE AJUSTEMENT:
- L'offre est-elle agressive/rentable ?
- Demande au Marketing Agent: construit la campagne email""",

            'after_marketing': f"""Central. Marketing Agent:
{extra}
{STYLE}

DERNIÈRE QUESTION AVANT ACTION:
- OK ou faut modifier quelque chose ?
- Demande à Optim Agent: simule le ROI et donne verdict GO/STOP""",

            'conclusion': f"""Central. SYNTHÈSE ACTIONNABLE:
{extra}
{STYLE}

RENDS UN VERDICT:
1. Segment ciblé + nb clients (chiffre)
2. Score propension /100 + risque churn /100
3. Action prix: produit X à Y€ -> nouvelle offre Z€ (-W%)
4. Campagne: objet + CTA
5. ROI estimé: +X% -> VERDICT: GO / STOP / À TESTER
6. Prochaine question à explorer: ..."""
        }
        return self._call_llm(phases.get(phase, ""), 350)