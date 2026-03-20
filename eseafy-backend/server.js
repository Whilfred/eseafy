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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`));