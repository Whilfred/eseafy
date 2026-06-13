from .base import BaseAgent
from utils.helpers import decimal_to_float


# ===========================================================================
# PRODUCT AGENT
# ===========================================================================
class ProductAgent(BaseAgent):
    def __init__(self):
        super().__init__("product")

    def run(self, sujet: str, question: str, messages: list, data: dict) -> dict:
        top_produits = data.get("top_produits", [])
        commandes    = data.get("commandes", {})
        panier_moyen = decimal_to_float(commandes.get("panier_moyen", 0))
        segments     = data.get("segments", {})

        # Trouver le produit le plus proche ou utiliser le panier moyen
        produit_ref = top_produits[0] if top_produits else {}
        prix_ref    = decimal_to_float(produit_ref.get("prix_moyen", panier_moyen))
        nom_ref     = produit_ref.get("nom_produit", sujet)

        seg_a_panier = decimal_to_float(segments.get("A", {}).get("panier_moyen", panier_moyen))

        prompt = f"""Tu es Product Agent dans ELISA. Tu construis des offres commerciales basées sur les données.

**Produit à vendre :** {sujet}
**Instruction de Central :** {question}
**Contexte :**
{self._ctx(messages, 5)}

**Données produit :**
- Produit de référence le plus proche : {nom_ref} à {prix_ref} FCFA
- Panier moyen global : {panier_moyen} FCFA
- Panier moyen segment A (premium) : {seg_a_panier} FCFA

**Ta mission :**
Propose 2-3 stratégies de prix concrètes pour "{sujet}" en te basant sur les données :
- Une option volume (prix attractif pour capter le max)
- Une option marge (prix premium pour segment A)
- Une option bundle si pertinent

Explique pourquoi chaque option est cohérente avec les données.
Pose une question à Central si tu hésites entre deux approches.
Langage naturel, 5-6 phrases, comme un commercial qui présente ses idées.
"""
        message = self._call_llm(prompt, 350)
        return {
            "message": message or f"Voici mes propositions d'offre pour '{sujet}'.",
            "data":    {"prix_ref": prix_ref, "panier_moyen": panier_moyen},
            "question": None,
        }


# ===========================================================================
# MARKETING AGENT
# ===========================================================================
class MarketingAgent(BaseAgent):
    def __init__(self):
        super().__init__("marketing")

    def run(self, sujet: str, question: str, messages: list, data: dict) -> dict:
        promos  = data.get("promos", {})
        events  = data.get("events", {})
        profiles = data.get("profiles", {})

        tx_conversion  = decimal_to_float(events.get("taux_conversion_pct", 0))
        sensibles_promo = profiles.get("sensibles_promo", 0)
        codes_actifs   = promos.get("codes_actifs", 0)

        prompt = f"""Tu es Marketing Agent dans ELISA. Tu conçois des campagnes email adaptées aux prospects identifiés.

**Produit :** {sujet}
**Instruction de Central :** {question}
**Contexte conversation :**
{self._ctx(messages, 6)}

**Stats actuelles :**
- Taux de conversion actuel : {tx_conversion}%
- Prospects sensibles aux promos : {sensibles_promo}
- Codes promo actifs : {codes_actifs}

**Ta mission :**
Propose une campagne email complète et réaliste :
- Segment cible (basé sur ce que Prospect et Scoring ont dit)
- Objet de l'email (2 options)
- Angle du message (pas le texte entier, juste la logique)
- CTA
- Timing recommandé
- Estimation taux d'ouverture et conversion

Pose une question si tu veux valider l'angle avec Central.
Parle naturellement, comme quelqu'un qui présente une stratégie marketing à un client. 5-6 phrases.
"""
        message = self._call_llm(prompt, 350)
        return {
            "message":  message or f"Voici la stratégie marketing pour '{sujet}'.",
            "data":     {"tx_conversion_base": tx_conversion},
            "question": None,
        }


# ===========================================================================
# OPTIMIZATION AGENT
# ===========================================================================
class OptimizationAgent(BaseAgent):
    def __init__(self):
        super().__init__("optimization")

    def run(self, sujet: str, question: str, messages: list, data: dict) -> dict:
        commandes = data.get("commandes", {})
        segments  = data.get("segments", {})
        events    = data.get("events", {})
        p         = self.params

        panier_moyen   = decimal_to_float(commandes.get("panier_moyen", 0))
        tx_conversion  = decimal_to_float(events.get("taux_conversion_pct", 0))
        nb_a           = segments.get("A", {}).get("nb_clients", 0)
        nb_b           = segments.get("B", {}).get("nb_clients", 0)
        roi_min_go     = p.get("roi_min_go", 2000)
        roi_min_test   = p.get("roi_min_test", 500)

        # Simulation ROI
        prospects      = nb_a + nb_b
        tx_estimee     = min(20, tx_conversion + 5)
        conversions    = int(prospects * tx_estimee / 100)
        ca_estime      = int(conversions * panier_moyen)
        cout_campagne  = 500
        revenu_net     = ca_estime - cout_campagne

        verdict = "GO" if revenu_net >= roi_min_go else ("À TESTER" if revenu_net >= roi_min_test else "STOP")

        prompt = f"""Tu es Optimization Agent dans ELISA. Tu simules le ROI et donnes un verdict financier.

**Produit :** {sujet}
**Instruction de Central :** {question}
**Contexte :**
{self._ctx(messages, 6)}

**Simulation ROI :**
- Prospects ciblés (A+B) : {prospects}
- Taux de conversion estimé : {tx_estimee}% (actuel {tx_conversion}% +5pts)
- Conversions attendues : {conversions}
- Panier moyen : {panier_moyen} FCFA
- CA estimé : {ca_estime} FCFA
- Coût campagne estimé : {cout_campagne} FCFA
- Revenu net : {revenu_net} FCFA

**Seuils ELISA (auto-ajustés) :**
- GO si revenu net ≥ {roi_min_go} FCFA
- À TESTER si entre {roi_min_test} et {roi_min_go} FCFA
- STOP si < {roi_min_test} FCFA

**Verdict calculé : {verdict}**

**Ta mission :**
Présente cette simulation de façon claire et honnête.
- Explique les hypothèses clés
- Mentionne les risques ou incertitudes
- Donne une recommandation concrète sur la prochaine étape
- Si c'est À TESTER, dis comment structurer le test
- Pose une question si tu vois un facteur qu'on n'a pas pris en compte

Langage naturel, direct, 5-6 phrases. Pas de tableau, parle vraiment.
"""
        message = self._call_llm(prompt, 400)
        return {
            "message": message or f"Simulation terminée — verdict : {verdict} (revenu net estimé {revenu_net} FCFA).",
            "data":    {
                "verdict":    verdict,
                "revenu_net": revenu_net,
                "ca_estime":  ca_estime,
                "conversions": conversions,
            },
            "question": None,
        }