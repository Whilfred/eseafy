import os
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

def get_db():
    return psycopg2.connect(
        host=os.getenv("DB_HOST"),
        port=os.getenv("DB_PORT", 5432),
        dbname=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        sslmode=os.getenv("DB_SSL", "require"),
        cursor_factory=psycopg2.extras.RealDictCursor
    )

def fetch_simulation_data(boutique_id=None):
    conn = get_db()
    cur = conn.cursor()
    b_filter_c  = "AND c.boutique_id = %(bid)s"   if boutique_id else ""
    b_filter_v  = "AND v.boutique_id = %(bid)s"   if boutique_id else ""
    b_filter_e  = "AND e.boutique_id = %(bid)s"   if boutique_id else ""
    b_filter_cp = "AND cp.boutique_id = %(bid)s"  if boutique_id else ""
    b_filter_pr = "AND pr.boutique_id = %(bid)s"  if boutique_id else ""
    b_filter_af = "AND a.boutique_id = %(bid)s"   if boutique_id else ""
    params = {"bid": boutique_id}

    # Résumé commandes
    cur.execute(f"""
        SELECT
            COUNT(*)                                          AS total_commandes,
            COUNT(*) FILTER (WHERE statut = 'paye')          AS commandes_payees,
            COUNT(*) FILTER (WHERE statut = 'en_attente')    AS commandes_attente,
            COUNT(*) FILTER (WHERE statut = 'annule')        AS commandes_annulees,
            ROUND(AVG(total) FILTER (WHERE statut='paye'),2) AS panier_moyen,
            ROUND(SUM(total) FILTER (WHERE statut='paye'),2) AS revenu_total,
            COUNT(DISTINCT email_client)                     AS clients_uniques
        FROM commandes c WHERE 1=1 {b_filter_c}
    """, params)
    orders = dict(cur.fetchone() or {})

    # Revenus 6 derniers mois
    cur.execute(f"""
        SELECT
            TO_CHAR(DATE_TRUNC('month', c.created_at), 'Mon YYYY') AS mois,
            ROUND(SUM(c.total), 2)                                  AS revenu,
            COUNT(*)                                                AS nb_commandes
        FROM commandes c
        WHERE statut = 'paye' AND c.created_at >= NOW() - INTERVAL '6 months'
          {b_filter_c}
        GROUP BY DATE_TRUNC('month', c.created_at)
        ORDER BY DATE_TRUNC('month', c.created_at)
    """, params)
    revenus_mois = [dict(r) for r in cur.fetchall()]

    # Top produits vendus
    cur.execute(f"""
        SELECT
            v.nom_produit,
            COUNT(*)                      AS nb_ventes,
            ROUND(SUM(v.total), 2)        AS revenu_total,
            ROUND(AVG(v.prix_unitaire),2) AS prix_moyen
        FROM ventes v
        JOIN commandes c ON c.id = v.commande_id
        WHERE c.statut = 'paye' {b_filter_v}
        GROUP BY v.nom_produit
        ORDER BY revenu_total DESC
        LIMIT 5
    """, params)
    top_produits = [dict(r) for r in cur.fetchall()]

    # Segmentation RFM simplifiée
    cur.execute(f"""
        WITH client_stats AS (
            SELECT
                email_client,
                COUNT(*)                                        AS nb_commandes,
                ROUND(AVG(total), 2)                            AS panier_moyen,
                ROUND(SUM(total), 2)                            AS total_depense,
                EXTRACT(DAY FROM NOW()-MAX(created_at))         AS jours_inactif
            FROM commandes c
            WHERE statut = 'paye' AND email_client IS NOT NULL {b_filter_c}
            GROUP BY email_client
        ),
        seuil AS (
            SELECT PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY panier_moyen) AS p75
            FROM client_stats
        )
        SELECT
            CASE
                WHEN nb_commandes >= 3 AND panier_moyen >= (SELECT p75 FROM seuil) THEN 'A'
                WHEN nb_commandes >= 2                                              THEN 'B'
                WHEN nb_commandes = 1 AND jours_inactif <= 60                      THEN 'C'
                ELSE                                                                     'D'
            END                          AS segment,
            COUNT(*)                     AS nb_clients,
            ROUND(AVG(panier_moyen), 2)  AS panier_moyen,
            ROUND(AVG(total_depense), 2) AS ltv_moyen,
            ROUND(AVG(jours_inactif), 0) AS jours_inactif_moyen
        FROM client_stats
        GROUP BY segment
        ORDER BY segment
    """, params)
    segments = {r['segment']: dict(r) for r in cur.fetchall()}

    # Profils enrichis
    cur.execute(f"""
        SELECT
            COUNT(*)                                              AS total_profils,
            ROUND(AVG(purchase_score), 2)                         AS score_achat_moyen,
            ROUND(AVG(churn_risk), 2)                             AS risque_churn_moyen,
            ROUND(AVG(ltv_estimated), 2)                          AS ltv_estimee_moy,
            COUNT(*) FILTER (WHERE purchase_score >= 70)          AS profils_chauds,
            COUNT(*) FILTER (WHERE churn_risk >= 60)              AS profils_risque_churn,
            COUNT(*) FILTER (WHERE promo_sensitive = true)        AS sensibles_promo,
            MODE() WITHIN GROUP (ORDER BY acquisition_source)     AS source_principale
        FROM customer_profiles cp WHERE 1=1 {b_filter_cp}
    """, params)
    profiles = dict(cur.fetchone() or {})

    # Events & conversion
    cur.execute(f"""
        SELECT
            COUNT(DISTINCT session_id)                                        AS sessions_totales,
            COUNT(*) FILTER (WHERE event_type = 'page_view')                  AS page_views,
            COUNT(*) FILTER (WHERE event_type = 'add_to_cart')                AS ajouts_panier,
            COUNT(*) FILTER (WHERE event_type = 'purchase')                   AS achats,
            ROUND(
                COUNT(*) FILTER (WHERE event_type='purchase')::NUMERIC /
                NULLIF(COUNT(DISTINCT session_id),0) * 100, 2
            )                                                                 AS taux_conversion_pct
        FROM events e WHERE 1=1 {b_filter_e}
    """, params)
    events_stats = dict(cur.fetchone() or {})

    # Codes promo
    cur.execute(f"""
        SELECT
            COUNT(*)                               AS total_codes,
            COUNT(*) FILTER (WHERE actif = true)   AS codes_actifs,
            ROUND(AVG(nb_utilisations), 1)         AS utilisations_moy,
            SUM(nb_utilisations)                   AS utilisations_total
        FROM codes_promo pr WHERE 1=1 {b_filter_pr}
    """, params)
    promos = dict(cur.fetchone() or {})

    # Affiliés
    cur.execute(f"""
        SELECT
            COUNT(*)                             AS total_affilies,
            COUNT(*) FILTER (WHERE actif=true)   AS affilies_actifs,
            ROUND(SUM(total_ventes), 2)          AS ventes_via_affiliation,
            ROUND(AVG(commission_pct), 1)        AS commission_moy_pct
        FROM affilies a WHERE 1=1 {b_filter_af}
    """, params)
    affilies = dict(cur.fetchone() or {})

    cur.close()
    conn.close()

    return {
        "commandes":    orders,
        "revenus_mois": revenus_mois,
        "top_produits": top_produits,
        "segments":     segments,
        "profiles":     profiles,
        "events":       events_stats,
        "promos":       promos,
        "affilies":     affilies,
    }