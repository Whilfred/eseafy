const express = require('express');
const pool    = require('../config/db');
const auth    = require('../middleware/auth');
const { sendConfirmationCommande, sendNotificationVendeur } = require('../services/emailService');

const router = express.Router();

// ══════════════════════════════════════
//  GET /api/commandes — PROTÉGÉ (vendeur)
// ══════════════════════════════════════
router.get('/', auth, async (req, res) => {
  const { statut } = req.query;
  try {
    let query  = `
      SELECT c.*, v.nom_produit
      FROM commandes c
      LEFT JOIN ventes v ON v.commande_id = c.id
      WHERE c.user_id = $1`;
    let params = [req.user.id];
    if (statut) { query += ` AND c.statut = $2`; params.push(statut); }
    query += ` ORDER BY c.created_at DESC`;
    const result = await pool.query(query, params);
    return res.json({ commandes: result.rows, total: result.rowCount });
  } catch (err) {
    console.error('Erreur GET /commandes :', err.message);
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// ══════════════════════════════════════
//  POST /api/commandes — PUBLIC (client)
// ══════════════════════════════════════
router.post('/', async (req, res) => {
  const { produit_id, nom_client, email_client, telephone, adresse, quantite = 1, code_promo, prix_final, ref_affilie } = req.body;

  if (!produit_id || !nom_client) {
    return res.status(400).json({ message: 'Produit et nom client requis.' });
  }

  try {
    // Récupérer le produit
    const prodResult = await pool.query(
      'SELECT * FROM produits WHERE id = $1 AND statut = $2',
      [produit_id, 'publie']
    );

    if (prodResult.rows.length === 0) {
      return res.status(404).json({ message: 'Produit introuvable ou non disponible.' });
    }

    const produit = prodResult.rows[0];

    // Calculer le total
    let total = produit.prix * quantite;
    if (prix_final && prix_final > 0 && prix_final < total) {
      total = prix_final;
    }

    // Générer une référence unique
    const reference = 'ESF-' + Date.now().toString().slice(-6);

    // Créer la commande
    const commande = await pool.query(`
      INSERT INTO commandes (boutique_id, user_id, reference, total, nom_client, email_client, telephone, adresse)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [produit.boutique_id, produit.user_id, reference, total, nom_client, email_client || null, telephone || null, adresse || null]);

    // Créer la ligne de vente
    await pool.query(`
      INSERT INTO ventes (commande_id, produit_id, boutique_id, user_id, nom_produit, prix_unitaire, quantite, total)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [commande.rows[0].id, produit_id, produit.boutique_id, produit.user_id, produit.nom, produit.prix, quantite, total]);

    // Incrémenter nb_utilisations du code promo
    if (code_promo) {
      await pool.query(
        `UPDATE codes_promo SET nb_utilisations = nb_utilisations + 1 WHERE code = $1 AND boutique_id = $2`,
        [code_promo.toUpperCase(), produit.boutique_id]
      );
      console.log('🎟 Code promo utilisé :', code_promo);
    }

    // Mettre à jour l'affilié
    if (ref_affilie) {
      await pool.query(
        `UPDATE affilies SET nb_ventes = nb_ventes + 1, total_ventes = total_ventes + $1
         WHERE code = $2 AND boutique_id = $3 AND actif = true`,
        [total, ref_affilie.toUpperCase(), produit.boutique_id]
      );
      console.log('🤝 Affilié mis à jour :', ref_affilie);
    }

    // Notification temps réel
    const notifyUser = req.app.locals.notifyUser;
    if (notifyUser) {
      notifyUser(produit.user_id, {
        type:      'nouvelle_commande',
        reference,
        montant:   total,
        client:    nom_client,
        produit:   produit.nom,
      });
    }

    // ── Emails automatiques ──
    const vendeurResult = await pool.query(
      'SELECT email, nom, prenom, telephone FROM users WHERE id = $1',
      [produit.user_id]
    );
    const vendeur = vendeurResult.rows[0];

    sendConfirmationCommande({
      email:        email_client,
      nom_client,
      reference,
      produit:      produit.nom,
      montant:      total,
      boutique_nom: produit.boutique_nom || 'Boutique',
      vendeur_tel:  vendeur?.telephone || null,
    });

    sendNotificationVendeur({
      email_vendeur:    vendeur?.email,
      nom_vendeur:      [vendeur?.prenom, vendeur?.nom].filter(Boolean).join(' ') || 'Vendeur',
      reference,
      produit:          produit.nom,
      montant:          total,
      nom_client,
      telephone_client: telephone,
    });

    console.log(`✅ Commande : ${reference} | ${total} XOF | ${nom_client}`);

    return res.status(201).json({
      message: 'Commande créée avec succès.',
      commande: commande.rows[0],
      reference,
    });

  } catch (err) {
    console.error('Erreur POST /commandes :', err.message);
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// ══════════════════════════════════════
//  PUT /api/commandes/:id/statut — PROTÉGÉ
// ══════════════════════════════════════
router.put('/:id/statut', auth, async (req, res) => {
  const { statut } = req.body;
  const validStatuts = ['en_attente', 'paye', 'rembourse', 'annule'];

  if (!validStatuts.includes(statut)) {
    return res.status(400).json({ message: 'Statut invalide.' });
  }

  try {
    const result = await pool.query(`
      UPDATE commandes SET statut = $1, updated_at = NOW()
      WHERE id = $2 AND user_id = $3
      RETURNING *
    `, [statut, req.params.id, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Commande introuvable.' });
    }

    return res.json({ message: 'Statut mis à jour.', commande: result.rows[0] });
  } catch (err) {
    console.error('Erreur PUT /commandes/:id/statut :', err.message);
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

module.exports = router;