const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { sendOTP, sendPasswordChanged } = require('../services/emailService');

const router = express.Router();

// ══════════════════════════════════════
//  POST /api/auth/forgot-password
//  Envoie un OTP pour réinitialiser le mot de passe
// ══════════════════════════════════════
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  
  console.log('🔐 [forgot-password] Requête reçue pour:', email);

  if (!email) {
    return res.status(400).json({ message: 'Email requis.' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      // Pour des raisons de sécurité, on ne dit pas si l'email existe
      console.log('📧 [forgot-password] Email non trouvé:', email);
      return res.status(200).json({ message: 'Si cet email existe, un code vous a été envoyé.' });
    }

    const user = result.rows[0];

    // Vérifier si c'est un compte Google (pas de mot de passe)
    if (!user.password) {
      console.log('⚠️ [forgot-password] Compte Google sans mot de passe:', email);
      return res.status(400).json({ 
        message: 'Ce compte utilise Google. Connectez-vous avec Google pour gérer votre mot de passe.' 
      });
    }

    // Générer un OTP à 6 chiffres
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expireAt = new Date(Date.now() + 10 * 60 * 1000); // expire dans 10 minutes

    // Sauvegarder l'OTP en DB
    await pool.query(
      `UPDATE users SET otp_code = $1, otp_expire_at = $2 WHERE id = $3`,
      [otp, expireAt, user.id]
    );

    // Envoyer l'OTP par email avec context 'reset'
    await sendOTP({ email: user.email, prenom: user.prenom, otp, context: 'reset' });

    console.log(`🔐 OTP réinitialisation envoyé à ${user.email} : ${otp}`);

    return res.status(200).json({
      message: 'Code de réinitialisation envoyé à votre email.',
      email: user.email,
    });

  } catch (err) {
    console.error('❌ [forgot-password] Erreur:', err.message);
    return res.status(500).json({ message: 'Erreur serveur. Réessayez.' });
  }
});

// ══════════════════════════════════════
//  POST /api/auth/reset-password
//  Vérifie l'OTP et change le mot de passe
// ══════════════════════════════════════
router.post('/reset-password', async (req, res) => {
  const { email, otp, newPassword } = req.body;

  console.log('🔐 [reset-password] Requête pour:', email);

  if (!email || !otp || !newPassword) {
    return res.status(400).json({ message: 'Email, code et nouveau mot de passe requis.' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ message: 'Le mot de passe doit faire au moins 6 caractères.' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Utilisateur introuvable.' });
    }

    const user = result.rows[0];

    // Vérifier si l'OTP existe et n'est pas expiré
    if (!user.otp_code || !user.otp_expire_at) {
      return res.status(400).json({ message: 'Aucun code en attente. Demandez un nouveau code.' });
    }

    // Vérifier l'expiration
    if (new Date() > new Date(user.otp_expire_at)) {
      return res.status(400).json({ message: 'Code expiré. Demandez un nouveau code.' });
    }

    // Vérifier le code
    if (user.otp_code !== otp.toString().trim()) {
      return res.status(400).json({ message: 'Code incorrect.' });
    }

    // Changer le mot de passe
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await pool.query(
      `UPDATE users SET password = $1, otp_code = NULL, otp_expire_at = NULL WHERE id = $2`,
      [hashedPassword, user.id]
    );

    // Envoyer email de confirmation
    await sendPasswordChanged({ email: user.email, prenom: user.prenom });

    console.log(`✅ Mot de passe réinitialisé pour ${user.email}`);

    return res.status(200).json({ message: 'Mot de passe modifié avec succès. Connectez-vous.' });

  } catch (err) {
    console.error('❌ [reset-password] Erreur:', err.message);
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

module.exports = router;