/**
 * services/feexpay.js — eseafy
 * Intégration de l'API FeexPay (v1)
 */

const axios = require('axios');

const FEEXPAY_API_KEY  = process.env.FEEXPAY_API_KEY;
const FEEXPAY_SHOP_ID  = process.env.FEEXPAY_SHOP_ID;
const CALLBACK_URL     = process.env.FEEXPAY_CALLBACK_URL;

// Dictionnaire des réseaux supportés
const RESEAUX = {
  mtn_bj:     { label: 'MTN Bénin',        pays: 'Bénin',        type: 'mobile' },
  moov_bj:    { label: 'Moov Bénin',       pays: 'Bénin',        type: 'mobile' },
  mtn_ci:     { label: 'MTN Côte d\'Ivoire', pays: 'Côte d\'Ivoire', type: 'mobile' },
  orange_ci:  { label: 'Orange CI',        pays: 'Côte d\'Ivoire', type: 'mobile' },
  moov_ci:    { label: 'Moov CI',          pays: 'Côte d\'Ivoire', type: 'mobile' },
  wave_ci:    { label: 'Wave CI',          pays: 'Côte d\'Ivoire', type: 'mobile' },
  mtn_bf:     { label: 'MTN Burkina',      pays: 'Burkina Faso',  type: 'mobile' },
  orange_bf:  { label: 'Orange Burkina',   pays: 'Burkina Faso',  type: 'mobile' },
  moov_bf:    { label: 'Moov Burkina',     pays: 'Burkina Faso',  type: 'mobile' },
  orange_sn:  { label: 'Orange Sénégal',   pays: 'Sénégal',       type: 'mobile' },
  free_sn:    { label: 'Free Sénégal',     pays: 'Sénégal',       type: 'mobile' },
  wave_sn:    { label: 'Wave Sénégal',     pays: 'Sénégal',       type: 'mobile' },
  visa:       { label: 'Carte Visa',       pays: 'International', type: 'card'   },
  mastercard: { label: 'Mastercard',       pays: 'International', type: 'card'   }
};

/**
 * Initialise une demande de paiement
 */
async function initierPaiement(data) {
  try {
    // NOUVELLE URL (Le SHOP_ID ne va plus dans l'URL mais dans le body)
    const url = `https://api.feexpay.me/api/v1/shop/pay/direct`;

    const payload = {
      shop_id:     FEEXPAY_SHOP_ID, // On le met ici maintenant
      phoneNumber: data.phoneNumber,
      amount:      data.amount,
      network:     data.network.toUpperCase(),
      callback_url: CALLBACK_URL,
      custom_id:   data.customId,
      full_name:   data.nom || `${data.firstName} ${data.lastName}`,
      email:       data.email || 'client@eseafy.com' // Un email par défaut si vide
    };

    console.log("🚀 Envoi vers FeexPay :", url, payload);

    const response = await axios.post(url, payload, {
      headers: {
        'Authorization': `Bearer ${FEEXPAY_API_KEY}`,
        'Content-Type':  'application/json'
      }
    });

    return {
      success:   true,
      reference: response.data.reference,
      status:    response.data.status,
      message:   response.data.message
    };

  } catch (error) {
    // Si l'erreur persiste, on logue le détail exact
    console.error("❌ Détail erreur API FeexPay:", error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || "Erreur lors de l'initiation du paiement"
    };
  }
}

/**
 * Vérifie manuellement le statut d'une transaction
 */
async function verifierStatut(reference) {
  try {
    const url = `https://api.feexpay.me/api/v1/shop/${FEEXPAY_SHOP_ID}/transaction/${reference}`;
    const response = await axios.get(url, {
      headers: { 'Authorization': `Bearer ${FEEXPAY_API_KEY}` }
    });
    return {
      success: true,
      status:  response.data.status,
      amount:  response.data.amount
    };
  } catch (error) {
    return { success: false };
  }
}

module.exports = { initierPaiement, verifierStatut, RESEAUX };