const express = require('express');
const pool    = require('../config/db');
const auth    = require('../middleware/auth');

const router = express.Router();
router.use(auth);

// ══════════════════════════════════════
//  GET /api/stats/dashboard
//  Toutes les stats pour le tableau de bord
// ══════════════════════════════════════
router.get('/dashboard', async (req, res) => {
  const userId = req.user.id;

  try {
    // ── Revenus ce mois ──
    const revenusThisMois = await pool.query(`
      SELECT COALESCE(SUM(total), 0) AS total
      FROM commandes
      WHERE user_id = $1
        AND statut = 'paye'
        AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
    `, [userId]);

    // ── Revenus mois dernier ──
    const revenusMoisDernier = await pool.query(`
      SELECT COALESCE(SUM(total), 0) AS total
      FROM commandes
      WHERE user_id = $1
        AND statut = 'paye'
        AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW() - INTERVAL '1 month')
    `, [userId]);

    // ── Nombre de ventes ce mois ──
    const ventesThisMois = await pool.query(`
      SELECT COUNT(*) AS total
      FROM commandes
      WHERE user_id = $1
        AND statut = 'paye'
        AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
    `, [userId]);

    // ── Ventes semaine dernière ──
    const ventesSemaineDerniere = await pool.query(`
      SELECT COUNT(*) AS total
      FROM commandes
      WHERE user_id = $1
        AND statut = 'paye'
        AND created_at >= NOW() - INTERVAL '14 days'
        AND created_at < NOW() - INTERVAL '7 days'
    `, [userId]);

    // ── Nombre de clients uniques ──
    const clients = await pool.query(`
      SELECT COUNT(DISTINCT email_client) AS total
      FROM commandes
      WHERE user_id = $1 AND statut = 'paye'
    `, [userId]);

    // ── Nouveaux clients cette semaine ──
    const nouveauxClients = await pool.query(`
      SELECT COUNT(DISTINCT email_client) AS total
      FROM commandes
      WHERE user_id = $1
        AND statut = 'paye'
        AND created_at >= NOW() - INTERVAL '7 days'
    `, [userId]);

    // ── Nombre de produits ──
    const produits = await pool.query(`
      SELECT COUNT(*) AS total FROM produits WHERE user_id = $1
    `, [userId]);

    const produitsPublies = await pool.query(`
      SELECT COUNT(*) AS total FROM produits WHERE user_id = $1 AND statut = 'publie'
    `, [userId]);

    // ── Revenus 30 derniers jours (par jour pour le graphe) ──
    const revenusGraph = await pool.query(`
      SELECT
        DATE(created_at) AS jour,
        SUM(total)       AS total
      FROM commandes
      WHERE user_id = $1
        AND statut = 'paye'
        AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY jour ASC
    `, [userId]);

    // ── Dernières ventes ──
    const dernieresVentes = await pool.query(`
      SELECT
        c.reference,
        c.total,
        c.statut,
        c.nom_client,
        c.created_at,
        v.nom_produit
      FROM commandes c
      LEFT JOIN ventes v ON v.commande_id = c.id
      WHERE c.user_id = $1
      ORDER BY c.created_at DESC
      LIMIT 5
    `, [userId]);

    // ── Frais eseafy (5%) ──
    const revenusMois   = parseFloat(revenusThisMois.rows[0].total);
    const fraisEseafy   = revenusMois * 0.05;
    const netDisponible = revenusMois - fraisEseafy;

    // ── Calcul variation revenus ──
    const revMoisDernier = parseFloat(revenusMoisDernier.rows[0].total);
    const variationRev   = revMoisDernier > 0
      ? (((revenusMois - revMoisDernier) / revMoisDernier) * 100).toFixed(1)
      : null;

    // ── Calcul variation ventes ──
    const ventesM  = parseInt(ventesThisMois.rows[0].total);
    const ventesMD = parseInt(ventesSemaineDerniere.rows[0].total);
    const variationVentes = ventesMD > 0
      ? ventesM - ventesMD
      : null;

    return res.json({
      kpis: {
        revenus_mois:       revenusMois,
        revenus_mois_dernier: revMoisDernier,
        variation_revenus:  variationRev,
        frais_eseafy:       Math.round(fraisEseafy),
        net_disponible:     Math.round(netDisponible),
        ventes_mois:        ventesM,
        variation_ventes:   variationVentes,
        clients_total:      parseInt(clients.rows[0].total),
        nouveaux_clients:   parseInt(nouveauxClients.rows[0].total),
        produits_total:     parseInt(produits.rows[0].total),
        produits_publies:   parseInt(produitsPublies.rows[0].total),
      },
      graph_revenus:    revenusGraph.rows,
      dernieres_ventes: dernieresVentes.rows,
    });

  } catch (err) {
    console.error('Erreur GET /stats/dashboard :', err.message);
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// ══════════════════════════════════════
//  GET /api/stats/revenus
//  Revenus par mois (12 derniers mois)
// ══════════════════════════════════════
router.get('/revenus', async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await pool.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', created_at), 'Mon YYYY') AS mois,
        SUM(total) AS total,
        COUNT(*)   AS nb_ventes
      FROM commandes
      WHERE user_id = $1
        AND statut = 'paye'
        AND created_at >= NOW() - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY DATE_TRUNC('month', created_at) ASC
    `, [userId]);

    return res.json({ revenus: result.rows });
  } catch (err) {
    console.error('Erreur GET /stats/revenus :', err.message);
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// ══════════════════════════════════════
//  GET /api/stats/top-produits
//  Produits les plus vendus
// ══════════════════════════════════════
router.get('/top-produits', async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await pool.query(`
      SELECT
        v.produit_id,
        v.nom_produit,
        SUM(v.quantite) AS nb_ventes,
        SUM(v.total)    AS revenus
      FROM ventes v
      WHERE v.user_id = $1
      GROUP BY v.produit_id, v.nom_produit
      ORDER BY nb_ventes DESC
      LIMIT 5
    `, [userId]);

    return res.json({ top_produits: result.rows });
  } catch (err) {
    console.error('Erreur GET /stats/top-produits :', err.message);
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

module.exports = router;
