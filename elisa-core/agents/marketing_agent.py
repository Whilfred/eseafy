from .base import BaseAgent, STYLE

class MarketingAgent(BaseAgent):
    def run(self, sujet, question, messages, data, extra=""):
        promos = data.get('promos', {})
        events = data.get('events', {})
        tx_conversion = events.get('taux_conversion_pct', 0)
        
        return self._call_llm(f"""Tu es Marketing Agent. Tu PROPOSES DES CAMPAGNES avec OBJET et CTA.

Sujet: {sujet}
Question: {question}

STATS CAMPAGNES:
- Taux conversion actuel: {tx_conversion}%
- Codes promo actifs: {promos.get('codes_actifs', 0)}/{promos.get('total_codes', 0)}
- Utilisations moyenne: {promos.get('utilisations_moy', 0)}

{STYLE}

TA CAMPAGNE (prête à envoyer):

📧 OBJET: "Offre exclusive {sujet[:30]} - -15% ce weekend"

📝 MESSAGE (2 phrases):
Bonjour [Prénom], 
On a repéré que vous aimez [catégorie]. Profitez de -15% sur votre prochaine commande avec le code {sujet[:8].upper()}15.

🔘 CTA: "J'en profite" → lien direct panier

⏰ ENVOI: Mardi 10h (taux ouverture +20%)

📊 ESTIMATION: Taux ouverture 35% → 12% conversion

❓ QUESTION: On fait un A/B test avec objet différent ?

PROCHAIN: Optim Agent pour le ROI.""", 450)