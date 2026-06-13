const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { sendEmailBienvenue, sendNotificationInscription } = require('../services/emailService');

const router = express.Router();

// ══════════════════════════════════════
//  POST /api/auth/google
//  Authentification avec Google
// ══════════════════════════════════════
router.post('/google', async (req, res) => {
  const { email, prenom, nom, googleId, picture } = req.body;

  console.log('🔐 [Google] Requête reçue pour:', email);

  if (!email) {
    return res.status(400).json({ message: 'Email requis.' });
  }

  try {
    // Vérifier si l'utilisateur existe déjà
    const existing = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (existing.rows.length > 0) {
      const user = existing.rows[0];
      console.log('📡 [Google] Utilisateur existant:', user.id);

      // Mettre à jour google_id si nécessaire
      if (!user.google_id && googleId) {
        await pool.query('UPDATE users SET google_id = $1 WHERE id = $2', [googleId, user.id]);
        console.log('✅ [Google] google_id mis à jour');
      }

      // Mettre à jour avatar si fourni
      if (picture && !user.avatar_url) {
        await pool.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [picture, user.id]);
      }

      // Générer token JWT
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
          picture: user.avatar_url || picture,
        },
      });
    }

    // Créer un nouveau compte Google
    console.log('📝 [Google] Création nouveau compte pour:', email);

    const result = await pool.query(
      `INSERT INTO users (email, password, nom, prenom, google_id, avatar_url, email_verified)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING id, email, nom, prenom, plan`,
      [email, null, nom || null, prenom || null, googleId || null, picture || null]
    );

    const user = result.rows[0];

    // Créer une boutique par défaut
    await pool.query(
      `INSERT INTO boutiques (user_id, nom, slug)
       VALUES ($1, $2, $3)`,
      [user.id, 'Ma boutique', `boutique-${user.id}`]
    );

    console.log('✅ [Google] Boutique créée pour user:', user.id);

    // Envoyer email de bienvenue
    sendEmailBienvenue({ 
      email: user.email, 
      prenom: user.prenom, 
      boutique_slug: `boutique-${user.id}` 
    });
    sendNotificationInscription({ 
      email: user.email, 
      prenom: user.prenom, 
      nom: user.nom 
    });

    // Générer token JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, nom: user.nom },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    console.log('✅ [Google] Compte créé avec succès pour:', email);

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

  } catch (err) {
    console.error('❌ [Google] Erreur:', err.message);
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

module.exports = router;