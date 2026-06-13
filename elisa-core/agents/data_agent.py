from .base import BaseAgent
from utils.helpers import decimal_to_float

class DataAgent(BaseAgent):
    def __init__(self):
        super().__init__("data")

    def run(self, sujet: str, question: str, messages: list, data: dict) -> dict:
        """
        Data Agent cherche dans la base.
        'question' contient la directive de Central (peut mentionner une catégorie fallback).
        """
        # Déterminer si Central demande une recherche élargie
        note_centrale  = question or ""
        cherche_categorie = any(
            mot in note_centrale.lower()
            for mot in ["catégorie", "categorie", "similaire", "proche", "élarg", "elarg", "cuisine", "bagagerie"]
        )

        if cherche_categorie:
            return self._recherche_categorie(sujet, note_centrale, data)
        else:
            return self._recherche_directe(sujet, data)

    # ------------------------------------------------------------------
    # RECHERCHE DIRECTE (produit exact)
    # ------------------------------------------------------------------
    def _recherche_directe(self, sujet: str, data: dict) -> dict:
        top_produits = data.get("top_produits", [])
        sujet_lower  = sujet.lower()

        produit_trouve = None
        for p in top_produits:
            nom = p.get("nom_produit", "").lower()
            if sujet_lower in nom or nom in sujet_lower:
                produit_trouve = p
                break

        if produit_trouve:
            nb_ventes = produit_trouve.get("nb_ventes", 0)
            revenu    = decimal_to_float(produit_trouve.get("revenu_total", 0))
            prix      = decimal_to_float(produit_trouve.get("prix_moyen", 0))
            
            message_data = {
                "trouve":        True,
                "produit":       produit_trouve.get("nom_produit"),
                "nb_ventes":     nb_ventes,
                "revenu":        revenu,
                "prix_moyen":    prix,
                "segments":      self._analyse_segments(data),
            }
            
            prompt = f"""Tu es Data Agent dans ELISA. Tu viens de chercher "{sujet}" dans la base de données et tu l'as trouvé.

Voici ce que tu as :
- Produit : {produit_trouve.get('nom_produit')}
- Ventes : {nb_ventes}
- Revenu total : {revenu} FCFA
- Prix moyen : {prix} FCFA
- {self._segments_texte(data)}

Parle naturellement à Central (3-4 phrases), comme un collègue qui remonte ses trouvailles.
Mentionne les chiffres clés et pose une question si tu vois quelque chose d'intéressant.
Exemple : "Central, bonne nouvelle — j'ai trouvé le produit directement dans la base. On a X ventes pour Y FCFA de revenu..."
"""
        else:
            # Produit non trouvé — chercher la catégorie via LLM
            categorie  = self._inférer_catégorie(sujet)
            top_noms   = [p.get("nom_produit", "") for p in top_produits[:5]]
            
            message_data = {
                "trouve":          False,
                "produit_cherche": sujet,
                "categorie_suggeree": categorie,
                "top_produits_base":  top_noms,
            }
            
            prompt = f"""Tu es Data Agent dans ELISA. Tu viens de chercher "{sujet}" dans la base — rien de direct.

Ce que tu as trouvé dans la base (produits similaires potentiels) :
{top_noms}

La catégorie probable de "{sujet}" : {categorie}

Parle naturellement à Central (3-4 phrases).
- Dis clairement qu'il n'y a rien d'exact sur "{sujet}"
- Propose d'aller chercher dans la catégorie "{categorie}"
- Demande confirmation à Central avant d'aller plus loin
Exemple : "Central, j'ai rien trouvé directement sur '{sujet}'. Mais ça ressemble à du {categorie} — j'ai quelques clients dans ce coin-là. Tu veux que je creuse dans cette catégorie ?"
"""
        
        message = self._call_llm(prompt, 250)
        return {
            "message":  message or f"Data Agent a cherché '{sujet}' — voici les résultats.",
            "data":     message_data,
            "question": None,
        }

    # ------------------------------------------------------------------
    # RECHERCHE ÉLARGIE (catégorie)
    # ------------------------------------------------------------------
    def _recherche_categorie(self, sujet: str, note_centrale: str, data: dict) -> dict:
        # Extraire la catégorie depuis la note de Central
        categorie  = self._extraire_categorie_note(note_centrale, sujet)
        top_produits = data.get("top_produits", [])
        segments   = data.get("segments", {})
        profiles   = data.get("profiles", {})

        # Clients potentiels dans la catégorie
        cat_lower   = categorie.lower()
        prods_match = [
            p for p in top_produits
            if any(mot in p.get("nom_produit", "").lower() for mot in cat_lower.split())
        ]
        
        # Construire profil prospect depuis les segments
        seg_a = segments.get("A", {})
        seg_b = segments.get("B", {})
        nb_prospects_potentiels = (
            seg_a.get("nb_clients", 0) +
            seg_b.get("nb_clients", 0)
        )
        
        message_data = {
            "trouve":              True,
            "via_categorie":       True,
            "categorie":           categorie,
            "produits_categorie":  [p.get("nom_produit") for p in prods_match],
            "nb_prospects_potentiels": nb_prospects_potentiels,
            "score_achat_moyen":   float(profiles.get("score_achat_moyen") or 0),
            "profils_chauds":      profiles.get("profils_chauds", 0),
        }

        prompt = f"""Tu es Data Agent dans ELISA. Central t'a demandé de chercher dans la catégorie "{categorie}" pour trouver des prospects qui pourraient acheter "{sujet}".

Ce que tu as trouvé :
- Catégorie explorée : {categorie}
- Produits similaires dans la base : {[p.get("nom_produit") for p in prods_match] or "aucun exact mais des profils existent"}
- Prospects potentiels (segments A+B) : {nb_prospects_potentiels} clients
- Profils avec score d'achat élevé : {profiles.get("profils_chauds", 0)}
- {self._segments_texte(data)}

Parle à Central (4-5 phrases) de façon naturelle :
- Confirme que tu es allé dans la catégorie
- Donne les chiffres des prospects trouvés
- Explique pourquoi ces clients sont pertinents pour "{sujet}"
- Passe la main à Prospect Agent pour affiner
Exemple : "Ok, j'ai élargi sur la catégorie {categorie}. On a X clients qui achètent dans cet espace..."
"""
        message = self._call_llm(prompt, 300)
        return {
            "message":  message or f"J'ai élargi sur la catégorie {categorie} — {nb_prospects_potentiels} prospects potentiels trouvés.",
            "data":     message_data,
            "question": None,
        }

    # ------------------------------------------------------------------
    # HELPERS
    # ------------------------------------------------------------------
    def _inférer_catégorie(self, terme: str) -> str:
        prompt = f"""De quelle catégorie de produit fait partie "{terme}" ?
Exemples: louche → ustensile cuisine | sacoche → bagagerie | cartable enfant → scolaire enfant | huile de palme → alimentation
Réponds UNIQUEMENT avec le nom de la catégorie en 2-3 mots max."""
        cat = self._call_llm(prompt, 30)
        return cat or "produits divers"

    def _extraire_categorie_note(self, note: str, sujet: str) -> str:
        prompt = f"""Dans cette instruction : "{note}"
Quel nom de catégorie de produit est mentionné ou sous-entendu ? (pour le produit "{sujet}")
Réponds UNIQUEMENT avec le nom de la catégorie, 2-3 mots max."""
        cat = self._call_llm(prompt, 30)
        return cat or "produits similaires"

    def _analyse_segments(self, data: dict) -> dict:
        from utils.helpers import decimal_to_float
        segments = data.get("segments", {})
        result   = {}
        for s in ["A", "B", "C", "D"]:
            d = segments.get(s, {})
            if d.get("nb_clients", 0) > 0:
                result[s] = {
                    "nb_clients":  d["nb_clients"],
                    "panier_moyen": decimal_to_float(d.get("panier_moyen", 0)),
                    "jours_inactif": float(d.get("jours_inactif_moyen") or 0),
                }
        return result

    def _segments_texte(self, data: dict) -> str:
        segs = self._analyse_segments(data)
        if not segs:
            return "Pas de données de segmentation"
        lines = []
        for s, d in segs.items():
            lines.append(f"Segment {s}: {d['nb_clients']} clients, panier moyen {d['panier_moyen']} FCFA")
        return " | ".join(lines)