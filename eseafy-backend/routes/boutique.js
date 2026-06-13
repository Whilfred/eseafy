const express = require('express');
const path    = require('path');
const pool    = require('../config/db');

const router = express.Router();

router.get('/:slugBoutique/:slugProduit', async (req, res) => {
  const { slugBoutique, slugProduit } = req.params;
  const acceptsHTML = req.headers.accept && req.headers.accept.includes('text/html');
  if (acceptsHTML) return res.sendFile(path.join(__dirname, '..', 'public', 'produit.html'));
  try {
    const result = await pool.query(
      `SELECT p.*, b.nom AS boutique_nom, b.slug AS boutique_slug, b.fb_pixel_id, b.ga_id, u.prenom AS vendeur_prenom, u.nom AS vendeur_nom
       FROM produits p JOIN boutiques b ON b.id = p.boutique_id JOIN users u ON u.id = p.user_id
       WHERE b.slug = $1 AND p.slug = $2 AND p.statut = 'publie' AND p.visible = true`,
      [slugBoutique, slugProduit]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Produit introuvable.' });
    return res.json({ produit: result.rows[0] });
  } catch (err) { return res.status(500).json({ message: 'Erreur serveur.' }); }
});

router.get('/:slugBoutique', async (req, res) => {
  const acceptsHTML = req.headers.accept && req.headers.accept.includes('text/html');
  if (acceptsHTML) return res.sendFile(path.join(__dirname, '..', 'public', 'boutique.html'));
  try {
    const boutiqueResult = await pool.query(
      `SELECT b.*, u.prenom, u.nom AS vendeur_nom FROM boutiques b JOIN users u ON u.id = b.user_id WHERE b.slug = $1`,
      [req.params.slugBoutique]
    );
    if (boutiqueResult.rows.length === 0) return res.status(404).json({ message: 'Boutique introuvable.' });
    const boutique = boutiqueResult.rows[0];
    const produits = await pool.query(
      `SELECT id, nom, prix, prix_barre, type, categorie, images, slug FROM produits WHERE boutique_id = $1 AND statut = 'publie' AND visible = true ORDER BY created_at DESC`,
      [boutique.id]
    );
    return res.json({ boutique, produits: produits.rows });
  } catch (err) { return res.status(500).json({ message: 'Erreur serveur.' }); }
});

module.exports = router;