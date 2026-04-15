from .base import BaseAgent, STYLE
from utils.helpers import decimal_to_float

class OptimizationAgent(BaseAgent):
    def run(self, sujet, question, messages, data, extra=""):
        commandes = data.get('commandes', {})
        profiles = data.get('profiles', {})
        segments = data.get('segments', {})
        
        # Convertir les Decimal en float
        nb_prospects = segments.get('A', {}).get('nb_clients', 1000)
        panier_moyen = decimal_to_float(commandes.get('panier_moyen', 50))
        tx_conversion = decimal_to_float(data.get('events', {}).get('taux_conversion_pct', 5))
        nb_segment_b = segments.get('B', {}).get('nb_clients', 0)
        
        tx_conv_estimee = min(15, tx_conversion + 5)
        conversions = int(nb_prospects * tx_conv_estimee / 100)
        ca_genere = int(conversions * panier_moyen)
        revenu_net = ca_genere - 500
        
        return self._call_llm(f"""Tu es Optimization Agent. Tu SIMULES LE ROI et DONNES UN VERDICT.

Sujet: {sujet}
Question: {question}

DONNÉES POUR SIMU:
- Prospects ciblés: {nb_prospects} (segment A)
- Panier moyen: {panier_moyen}€
- Taux conversion actuel: {tx_conversion}%
- Coût campagne (estimation): 500€

{STYLE}

📊 TABLEAU ROI SIMULÉ:

| Métrique | Valeur | Calcul |
|----------|--------|--------|
| Prospects ciblés | {nb_prospects} | - |
| Taux conv. estimé | {tx_conv_estimee}% | +{5}pts vs actuel |
| Conversions | {conversions} | - |
| CA généré | {ca_genere}€ | conv × panier |
| Coût campagne | 500€ | emails + promo |
| Revenu net | {revenu_net}€ | - |

⚠️ RISQUE: Le segment A ne représente que {nb_prospects} clients → scaling limité

💡 QUESTION: Et si on inclut aussi le segment B (+{nb_segment_b} prospects) ?

🎯 VERDICT: 
✅ GO si revenu net > 2000€
❌ STOP si < 500€
🔁 À TESTER si entre 500 et 2000€

→ Pour cette simu: **{"GO" if revenu_net > 2000 else "À TESTER" if revenu_net > 500 else "STOP"}** (gain estimé {revenu_net}€)

PROCHAINE QUESTION À EXPLORER: Quel impact sur la marge si on baisse les prix de 15% ?""", 500)