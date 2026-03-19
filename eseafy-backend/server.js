require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app = express();

// ── CORS : autoriser le frontend ──
app.use(cors({
  origin: ['http://localhost:3001', 'http://127.0.0.1:5500', 'null'],
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Fichiers statiques ──
app.use(express.static(path.join(__dirname, 'public')));

// ── Routes API ──
app.use('/api/auth', require('./routes/auth'));
// app.use('/api/produits', require('./routes/produits'));
// app.use('/api/ventes',   require('./routes/ventes'));
// app.use('/api/clients',  require('./routes/clients'));

// ── Fallback SPA ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

// ── Démarrage ──
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Serveur Eseafy démarré sur http://localhost:${PORT}`);
});