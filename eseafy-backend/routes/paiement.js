/**
 * routes/paiement.js — ojafy
 * POST /api/paiement/initier   → lance le paiement FeexPay
 * POST /api/paiement/webhook   → callback FeexPay (paiement confirmé)
 * GET  /api/paiement/statut/:ref → vérifier un paiement manuellement
 * GET  /api/paiement/reseaux   → liste des réseaux disponibles
 */

const express = require('express');
const pool    = require('../config/db');
const { initierPaiement, verifierStatut, RESEAUX } = require('../services/feexpay');
const { sendConfirmationCommande, sendNotificationVendeur } = require('../services/emailService');

const router = express.Router();

// ─────────────────────────────────────────────────────────────
//  GET /api/paiement/reseaux
//  Liste des réseaux FeexPay disponibles (pour le frontend)
// ─────────────────────────────────────────────────────────────
router.get('/reseaux', (req, res) => {
  const { pays } = req.query; // ex: ?pays=Burkina Faso

  let liste = Object.entries(RESEAUX).map(([endpoint, info]) => ({
    endpoint,
    ...info,
  }));

  if (pays) {
    liste = liste.filter(r => r.pays.toLowerCase().includes(pays.toLowerCase()));
  }

  return res.json({ reseaux: liste });
});

// ─────────────────────────────────────────────────────────────
//  POST /api/paiement/initier
//  Corps attendu :
//  {
//    produit_id, nom_client, telephone, email_client, adresse,
//    quantite, code_promo, prix_final, ref_affilie,
//    network,        ← ex: "mtn_bf", "orange_bf", "moov_bj", "visa"
//    pays,           ← ex: "Burkina" (pour carte uniquement)
//    currency        ← ex: "XOF" (pour carte uniquement)
//  }
// ─────────────────────────────────────────────────────────────
router.post('/initier', async (req, res) => {
  const {
    produit_id, nom_client, email_client, telephone, adresse,
    quantite = 1, code_promo, prix_final, ref_affilie,
    network, pays, currency,
  } = req.body;

  // ── Validations de base ──
  if (!produit_id)  return res.status(400).json({ message: 'produit_id requis.' });
  if (!nom_client)  return res.status(400).json({ message: 'nom_client requis.' });
  if (!telephone)   return res.status(400).json({ message: 'telephone requis.' });
  if (!network)     return res.status(400).json({ message: 'network requis (ex: mtn_bf, orange_bf, visa).' });
  if (!RESEAUX[network]) return res.status(400).json({ message: `Réseau inconnu : "${network}". Consultez GET /api/paiement/reseaux.` });

  try {
    // ── 1. Récupérer le produit ──
    const prodResult = await pool.query(
      `SELECT p.*, b.nom AS boutique_nom, b.slug AS boutique_slug,
              u.email AS vendeur_email, u.nom AS vendeur_nom,
              u.prenom AS vendeur_prenom, u.telephone AS vendeur_tel
       FROM produits p
       JOIN boutiques b ON b.id = p.boutique_id
       JOIN users u ON u.id = p.user_id
       WHERE p.id = $1 AND p.statut = 'publie' AND p.visible = true`,
      [produit_id]
    );

    if (prodResult.rows.length === 0) {
      return res.status(404).json({ message: 'Produit introuvable ou non disponible.' });
    }

    const produit = prodResult.rows[0];

    // ── 2. Calculer le total ──
    let total = produit.prix * quantite;
    if (prix_final && prix_final > 0 && prix_final < total) total = Number(prix_final);

    // ── 3. Générer une référence interne ──
    const reference = 'ESF-' + Date.now().toString().slice(-6);

    // ── 4. Créer la commande en statut "en_attente_paiement" ──
    const commandeResult = await pool.query(`
      INSERT INTO commandes
        (boutique_id, user_id, reference, total, nom_client, email_client, telephone, adresse, statut)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'en_attente_paiement')
      RETURNING *
    `, [
      produit.boutique_id, produit.user_id,
      reference, total,
      nom_client, email_client || null, telephone, adresse || null,
    ]);

    const commande = commandeResult.rows[0];

    // ── 5. Créer la ligne de vente (sans statut paye pour l'instant) ──
    await pool.query(`
      INSERT INTO ventes (commande_id, produit_id, boutique_id, user_id, nom_produit, prix_unitaire, quantite, total)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `, [commande.id, produit_id, produit.boutique_id, produit.user_id, produit.nom, produit.prix, quantite, total]);

    // ── 6. Sauvegarder le code promo si présent ──
    if (code_promo) {
      await pool.query(
        `UPDATE codes_promo SET nb_utilisations = nb_utilisations + 1 WHERE code = $1 AND boutique_id = $2`,
        [code_promo.toUpperCase(), produit.boutique_id]
      );
    }

    // ── 7. Appeler FeexPay ──
    const isCard = ['visa', 'mastercard'].includes(network);
    let feexpayResult;

    if (isCard) {
      const [firstName, ...lastParts] = nom_client.split(' ');
      feexpayResult = await initierPaiement({
        network,
        amount:      total,
        phoneNumber: telephone,
        firstName,
        lastName:    lastParts.join(' ') || '',
        email:       email_client || '',
        country:     pays || 'Burkina',
        currency:    currency || 'XOF',
        customId:    reference,
      });
    } else {
      feexpayResult = await initierPaiement({
        network,
        amount:      total,
        phoneNumber: telephone,
        nom:         nom_client,
        email:       email_client || '',
        customId:    reference,
        callbackInfo: {
          commande_id: commande.id,
          reference,
          produit:     produit.nom,
          client:      nom_client,
        },
      });
    }

    // ── 8. Sauvegarder la référence FeexPay ──
    if (feexpayResult.reference) {
      await pool.query(
        `UPDATE commandes SET feexpay_ref = $1 WHERE id = $2`,
        [feexpayResult.reference, commande.id]
      );
    }

    // ── 9. Réponse selon le type ──
    if (!feexpayResult.success) {
      // Annuler la commande si FeexPay refuse
      await pool.query(`UPDATE commandes SET statut = 'annule' WHERE id = $1`, [commande.id]);
      return res.status(502).json({
        message: `Échec de l'initiation du paiement : ${feexpayResult.error}`,
        reference,
      });
    }

    console.log(`💳 Paiement initié — ref: ${reference} | réseau: ${network} | montant: ${total} XOF`);

    // ── Carte → redirection ──
    if (isCard && feexpayResult.redirectUrl) {
      return res.json({
        message:      'Redirection vers la page de paiement.',
        type:         'redirect',
        redirect_url: feexpayResult.redirectUrl,
        reference,
        commande_id:  commande.id,
      });
    }

    // ── Mobile → attente validation (push ussd) ──
    return res.json({
      message:     'Paiement initié. Le client recevra une notification USSD pour valider.',
      type:        'mobile',
      reference,
      commande_id: commande.id,
      network,
      montant:     total,
    });

  } catch (err) {
    console.error('❌ POST /api/paiement/initier :', err.message);
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// ─────────────────────────────────────────────────────────────
//  POST /api/paiement/webhook
//  FeexPay envoie un POST ici quand le paiement est confirmé
//  Corps attendu (FeexPay) :
//  { reference, status, callback_info: { custom_id, ... }, ... }
// ─────────────────────────────────────────────────────────────
router.post('/webhook', async (req, res) => {
  console.log('🔔 FeexPay Webhook reçu :', JSON.stringify(req.body, null, 2));

  const { reference, status, callback_info } = req.body;

  // Référence interne ojafy stockée dans custom_id
  const esfReference = callback_info?.custom_id || reference;

  if (!esfReference) {
    console.warn('⚠️ Webhook FeexPay sans référence');
    return res.status(400).json({ message: 'reference manquante.' });
  }

  try {
    // ── Trouver la commande ──
    const commandeResult = await pool.query(
      `SELECT c.*, p.nom AS nom_produit, p.boutique_id,
              u.email AS vendeur_email, u.nom AS vendeur_nom,
              u.prenom AS vendeur_prenom, u.telephone AS vendeur_tel,
              b.nom AS boutique_nom
       FROM commandes c
       JOIN ventes v ON v.commande_id = c.id
       JOIN produits p ON p.id = v.produit_id
       JOIN boutiques b ON b.id = c.boutique_id
       JOIN users u ON u.id = c.user_id
       WHERE c.reference = $1
       LIMIT 1`,
      [esfReference.toUpperCase()]
    );

    if (commandeResult.rows.length === 0) {
      console.warn(`⚠️ Webhook FeexPay — commande introuvable : ${esfReference}`);
      return res.status(404).json({ message: 'Commande introuvable.' });
    }

    const commande = commandeResult.rows[0];

    // ── Ignorer si déjà traitée ──
    if (commande.statut === 'paye') {
      console.log(`ℹ️ Commande ${esfReference} déjà marquée payée.`);
      return res.json({ message: 'Déjà traité.' });
    }

    // ── Statuts FeexPay → statuts ojafy ──
    const statutMap = {
      'SUCCESSFUL': 'paye',
      'SUCCESS':    'paye',
      'FAILED':     'annule',
      'CANCELLED':  'annule',
      'PENDING':    'en_attente',
    };
    const nouveauStatut = statutMap[status?.toUpperCase()] || 'en_attente';

    // ── Mettre à jour la commande ──
    await pool.query(
      `UPDATE commandes SET statut = $1, updated_at = NOW() WHERE id = $2`,
      [nouveauStatut, commande.id]
    );

    console.log(`✅ Commande ${esfReference} → statut : ${nouveauStatut}`);

    // ── Si paiement confirmé : emails + notification + affilié ──
    if (nouveauStatut === 'paye') {

      // Notification temps réel SSE
      const notifyUser = require('../server').locals?.notifyUser;
      // On tente via app.locals (injecté dans server.js)
      try {
        const app = require('../server');
        if (app.locals?.notifyUser) {
          app.locals.notifyUser(commande.user_id, {
            type:    'nouvelle_commande',
            reference: commande.reference,
            montant:   commande.total,
            client:    commande.nom_client,
            produit:   commande.nom_produit,
          });
        }
      } catch(_) {}

      // Notification DB
      await pool.query(
        `INSERT INTO notifications (user_id, type, titre, message, data) VALUES ($1,$2,$3,$4,$5)`,
        [
          commande.user_id,
          'nouvelle_commande',
          `💳 Paiement confirmé — ${commande.nom_produit}`,
          `${commande.nom_client} · ${Number(commande.total).toLocaleString('fr-FR')} XOF · #${commande.reference}`,
          JSON.stringify({ reference: commande.reference, montant: commande.total, reseau: callback_info?.network || null }),
        ]
      );

      // Affilié
      if (commande.ref_affilie) {
        await pool.query(
          `UPDATE affilies SET nb_ventes = nb_ventes + 1, total_ventes = total_ventes + $1
           WHERE code = $2 AND boutique_id = $3 AND actif = true`,
          [commande.total, commande.ref_affilie.toUpperCase(), commande.boutique_id]
        );
      }

      // Email client
      sendConfirmationCommande({
        email:        commande.email_client,
        nom_client:   commande.nom_client,
        reference:    commande.reference,
        produit:      commande.nom_produit,
        montant:      commande.total,
        boutique_nom: commande.boutique_nom,
        vendeur_tel:  commande.vendeur_tel,
      });

      // Email vendeur
      sendNotificationVendeur({
        email_vendeur:    commande.vendeur_email,
        nom_vendeur:      [commande.vendeur_prenom, commande.vendeur_nom].filter(Boolean).join(' '),
        reference:        commande.reference,
        produit:          commande.nom_produit,
        montant:          commande.total,
        nom_client:       commande.nom_client,
        telephone_client: commande.telephone,
      });
    }

    return res.json({ message: 'Webhook traité.', statut: nouveauStatut });

  } catch (err) {
    console.error('❌ Webhook FeexPay :', err.message);
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// ─────────────────────────────────────────────────────────────
//  GET /api/paiement/statut/:reference
//  Vérifier manuellement le statut (polling fallback)
// ─────────────────────────────────────────────────────────────
router.get('/statut/:reference', async (req, res) => {
  const reference = req.params.reference.toUpperCase();

  try {
    // Statut en DB d'abord
    const result = await pool.query(
      `SELECT reference, statut, total, nom_client, nom_produit, created_at
       FROM commandes c
       LEFT JOIN ventes v ON v.commande_id = c.id
       WHERE c.reference = $1 LIMIT 1`,
      [reference]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Commande introuvable.' });
    }

    const commande = result.rows[0];

    // Si toujours en attente → interroger FeexPay aussi
    if (commande.statut === 'en_attente_paiement' || commande.statut === 'en_attente') {
      const feexpayRef = result.rows[0].feexpay_ref;
      if (feexpayRef) {
        const feexpayStatut = await verifierStatut(feexpayRef);
        if (feexpayStatut.success && feexpayStatut.status?.toUpperCase() === 'SUCCESSFUL') {
          // Déclencher la mise à jour via webhook interne
          await pool.query(
            `UPDATE commandes SET statut = 'paye', updated_at = NOW() WHERE reference = $1`,
            [reference]
          );
          commande.statut = 'paye';
        }
      }
    }

    return res.json({
      reference:    commande.reference,
      statut:       commande.statut,
      paye:         commande.statut === 'paye',
      montant:      commande.total,
      nom_client:   commande.nom_client,
      produit:      commande.nom_produit,
    });

  } catch (err) {
    console.error('❌ GET /api/paiement/statut :', err.message);
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

module.exports = router;