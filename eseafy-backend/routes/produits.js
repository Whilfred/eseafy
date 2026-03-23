const express  = require('express');
const pool     = require('../config/db');
const auth     = require('../middleware/auth');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');

const router = express.Router();
router.use(auth);

// ══ UPLOAD FICHIER DIGITAL ══
const storageDigital = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../public/uploads/digital');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname);
    const name = Date.now() + '-' + Math.round(Math.random() * 1e6) + ext;
    cb(null, name);
  }
});
const uploadDigital = multer({
  storage: storageDigital,
  limits:  { fileSize: 500 * 1024 * 1024 }, // 500 Mo
});

// ══ UPLOAD MEDIA DESCRIPTION (images/vidéos) ══
const storageMedia = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../public/uploads/media');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname);
    const name = Date.now() + '-' + Math.round(Math.random() * 1e6) + ext;
    cb(null, name);
  }
});
const uploadMedia = multer({
  storage: storageMedia,
  limits:  { fileSize: 100 * 1024 * 1024 }, // 100 Mo
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|mp4|mov|avi|webm/;
    const ok = allowed.test(path.extname(file.originalname).toLowerCase()) &&
               allowed.test(file.mimetype.split('/')[1]);
    ok ? cb(null, true) : cb(new Error('Format non supporté'));
  }
});

// ══ POST /api/produits/upload-digital ══
router.post('/upload-digital', uploadDigital.single('fichier'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Aucun fichier reçu.' });
    const url = `/uploads/digital/${req.file.filename}`;
    console.log(`📁 Fichier digital uploadé : ${url}`);
    return res.json({ url, nom: req.file.originalname, taille: req.file.size });
  } catch (err) {
    console.error('❌ upload-digital :', err);
    return res.status(500).json({ message: 'Erreur upload.' });
  }
});

// ══ POST /api/produits/upload-media ══
router.post('/upload-media', uploadMedia.single('media'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Aucun fichier reçu.' });
    const ext      = path.extname(req.file.originalname).toLowerCase();
    const isVideo  = ['.mp4','.mov','.avi','.webm'].includes(ext);
    const url      = `/uploads/media/${req.file.filename}`;
    console.log(`🖼️ Media uploadé : ${url}`);
    return res.json({ url, type: isVideo ? 'video' : 'image' });
  } catch (err) {
    console.error('❌ upload-media :', err);
    return res.status(500).json({ message: 'Erreur upload.' });
  }
});

// ══ GET / ══
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

// ══ GET /:id ══
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

// ══ POST / ══
router.post('/', async (req, res) => {
  console.log('📦 Body reçu :', JSON.stringify(req.body, null, 2));
  const {
    nom, description, prix, prix_barre, type, categorie, tags,
    statut, visible, seo_titre, seo_desc, images,
    digital, physical
  } = req.body;

  if (!nom || !type || prix === undefined)
    return res.status(400).json({ message: 'Nom, type et prix sont requis.' });

  try {
    const boutiqueResult = await pool.query(
      'SELECT id, slug FROM boutiques WHERE user_id = $1 LIMIT 1',
      [req.user.id]
    );
    if (boutiqueResult.rows.length === 0)
      return res.status(404).json({ message: 'Boutique non trouvée.' });

    const boutique = boutiqueResult.rows[0];
    const slug = (
      nom.toLowerCase().normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .slice(0, 50) + '-' + Date.now()
    ).slice(0, 200);

    // ── Données digital ──
    const fichier_digital = digital?.fichier_url || null;
    const lien_digital    = digital?.lien        || null;
    const dl_max          = digital?.dl_max      || null;
    const duree_acces     = digital?.duree       || null;

    // ── Données physical ──
    const stock           = physical?.stock      ?? null;
    const sku             = physical?.sku        || null;
    const poids           = physical?.poids      || null;
    const delai_livraison = physical?.delai      || null;
    const livraisons      = physical?.livraisons || [];
    const variantes       = physical?.variantes  || null;
    const stock_auto      = physical?.stock_auto ?? true;

    const result = await pool.query(
      `INSERT INTO produits (
        boutique_id, user_id, nom, description, prix, prix_barre,
        type, categorie, tags, statut, visible,
        seo_titre, seo_desc, slug, images,
        fichier_digital, lien_digital, dl_max, duree_acces,
        stock, sku, poids, delai_livraison, livraisons, variantes, stock_auto
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
        $16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26
      ) RETURNING *`,
      [
        boutique.id, req.user.id, nom, description || null,
        prix, prix_barre || null, type, categorie || null,
        tags || [], statut || 'brouillon', visible !== false,
        seo_titre || null, seo_desc || null, slug, images || [],
        fichier_digital, lien_digital, dl_max, duree_acces,
        stock, sku, poids, delai_livraison,
        livraisons, variantes ? JSON.stringify(variantes) : null, stock_auto
      ]
    );

    const lien_public = `http://localhost:3001/boutique/${boutique.slug}/${slug}`;
    console.log('🚀 Produit créé :', result.rows[0].nom);
    return res.status(201).json({ message: 'Produit créé.', produit: result.rows[0], lien_public });

  } catch (err) {
    console.error('❌', err.message);
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// ══ PUT /:id ══
router.put('/:id', async (req, res) => {
  const {
    nom, description, prix, prix_barre, categorie, tags,
    statut, visible, seo_titre, seo_desc, images,
    digital, physical
  } = req.body;

  try {
    const check = await pool.query(
      'SELECT id FROM produits WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (check.rows.length === 0)
      return res.status(404).json({ message: 'Produit non trouvé.' });

    const fichier_digital = digital?.fichier_url || undefined;
    const lien_digital    = digital?.lien        || undefined;
    const dl_max          = digital?.dl_max      || undefined;
    const duree_acces     = digital?.duree       || undefined;
    const stock           = physical?.stock      ?? undefined;
    const sku             = physical?.sku        || undefined;
    const poids           = physical?.poids      || undefined;
    const delai_livraison = physical?.delai      || undefined;
    const livraisons      = physical?.livraisons || undefined;
    const variantes       = physical?.variantes  || undefined;
    const stock_auto      = physical?.stock_auto ?? undefined;

    const result = await pool.query(
      `UPDATE produits SET
        nom             = COALESCE($1,  nom),
        description     = COALESCE($2,  description),
        prix            = COALESCE($3,  prix),
        prix_barre      = COALESCE($4,  prix_barre),
        categorie       = COALESCE($5,  categorie),
        tags            = COALESCE($6,  tags),
        statut          = COALESCE($7,  statut),
        visible         = COALESCE($8,  visible),
        seo_titre       = COALESCE($9,  seo_titre),
        seo_desc        = COALESCE($10, seo_desc),
        images          = COALESCE($11, images),
        fichier_digital = COALESCE($12, fichier_digital),
        lien_digital    = COALESCE($13, lien_digital),
        dl_max          = COALESCE($14, dl_max),
        duree_acces     = COALESCE($15, duree_acces),
        stock           = COALESCE($16, stock),
        sku             = COALESCE($17, sku),
        poids           = COALESCE($18, poids),
        delai_livraison = COALESCE($19, delai_livraison),
        livraisons      = COALESCE($20, livraisons),
        variantes       = COALESCE($21, variantes),
        stock_auto      = COALESCE($22, stock_auto),
        updated_at      = NOW()
       WHERE id = $23 AND user_id = $24 RETURNING *`,
      [
        nom, description, prix, prix_barre, categorie, tags,
        statut, visible, seo_titre, seo_desc,
        images || null,
        fichier_digital || null, lien_digital || null,
        dl_max || null, duree_acces || null,
        stock ?? null, sku || null, poids || null,
        delai_livraison || null, livraisons || null,
        variantes ? JSON.stringify(variantes) : null,
        stock_auto ?? null,
        req.params.id, req.user.id
      ]
    );
    return res.json({ message: 'Produit mis à jour.', produit: result.rows[0] });

  } catch (err) {
    console.error('❌', err.message);
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// ══ DELETE /:id ══
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM produits WHERE id = $1 AND user_id = $2 RETURNING id, nom',
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ message: 'Produit non trouvé.' });
    return res.json({ message: `Produit "${result.rows[0].nom}" supprimé.` });
  } catch (err) {
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

module.exports = router;