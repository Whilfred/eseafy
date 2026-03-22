const express = require('express');
const router  = express.Router();
const pool    = require('../config/db');
const auth    = require('../middleware/auth');

// ══ GET /api/elisa/config ══
router.get('/config', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT elisa_actif, elisa_targeting, elisa_sequences, elisa_emails_sent, elisa_reset_at
       FROM boutiques WHERE user_id = $1 LIMIT 1`,
      [req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Boutique introuvable' });

    const b = result.rows[0];

    const resetAt      = new Date(b.elisa_reset_at);
    const now          = new Date();
    const nouveau_mois = resetAt.getMonth() !== now.getMonth() ||
                         resetAt.getFullYear() !== now.getFullYear();
    if (nouveau_mois) {
      await pool.query(
        `UPDATE boutiques SET elisa_emails_sent = 0, elisa_reset_at = NOW() WHERE user_id = $1`,
        [req.user.id]
      );
      b.elisa_emails_sent = 0;
    }

    res.json({
      actif:       b.elisa_actif,
      targeting:   b.elisa_targeting,
      sequences:   b.elisa_sequences,
      emails_sent: b.elisa_emails_sent,
      plan:        req.user.plan || 'starter',
      limite:      req.user.plan === 'pro' ? null : 3,
    });
  } catch (err) {
    console.error('❌ ELISA config GET :', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ══ PATCH /api/elisa/config ══
router.patch('/config', auth, async (req, res) => {
  const { actif, targeting, sequences } = req.body;
  try {
    const check = await pool.query(
      'SELECT id FROM boutiques WHERE user_id = $1 LIMIT 1',
      [req.user.id]
    );
    if (check.rows.length === 0) return res.status(404).json({ message: 'Boutique introuvable' });

    const fields = [];
    const values = [];
    let   idx    = 1;

    if (actif     !== undefined) { fields.push(`elisa_actif = $${idx++}`);     values.push(actif); }
    if (targeting !== undefined) { fields.push(`elisa_targeting = $${idx++}`); values.push(JSON.stringify(targeting)); }
    if (sequences !== undefined) { fields.push(`elisa_sequences = $${idx++}`); values.push(JSON.stringify(sequences)); }

    if (fields.length === 0) return res.status(400).json({ message: 'Aucun champ à mettre à jour' });

    values.push(req.user.id);
    await pool.query(`UPDATE boutiques SET ${fields.join(', ')} WHERE user_id = $${idx}`, values);

    console.log(`⚡ ELISA config updated — user ${req.user.id} — actif: ${actif}`);
    res.json({ message: 'Config ELISA sauvegardée', actif, targeting });
  } catch (err) {
    console.error('❌ ELISA config PATCH :', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ══ GET /api/elisa/prospects ══
router.get('/prospects', auth, async (req, res) => {
  try {
    const boutiqueRes = await pool.query(
      'SELECT id FROM boutiques WHERE user_id = $1 LIMIT 1',
      [req.user.id]
    );
    if (boutiqueRes.rows.length === 0) return res.status(404).json({ message: 'Boutique introuvable' });
    const boutique_id = boutiqueRes.rows[0].id;

    const result = await pool.query(
      `SELECT
         cp.email, cp.telephone, cp.visit_count, cp.total_spent,
         cp.purchase_score, cp.churn_risk, cp.last_seen, cp.promo_sensitive,
         CASE
           WHEN cp.churn_risk > 60 THEN 'churn'
           WHEN cp.total_spent > 0 THEN 'client'
           ELSE 'prospect'
         END AS type
       FROM customer_profiles cp
       WHERE cp.boutique_id = $1
       ORDER BY cp.purchase_score DESC
       LIMIT 20`,
      [boutique_id]
    );
    res.json({ prospects: result.rows });
  } catch (err) {
    console.error('❌ ELISA prospects :', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ══ GET /api/elisa/audience ══
router.get('/audience', auth, async (req, res) => {
  const { device, genre, age } = req.query;
  try {
    const boutiqueRes = await pool.query(
      'SELECT id FROM boutiques WHERE user_id = $1 LIMIT 1',
      [req.user.id]
    );
    if (boutiqueRes.rows.length === 0) return res.status(404).json({ message: 'Boutique introuvable' });
    const boutique_id = boutiqueRes.rows[0].id;

    // Tous les clients avec email — peu importe le statut
    const conditions = ['c.boutique_id = $1', 'c.email_client IS NOT NULL'];
    const values     = [boutique_id];
    let   idx        = 2;

    if (device && device !== 'tous') { conditions.push(`v.device_type = $${idx++}`);          values.push(device); }
    if (genre  && genre  !== 'tous') { conditions.push(`v.gender_inferred = $${idx++}`);      values.push(genre);  }
    if (age    && age    !== 'tous') { conditions.push(`v.age_bracket_inferred = $${idx++}`); values.push(age);    }

    const result = await pool.query(
      `SELECT COUNT(DISTINCT c.email_client) AS total
       FROM commandes c
       LEFT JOIN visitors v ON v.boutique_id = c.boutique_id AND v.email = c.email_client
       WHERE ${conditions.join(' AND ')}`,
      values
    );

    res.json({ audience: parseInt(result.rows[0].total) || 0 });
  } catch (err) {
    console.error('❌ ELISA audience :', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// ══ POST /api/elisa/campagnes ══
router.post('/campagnes', auth, async (req, res) => {
  const { nom, emails, targeting } = req.body;

  if (!nom) return res.status(400).json({ message: 'Nom de campagne requis' });

  try {
    const boutiqueRes = await pool.query(
      `SELECT id, elisa_actif, elisa_emails_sent FROM boutiques WHERE user_id = $1 LIMIT 1`,
      [req.user.id]
    );
    if (boutiqueRes.rows.length === 0) return res.status(404).json({ message: 'Boutique introuvable' });

    const boutique = boutiqueRes.rows[0];

    if (!boutique.elisa_actif) {
      return res.status(403).json({ message: 'Activez ELISA avant de lancer une campagne' });
    }

    const isPro   = req.user.plan === 'pro';
    const limite  = isPro ? Infinity : 3;
    const envoyes = boutique.elisa_emails_sent || 0;

    if (!isPro && envoyes >= limite) {
      return res.status(403).json({
        message: 'Limite de 3 campagnes gratuites atteinte. Passez au plan Pro.',
        upgrade: true
      });
    }

    // ── Récupérer les destinataires ──
    let destinataires = [];

    if (emails && emails.length > 0) {
      // Emails saisis manuellement
      destinataires = emails.map(e => ({ email: e, prenom: null }));

    } else {
      // Ciblage automatique — tous clients avec email peu importe statut
      const conditions = ['c.boutique_id = $1', 'c.email_client IS NOT NULL'];
      const values     = [boutique.id];
      let   idx        = 2;

      if (targeting?.genre && targeting.genre !== 'tous') {
        conditions.push(`v.gender_inferred = $${idx++}`);
        values.push(targeting.genre);
      }
      if (targeting?.age && targeting.age !== 'tous') {
        conditions.push(`v.age_bracket_inferred = $${idx++}`);
        values.push(targeting.age);
      }

      const prospectsRes = await pool.query(
        `SELECT DISTINCT ON (c.email_client)
           c.email_client AS email,
           c.nom_client   AS prenom
         FROM commandes c
         LEFT JOIN visitors v ON v.boutique_id = c.boutique_id AND v.email = c.email_client
         WHERE ${conditions.join(' AND ')}
         ORDER BY c.email_client, c.created_at DESC
         LIMIT 200`,
        values
      );

      destinataires = prospectsRes.rows.map(r => ({
        email:  r.email,
        prenom: r.prenom?.split(' ')[0] || null
      }));
    }

    if (destinataires.length === 0) {
      return res.status(400).json({
        message: 'Aucun client avec email trouvé. Ajoutez des emails manuellement dans le champ prévu.'
      });
    }

    // ── Créer les 3 séquences J0 / J+3 / J+6 ──
    const now = new Date();
    for (let seq = 1; seq <= 3; seq++) {
      const send_at = new Date(now);
      send_at.setDate(send_at.getDate() + (seq - 1) * 3);

      await pool.query(
        `INSERT INTO elisa_campagnes (boutique_id, nom, sequence_num, destinataires, targeting, send_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [boutique.id, nom, seq, JSON.stringify(destinataires), JSON.stringify(targeting || {}), send_at]
      );
    }

    // ── Incrémenter compteur ──
    await pool.query(
      `UPDATE boutiques SET elisa_emails_sent = elisa_emails_sent + 1 WHERE id = $1`,
      [boutique.id]
    );

    // ── Notification vendeur ──
    await pool.query(
      `INSERT INTO notifications (user_id, type, titre, message, data) VALUES ($1, $2, $3, $4, $5)`,
      [
        req.user.id,
        'elisa_campagne',
        `Campagne ELISA lancée : ${nom}`,
        `${destinataires.length} client(s) ciblé(s) · 3 emails programmés (J0, J+3, J+6)`,
        JSON.stringify({ nom, targeting, nb_destinataires: destinataires.length })
      ]
    );

    console.log(`⚡ Campagne ELISA "${nom}" — ${destinataires.length} destinataires — 3 séquences programmées`);

    res.json({
      message:       'Campagne enregistrée — 3 emails programmés (J0, J+3, J+6)',
      nom,
      destinataires: destinataires.length,
      emails_sent:   envoyes + 1,
      reste:         isPro ? null : limite - envoyes - 1,
    });

  } catch (err) {
    console.error('❌ ELISA campagne :', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

module.exports = router;