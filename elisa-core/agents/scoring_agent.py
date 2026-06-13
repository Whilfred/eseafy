from .base import BaseAgent
from utils.helpers import decimal_to_float

class ScoringAgent(BaseAgent):
    def __init__(self):
        super().__init__("scoring")

    def run(self, sujet: str, question: str, messages: list, data: dict) -> dict:
        profiles = data.get("profiles", {})
        segments = data.get("segments", {})
        events   = data.get("events", {})
        p        = self.params

        seuil_chaud  = p.get("seuil_chaud", 65)
        seuil_churn  = p.get("seuil_churn_ok", 70)

        # Scores depuis la base
        score_achat   = decimal_to_float(profiles.get("score_achat_moyen", 0))
        churn_moyen   = decimal_to_float(profiles.get("risque_churn_moyen", 0))
        ltv_moyen     = decimal_to_float(profiles.get("ltv_estimee_moy", 0))
        profils_chauds = profiles.get("profils_chauds", 0)
        churn_risque  = profiles.get("profils_risque_churn", 0)

        tx_conversion = decimal_to_float(events.get("taux_conversion_pct", 0))

        # Segments
        seg_a = segments.get("A", {})
        seg_b = segments.get("B", {})
        nb_a  = seg_a.get("nb_clients", 0)
        nb_b  = seg_b.get("nb_clients", 0)

        # Score ajusté selon le contexte produit
        score_ajuste = self._calculer_score_ajuste(sujet, score_achat, tx_conversion, segments)

        prompt = f"""Tu es Scoring Agent dans ELISA. Tu calcules la propension d'achat des prospects.

**Produit :** {sujet}
**Instruction de Central :** {question}
**Contexte :**
{self._ctx(messages, 5)}

**Données scoring :**
- Score achat moyen global : {score_achat}/100
- Score ajusté pour "{sujet}" : {score_ajuste}/100
- Risque churn moyen : {churn_moyen}/100
- LTV estimée moyenne : {ltv_moyen} FCFA
- Profils "chauds" (score≥70) : {profils_chauds}
- Profils à risque churn : {churn_risque}
- Taux de conversion actuel : {tx_conversion}%

**Seuils ELISA (auto-ajustés) :**
- Seuil "prospect chaud" : {seuil_chaud}/100
- Seuil churn acceptable : {seuil_churn}/100

**Segments prioritaires :**
- Segment A : {nb_a} clients
- Segment B : {nb_b} clients

**Ta mission :**
- Donne ton évaluation du score de propension à acheter "{sujet}"
- Explique ce qui tire le score vers le haut ou vers le bas
- Classe les prospects en "chauds" / "tièdes" / "froids"
- Si le score est limite (entre {seuil_chaud-10} et {seuil_chaud}), dis-le et propose ce qu'on peut faire
- Pose une question si tu as besoin d'un élément

Parle naturellement, 4-5 phrases. Donne des chiffres précis.
"""
        message = self._call_llm(prompt, 350)
        
        return {
            "message": message or f"Score de propension pour '{sujet}' : {score_ajuste}/100 — {'au-dessus' if score_ajuste >= seuil_chaud else 'en dessous'} du seuil.",
            "data": {
                "score_ajuste":   score_ajuste,
                "seuil_chaud":    seuil_chaud,
                "score_ok":       score_ajuste >= seuil_chaud,
                "churn_ok":       churn_moyen <= seuil_churn,
                "profils_chauds": profils_chauds,
                "ltv_moyen":      ltv_moyen,
            },
            "question": None,
        }

    def _calculer_score_ajuste(self, sujet: str, score_base: float, tx_conversion: float, segments: dict) -> int:
        """
        Calcule un score contextualisé au produit.
        Utilise quelques heuristiques simples.
        """
        score = score_base or 60

        # Boost si taux de conversion global est bon
        if tx_conversion > 5:
            score += 5
        elif tx_conversion < 2:
            score -= 5

        # Boost si segment A bien représenté
        nb_a = segments.get("A", {}).get("nb_clients", 0)
        if nb_a > 50:
            score += 5
        elif nb_a < 10:
            score -= 5

        return min(99, max(10, round(score)))