const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { sendOTP, sendPasswordChanged } = require('../services/emailService');

const router = express.Router();

// ══════════════════════════════════════
//  POST /api/auth/google
//  Vérifie ou crée un compte Google, retourne OTP ou token
// ══════════════════════════════════════
router.post('/google', async (req, res) => {
  const { email, prenom, nom, googleId, picture } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email requis.' });
  }

  try {
    // Vérifier si l'utilisateur existe déjà
    const existing = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (existing.rows.length > 0) {
      const user = existing.rows[0];

      // Mettre à jour google_id si nécessaire
      if (!user.google_id && googleId) {
        await pool.query('UPDATE users SET google_id = $1 WHERE id = $2', [googleId, user.id]);
      }

      // Si le compte a un mot de passe (créé normalement) → OTP requis
      if (user.password) {
        // Générer OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expireAt = new Date(Date.now() + 10 * 60 * 1000);

        await pool.query(
          `UPDATE users SET otp_code = $1, otp_expire_at = $2 WHERE id = $3`,
          [otp, expireAt, user.id]
        );

        await sendOTP({ email: user.email, prenom: user.prenom, otp, context: 'login' });

        return res.status(200).json({
          message: 'Code de vérification envoyé à votre email.',
          email: user.email,
          step: 'otp_required',
          isGoogleUser: false,
        });
      } else {
        // Compte Google uniquement → connexion directe
        const token = jwt.sign(
          { id: user.id, email: user.email, nom: user.nom },
          process.env.JWT_SECRET,
          { expiresIn: process.env.JWT_EXPIRES_IN }
        );

        return res.status(200).json({
          message: 'Connexion réussie.',
          token,
          user: {
            id: user.id,
            email: user.email,
            nom: user.nom,
            prenom: user.prenom,
            plan: user.plan,
            picture: picture || null,
          },
        });
      }
    } else {
      // Créer un nouveau compte Google
      const hashedPassword = null; // Pas de mot de passe pour les comptes Google

      const result = await pool.query(
        `INSERT INTO users (email, password, nom, prenom, google_id, avatar_url, email_verified)
         VALUES ($1, $2, $3, $4, $5, $6, true)
         RETURNING id, email, nom, prenom, plan`,
        [email, hashedPassword, nom || null, prenom || null, googleId || null, picture || null]
      );

      const user = result.rows[0];

      // Créer une boutique par défaut
      await pool.query(
        `INSERT INTO boutiques (user_id, nom, slug)
         VALUES ($1, $2, $3)`,
        [user.id, 'Ma boutique', `boutique-${user.id}`]
      );

      // Envoyer email de bienvenue
      const { sendEmailBienvenue } = require('../services/emailService');
      sendEmailBienvenue({ email: user.email, prenom: user.prenom, boutique_slug: `boutique-${user.id}` });
      sendNotificationInscription({ email: user.email, prenom: user.prenom, nom: user.nom });

      // Générer token direct (pas d'OTP pour les comptes Google)
      const token = jwt.sign(
        { id: user.id, email: user.email, nom: user.nom },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN }
      );

      return res.status(201).json({
        message: 'Compte créé avec succès.',
        token,
        user: {
          id: user.id,
          email: user.email,
          nom: user.nom,
          prenom: user.prenom,
          plan: user.plan,
          picture: picture || null,
        },
      });
    }
  } catch (err) {
    console.error('Erreur Google auth :', err.message);
    return res.status(500).json({ message: 'Erreur serveur. Réessayez.' });
  }
});

// ══════════════════════════════════════
//  POST /api/auth/google/set-password
//  Permet à un utilisateur Google d'ajouter un mot de passe
// ══════════════════════════════════════
router.post('/google/set-password', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ message: 'Token requis.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({ message: 'Mot de passe trop court (min 6 caractères).' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    await pool.query(
      `UPDATE users SET password = $1 WHERE id = $2 AND password IS NULL`,
      [hashedPassword, decoded.id]
    );

    return res.json({ message: 'Mot de passe ajouté avec succès.' });
  } catch (err) {
    return res.status(401).json({ message: 'Token invalide.' });
  }
});

module.exports = router;