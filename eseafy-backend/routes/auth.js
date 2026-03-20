const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const pool     = require('../config/db');
const { sendEmailBienvenue } = require('../services/emailService');

const router = express.Router();

// ══════════════════════════════════════
//  POST /api/auth/register
// ══════════════════════════════════════
router.post('/register', async (req, res) => {
  const { email, password, nom, prenom } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email et mot de passe requis.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ message: 'Le mot de passe doit faire au moins 6 caractères.' });
  }

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: 'Un compte avec cet email existe déjà.' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (email, password, nom, prenom)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, nom, prenom, plan, created_at`,
      [email, hashedPassword, nom || null, prenom || null]
    );

    const user = result.rows[0];

    // Créer une boutique par défaut
    const boutique = await pool.query(
      `INSERT INTO boutiques (user_id, nom, slug)
       VALUES ($1, $2, $3) RETURNING slug`,
      [user.id, 'Ma boutique', `boutique-${user.id}`]
    );

    // Email de bienvenue
    sendEmailBienvenue({
      email,
      prenom,
      boutique_slug: boutique.rows[0].slug
    });

    const token = jwt.sign(
      { id: user.id, email: user.email, nom: user.nom },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    return res.status(201).json({
      message: 'Compte créé avec succès.',
      token,
      user: {
        id:     user.id,
        email:  user.email,
        nom:    user.nom,
        prenom: user.prenom,
        plan:   user.plan,
      }
    });

  } catch (err) {
    console.error('Erreur register :', err.message);
    return res.status(500).json({ message: 'Erreur serveur. Réessayez.' });
  }
});

// ══════════════════════════════════════
//  POST /api/auth/login
// ══════════════════════════════════════
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email et mot de passe requis.' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Email ou mot de passe incorrect.' });
    }

    const user = result.rows[0];

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ message: 'Email ou mot de passe incorrect.' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, nom: user.nom },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    return res.status(200).json({
      message: 'Connexion réussie.',
      token,
      user: {
        id:     user.id,
        email:  user.email,
        nom:    user.nom,
        prenom: user.prenom,
        plan:   user.plan,
      }
    });

  } catch (err) {
    console.error('Erreur login :', err.message);
    return res.status(500).json({ message: 'Erreur serveur. Réessayez.' });
  }
});

// ══════════════════════════════════════
//  GET /api/auth/me
// ══════════════════════════════════════
const authMiddleware = require('../middleware/auth');

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, nom, prenom, telephone, plan, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Utilisateur non trouvé.' });
    }
    return res.status(200).json({ user: result.rows[0] });
  } catch (err) {
    console.error('Erreur /me :', err.message);
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

module.exports = router;