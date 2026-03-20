require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app = express();

app.use(cors({ origin: ['http://localhost:3001', 'http://127.0.0.1:5500', 'null'], credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Servir les images uploadées
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// Routes privées
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/produits',  require('./routes/produits'));
app.use('/api/stats',     require('./routes/stats'));
app.use('/api/commandes', require('./routes/commandes'));
app.use('/api/upload',    require('./routes/upload'));

// Routes publiques
app.use('/boutique', require('./routes/boutique'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/promo', require('./routes/promo'));
app.use('/api/affiliation', require('./routes/affiliation'));

app.put('/api/boutique/pixels', require('./middleware/auth'), async (req, res) => {
  const { fb_pixel_id, ga_id } = req.body;
  const pool = require('./config/db');
  try {
    await pool.query(
      `UPDATE boutiques SET fb_pixel_id = $1, ga_id = $2 WHERE user_id = $3`,
      [fb_pixel_id || null, ga_id || null, req.user.id]
    );
    return res.json({ message: 'Pixels sauvegardés.' });
  } catch (err) {
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

const bcrypt = require('bcryptjs');

app.put('/api/profil', require('./middleware/auth'), async (req, res) => {
  const { nom, prenom, telephone } = req.body;
  const pool = require('./config/db');
  try {
    const result = await pool.query(
      `UPDATE users SET nom=$1, prenom=$2, telephone=$3, updated_at=NOW() WHERE id=$4 RETURNING id, email, nom, prenom, telephone, plan`,
      [nom||null, prenom||null, telephone||null, req.user.id]
    );
    return res.json({ message: 'Profil mis à jour.', user: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

app.put('/api/profil/password', require('./middleware/auth'), async (req, res) => {
  const { password } = req.body;
  const pool = require('./config/db');
  if (!password || password.length < 6) return res.status(400).json({ message: 'Mot de passe trop court (min 6 caractères).' });
  try {
    const hashed = await bcrypt.hash(password, 12);
    await pool.query(`UPDATE users SET password=$1, updated_at=NOW() WHERE id=$2`, [hashed, req.user.id]);
    return res.json({ message: 'Mot de passe mis à jour.' });
  } catch (err) {
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

app.put('/api/boutique/settings', require('./middleware/auth'), async (req, res) => {
  const { nom, slug, devise, langue, pays, mobile_money_num, mobile_money_op } = req.body;
  const pool = require('./config/db');
  try {
    const result = await pool.query(
      `UPDATE boutiques SET
        nom   = COALESCE($1, nom),
        slug  = COALESCE($2, slug),
        devise= COALESCE($3, devise),
        langue= COALESCE($4, langue),
        pays  = COALESCE($5, pays),
        updated_at = NOW()
       WHERE user_id = $6 RETURNING *`,
      [nom||null, slug||null, devise||null, langue||null, pays||null, req.user.id]
    );
    return res.json({ message: 'Paramètres sauvegardés.', boutique: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

app.get('/api/boutique/settings', require('./middleware/auth'), async (req, res) => {
  const pool = require('./config/db');
  try {
    const result = await pool.query(
      'SELECT * FROM boutiques WHERE user_id = $1 LIMIT 1',
      [req.user.id]
    );
    return res.json({ boutique: result.rows[0] || null });
  } catch (err) {
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`));