const express = require('express');
const pool    = require('../config/db');
const auth    = require('../middleware/auth');

const router = express.Router();
router.use(auth);

router.get('/', async (req, res) => {
  try {
    const { type, statut, search } = req.query;
    let query  = `SELECT * FROM produits WHERE user_id = $1`;
    let params = [req.user.id];
    let index  = 2;
    if (type)   { query += ` AND type = $${index++}`;    params.push(type); }
    if (statut) { query += ` AND statut = $${index++}`;  params.push(statut); }
    if (search) { query += ` AND nom ILIKE $${index++}`; params.push(`%${search}%`); }
    query += ` ORDER BY created_at DESC`;
    const result = await pool.query(query, params);
    return res.json({ produits: result.rows, total: result.rowCount });
  } catch (err) {
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM produits WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Produit non trouvé.' });
    return res.json({ produit: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

router.post('/', async (req, res) => {
  console.log('📦 Body reçu :', JSON.stringify(req.body, null, 2));
  const { nom, description, prix, prix_barre, type, categorie, tags, statut, visible, stock, seo_titre, seo_desc, images } = req.body;
  if (!nom || !type || prix === undefined) return res.status(400).json({ message: 'Nom, type et prix sont requis.' });
  try {
    const boutiqueResult = await pool.query('SELECT id, slug FROM boutiques WHERE user_id = $1 LIMIT 1', [req.user.id]);
    if (boutiqueResult.rows.length === 0) return res.status(404).json({ message: 'Boutique non trouvée.' });
    const boutique = boutiqueResult.rows[0];
    const slug = (nom.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 50) + '-' + Date.now()).slice(0, 200);
    console.log('📦 Images à sauvegarder :', images);
    const result = await pool.query(
      `INSERT INTO produits (boutique_id, user_id, nom, description, prix, prix_barre, type, categorie, tags, statut, visible, stock, seo_titre, seo_desc, slug, images)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [boutique.id, req.user.id, nom, description || null, prix, prix_barre || null, type, categorie || null, tags || [], statut || 'brouillon', visible !== false, stock || null, seo_titre || null, seo_desc || null, slug, images || []]
    );
    const lien_public = `http://localhost:3001/boutique/${boutique.slug}/${slug}`;
    return res.status(201).json({ message: 'Produit créé.', produit: result.rows[0], lien_public });
  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

router.put('/:id', async (req, res) => {
  const { nom, description, prix, prix_barre, categorie, tags, statut, visible, stock, seo_titre, seo_desc } = req.body;
  try {
    const check = await pool.query('SELECT id FROM produits WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (check.rows.length === 0) return res.status(404).json({ message: 'Produit non trouvé.' });
    const result = await pool.query(
      `UPDATE produits SET nom=COALESCE($1,nom), description=COALESCE($2,description), prix=COALESCE($3,prix), prix_barre=COALESCE($4,prix_barre), categorie=COALESCE($5,categorie), tags=COALESCE($6,tags), statut=COALESCE($7,statut), visible=COALESCE($8,visible), stock=COALESCE($9,stock), seo_titre=COALESCE($10,seo_titre), seo_desc=COALESCE($11,seo_desc), updated_at=NOW()
       WHERE id=$12 AND user_id=$13 RETURNING *`,
      [nom, description, prix, prix_barre, categorie, tags, statut, visible, stock, seo_titre, seo_desc, req.params.id, req.user.id]
    );
    return res.json({ message: 'Produit mis à jour.', produit: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM produits WHERE id = $1 AND user_id = $2 RETURNING id, nom', [req.params.id, req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Produit non trouvé.' });
    return res.json({ message: `Produit "${result.rows[0].nom}" supprimé.` });
  } catch (err) {
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

module.exports = router;