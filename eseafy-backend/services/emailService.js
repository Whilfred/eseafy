const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

transporter.verify((err, success) => {
  if (err) console.error('❌ Email service erreur :', err.message);
  else     console.log('✅ Email service connecté (Gmail)');
});

// ══ TEMPLATE DE BASE ══
function baseTemplate(content, titre = 'eseafy') {
  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${titre}</title>
</head>
<body style="margin:0;padding:0;background:#f4f7ff;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7ff;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr><td style="background:linear-gradient(135deg,#1A6BFF,#1455cc);border-radius:16px 16px 0 0;padding:28px 32px;text-align:center;">
          <div style="font-size:26px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">eseafy<span style="opacity:.6">.</span></div>
          <div style="font-size:12px;color:rgba(255,255,255,.7);margin-top:4px;">La plateforme e-commerce made in Africa 🌍</div>
        </td></tr>
        <tr><td style="background:#ffffff;padding:32px;border-radius:0 0 16px 16px;border:1px solid #e8f0ff;border-top:none;">
          ${content}
        </td></tr>
        <tr><td style="padding:20px 0;text-align:center;">
          <div style="font-size:12px;color:#9e9b97;">
            © 2026 eseafy · La plateforme e-commerce made in Africa<br/>
            <a href="#" style="color:#1A6BFF;text-decoration:none;">Se désabonner</a>
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ══════════════════════════════════════
//  1. EMAIL CONFIRMATION COMMANDE (CLIENT)
// ══════════════════════════════════════
async function sendConfirmationCommande({ email, nom_client, reference, produit, montant, boutique_nom, vendeur_tel }) {
  if (!email) return;

  const suiviUrl = `http://localhost:3001/suivi?ref=${reference}`;
  const waUrl    = vendeur_tel
    ? `https://wa.me/${vendeur_tel.replace(/\D/g,'')}?text=Bonjour, je voudrais des infos sur ma commande ${reference}`
    : null;

  const content = `
    <h1 style="font-size:22px;color:#0a0a0a;margin:0 0 8px;">🎉 Commande confirmée !</h1>
    <p style="color:#6a6760;font-size:14px;margin:0 0 24px;">Bonjour <strong>${nom_client}</strong>, votre commande a bien été reçue.</p>
    <div style="background:#f0f5ff;border:1px solid #e8f0ff;border-radius:12px;padding:20px;margin-bottom:24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:12px;color:#9e9b97;text-transform:uppercase;letter-spacing:.06em;">Référence</td>
          <td style="text-align:right;font-family:monospace;font-size:16px;font-weight:700;color:#1A6BFF;">#${reference}</td>
        </tr>
        <tr><td colspan="2" style="padding:6px 0;"><hr style="border:none;border-top:1px solid #e8f0ff;"></td></tr>
        <tr>
          <td style="font-size:13px;color:#6a6760;">Produit</td>
          <td style="text-align:right;font-size:13px;font-weight:500;">${produit}</td>
        </tr>
        <tr>
          <td style="font-size:13px;color:#6a6760;padding-top:8px;">Boutique</td>
          <td style="text-align:right;font-size:13px;padding-top:8px;">${boutique_nom}</td>
        </tr>
        <tr>
          <td style="font-size:13px;color:#6a6760;padding-top:8px;">Montant total</td>
          <td style="text-align:right;font-size:18px;font-weight:700;color:#0a0a0a;padding-top:8px;">${Number(montant).toLocaleString('fr-FR')} XOF</td>
        </tr>
      </table>
    </div>
    <p style="color:#6a6760;font-size:13.5px;margin:0 0 20px;">Le vendeur vous contactera très bientôt pour organiser la livraison.</p>
    <div style="text-align:center;margin-bottom:24px;">
      <a href="${suiviUrl}" style="display:inline-block;background:#1A6BFF;color:#ffffff;padding:14px 28px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:600;">🔍 Suivre ma commande</a>
    </div>
    ${waUrl ? `<div style="text-align:center;"><a href="${waUrl}" style="display:inline-block;background:#25d366;color:#ffffff;padding:12px 24px;border-radius:10px;text-decoration:none;font-size:13px;font-weight:600;">💬 Contacter le vendeur sur WhatsApp</a></div>` : ''}`;

  try {
    await transporter.sendMail({
      from:    `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
      to:      email,
      cc:      process.env.EMAIL_FROM, // ← copie admin
      subject: `✅ Commande #${reference} confirmée — eseafy`,
      html:    baseTemplate(content, `Commande #${reference}`),
    });
    console.log(`📧 Email confirmation → ${email}`);
  } catch (err) {
    console.error('❌ Erreur email confirmation :', err.message);
  }
}

// ══════════════════════════════════════
//  2. EMAIL NOTIFICATION VENDEUR
// ══════════════════════════════════════
async function sendNotificationVendeur({ email_vendeur, nom_vendeur, reference, produit, montant, nom_client, telephone_client }) {
  if (!email_vendeur) return;

  const content = `
    <h1 style="font-size:22px;color:#0a0a0a;margin:0 0 8px;">🛒 Nouvelle commande !</h1>
    <p style="color:#6a6760;font-size:14px;margin:0 0 24px;">Bonjour <strong>${nom_vendeur}</strong>, vous avez reçu une nouvelle commande.</p>
    <div style="background:#f0f5ff;border:1px solid #e8f0ff;border-radius:12px;padding:20px;margin-bottom:24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:12px;color:#9e9b97;text-transform:uppercase;letter-spacing:.06em;">Référence</td>
          <td style="text-align:right;font-family:monospace;font-size:16px;font-weight:700;color:#1A6BFF;">#${reference}</td>
        </tr>
        <tr><td colspan="2" style="padding:6px 0;"><hr style="border:none;border-top:1px solid #e8f0ff;"></td></tr>
        <tr>
          <td style="font-size:13px;color:#6a6760;">Produit commandé</td>
          <td style="text-align:right;font-size:13px;font-weight:500;">${produit}</td>
        </tr>
        <tr>
          <td style="font-size:13px;color:#6a6760;padding-top:8px;">Montant</td>
          <td style="text-align:right;font-size:18px;font-weight:700;color:#1A6BFF;padding-top:8px;">${Number(montant).toLocaleString('fr-FR')} XOF</td>
        </tr>
        <tr><td colspan="2" style="padding:12px 0;"><hr style="border:none;border-top:1px solid #e8f0ff;"></td></tr>
        <tr>
          <td style="font-size:13px;color:#6a6760;">Client</td>
          <td style="text-align:right;font-size:13px;font-weight:500;">${nom_client}</td>
        </tr>
        <tr>
          <td style="font-size:13px;color:#6a6760;padding-top:8px;">Téléphone</td>
          <td style="text-align:right;font-size:13px;padding-top:8px;">${telephone_client || '—'}</td>
        </tr>
      </table>
    </div>
    <p style="color:#6a6760;font-size:13px;margin:0 0 20px;">Connectez-vous à votre dashboard pour gérer cette commande.</p>
    <div style="text-align:center;">
      <a href="http://localhost:3001" style="display:inline-block;background:#1A6BFF;color:#ffffff;padding:14px 28px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:600;">📊 Voir le dashboard</a>
    </div>`;

  try {
    await transporter.sendMail({
      from:    `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
      to:      email_vendeur,
      cc:      process.env.EMAIL_FROM, // ← copie admin
      subject: `🛒 Nouvelle commande #${reference} — ${Number(montant).toLocaleString('fr-FR')} XOF`,
      html:    baseTemplate(content, `Nouvelle commande #${reference}`),
    });
    console.log(`📧 Email vendeur → ${email_vendeur}`);
  } catch (err) {
    console.error('❌ Erreur email vendeur :', err.message);
  }
}

// ══════════════════════════════════════
//  3. EMAIL MARKETING (CAMPAGNE)
// ══════════════════════════════════════
async function sendEmailMarketing({ email, nom, sujet, contenu_html, boutique_nom }) {
  if (!email) return;

  const content = `
    <h1 style="font-size:20px;color:#0a0a0a;margin:0 0 16px;">${sujet}</h1>
    <div style="color:#6a6760;font-size:14px;line-height:1.7;">${contenu_html}</div>`;

  try {
    await transporter.sendMail({
      from:    `"${boutique_nom || process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
      to:      email,
      subject: sujet,
      html:    baseTemplate(content, sujet),
    });
    console.log(`📧 Email marketing → ${email}`);
    return true;
  } catch (err) {
    console.error('❌ Erreur email marketing :', err.message);
    return false;
  }
}

// ══════════════════════════════════════
//  4. EMAIL BIENVENUE (INSCRIPTION)
// ══════════════════════════════════════
async function sendEmailBienvenue({ email, prenom, boutique_slug }) {
  if (!email) return;

  const content = `
    <h1 style="font-size:22px;color:#0a0a0a;margin:0 0 8px;">Bienvenue sur eseafy 🎉</h1>
    <p style="color:#6a6760;font-size:14px;margin:0 0 24px;">Bonjour <strong>${prenom || 'cher vendeur'}</strong>, votre boutique est prête !</p>
    <div style="background:#f0f5ff;border:1px solid #e8f0ff;border-radius:12px;padding:20px;margin-bottom:24px;">
      <p style="font-size:13.5px;color:#6a6760;margin:0 0 12px;">Voici ce que vous pouvez faire dès maintenant :</p>
      ${['📦 Créer vos premiers produits', '🔗 Partager le lien de votre boutique', '📊 Suivre vos ventes en temps réel', '🎟 Créer des codes promo pour attirer des clients'].map(item => `
        <div style="padding:8px 12px;background:#ffffff;border-radius:8px;font-size:13px;margin-bottom:6px;">${item}</div>`).join('')}
    </div>
    <div style="text-align:center;">
      <a href="http://localhost:3001/boutique/${boutique_slug}" style="display:inline-block;background:#1A6BFF;color:#ffffff;padding:14px 28px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:600;">🏪 Voir ma boutique</a>
    </div>`;

  try {
    await transporter.sendMail({
      from:    `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
      to:      email,
      cc:      process.env.EMAIL_FROM, // ← copie admin
      subject: `Bienvenue sur eseafy ! Votre boutique est prête 🚀`,
      html:    baseTemplate(content, 'Bienvenue sur eseafy'),
    });
    console.log(`📧 Email bienvenue → ${email}`);
  } catch (err) {
    console.error('❌ Erreur email bienvenue :', err.message);
  }
}

// ══════════════════════════════════════
//  5. EMAIL NOUVELLE INSCRIPTION (ADMIN)
// ══════════════════════════════════════
async function sendNotificationInscription({ email, prenom, nom }) {
  const content = `
    <h1 style="font-size:22px;color:#0a0a0a;margin:0 0 8px;">👤 Nouvel utilisateur inscrit !</h1>
    <div style="background:#f0f5ff;border:1px solid #e8f0ff;border-radius:12px;padding:20px;margin-bottom:24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:13px;color:#6a6760;">Nom</td>
          <td style="text-align:right;font-size:13px;font-weight:500;">${[prenom, nom].filter(Boolean).join(' ') || '—'}</td>
        </tr>
        <tr>
          <td style="font-size:13px;color:#6a6760;padding-top:8px;">Email</td>
          <td style="text-align:right;font-size:13px;padding-top:8px;">${email}</td>
        </tr>
        <tr>
          <td style="font-size:13px;color:#6a6760;padding-top:8px;">Date</td>
          <td style="text-align:right;font-size:13px;padding-top:8px;">${new Date().toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' })}</td>
        </tr>
      </table>
    </div>
    <div style="text-align:center;">
      <a href="http://localhost:3002" style="display:inline-block;background:#1A6BFF;color:#ffffff;padding:14px 28px;border-radius:10px;text-decoration:none;font-size:14px;font-weight:600;">📊 Voir l'admin</a>
    </div>`;

  try {
    await transporter.sendMail({
      from:    `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
      to:      process.env.EMAIL_FROM, // ← uniquement admin
      subject: `👤 Nouvel inscrit sur eseafy — ${email}`,
      html:    baseTemplate(content, 'Nouvel inscrit'),
    });
    console.log(`📧 Email inscription admin → ${process.env.EMAIL_FROM}`);
  } catch (err) {
    console.error('❌ Erreur email inscription :', err.message);
  }
}

module.exports = {
  sendConfirmationCommande,
  sendNotificationVendeur,
  sendEmailMarketing,
  sendEmailBienvenue,
  sendNotificationInscription,
};
