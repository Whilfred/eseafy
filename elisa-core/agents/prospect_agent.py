from .base import BaseAgent
from utils.helpers import decimal_to_float

class ProspectAgent(BaseAgent):
    def __init__(self):
        super().__init__("prospect")

    def run(self, sujet: str, question: str, messages: list, data: dict) -> dict:
        profiles = data.get("profiles", {})
        segments = data.get("segments", {})
        p        = self.params

        # Extraire les données pertinentes
        seg_a = segments.get("A", {})
        seg_b = segments.get("B", {})
        seg_c = segments.get("C", {})

        nb_a      = seg_a.get("nb_clients", 0)
        nb_b      = seg_b.get("nb_clients", 0)
        nb_c      = seg_c.get("nb_clients", 0)
        panier_a  = decimal_to_float(seg_a.get("panier_moyen", 0))
        panier_b  = decimal_to_float(seg_b.get("panier_moyen", 0))
        jours_a   = float(seg_a.get("jours_inactif_moyen") or 0)
        jours_b   = float(seg_b.get("jours_inactif_moyen") or 0)

        profils_chauds    = profiles.get("profils_chauds", 0)
        sensibles_promo   = profiles.get("sensibles_promo", 0)
        score_achat_moyen = decimal_to_float(profiles.get("score_achat_moyen", 0))
        churn_risque      = profiles.get("profils_risque_churn", 0)
        source_principale = profiles.get("source_principale", "inconnue")

        min_prospects = p.get("min_prospects", 5)

        # Contexte de la conversation pour savoir si c'est via catégorie
        ctx            = self._ctx(messages, 6)
        via_categorie  = "catégorie" in ctx.lower() or "catégorie" in question.lower()

        prompt = f"""Tu es Prospect Agent dans ELISA. Tu qualifies les prospects — tu identifies ceux qui sont les plus susceptibles d'acheter un produit.

**Produit analysé :** {sujet}
**Instruction de Central :** {question}
**Via catégorie élargie :** {"Oui" if via_categorie else "Non"}
**Contexte conversation :**
{ctx}

**Données prospects :**
- Segment A (meilleurs clients) : {nb_a} clients, panier {panier_a} FCFA, inactifs depuis {jours_a:.0f} jours en moyenne
- Segment B (bons clients) : {nb_b} clients, panier {panier_b} FCFA, inactifs depuis {jours_b:.0f} jours
- Segment C (occasionnels) : {nb_c} clients
- Profils avec score achat élevé : {profils_chauds}
- Sensibles aux promos : {sensibles_promo}
- Score achat moyen global : {score_achat_moyen}/100
- Risque churn élevé : {churn_risque}
- Source principale d'acquisition : {source_principale}
- Seuil minimum prospects (ELISA) : {min_prospects}

**Ta mission :**
1. Qualifier les prospects les plus pertinents pour "{sujet}"
2. Expliquer pourquoi ils correspondent (comportement d'achat, panier, récence)
3. Si tu vois des patterns intéressants (ex: les sensibles aux promos achètent aussi des ustensiles), dis-le
4. Pose une question à Central si tu as besoin d'une précision
5. Si trop peu de prospects → dis-le clairement sans dramatiser

Réponds en langage très naturel, comme un collègue qui analyse des données (5-6 phrases max).
Pas de bullet points, parle vraiment.
Si tu poses une question, formule-la à la fin.
"""
        message = self._call_llm(prompt, 350)
        
        # Données structurées pour Scoring Agent
        prospects_data = {
            "nb_qualifies":     nb_a + (nb_b if nb_b > 0 else 0),
            "nb_prioritaires":  profils_chauds,
            "segment_cible":    "A+B",
            "panier_moyen":     (panier_a + panier_b) / 2 if panier_b else panier_a,
            "sensibles_promo":  sensibles_promo,
            "score_moyen":      score_achat_moyen,
            "assez_prospects":  (nb_a + nb_b) >= min_prospects,
        }
        
        return {
            "message":  message or f"J'ai identifié {nb_a + nb_b} prospects potentiels pour '{sujet}' dans les segments A et B.",
            "data":     prospects_data,
            "question": None,
        }