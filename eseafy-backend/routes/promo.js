const express = require('express');
const pool    = require('../config/db');
const auth    = require('../middleware/auth');

const router = express.Router();

// ══════════════════════════════════════
//  GET /api/promo
//  Lister les codes promo
// ══════════════════════════════════════
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM codes_promo WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    return res.json({ codes: result.rows });
  } catch (err) {
    console.error('Erreur GET /promo :', err.message);
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// ══════════════════════════════════════
//  POST /api/promo
//  Créer un code promo
// ══════════════════════════════════════
router.post('/', auth, async (req, res) => {
  const { code, type, valeur, min_commande, max_utilisations, expire_le } = req.body;

  if (!code || !type || !valeur) {
    return res.status(400).json({ message: 'Code, type et valeur sont requis.' });
  }
  if (!['pourcentage', 'montant_fixe'].includes(type)) {
    return res.status(400).json({ message: 'Type invalide.' });
  }
  if (type === 'pourcentage' && (valeur < 1 || valeur > 100)) {
    return res.status(400).json({ message: 'Le pourcentage doit être entre 1 et 100.' });
  }

  try {
    const boutiqueResult = await pool.query(
      'SELECT id FROM boutiques WHERE user_id = $1 LIMIT 1',
      [req.user.id]
    );
    if (boutiqueResult.rows.length === 0) {
      return res.status(404).json({ message: 'Boutique introuvable.' });
    }

    const result = await pool.query(
      `INSERT INTO codes_promo (boutique_id, user_id, code, type, valeur, min_commande, max_utilisations, expire_le)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        boutiqueResult.rows[0].id,
        req.user.id,
        code.toUpperCase().trim(),
        type,
        valeur,
        min_commande || 0,
        max_utilisations || null,
        expire_le || null
      ]
    );

    return res.status(201).json({ message: 'Code promo créé.', code: result.rows[0] });

  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ message: 'Ce code existe déjà.' });
    }
    console.error('Erreur POST /promo :', err.message);
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// ══════════════════════════════════════
//  POST /api/promo/verifier
//  Vérifier un code promo (public)
// ══════════════════════════════════════
router.post('/verifier', async (req, res) => {
  const { code, boutique_slug, montant } = req.body;

  if (!code || !boutique_slug) {
    return res.status(400).json({ message: 'Code et boutique requis.' });
  }

  try {
    const result = await pool.query(
      `SELECT cp.* FROM codes_promo cp
       JOIN boutiques b ON b.id = cp.boutique_id
       WHERE cp.code = $1 AND b.slug = $2 AND cp.actif = true`,
      [code.toUpperCase().trim(), boutique_slug]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Code promo invalide ou inactif.' });
    }

    const promo = result.rows[0];

    // Vérifier expiration
    if (promo.expire_le && new Date(promo.expire_le) < new Date()) {
      return res.status(400).json({ message: 'Ce code promo a expiré.' });
    }

    // Vérifier nb utilisations
    if (promo.max_utilisations && promo.nb_utilisations >= promo.max_utilisations) {
      return res.status(400).json({ message: 'Ce code promo a atteint sa limite d\'utilisation.' });
    }

    // Vérifier montant minimum
    if (montant && parseFloat(montant) < parseFloat(promo.min_commande)) {
      return res.status(400).json({
        message: `Montant minimum requis : ${Number(promo.min_commande).toLocaleString('fr-FR')} XOF`
      });
    }

    // Calculer la réduction
    let reduction = 0;
    if (promo.type === 'pourcentage') {
      reduction = montant ? Math.round(parseFloat(montant) * parseFloat(promo.valeur) / 100) : null;
    } else {
      reduction = parseFloat(promo.valeur);
    }

    return res.json({
      message: '✅ Code valide !',
      promo: {
        code:      promo.code,
        type:      promo.type,
        valeur:    promo.valeur,
        reduction,
      }
    });

  } catch (err) {
    console.error('Erreur POST /promo/verifier :', err.message);
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// ══════════════════════════════════════
//  PUT /api/promo/:id/toggle
//  Activer / désactiver un code
// ══════════════════════════════════════
router.put('/:id/toggle', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE codes_promo SET actif = NOT actif WHERE id = $1 AND user_id = $2 RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Code introuvable.' });
    }
    const etat = result.rows[0].actif ? 'activé' : 'désactivé';
    return res.json({ message: `Code ${etat}.`, code: result.rows[0] });
  } catch (err) {
    console.error('Erreur PUT /promo/:id/toggle :', err.message);
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// ══════════════════════════════════════
//  DELETE /api/promo/:id
//  Supprimer un code promo
// ══════════════════════════════════════
router.delete('/:id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM codes_promo WHERE id = $1 AND user_id = $2 RETURNING code',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Code introuvable.' });
    }
    return res.json({ message: `Code "${result.rows[0].code}" supprimé.` });
  } catch (err) {
    console.error('Erreur DELETE /promo/:id :', err.message);
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

module.exports = router;