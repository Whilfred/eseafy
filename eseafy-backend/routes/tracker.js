const express = require('express');
const pool    = require('../config/db');

const router = express.Router();

// ══════════════════════════════════════
//  POST /api/tracker/event
//  Recevoir un événement comportemental
// ══════════════════════════════════════
router.post('/event', async (req, res) => {
  const {
    session_id, boutique_slug, produit_slug,
    event_type, page_url, payload, ts
  } = req.body;

  if (!session_id || !event_type) {
    return res.status(400).json({ message: 'session_id et event_type requis.' });
  }

  try {
    // Trouver la boutique
    let boutique_id = null;
    let produit_id  = null;

    if (boutique_slug) {
      const b = await pool.query('SELECT id FROM boutiques WHERE slug = $1', [boutique_slug]);
      if (b.rows.length > 0) boutique_id = b.rows[0].id;
    }

    if (produit_slug && boutique_id) {
      const p = await pool.query('SELECT id, prix FROM produits WHERE slug = $1', [produit_slug]);
      if (p.rows.length > 0) produit_id = p.rows[0].id;
    }

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || null;

    // ── Insérer l'event ──
    await pool.query(`
      INSERT INTO events (session_id, boutique_id, produit_id, event_type, page_url, payload, ip, ts)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      session_id, boutique_id, produit_id,
      event_type, page_url || null,
      payload ? JSON.stringify(payload) : null,
      ip, ts || new Date()
    ]);

    // ── Mettre à jour ou créer le visitor ──
    if (event_type === 'page_view' && boutique_id) {
      await upsertVisitor(session_id, boutique_id, payload, ip);
    }

    // ── Mettre à jour le customer profile ──
    if (boutique_id) {
      await updateCustomerProfile(session_id, boutique_id, event_type, payload);
    }

    return res.status(201).json({ ok: true });

  } catch (err) {
    console.error('Erreur tracker event :', err.message);
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// ══════════════════════════════════════
//  Upsert visitor
// ══════════════════════════════════════
async function upsertVisitor(session_id, boutique_id, payload = {}, ip) {
  try {
    const existing = await pool.query(
      'SELECT id, visit_count FROM visitors WHERE session_id = $1',
      [session_id]
    );

    if (existing.rows.length > 0) {
      // Incrémenter les visites
      await pool.query(
        `UPDATE visitors SET visit_count = visit_count + 1, updated_at = NOW() WHERE session_id = $1`,
        [session_id]
      );
    } else {
      // Créer le visiteur
      await pool.query(`
        INSERT INTO visitors (
          session_id, boutique_id, language, timezone,
          device_type, os, browser, screen_res,
          connection_type, ram_gb, cpu_cores,
          referrer, utm_source, utm_campaign, landing_page
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        ON CONFLICT (session_id) DO UPDATE SET visit_count = visitors.visit_count + 1, updated_at = NOW()
      `, [
        session_id, boutique_id,
        payload.language      || null,
        payload.timezone      || null,
        payload.device_type   || null,
        payload.os            || null,
        payload.browser       || null,
        payload.screen_res    || null,
        payload.connection_type || null,
        payload.ram_gb        || null,
        payload.cpu_cores     || null,
        payload.referrer      || null,
        payload.utm_source    || null,
        payload.utm_campaign  || null,
        payload.landing_page  || null,
      ]);
    }
  } catch (err) {
    console.error('Erreur upsertVisitor :', err.message);
  }
}

// ══════════════════════════════════════
//  Mettre à jour le customer profile
// ══════════════════════════════════════
async function updateCustomerProfile(session_id, boutique_id, event_type, payload = {}) {
  try {
    const events = await pool.query(`
      SELECT event_type, payload FROM events
      WHERE session_id = $1 AND boutique_id = $2
      ORDER BY ts DESC LIMIT 100
    `, [session_id, boutique_id]);

    let score = 0;
    let visit_count = 0;
    let scrollEvents = [];
    let timeEvents   = [];

    events.rows.forEach(e => {
      const p = e.payload || {};
      switch (e.event_type) {
        case 'page_view':     score += 5;  visit_count++; break;
        case 'scroll_depth':  score += (p.depth || 0) / 10; scrollEvents.push(p.depth || 0); break;
        case 'time_on_page':  score += Math.min((p.seconds || 0) / 10, 20); timeEvents.push(p.seconds || 0); break;
        case 'product_hover': score += 8; break;
        case 'click':         score += 3; break;
        case 'rage_click':    score -= 5; break;
        case 'copy':          score += 10; break;
        case 'purchase':      score += 50; break;
      }
    });

    const avg_time = timeEvents.length > 0 ? timeEvents.reduce((a,b) => a+b, 0) / timeEvents.length : 0;
    score = Math.min(100, Math.max(0, Math.round(score)));

    // Vérifier si le profil existe
    const existing = await pool.query(
      'SELECT id FROM customer_profiles WHERE session_id = $1 AND boutique_id = $2',
      [session_id, boutique_id]
    );

    if (existing.rows.length > 0) {
      await pool.query(`
        UPDATE customer_profiles SET
          purchase_score       = $1,
          visit_count          = $2,
          avg_session_duration = $3,
          last_seen            = NOW(),
          updated_at           = NOW()
        WHERE session_id = $4 AND boutique_id = $5
      `, [score, visit_count, Math.round(avg_time), session_id, boutique_id]);
    } else {
      await pool.query(`
        INSERT INTO customer_profiles (session_id, boutique_id, purchase_score, visit_count, avg_session_duration, last_seen)
        VALUES ($1, $2, $3, $4, $5, NOW())
      `, [session_id, boutique_id, score, visit_count, Math.round(avg_time)]);
    }

  } catch (err) {
    console.error('Erreur updateCustomerProfile :', err.message);
  }
}

// ══════════════════════════════════════
//  GET /api/tracker/stats
//  Stats pour le dashboard admin
// ══════════════════════════════════════
router.get('/stats/:boutique_slug', async (req, res) => {
  try {
    const b = await pool.query('SELECT id FROM boutiques WHERE slug = $1', [req.params.boutique_slug]);
    if (b.rows.length === 0) return res.status(404).json({ message: 'Boutique introuvable.' });
    const boutique_id = b.rows[0].id;

    // Top events
    const topEvents = await pool.query(`
      SELECT event_type, COUNT(*) AS nb
      FROM events WHERE boutique_id = $1
      GROUP BY event_type ORDER BY nb DESC LIMIT 10
    `, [boutique_id]);

    // Top visiteurs par score
    const topVisitors = await pool.query(`
      SELECT cp.session_id, cp.purchase_score, cp.visit_count,
             cp.avg_session_duration, cp.last_seen,
             v.device_type, v.country, v.language
      FROM customer_profiles cp
      LEFT JOIN visitors v ON v.session_id = cp.session_id
      WHERE cp.boutique_id = $1
      ORDER BY cp.purchase_score DESC LIMIT 20
    `, [boutique_id]);

    // Devices breakdown
    const devices = await pool.query(`
      SELECT device_type, COUNT(*) AS nb
      FROM visitors WHERE boutique_id = $1
      GROUP BY device_type
    `, [boutique_id]);

    // Sources d'acquisition
    const sources = await pool.query(`
      SELECT COALESCE(utm_source, referrer, 'direct') AS source, COUNT(*) AS nb
      FROM visitors WHERE boutique_id = $1
      GROUP BY source ORDER BY nb DESC LIMIT 10
    `, [boutique_id]);

    return res.json({
      top_events:    topEvents.rows,
      top_visitors:  topVisitors.rows,
      devices:       devices.rows,
      sources:       sources.rows,
    });

  } catch (err) {
    console.error('Erreur tracker stats :', err.message);
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

module.exports = router;