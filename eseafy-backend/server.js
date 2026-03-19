require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app = express();

app.use(cors({ origin: ['http://localhost:3001', 'http://127.0.0.1:5500', 'null'], credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Routes privées
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/produits', require('./routes/produits'));
app.use('/api/stats',     require('./routes/stats'));
app.use('/api/commandes', require('./routes/commandes'));

// Routes publiques
app.use('/boutique',     require('./routes/boutique'));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`));