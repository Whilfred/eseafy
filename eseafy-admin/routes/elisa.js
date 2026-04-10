const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// ══ GET /api/elisa/geographie ══
router.get('/geographie', async (req, res) => {
  try {
    // Récupérer la première boutique
    const boutiqueRes = await pool.query('SELECT id FROM boutiques LIMIT 1');
    if (boutiqueRes.rows.length === 0) {
      return res.json({ top_pays: [], message: 'Aucune boutique trouvée' });
    }
    const boutique_id = boutiqueRes.rows[0].id;

    // Top pays par visiteurs
    const topPays = await pool.query(`
      SELECT 
        v.country,
        COUNT(DISTINCT v.session_id) as visiteurs,
        ROUND(AVG(COALESCE(cp.purchase_score, 0)), 1) as score_moyen
      FROM visitors v
      LEFT JOIN customer_profiles cp ON cp.session_id = v.session_id
      WHERE v.boutique_id = $1 AND v.country IS NOT NULL AND v.country != ''
      GROUP BY v.country
      ORDER BY visiteurs DESC
      LIMIT 10
    `, [boutique_id]);

    // Top pays par revenus
    const topRevenus = await pool.query(`
      SELECT 
        v.country,
        COALESCE(SUM(c.total), 0) as revenus,
        COUNT(DISTINCT c.id) as commandes
      FROM visitors v
      JOIN commandes c ON c.email_client = v.email AND c.statut = 'paye'
      WHERE v.boutique_id = $1 AND v.country IS NOT NULL AND v.country != ''
      GROUP BY v.country
      ORDER BY revenus DESC
      LIMIT 10
    `, [boutique_id]);

    // Répartition Hot/Warm/Cold par pays
    const repartition = await pool.query(`
      SELECT 
        v.country,
        COUNT(CASE WHEN cp.purchase_score >= 70 THEN 1 END) as hot,
        COUNT(CASE WHEN cp.purchase_score >= 40 AND cp.purchase_score < 70 THEN 1 END) as warm,
        COUNT(CASE WHEN cp.purchase_score >= 20 AND cp.purchase_score < 40 THEN 1 END) as cold,
        COUNT(CASE WHEN cp.purchase_score < 20 THEN 1 END) as inactive
      FROM visitors v
      LEFT JOIN customer_profiles cp ON cp.session_id = v.session_id
      WHERE v.boutique_id = $1 AND v.country IS NOT NULL AND v.country != ''
      GROUP BY v.country
      ORDER BY hot DESC
      LIMIT 10
    `, [boutique_id]);

    // Nouveaux visiteurs (30 derniers jours)
    const nouveauxVisiteurs = await pool.query(`
      SELECT 
        v.country,
        COUNT(DISTINCT v.session_id) as nouveaux_visiteurs
      FROM visitors v
      WHERE v.boutique_id = $1 
        AND v.country IS NOT NULL 
        AND v.country != ''
        AND v.created_at >= NOW() - INTERVAL '30 days'
      GROUP BY v.country
      ORDER BY nouveaux_visiteurs DESC
      LIMIT 10
    `, [boutique_id]);

    res.json({
      top_pays: topPays.rows,
      top_revenus: topRevenus.rows,
      repartition: repartition.rows,
      nouveaux_visiteurs: nouveauxVisiteurs.rows
    });
  } catch (err) {
    console.error('❌ Erreur geographie:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/geographie', async (req, res) => {
  try {
    // Prendre la première boutique pour l'exemple
    const boutiqueRes = await pool.query('SELECT id FROM boutiques LIMIT 1');
    if (boutiqueRes.rows.length === 0) {
      return res.json({ top_pays: [] });
    }
    const boutique_id = boutiqueRes.rows[0].id;

    const topPays = await pool.query(`
      SELECT 
        v.country,
        COUNT(DISTINCT v.session_id) as visiteurs,
        ROUND(AVG(COALESCE(cp.purchase_score, 0)), 1) as score_moyen
      FROM visitors v
      LEFT JOIN customer_profiles cp ON cp.session_id = v.session_id
      WHERE v.boutique_id = $1 AND v.country IS NOT NULL AND v.country != ''
      GROUP BY v.country
      ORDER BY visiteurs DESC
      LIMIT 10
    `, [boutique_id]);

    res.json({ top_pays: topPays.rows });
  } catch (err) {
    console.error('❌ Erreur geographie:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
