require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const { Pool } = require('pg');

const app = express();

// ══ DB ══
const pool = new Pool({
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port:     process.env.DB_PORT || 5432,
});
pool.connect().then(() => console.log('✅ Admin DB connectée')).catch(console.error);

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ══ MIDDLEWARE AUTH ADMIN ══
function authAdmin(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Token manquant.' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.is_admin) return res.status(403).json({ message: 'Accès refusé.' });
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Token invalide.' });
  }
}

// ══ LOGIN ADMIN ══
app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body;
  if (email !== process.env.ADMIN_EMAIL || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ message: 'Identifiants incorrects.' });
  }
  const token = jwt.sign({ email, is_admin: true }, process.env.JWT_SECRET, { expiresIn: '24h' });
  return res.json({ token, message: 'Connecté.' });
});

// ══ STATS GLOBALES ══
app.get('/api/admin/stats', authAdmin, async (req, res) => {
  try {
    const [users, boutiques, produits, commandes, revenus, visiteurs, events] = await Promise.all([
      pool.query('SELECT COUNT(*) AS total FROM users'),
      pool.query('SELECT COUNT(*) AS total FROM boutiques'),
      pool.query('SELECT COUNT(*) AS total FROM produits'),
      pool.query('SELECT COUNT(*) AS total FROM commandes'),
      pool.query("SELECT COALESCE(SUM(total),0) AS total FROM commandes WHERE statut='paye'"),
      pool.query('SELECT COUNT(DISTINCT session_id) AS total FROM visitors'),
      pool.query('SELECT COUNT(*) AS total FROM events'),
    ]);

    // Revenus par jour (30 derniers jours)
    const revenusGraph = await pool.query(`
      SELECT DATE(created_at) AS jour, SUM(total) AS total, COUNT(*) AS nb
      FROM commandes WHERE statut='paye' AND created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at) ORDER BY jour ASC
    `);

    // Inscriptions par jour (30 derniers jours)
    const inscriptions = await pool.query(`
      SELECT DATE(created_at) AS jour, COUNT(*) AS nb
      FROM users WHERE created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(created_at) ORDER BY jour ASC
    `);

    return res.json({
      kpis: {
        users:     parseInt(users.rows[0].total),
        boutiques: parseInt(boutiques.rows[0].total),
        produits:  parseInt(produits.rows[0].total),
        commandes: parseInt(commandes.rows[0].total),
        revenus:   parseFloat(revenus.rows[0].total),
        visiteurs: parseInt(visiteurs.rows[0].total),
        events:    parseInt(events.rows[0].total),
      },
      revenus_graph:  revenusGraph.rows,
      inscriptions:   inscriptions.rows,
    });
  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// ══ LISTE DES VENDEURS ══
app.get('/api/admin/vendeurs', authAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        u.id, u.email, u.nom, u.prenom, u.plan, u.created_at,
        b.nom AS boutique_nom, b.slug AS boutique_slug,
        COUNT(DISTINCT p.id)  AS nb_produits,
        COUNT(DISTINCT c.id)  AS nb_commandes,
        COALESCE(SUM(CASE WHEN c.statut='paye' THEN c.total ELSE 0 END), 0) AS revenus
      FROM users u
      LEFT JOIN boutiques b  ON b.user_id = u.id
      LEFT JOIN produits p   ON p.user_id = u.id
      LEFT JOIN commandes c  ON c.user_id = u.id
      GROUP BY u.id, b.nom, b.slug
      ORDER BY revenus DESC
    `);
    return res.json({ vendeurs: result.rows });
  } catch (err) {
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// ══ SCORING IA — TOP VISITEURS ══
app.get('/api/admin/scoring', authAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        cp.session_id,
        cp.purchase_score,
        cp.visit_count,
        cp.avg_session_duration,
        cp.total_spent,
        cp.last_seen,
        b.nom  AS boutique_nom,
        b.slug AS boutique_slug,
        v.device_type,
        v.os,
        v.browser,
        v.language,
        v.utm_source,
        v.referrer
      FROM customer_profiles cp
      LEFT JOIN boutiques b ON b.id = cp.boutique_id
      LEFT JOIN visitors   v ON v.session_id = cp.session_id
      ORDER BY cp.purchase_score DESC
      LIMIT 100
    `);
    return res.json({ profiles: result.rows });
  } catch (err) {
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// ══ SEGMENTATION CLIENTS ══
app.get('/api/admin/segments', authAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        CASE
          WHEN purchase_score >= 80 THEN 'Hot 🔥'
          WHEN purchase_score >= 50 THEN 'Warm 🌡'
          WHEN purchase_score >= 20 THEN 'Cold ❄️'
          ELSE 'Inactif 💤'
        END AS segment,
        COUNT(*) AS nb,
        ROUND(AVG(purchase_score), 1) AS score_moyen,
        ROUND(AVG(visit_count), 1)    AS visites_moy,
        ROUND(AVG(avg_session_duration), 0) AS duree_moy
      FROM customer_profiles
      GROUP BY segment
      ORDER BY score_moyen DESC
    `);
    return res.json({ segments: result.rows });
  } catch (err) {
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// ══ EVENTS PAR TYPE ══
app.get('/api/admin/events', authAdmin, async (req, res) => {
  try {
    const byType = await pool.query(`
      SELECT event_type, COUNT(*) AS nb
      FROM events GROUP BY event_type ORDER BY nb DESC
    `);

    const byDay = await pool.query(`
      SELECT DATE(ts) AS jour, COUNT(*) AS nb
      FROM events WHERE ts >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(ts) ORDER BY jour ASC
    `);

    const devices = await pool.query(`
      SELECT device_type, COUNT(*) AS nb FROM visitors
      WHERE device_type IS NOT NULL GROUP BY device_type
    `);

    const browsers = await pool.query(`
      SELECT browser, COUNT(*) AS nb FROM visitors
      WHERE browser IS NOT NULL GROUP BY browser ORDER BY nb DESC
    `);

    const sources = await pool.query(`
      SELECT COALESCE(utm_source, 'direct') AS source, COUNT(*) AS nb
      FROM visitors GROUP BY source ORDER BY nb DESC LIMIT 10
    `);

    return res.json({
      by_type: byType.rows,
      by_day:  byDay.rows,
      devices: devices.rows,
      browsers: browsers.rows,
      sources:  sources.rows,
    });
  } catch (err) {
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// ══ PRODUITS TOP PLATEFORME ══
app.get('/api/admin/top-produits', authAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        p.id, p.nom, p.prix, p.type, p.categorie,
        b.nom AS boutique_nom,
        COUNT(DISTINCT v.id)  AS nb_ventes,
        COALESCE(SUM(v.total), 0) AS revenus,
        COUNT(DISTINCT ev.id) AS nb_vues
      FROM produits p
      LEFT JOIN boutiques b ON b.id = p.boutique_id
      LEFT JOIN ventes v    ON v.produit_id = p.id
      LEFT JOIN events ev   ON ev.produit_id = p.id AND ev.event_type = 'page_view'
      GROUP BY p.id, b.nom
      ORDER BY revenus DESC
      LIMIT 20
    `);
    return res.json({ produits: result.rows });
  } catch (err) {
    return res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// ══ PAGE ADMIN ══
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`🚀 Admin eseafy sur http://localhost:${PORT}`));