const cron       = require('node-cron');
const nodemailer = require('nodemailer');
const pool       = require('../config/db');

// ══ CONFIG SMTP ══
const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  }
});

// ══ TEMPLATE PAR DÉFAUT (si pas de contenu personnalisé) ══
function buildEmailHTML(boutique_nom, prenom, sequence_num) {
  const templates = {
    1: {
      sujet: `${prenom ? prenom + ', on' : 'On'} a quelque chose pour vous 👀`,
      body: `
        <div style="max-width:560px;margin:0 auto;font-family:'Helvetica Neue',sans-serif;color:#111;">
          <div style="background:#000;padding:28px 32px;border-radius:12px 12px 0 0;">
            <div style="font-size:11px;letter-spacing:2px;color:#f59e0b;text-transform:uppercase;margin-bottom:8px;">OJAFY · ELISA</div>
            <div style="font-size:22px;font-weight:700;color:white;">Une sélection pour vous</div>
          </div>
          <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:28px 32px;border-radius:0 0 12px 12px;">
            <p style="font-size:15px;line-height:1.7;margin:0 0 20px;">Bonjour${prenom ? ' ' + prenom : ''},</p>
            <p style="font-size:14px;line-height:1.7;color:#374151;margin:0 0 24px;">
              Vous avez visité la boutique <strong>${boutique_nom}</strong> récemment.
              Nous avons sélectionné des produits qui pourraient vous intéresser.
            </p>
            <div style="background:#f9fafb;border-radius:10px;padding:20px;margin-bottom:24px;text-align:center;">
              <div style="font-size:13px;color:#6b7280;margin-bottom:8px;">Offre exclusive · 48h seulement</div>
              <div style="font-size:28px;font-weight:800;letter-spacing:2px;color:#000;">ELISA10</div>
              <div style="font-size:13px;color:#6b7280;margin-top:4px;">−10% sur votre commande</div>
            </div>
            <div style="text-align:center;margin-bottom:24px;">
              <a href="#" style="background:#000;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:14px;font-weight:700;display:inline-block;">
                Découvrir la boutique →
              </a>
            </div>
            <p style="font-size:12px;color:#9ca3af;text-align:center;margin:0;">${boutique_nom} · Propulsé par Ojafy</p>
          </div>
        </div>`
    },
    2: {
      sujet: `Votre offre expire dans 24h ⏳`,
      body: `
        <div style="max-width:560px;margin:0 auto;font-family:'Helvetica Neue',sans-serif;color:#111;">
          <div style="background:#000;padding:28px 32px;border-radius:12px 12px 0 0;">
            <div style="font-size:11px;letter-spacing:2px;color:#f59e0b;text-transform:uppercase;margin-bottom:8px;">RAPPEL · OJAFY</div>
            <div style="font-size:22px;font-weight:700;color:white;">Plus que 24 heures</div>
          </div>
          <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:28px 32px;border-radius:0 0 12px 12px;">
            <p style="font-size:15px;line-height:1.7;margin:0 0 20px;">Bonjour${prenom ? ' ' + prenom : ''},</p>
            <p style="font-size:14px;line-height:1.7;color:#374151;margin:0 0 24px;">
              Votre code <strong>ELISA10</strong> chez <strong>${boutique_nom}</strong> expire dans 24 heures. Ne passez pas à côté !
            </p>
            <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:20px;margin-bottom:24px;text-align:center;">
              <div style="font-size:13px;color:#92400e;margin-bottom:8px;">⏳ Expire bientôt</div>
              <div style="font-size:28px;font-weight:800;letter-spacing:2px;color:#000;">ELISA10</div>
            </div>
            <div style="text-align:center;margin-bottom:24px;">
              <a href="#" style="background:#000;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:14px;font-weight:700;display:inline-block;">
                En profiter maintenant →
              </a>
            </div>
            <p style="font-size:12px;color:#9ca3af;text-align:center;margin:0;">${boutique_nom} · Propulsé par Ojafy</p>
          </div>
        </div>`
    },
    3: {
      sujet: `Dernière chance — −15% pour vous 🎁`,
      body: `
        <div style="max-width:560px;margin:0 auto;font-family:'Helvetica Neue',sans-serif;color:#111;">
          <div style="background:#000;padding:28px 32px;border-radius:12px 12px 0 0;">
            <div style="font-size:11px;letter-spacing:2px;color:#f59e0b;text-transform:uppercase;margin-bottom:8px;">OFFRE FINALE · Ojafy</div>
            <div style="font-size:22px;font-weight:700;color:white;">Notre dernière offre</div>
          </div>
          <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:28px 32px;border-radius:0 0 12px 12px;">
            <p style="font-size:15px;line-height:1.7;margin:0 0 20px;">Bonjour${prenom ? ' ' + prenom : ''},</p>
            <p style="font-size:14px;line-height:1.7;color:#374151;margin:0 0 24px;">
              C'est notre dernière offre pour vous chez <strong>${boutique_nom}</strong>. On ne se verra peut-être plus de si tôt 😉
            </p>
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:20px;margin-bottom:24px;text-align:center;">
              <div style="font-size:13px;color:#166534;margin-bottom:8px;">🎁 Offre finale exclusive</div>
              <div style="font-size:28px;font-weight:800;letter-spacing:2px;color:#000;">ELISA15</div>
              <div style="font-size:13px;color:#166534;margin-top:4px;">−15% sur votre commande</div>
            </div>
            <div style="text-align:center;margin-bottom:24px;">
              <a href="#" style="background:#000;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:14px;font-weight:700;display:inline-block;">
                Saisir cette offre →
              </a>
            </div>
            <p style="font-size:12px;color:#9ca3af;text-align:center;margin:0;">${boutique_nom} · Propulsé par Ojafy</p>
          </div>
        </div>`
    }
  };
  return templates[sequence_num] || templates[1];
}

// ══ CONSTRUIRE L'EMAIL DEPUIS LE CONTENU FRONTEND ══
function buildEmailFromContent(seqContent, boutique_nom, prenom, ctaLink) {
  // Remplacer les variables dans le contenu
  const corps = (seqContent.corps || '')
    .replace(/\{\{prenom\}\}/g, prenom || 'client')
    .replace(/\{\{boutique_nom\}\}/g, boutique_nom);

  const objet = (seqContent.objet || '')
    .replace(/\{\{prenom\}\}/g, prenom || 'client')
    .replace(/\{\{boutique_nom\}\}/g, boutique_nom);

  // Bloc code promo si présent
  const codeBlock = seqContent.code ? `
    <div style="background:#f9fafb;border-radius:10px;padding:18px;margin:20px 0;text-align:center;">
      <div style="font-size:12px;color:#6b7280;margin-bottom:6px;">Code exclusif</div>
      <div style="font-size:26px;font-weight:800;letter-spacing:3px;color:#000;font-family:monospace;">${seqContent.code.toUpperCase()}</div>
      ${seqContent.code_val ? `<div style="font-size:13px;color:#16a34a;margin-top:4px;font-weight:600;">${seqContent.code_val}</div>` : ''}
    </div>` : '';

  const ctaTxt  = seqContent.cta_text || 'Découvrir la boutique →';
  const ctaHref = seqContent.cta_link || ctaLink || '#';

  const body = `
    <div style="max-width:520px;margin:0 auto;font-family:'Helvetica Neue',Arial,sans-serif;">
      <div style="background:#000;padding:22px 28px;border-radius:12px 12px 0 0;">
        <div style="font-size:10px;letter-spacing:2px;color:#f59e0b;text-transform:uppercase;margin-bottom:6px;">Ojafy · ELISA</div>
        <div style="font-size:18px;font-weight:700;color:white;">${objet}</div>
      </div>
      <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:24px 28px;border-radius:0 0 12px 12px;">
        <div style="font-size:13.5px;line-height:1.75;color:#374151;">${corps}</div>
        ${codeBlock}
        <div style="text-align:center;margin:20px 0 16px;">
          <a href="${ctaHref}" style="background:#000;color:#fff;text-decoration:none;padding:13px 28px;border-radius:8px;font-size:13px;font-weight:700;display:inline-block;">
            ${ctaTxt}
          </a>
        </div>
        <div style="font-size:11px;color:#9ca3af;text-align:center;padding-top:14px;border-top:1px solid #f3f4f6;">
          Propulsé par <strong>Ojafy</strong>
        </div>
      </div>
    </div>`;

  return { sujet: objet, body };
}

// ══ FONCTION D'ENVOI ══
async function envoyerCampagnesElisa() {
  console.log('⚡ ELISA CRON — Démarrage :', new Date().toISOString());

  try {
    const campagnes = await pool.query(`
      SELECT
        ec.id,
        ec.nom,
        ec.sequence_num,
        ec.destinataires,
        ec.targeting,
        ec.sequences,
        ec.boutique_id,
        ec.created_at,
        b.nom      AS boutique_nom,
        b.slug     AS boutique_slug,
        b.user_id,
        u.plan
      FROM elisa_campagnes ec
      JOIN boutiques b ON b.id = ec.boutique_id
      JOIN users     u ON u.id = b.user_id
      WHERE ec.statut    = 'programmee'
        AND ec.send_at  <= NOW()
        AND b.elisa_actif = true
      ORDER BY ec.send_at ASC
      LIMIT 50
    `);

    if (campagnes.rows.length === 0) {
      console.log('⚡ ELISA CRON — Aucune campagne à envoyer');
      return;
    }

    console.log(`⚡ ELISA CRON — ${campagnes.rows.length} campagne(s) à traiter`);

    for (const camp of campagnes.rows) {
      try {
        const destinataires = camp.destinataires || [];
        if (destinataires.length === 0) {
          await pool.query(`UPDATE elisa_campagnes SET statut = 'vide' WHERE id = $1`, [camp.id]);
          continue;
        }

        let envoyes = 0;
        let echecs  = 0;

        // Lien boutique pour le CTA
        const ctaLink = `http://localhost:3001/boutique/boutique-${camp.user_id}`;

        for (const dest of destinataires) {
          const email  = typeof dest === 'string' ? dest : dest.email;
          const prenom = typeof dest === 'object'  ? dest.prenom : null;
          if (!email) continue;

          try {
            let sujet, htmlBody;

            // ── Utiliser le contenu personnalisé du frontend si disponible ──
            const seqContent = camp.sequences;
            if (seqContent && seqContent.objet && seqContent.objet.trim() !== '') {
              const tpl = buildEmailFromContent(seqContent, camp.boutique_nom, prenom, ctaLink);
              sujet    = tpl.sujet;
              htmlBody = tpl.body;
              console.log(`📝 Contenu personnalisé utilisé pour séquence ${camp.sequence_num}`);
            } else {
              const tpl = buildEmailHTML(camp.boutique_nom, prenom, camp.sequence_num);
              sujet    = tpl.sujet;
              htmlBody = tpl.body;
              console.log(`📄 Template par défaut utilisé pour séquence ${camp.sequence_num}`);
            }

            await transporter.sendMail({
              from:    `"${camp.boutique_nom}" <${process.env.SMTP_USER}>`,
              to:      email,
              subject: sujet,
              html:    htmlBody,
            });
            envoyes++;
            console.log(`📧 Email envoyé → ${email}`);

            await new Promise(r => setTimeout(r, 120));

          } catch (mailErr) {
            console.warn(`⚠️ Envoi échoué → ${email} :`, mailErr.message);
            echecs++;
          }
        }

        await pool.query(
          `UPDATE elisa_campagnes SET statut = 'envoyee', envoyes = $1, echecs = $2, sent_at = NOW() WHERE id = $3`,
          [envoyes, echecs, camp.id]
        );

        await pool.query(
          `INSERT INTO notifications (user_id, type, titre, message, data) VALUES ($1, 'elisa_envoye', $2, $3, $4)`,
          [
            camp.user_id,
            `Campagne "${camp.nom}" envoyée ✅`,
            `${envoyes} email(s) envoyé(s) · ${echecs} échec(s)`,
            JSON.stringify({ campagne_id: camp.id, envoyes, echecs })
          ]
        );

        console.log(`✅ Campagne #${camp.id} "${camp.nom}" — ${envoyes} envoyés / ${echecs} échecs`);

      } catch (campErr) {
        console.error(`❌ Erreur campagne #${camp.id} :`, campErr);
        await pool.query(`UPDATE elisa_campagnes SET statut = 'erreur' WHERE id = $1`, [camp.id]);
      }
    }

  } catch (err) {
    console.error('❌ ELISA CRON global :', err);
  }
}

// ══ PLANIFIER — toutes les 6h ══
cron.schedule('0 */6 * * *', envoyerCampagnesElisa);
console.log('⚡ ELISA Cron job démarré — vérification toutes les 6h');

module.exports = { envoyerCampagnesElisa };