const express = require('express');
const pool    = require('../config/db');
const auth    = require('../middleware/auth');

const router = express.Router();

// ══════════════════════════════════════
//  POST /api/analytics/visite
//  Enregistrer une visite (public — sans auth)
// ══════════════════════════════════════
router.post('/visite', async (req, res) => {
  const { boutique_slug, produit_slug, type } = req.body;

  try {
    // Trouver la boutique
    const boutiqueResult = await pool.query(
      'SELECT id, user_id FROM boutiques WHERE slug = $1',
      [boutique_slug]
    );
    if (boutiqueResult.rows.length === 0) return res.status(404).json({ message: 'Boutique introuvable.' });

    const boutique = boutiqueResult.rows[0];
    let produit_id = null;

    // Trouver le produit si c'est une visite produit
    if (type === 'produit' && produit_slug) {
      const produitResult = await pool.query(
        'SELECT id FROM produits WHERE slug = $1',
        [produit_slug]
      );
      if (produitResult.rows.length > 0) produit_id = produitResult.rows[0].id;
    }

    // IP du visiteur
    const ip         = req.headers['x-forwarded-for'] || req.socket.remoteAddress || null;
    const user_agent = req.headers['user-agent'] || null;

    await pool.query(
      `INSERT INTO visites (boutique_id, produit_id, user_id, type, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [boutique.id, produit_id, boutique.user_id, type || 'boutique', ip, user_agent]
    );

    return res.status(201).json({ message: 'Visite enregistrée.' });

  } catch (err) {
    console.error('Erreur POST /analytics/visite :', err.message);
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// ══════════════════════════════════════
//  GET /api/analytics/dashboard
//  Stats analytiques complètes
// ══════════════════════════════════════
router.get('/dashboard', auth, async (req, res) => {
  const userId = req.user.id;

  try {
    // ── Visites totales ──
    const visitesTotales = await pool.query(
      `SELECT COUNT(*) AS total FROM visites WHERE user_id = $1`,
      [userId]
    );

    // ── Visites ce mois ──
    const visitesMois = await pool.query(
      `SELECT COUNT(*) AS total FROM visites
       WHERE user_id = $1
         AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())`,
      [userId]
    );

    // ── Visiteurs uniques (par IP) ──
    const visiteursUniques = await pool.query(
      `SELECT COUNT(DISTINCT ip) AS total FROM visites WHERE user_id = $1`,
      [userId]
    );

    // ── Visites par jour (30 derniers jours) ──
    const visitesGraph = await pool.query(
      `SELECT DATE(created_at) AS jour, COUNT(*) AS total
       FROM visites
       WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '30 days'
       GROUP BY DATE(created_at)
       ORDER BY jour ASC`,
      [userId]
    );

    // ── Visites par type (boutique / produit) ──
    const visitesParType = await pool.query(
      `SELECT type, COUNT(*) AS total FROM visites WHERE user_id = $1 GROUP BY type`,
      [userId]
    );

    // ── Produits les plus vus ──
    const topProduits = await pool.query(
      `SELECT v.produit_id, p.nom, COUNT(*) AS vues
       FROM visites v
       JOIN produits p ON p.id = v.produit_id
       WHERE v.user_id = $1 AND v.type = 'produit'
       GROUP BY v.produit_id, p.nom
       ORDER BY vues DESC
       LIMIT 5`,
      [userId]
    );

    // ── Taux de conversion (commandes / visites produit) ──
    const commandesTotal = await pool.query(
      `SELECT COUNT(*) AS total FROM commandes WHERE user_id = $1`,
      [userId]
    );
    const visitesProduits = await pool.query(
      `SELECT COUNT(*) AS total FROM visites WHERE user_id = $1 AND type = 'produit'`,
      [userId]
    );

    const nbCommandes     = parseInt(commandesTotal.rows[0].total);
    const nbVisitesProd   = parseInt(visitesProduits.rows[0].total);
    const tauxConversion  = nbVisitesProd > 0
      ? ((nbCommandes / nbVisitesProd) * 100).toFixed(1)
      : 0;

    // ── Construire réponse ──
    const typeMap = {};
    visitesParType.rows.forEach(r => { typeMap[r.type] = parseInt(r.total); });

    // ── Produits vendus par jour (30 derniers jours) ──
const graph_ventes = await pool.query(`
  SELECT
    DATE(c.created_at) AS jour,
    COUNT(v.id) AS nb_ventes
  FROM ventes v
  JOIN commandes c ON c.id = v.commande_id
  WHERE v.user_id = $1
    AND c.created_at >= NOW() - INTERVAL '30 days'
  GROUP BY DATE(c.created_at)
  ORDER BY jour;
`, [req.user.id]);

console.log("RESULT DB:", result.rows);

    return res.json({
      kpis: {
        visites_totales:    parseInt(visitesTotales.rows[0].total),
        visites_mois:       parseInt(visitesMois.rows[0].total),
        visiteurs_uniques:  parseInt(visiteursUniques.rows[0].total),
        visites_boutique:   typeMap.boutique || 0,
        visites_produits:   typeMap.produit  || 0,
        taux_conversion:    parseFloat(tauxConversion),
      },
      graph_visites: visitesGraph.rows,
      top_produits:  topProduits.rows,
      graph_ventes: ventesGraph.rows,
    });

  } catch (err) {
    console.error('Erreur GET /analytics/dashboard :', err.message);
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

module.exports = router;
