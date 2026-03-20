require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const bcrypt  = require('bcryptjs');

const app = express();

app.use(cors({ origin: ['http://localhost:3001', 'http://127.0.0.1:5500', 'null'], credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// ══ ROUTES ══
app.use('/api/auth',        require('./routes/auth'));
app.use('/api/produits',    require('./routes/produits'));
app.use('/api/stats',       require('./routes/stats'));
app.use('/api/commandes',   require('./routes/commandes'));
app.use('/api/upload',      require('./routes/upload'));
app.use('/api/analytics',   require('./routes/analytics'));
app.use('/api/promo',       require('./routes/promo'));
app.use('/api/affiliation', require('./routes/affiliation'));
app.use('/boutique',        require('./routes/boutique'));

// ══ PIXELS ══
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

// ══ PROFIL ══
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

// ══ PARAMÈTRES BOUTIQUE ══
app.put('/api/boutique/settings', require('./middleware/auth'), async (req, res) => {
  const { nom, devise, langue, pays } = req.body;
  const pool = require('./config/db');
  try {
    const result = await pool.query(
      `UPDATE boutiques SET
        nom    = COALESCE($1, nom),
        devise = COALESCE($2, devise),
        langue = COALESCE($3, langue),
        pays   = COALESCE($4, pays),
        updated_at = NOW()
       WHERE user_id = $5 RETURNING *`,
      [nom||null, devise||null, langue||null, pays||null, req.user.id]
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

// ══ SSE — Notifications temps réel ══
const clients = new Map();

app.get('/api/notifications/stream', async (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(401).json({ message: 'Token manquant.' });

  try {
    const jwt     = require('jsonwebtoken');
    const pool    = require('./config/db');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result  = await pool.query('SELECT id FROM users WHERE id = $1', [decoded.id]);
    if (result.rows.length === 0) return res.status(401).json({ message: 'Utilisateur introuvable.' });

    const userId = decoded.id;

    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection',    'keep-alive');
    res.flushHeaders();

    clients.set(userId, res);
    console.log(`🔔 Client connecté : user ${userId}`);

    const ping = setInterval(() => res.write('event: ping\ndata: {}\n\n'), 30000);

    req.on('close', () => {
      clients.delete(userId);
      clearInterval(ping);
      console.log(`🔕 Client déconnecté : user ${userId}`);
    });

  } catch (err) {
    return res.status(401).json({ message: 'Token invalide.' });
  }
});

// Envoyer une notification à un utilisateur connecté
app.locals.notifyUser = (userId, data) => {
  const client = clients.get(parseInt(userId));
  if (client) {
    client.write(`event: notification\ndata: ${JSON.stringify(data)}\n\n`);
    console.log(`🔔 Notification envoyée à user ${userId} :`, data);
  }
};

app.get('/api/suivi/:reference', async (req, res) => {
  const pool = require('./config/db');
  try {
    const result = await pool.query(`
      SELECT c.*, v.nom_produit, v.prix_unitaire, v.quantite,
             b.nom AS boutique_nom, b.slug AS boutique_slug,
             u.prenom AS vendeur_prenom, u.nom AS vendeur_nom,
             u.telephone AS vendeur_tel
      FROM commandes c
      LEFT JOIN ventes v ON v.commande_id = c.id
      LEFT JOIN boutiques b ON b.id = c.boutique_id
      LEFT JOIN users u ON u.id = c.user_id
      WHERE c.reference = $1
    `, [req.params.reference.toUpperCase()]);

    if (result.rows.length === 0) return res.status(404).json({ message: 'Commande introuvable.' });
    return res.json({ commande: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

app.get('/suivi', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'suivi.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`));