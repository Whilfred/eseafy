const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const pool     = require('../config/db');
const { sendEmailBienvenue, sendNotificationInscription, sendOTP } = require('../services/emailService');

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

    // Emails
    sendEmailBienvenue({ email, prenom, boutique_slug: boutique.rows[0].slug });
    sendNotificationInscription({ email, prenom, nom });

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
//  Étape 1 : vérifier email + mot de passe → envoyer OTP
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

    // Générer un OTP à 6 chiffres
    const otp        = Math.floor(100000 + Math.random() * 900000).toString();
    const expireAt   = new Date(Date.now() + 10 * 60 * 1000); // expire dans 10 minutes

    // Sauvegarder l'OTP en DB
    await pool.query(
      `UPDATE users SET otp_code = $1, otp_expire_at = $2 WHERE id = $3`,
      [otp, expireAt, user.id]
    );

    // Envoyer l'OTP par email
    await sendOTP({ email: user.email, prenom: user.prenom, otp });

    console.log(`🔐 OTP envoyé à ${user.email} : ${otp}`);

    return res.status(200).json({
      message: 'Code de vérification envoyé à votre email.',
      email:   user.email,
      step:    'otp_required',
    });

  } catch (err) {
    console.error('Erreur login :', err.message);
    return res.status(500).json({ message: 'Erreur serveur. Réessayez.' });
  }
});

// ══════════════════════════════════════
//  POST /api/auth/verify-otp
//  Étape 2 : vérifier l'OTP → retourner le token
// ══════════════════════════════════════
router.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ message: 'Email et code requis.' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Utilisateur introuvable.' });
    }

    const user = result.rows[0];

    // Vérifier si le code est expiré
    if (!user.otp_code || !user.otp_expire_at) {
      return res.status(400).json({ message: 'Aucun code en attente. Reconnectez-vous.' });
    }

    if (new Date() > new Date(user.otp_expire_at)) {
      return res.status(400).json({ message: 'Code expiré. Reconnectez-vous pour recevoir un nouveau code.' });
    }

    // Vérifier le code
    if (user.otp_code !== otp.toString().trim()) {
      return res.status(400).json({ message: 'Code incorrect.' });
    }

    // Effacer l'OTP
    await pool.query(
      `UPDATE users SET otp_code = NULL, otp_expire_at = NULL WHERE id = $1`,
      [user.id]
    );

    // Générer le JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, nom: user.nom },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    console.log(`✅ OTP vérifié pour ${user.email}`);

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
    console.error('Erreur verify-otp :', err.message);
    return res.status(500).json({ message: 'Erreur serveur. Réessayez.' });
  }
});

// ══════════════════════════════════════
//  POST /api/auth/resend-otp
//  Renvoyer l'OTP
// ══════════════════════════════════════
router.post('/resend-otp', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email requis.' });

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Utilisateur introuvable.' });

    const user     = result.rows[0];
    const otp      = Math.floor(100000 + Math.random() * 900000).toString();
    const expireAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      `UPDATE users SET otp_code = $1, otp_expire_at = $2 WHERE id = $3`,
      [otp, expireAt, user.id]
    );

    await sendOTP({ email: user.email, prenom: user.prenom, otp });

    console.log(`🔐 OTP renvoyé à ${user.email} : ${otp}`);

    return res.json({ message: 'Nouveau code envoyé.' });

  } catch (err) {
    return res.status(500).json({ message: 'Erreur serveur.' });
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