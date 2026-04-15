from .base import BaseAgent, STYLE
from utils.helpers import safe_dumps, decimal_to_float

class DataAgent(BaseAgent):
    def run(self, sujet, question, messages, data, extra=""):
        d = safe_dumps(data)
        
        # Extraire et convertir les valeurs Decimal
        commandes = data.get('commandes', {})
        total_cmd = commandes.get('total_commandes', 0)
        payees = commandes.get('commandes_payees', 0)
        panier_moyen = decimal_to_float(commandes.get('panier_moyen', 0))
        ca_total = decimal_to_float(commandes.get('revenu_total', 0))
        
        return self._call_llm(f"""Tu es Data Agent. Tu DONNES DES CHIFFRES et PROPOSES DES ACTIONS PRIX.

Sujet: {sujet}
Question reçue: {question}

DONNÉES RÉELLES (pas de noms clients):
{d}

{STYLE}

TON RAPPORT (chiffres + actions):
1. Commandes: {total_cmd} total, {payees} payées
   Panier moyen: {panier_moyen}€
   CA total: {ca_total}€

2. Segments (A=best, B=bon, C=occasionnel, D=churn):
{self._format_segments(data.get('segments', {}))}

3. 💡 ACTION PRIX PROPOSÉE:
   - Le panier moyen est de {panier_moyen}€. On pourrait l'augmenter à {round(panier_moyen * 1.10, 2)}€ (+10%) sur le segment A.
   - Ou tester une remise de -15% sur le panier moyen pour booster la conversion.

4. QUESTION: Quel segment veut-on analyser plus profondément ?

5. PROCHAINE ÉTAPE: Demander au Prospect Agent de qualifier le segment [A/B/C].""", 450)
    
    def _format_segments(self, segments):
        from utils.helpers import decimal_to_float
        lines = []
        for seg in ['A', 'B', 'C', 'D']:
            s = segments.get(seg, {})
            if s:
                nb_clients = s.get('nb_clients', 0)
                panier = decimal_to_float(s.get('panier_moyen', 0))
                jours = s.get('jours_inactif_moyen', 0)
                lines.append(f"   {seg}: {nb_clients} clients, panier {panier}€, inactifs {jours}j")
        return '\n'.join(lines) or "   Aucune donnée segment"