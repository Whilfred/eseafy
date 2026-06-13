const express = require('express');
const pool    = require('../config/db');
const auth    = require('../middleware/auth');

const router = express.Router();

// ══════════════════════════════════════
//  GET /api/affiliation
//  Lister les affiliés
// ══════════════════════════════════════
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM affilies WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    return res.json({ affilies: result.rows });
  } catch (err) {
    console.error('Erreur GET /affiliation :', err.message);
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// ══════════════════════════════════════
//  POST /api/affiliation
//  Créer un affilié
// ══════════════════════════════════════
router.post('/', auth, async (req, res) => {
  const { nom, email, commission_pct } = req.body;

  if (!nom) return res.status(400).json({ message: 'Le nom est requis.' });

  try {
    const boutiqueResult = await pool.query(
      'SELECT id, slug FROM boutiques WHERE user_id = $1 LIMIT 1',
      [req.user.id]
    );
    if (boutiqueResult.rows.length === 0) return res.status(404).json({ message: 'Boutique introuvable.' });

    const boutique = boutiqueResult.rows[0];

    // Générer un code unique
    const code = nom.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '')
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 8)
      .toUpperCase() + Math.floor(Math.random() * 100);

    const result = await pool.query(
      `INSERT INTO affilies (boutique_id, user_id, nom, email, code, commission_pct)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [boutique.id, req.user.id, nom, email || null, code, commission_pct || 10]
    );

    const affilie  = result.rows[0];
    const lien     = `http://localhost:3001/boutique/${boutique.slug}?ref=${code}`;

    return res.status(201).json({
      message: 'Affilié créé.',
      affilie,
      lien,
    });

  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Ce code existe déjà.' });
    console.error('Erreur POST /affiliation :', err.message);
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// ══════════════════════════════════════
//  PUT /api/affiliation/:id/toggle
//  Activer / désactiver un affilié
// ══════════════════════════════════════
router.put('/:id/toggle', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE affilies SET actif = NOT actif WHERE id = $1 AND user_id = $2 RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Affilié introuvable.' });
    return res.json({ message: 'Statut mis à jour.', affilie: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// ══════════════════════════════════════
//  DELETE /api/affiliation/:id
//  Supprimer un affilié
// ══════════════════════════════════════
router.delete('/:id', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM affilies WHERE id = $1 AND user_id = $2 RETURNING nom',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Affilié introuvable.' });
    return res.json({ message: `Affilié "${result.rows[0].nom}" supprimé.` });
  } catch (err) {
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// ══════════════════════════════════════
//  POST /api/affiliation/track
//  Enregistrer un clic affilié (public)
// ══════════════════════════════════════
router.post('/track', async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ message: 'Code requis.' });
  try {
    const result = await pool.query(
      'SELECT * FROM affilies WHERE code = $1 AND actif = true',
      [code.toUpperCase()]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Code affilié invalide.' });
    return res.json({ affilie: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

module.exports = router;