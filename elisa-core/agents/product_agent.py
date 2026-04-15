from .base import BaseAgent, STYLE
from utils.helpers import safe_dumps, decimal_to_float

class ProductAgent(BaseAgent):
    def run(self, sujet, question, messages, data, extra=""):
        produits = data.get('top_produits', [])
        panier_moyen = data.get('commandes', {}).get('panier_moyen', 0)
        
        # Convertir Decimal en float
        panier_moyen = decimal_to_float(panier_moyen)
        
        produits_txt = ""
        for p in produits[:3]:
            nom = p.get('nom_produit', 'Produit')
            nb_ventes = p.get('nb_ventes', 0)
            prix = decimal_to_float(p.get('prix_moyen', 0))
            produits_txt += f"   - {nom}: {nb_ventes} ventes, {prix}€\n"
        
        # Préparer les données pour le prompt (avec conversion Decimal)
        if produits:
            prix_actuel = decimal_to_float(produits[0].get('prix_moyen', panier_moyen))
            prix_baisse = round(prix_actuel * 0.85, 2)
            prix_hausse = round(prix_actuel * 1.20, 2)
            prix_pack = round(panier_moyen * 1.5, 2) if panier_moyen else 0
            prix_pack_normal = round(panier_moyen * 2, 2) if panier_moyen else 0
        else:
            prix_actuel = panier_moyen
            prix_baisse = round(panier_moyen * 0.85, 2) if panier_moyen else 0
            prix_hausse = round(panier_moyen * 1.20, 2) if panier_moyen else 0
            prix_pack = round(panier_moyen * 1.5, 2) if panier_moyen else 0
            prix_pack_normal = round(panier_moyen * 2, 2) if panier_moyen else 0
        
        return self._call_llm(f"""Tu es Product Agent. Tu PROPOSES DES OFFRES et MODIFIES LES PRIX.

Sujet: {sujet}
Question: {question}

TOP PRODUITS (anonymisés, pas de noms clients):
{produits_txt}
Panier moyen global: {panier_moyen}€

{STYLE}

TON OFFRE (actionnable):
1. PRODUIT: {produits[0].get('nom_produit', 'Top produit') if produits else 'Produit phare'}
   Prix actuel: {prix_actuel}€
   
2. 💰 ACTION PRIX PROPOSÉE:
   Option A: Baisser à {prix_baisse}€ (-15%) pour booster volume
   Option B: Monter à {prix_hausse}€ (+20%) sur segment premium
   Option C: Pack 2 produits à {prix_pack}€ (au lieu de {prix_pack_normal}€)

3. POURQUOI: Le segment A a un panier moyen élevé, peut supporter +20%

4. QUESTION: On teste quelle option ? Ou on combine avec une remise ?

PROCHAIN: Marketing Agent pour la campagne.""", 450)