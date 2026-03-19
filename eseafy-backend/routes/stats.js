const express = require('express');
const pool    = require('../config/db');
const auth    = require('../middleware/auth');

const router = express.Router();
router.use(auth);

// ══════════════════════════════════════
//  GET /api/stats/dashboard
// ══════════════════════════════════════
router.get('/dashboard', async (req, res) => {
  const userId = req.user.id;

  try {
    // ── Revenus par statut ce mois ──
    const revenusParStatut = await pool.query(`
      SELECT
        statut,
        COALESCE(SUM(total), 0) AS total,
        COUNT(*)                 AS nb
      FROM commandes
      WHERE user_id = $1
        AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
      GROUP BY statut
    `, [userId]);

    // ── Revenus mois dernier (payé) ──
    const revMoisDernier = await pool.query(`
      SELECT COALESCE(SUM(total), 0) AS total
      FROM commandes
      WHERE user_id = $1
        AND statut = 'paye'
        AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW() - INTERVAL '1 month')
    `, [userId]);

    // ── Totaux globaux toutes périodes ──
    const totauxGlobaux = await pool.query(`
      SELECT
        statut,
        COALESCE(SUM(total), 0) AS total,
        COUNT(*)                 AS nb
      FROM commandes
      WHERE user_id = $1
      GROUP BY statut
    `, [userId]);

    // ── Clients ──
    const clients = await pool.query(`
      SELECT COUNT(DISTINCT email_client) AS total FROM commandes WHERE user_id = $1
    `, [userId]);

    const nouveauxClients = await pool.query(`
      SELECT COUNT(DISTINCT email_client) AS total
      FROM commandes WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '7 days'
    `, [userId]);

    // ── Produits ──
    const produits        = await pool.query(`SELECT COUNT(*) AS total FROM produits WHERE user_id = $1`, [userId]);
    const produitsPublies = await pool.query(`SELECT COUNT(*) AS total FROM produits WHERE user_id = $1 AND statut = 'publie'`, [userId]);

    // ── Graph 30 jours ──
    const revenusGraph = await pool.query(`
      SELECT
        DATE(created_at)        AS jour,
        statut,
        COALESCE(SUM(total), 0) AS total
      FROM commandes
      WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at), statut
      ORDER BY jour ASC
    `, [userId]);

    // ── Dernières commandes ──
    const dernieres = await pool.query(`
      SELECT c.id, c.reference, c.total, c.statut, c.nom_client, c.created_at, v.nom_produit
      FROM commandes c
      LEFT JOIN ventes v ON v.commande_id = c.id
      WHERE c.user_id = $1
      ORDER BY c.created_at DESC
      LIMIT 8
    `, [userId]);

    // ── Construire les objets par statut ──
    const statuts  = { paye:{total:0,nb:0}, en_attente:{total:0,nb:0}, rembourse:{total:0,nb:0}, annule:{total:0,nb:0} };
    const globaux  = { paye:{total:0,nb:0}, en_attente:{total:0,nb:0}, rembourse:{total:0,nb:0}, annule:{total:0,nb:0} };

    revenusParStatut.rows.forEach(r => { if (statuts[r.statut]) { statuts[r.statut].total=parseFloat(r.total); statuts[r.statut].nb=parseInt(r.nb); }});
    totauxGlobaux.rows.forEach(r   => { if (globaux[r.statut])  { globaux[r.statut].total =parseFloat(r.total); globaux[r.statut].nb =parseInt(r.nb); }});

    const revMois   = statuts.paye.total;
    const variation = parseFloat(revMoisDernier.rows[0].total) > 0
      ? (((revMois - parseFloat(revMoisDernier.rows[0].total)) / parseFloat(revMoisDernier.rows[0].total)) * 100).toFixed(1)
      : null;

    return res.json({
      kpis: {
        // Ce mois par statut
        revenus_paye:        statuts.paye.total,
        revenus_en_attente:  statuts.en_attente.total,
        revenus_rembourse:   statuts.rembourse.total,
        revenus_annule:      statuts.annule.total,
        ventes_paye:         statuts.paye.nb,
        ventes_en_attente:   statuts.en_attente.nb,
        ventes_rembourse:    statuts.rembourse.nb,
        ventes_annule:       statuts.annule.nb,
        // Totaux globaux par statut
        total_paye:          globaux.paye.total,
        total_en_attente:    globaux.en_attente.total,
        total_rembourse:     globaux.rembourse.total,
        total_annule:        globaux.annule.total,
        nb_total_paye:       globaux.paye.nb,
        nb_total_en_attente: globaux.en_attente.nb,
        nb_total_rembourse:  globaux.rembourse.nb,
        nb_total_annule:     globaux.annule.nb,
        // Nets
        variation_revenus:   variation,
        frais_eseafy:        Math.round(revMois * 0.05),
        net_disponible:      Math.round(revMois * 0.95),
        // Clients & produits
        clients_total:       parseInt(clients.rows[0].total),
        nouveaux_clients:    parseInt(nouveauxClients.rows[0].total),
        produits_total:      parseInt(produits.rows[0].total),
        produits_publies:    parseInt(produitsPublies.rows[0].total),
      },
      graph_revenus:    revenusGraph.rows,
      dernieres_ventes: dernieres.rows,
    });

  } catch (err) {
    console.error('Erreur /stats/dashboard :', err.message);
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// ══════════════════════════════════════
//  GET /api/stats/revenus
// ══════════════════════════════════════
router.get('/revenus', async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await pool.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', created_at), 'Mon YYYY') AS mois,
        statut,
        SUM(total) AS total,
        COUNT(*)   AS nb_ventes
      FROM commandes
      WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', created_at), statut
      ORDER BY DATE_TRUNC('month', created_at) ASC
    `, [userId]);
    return res.json({ revenus: result.rows });
  } catch (err) {
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// ══════════════════════════════════════
//  GET /api/stats/top-produits
// ══════════════════════════════════════
router.get('/top-produits', async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await pool.query(`
      SELECT
        v.produit_id,
        v.nom_produit,
        SUM(v.quantite) AS nb_ventes,
        SUM(v.total)    AS revenus,
        c.statut
      FROM ventes v
      JOIN commandes c ON c.id = v.commande_id
      WHERE v.user_id = $1
      GROUP BY v.produit_id, v.nom_produit, c.statut
      ORDER BY nb_ventes DESC
      LIMIT 10
    `, [userId]);
    return res.json({ top_produits: result.rows });
  } catch (err) {
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

module.exports = router;