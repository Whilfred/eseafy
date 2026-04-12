from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import os
import json
import psycopg2
import psycopg2.extras
from groq import Groq
from dotenv import load_dotenv
import uuid
from datetime import datetime, date
from decimal import Decimal

load_dotenv()

class SafeEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal): return float(o)
        if isinstance(o, (datetime, date)): return o.isoformat()
        return super().default(o)

def safe_dumps(obj):
    return json.dumps(obj, cls=SafeEncoder, ensure_ascii=False, indent=2)

app = Flask(__name__)
CORS(app)

client = Groq(api_key=os.getenv("GROQ_API_KEY"))
conversations = {}

# ── CONNEXION POSTGRES ────────────────────────────────────────────────────────
def get_db():
    return psycopg2.connect(
        host=os.getenv("DB_HOST"),
        port=os.getenv("DB_PORT", 5432),
        dbname=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
        sslmode=os.getenv("DB_SSL", "require"),
        cursor_factory=psycopg2.extras.RealDictCursor
    )

def fetch_simulation_data(boutique_id=None):
    """
    Charge les données réelles depuis PostgreSQL.
    boutique_id=None → agrégat global toutes boutiques.
    """
    conn = get_db()
    cur  = conn.cursor()
    b_filter_c  = "AND c.boutique_id = %(bid)s"   if boutique_id else ""
    b_filter_v  = "AND v.boutique_id = %(bid)s"   if boutique_id else ""
    b_filter_e  = "AND e.boutique_id = %(bid)s"   if boutique_id else ""
    b_filter_cp = "AND cp.boutique_id = %(bid)s"  if boutique_id else ""
    b_filter_pr = "AND pr.boutique_id = %(bid)s"  if boutique_id else ""
    b_filter_af = "AND a.boutique_id = %(bid)s"   if boutique_id else ""
    params = {"bid": boutique_id}

    # Résumé commandes
    cur.execute(f"""
        SELECT
            COUNT(*)                                          AS total_commandes,
            COUNT(*) FILTER (WHERE statut = 'paye')          AS commandes_payees,
            COUNT(*) FILTER (WHERE statut = 'en_attente')    AS commandes_attente,
            COUNT(*) FILTER (WHERE statut = 'annule')        AS commandes_annulees,
            ROUND(AVG(total) FILTER (WHERE statut='paye'),2) AS panier_moyen,
            ROUND(SUM(total) FILTER (WHERE statut='paye'),2) AS revenu_total,
            COUNT(DISTINCT email_client)                     AS clients_uniques
        FROM commandes c WHERE 1=1 {b_filter_c}
    """, params)
    orders = dict(cur.fetchone() or {})

    # Revenus 6 derniers mois
    cur.execute(f"""
        SELECT
            TO_CHAR(DATE_TRUNC('month', c.created_at), 'Mon YYYY') AS mois,
            ROUND(SUM(c.total), 2)                                  AS revenu,
            COUNT(*)                                                AS nb_commandes
        FROM commandes c
        WHERE statut = 'paye' AND c.created_at >= NOW() - INTERVAL '6 months'
          {b_filter_c}
        GROUP BY DATE_TRUNC('month', c.created_at)
        ORDER BY DATE_TRUNC('month', c.created_at)
    """, params)
    revenus_mois = [dict(r) for r in cur.fetchall()]

    # Top produits vendus
    cur.execute(f"""
        SELECT
            v.nom_produit,
            COUNT(*)                      AS nb_ventes,
            ROUND(SUM(v.total), 2)        AS revenu_total,
            ROUND(AVG(v.prix_unitaire),2) AS prix_moyen
        FROM ventes v
        JOIN commandes c ON c.id = v.commande_id
        WHERE c.statut = 'paye' {b_filter_v}
        GROUP BY v.nom_produit
        ORDER BY revenu_total DESC
        LIMIT 5
    """, params)
    top_produits = [dict(r) for r in cur.fetchall()]

    # Segmentation RFM simplifiée
    cur.execute(f"""
        WITH client_stats AS (
            SELECT
                email_client,
                COUNT(*)                                        AS nb_commandes,
                ROUND(AVG(total), 2)                            AS panier_moyen,
                ROUND(SUM(total), 2)                            AS total_depense,
                EXTRACT(DAY FROM NOW()-MAX(created_at))         AS jours_inactif
            FROM commandes c
            WHERE statut = 'paye' AND email_client IS NOT NULL {b_filter_c}
            GROUP BY email_client
        ),
        seuil AS (
            SELECT PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY panier_moyen) AS p75
            FROM client_stats
        )
        SELECT
            CASE
                WHEN nb_commandes >= 3 AND panier_moyen >= (SELECT p75 FROM seuil) THEN 'A'
                WHEN nb_commandes >= 2                                              THEN 'B'
                WHEN nb_commandes = 1 AND jours_inactif <= 60                      THEN 'C'
                ELSE                                                                     'D'
            END                          AS segment,
            COUNT(*)                     AS nb_clients,
            ROUND(AVG(panier_moyen), 2)  AS panier_moyen,
            ROUND(AVG(total_depense), 2) AS ltv_moyen,
            ROUND(AVG(jours_inactif), 0) AS jours_inactif_moyen
        FROM client_stats
        GROUP BY segment
        ORDER BY segment
    """, params)
    segments = {r['segment']: dict(r) for r in cur.fetchall()}

    # Profils enrichis
    cur.execute(f"""
        SELECT
            COUNT(*)                                              AS total_profils,
            ROUND(AVG(purchase_score), 2)                         AS score_achat_moyen,
            ROUND(AVG(churn_risk), 2)                             AS risque_churn_moyen,
            ROUND(AVG(ltv_estimated), 2)                          AS ltv_estimee_moy,
            COUNT(*) FILTER (WHERE purchase_score >= 70)          AS profils_chauds,
            COUNT(*) FILTER (WHERE churn_risk >= 60)              AS profils_risque_churn,
            COUNT(*) FILTER (WHERE promo_sensitive = true)        AS sensibles_promo,
            MODE() WITHIN GROUP (ORDER BY acquisition_source)     AS source_principale
        FROM customer_profiles cp WHERE 1=1 {b_filter_cp}
    """, params)
    profiles = dict(cur.fetchone() or {})

    # Events & conversion
    cur.execute(f"""
        SELECT
            COUNT(DISTINCT session_id)                                        AS sessions_totales,
            COUNT(*) FILTER (WHERE event_type = 'page_view')                  AS page_views,
            COUNT(*) FILTER (WHERE event_type = 'add_to_cart')                AS ajouts_panier,
            COUNT(*) FILTER (WHERE event_type = 'purchase')                   AS achats,
            ROUND(
                COUNT(*) FILTER (WHERE event_type='purchase')::NUMERIC /
                NULLIF(COUNT(DISTINCT session_id),0) * 100, 2
            )                                                                 AS taux_conversion_pct
        FROM events e WHERE 1=1 {b_filter_e}
    """, params)
    events_stats = dict(cur.fetchone() or {})

    # Codes promo
    cur.execute(f"""
        SELECT
            COUNT(*)                               AS total_codes,
            COUNT(*) FILTER (WHERE actif = true)   AS codes_actifs,
            ROUND(AVG(nb_utilisations), 1)         AS utilisations_moy,
            SUM(nb_utilisations)                   AS utilisations_total
        FROM codes_promo pr WHERE 1=1 {b_filter_pr}
    """, params)
    promos = dict(cur.fetchone() or {})

    # Affiliés
    cur.execute(f"""
        SELECT
            COUNT(*)                             AS total_affilies,
            COUNT(*) FILTER (WHERE actif=true)   AS affilies_actifs,
            ROUND(SUM(total_ventes), 2)          AS ventes_via_affiliation,
            ROUND(AVG(commission_pct), 1)        AS commission_moy_pct
        FROM affilies a WHERE 1=1 {b_filter_af}
    """, params)
    affilies = dict(cur.fetchone() or {})

    cur.close()
    conn.close()

    return {
        "commandes":    orders,
        "revenus_mois": revenus_mois,
        "top_produits": top_produits,
        "segments":     segments,
        "profiles":     profiles,
        "events":       events_stats,
        "promos":       promos,
        "affilies":     affilies,
    }

# ── AGENTS ────────────────────────────────────────────────────────────────────
AGENTS = {
    "central":      {"name": "Central",       "icon": "🧠", "color": "#6366f1", "role": "Orchestrateur"},
    "data":         {"name": "Data Agent",     "icon": "📊", "color": "#10b981", "role": "Analyste données"},
    "prospect":     {"name": "Prospect Agent", "icon": "🔎", "color": "#06b6d4", "role": "Qualification"},
    "scoring":      {"name": "Scoring Agent",  "icon": "🎯", "color": "#f59e0b", "role": "Propension achat"},
    "product":      {"name": "Product Agent",  "icon": "🛒", "color": "#ec4899", "role": "Offres"},
    "marketing":    {"name": "Marketing Agent","icon": "📧", "color": "#ef4444", "role": "Campagnes"},
    "optimization": {"name": "Optim Agent",    "icon": "⚡", "color": "#8b5cf6", "role": "ROI & Simulations"},
}

PIPELINE = [
    ('init',                    'central',      'init'),
    ('central_asked_data',      'data',         None),
    ('data_done',               'central',      'after_data'),
    ('central_asked_prospect',  'prospect',     None),
    ('prospect_done',           'central',      'after_prospect'),
    ('central_asked_scoring',   'scoring',      None),
    ('scoring_done',            'central',      'after_scoring'),
    ('central_asked_product',   'product',      None),
    ('product_done',            'central',      'after_product'),
    ('central_asked_marketing', 'marketing',    None),
    ('marketing_done',          'central',      'after_marketing'),
    ('central_asked_optim',     'optimization', None),
    ('optimization_done',       'central',      'conclusion'),
]

TRANSITIONS = {p[0]: p for p in PIPELINE}
NEXT_STATE  = {PIPELINE[i][0]: (PIPELINE[i+1][0] if i+1 < len(PIPELINE) else 'done') for i in range(len(PIPELINE))}
TOTAL_STEPS = len(PIPELINE)

# ── LLM ──────────────────────────────────────────────────────────────────────
STYLE = """RÈGLES ABSOLUES:
- Tu parles comme un collègue en réunion rapide : direct, factuel, sans fioritures.
- Pas de "Bien sûr", pas de salutations, pas de conclusion morale.
- Phrases courtes. Maximum 90 mots. Utilise UNIQUEMENT les chiffres fournis dans les données.
- Si tableau : 3 colonnes max, 5 lignes max.
- Zéro markdown inutile.
"""

def call_llm(prompt, max_tokens=350):
    try:
        r = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.6,
            max_tokens=max_tokens
        )
        return r.choices[0].message.content.strip()
    except Exception as e:
        print(f"LLM error: {e}")
        return None

def ctx(messages, n=4):
    return ''.join(f"[{m['agent_name']}]: {m['message'][:300]}\n" for m in messages[-n:])

def last_from(messages, key):
    for m in reversed(messages):
        if m['agent_key'] == key:
            return m['message']
    return ""

# ── CENTRAL ──────────────────────────────────────────────────────────────────
def run_central(sujet, messages, phase, extra="", data=None):
    phases = {
        'init': f"""Tu es Central, chef d'orchestre.
Sujet: {sujet}
{STYLE}
En 2 phrases: pose l'objectif (identifier les meilleurs prospects, emails personnalisés). Demande au Data Agent d'analyser les segments actifs à fort potentiel.""",

        'after_data': f"""Central. Data Agent a répondu:
{extra}
{STYLE}
En 2 phrases: quels segments retenir? Demande au Prospect Agent de qualifier les leads sur ces segments.""",

        'after_prospect': f"""Central. Prospect Agent:
{extra}
{STYLE}
En 2 phrases: valide ou ajuste. Demande au Scoring Agent le score de propension pour les segments retenus.""",

        'after_scoring': f"""Central. Scoring Agent:
{extra}
{STYLE}
En 2 phrases: quel segment cibler. Demande au Product Agent une offre adaptée à ce profil.""",

        'after_product': f"""Central. Product Agent:
{extra}
{STYLE}
En 2 phrases: valide l'offre. Demande au Marketing Agent de construire la campagne email.""",

        'after_marketing': f"""Central. Marketing Agent:
{extra}
{STYLE}
En 2 phrases: ok ou retouche. Demande à Optim Agent le ROI simulé et un verdict GO/NO-GO.""",

        'conclusion': f"""Central. Synthèse finale:
{extra}
{STYLE}
5 points courts:
1. Segment cible + nb clients
2. Score propension + churn risk
3. Offre (produit, prix, remise)
4. Email: objet + CTA
5. ROI estimé + verdict GO/STOP"""
    }
    return call_llm(phases.get(phase, ""), 300)

# ── AGENTS SPÉCIALISÉS ────────────────────────────────────────────────────────
def run_data(sujet, question, messages, data):
    d = safe_dumps(data)
    return call_llm(f"""Tu es Data Agent.
Sujet: {sujet}
Question: {question}

DONNÉES RÉELLES:
{d}

{STYLE}
4 points max:
- Résumé commandes (total, payées, panier moyen, revenu total)
- Répartition segments A/B/C/D (nb clients, panier moyen)
- Profils chauds (purchase_score≥70) vs churn risk (≥60)
- Segment recommandé + 1 chiffre clé""", 380)

def run_prospect(sujet, question, messages, data):
    d = safe_dumps(data)
    return call_llm(f"""Tu es Prospect Agent.
Sujet: {sujet}
Question: {question}

Contexte:
{ctx(messages, 3)}

DONNÉES:
{d}

{STYLE}
4 lignes max:
- Nb prospects qualifiés dans le segment retenu
- Critères (récence, score, sensibilité promo)
- Nb profils sensibles aux promos
- Segment confirmé + justification chiffrée""", 320)

def run_scoring(sujet, question, messages, data):
    d = safe_dumps(data)
    return call_llm(f"""Tu es Scoring Agent.
Sujet: {sujet}
Question: {question}

Contexte:
{ctx(messages, 3)}

DONNÉES:
{d}

{STYLE}
Tableau (Segment | Score /100 | Churn risk | Priorité):
1 phrase: quel segment activer, chiffre à l'appui.""", 300)

def run_product(sujet, question, messages, data):
    produits = safe_dumps(data.get('top_produits', []))
    return call_llm(f"""Tu es Product Agent.
Sujet: {sujet}
Question: {question}

Contexte:
{ctx(messages, 4)}

TOP PRODUITS RÉELS:
{produits}

{STYLE}
UNE offre:
- Produit (des vrais top produits) + prix + remise %
- Pourquoi ça colle avec le segment (1 chiffre)
- Condition spéciale si applicable""", 280)

def run_marketing(sujet, question, messages, data):
    promos = safe_dumps(data.get('promos', {}))
    events = safe_dumps(data.get('events', {}))
    return call_llm(f"""Tu es Marketing Agent.
Sujet: {sujet}
Question: {question}

Contexte:
{ctx(messages, 4)}

STATS:
- Codes promo: {promos}
- Conversion: {events}

{STYLE}
Objet email: (< 50 car)
Message: (2 phrases, inclure [Prénom])
CTA: (action précise)
Envoi: (jour + heure)
Taux ouverture estimé: X%""", 320)

def run_optimization(sujet, question, messages, data):
    d = safe_dumps(data)
    return call_llm(f"""Tu es Optimization Agent.
Sujet: {sujet}
Question: {question}

Contexte:
{ctx(messages, 6)}

DONNÉES:
{d}

{STYLE}
Tableau ROI (Prospects ciblés | Coût camp. | Conversions | Revenu net):
1 risque principal (chiffre).
Verdict: GO ✅ ou STOP ❌ + 1 phrase chiffrée.""", 320)

# ── ROUTES ────────────────────────────────────────────────────────────────────
@app.route('/')
def index():
    return render_template('chat.html')

@app.route('/api/start', methods=['POST'])
def start_conversation():
    sid      = str(uuid.uuid4())
    body     = request.json or {}
    sujet    = body.get('sujet', '').strip()
    boutique = body.get('boutique_id')  # optionnel

    if not sujet:
        return jsonify({'error': 'Sujet requis'}), 400

    try:
        sim_data = fetch_simulation_data(boutique_id=boutique)
    except Exception as e:
        print(f"DB error: {e}")
        return jsonify({'error': f'Erreur base de données: {str(e)}'}), 500

    conversations[sid] = {
        'messages':       [],
        'sujet':          sujet,
        'boutique_id':    boutique,
        'data':           sim_data,
        'state':          'init',
        'last_central_q': '',
        'step_count':     0
    }
    return jsonify({'session_id': sid})

@app.route('/api/next', methods=['POST'])
def next_message():
    sid = request.json.get('session_id')
    if sid not in conversations:
        return jsonify({'error': 'Session invalide'}), 404

    conv  = conversations[sid]
    state = conv['state']

    if state == 'done' or state not in TRANSITIONS:
        return jsonify({'finished': True})

    _, agent_key, phase = TRANSITIONS[state]
    agent_cfg = AGENTS.get(agent_key, {})
    sujet     = conv['sujet']
    messages  = conv['messages']
    data      = conv['data']

    if agent_key == 'central':
        extra = ''
        if phase == 'after_data':       extra = last_from(messages, 'data')
        elif phase == 'after_prospect': extra = last_from(messages, 'prospect')
        elif phase == 'after_scoring':  extra = last_from(messages, 'scoring')
        elif phase == 'after_product':  extra = last_from(messages, 'product')
        elif phase == 'after_marketing':extra = last_from(messages, 'marketing')
        elif phase == 'conclusion':     extra = ctx(messages, 12)
        text = run_central(sujet, messages, phase, extra, data)
        conv['last_central_q'] = text or ""
    elif agent_key == 'data':
        text = run_data(sujet, conv['last_central_q'], messages, data)
    elif agent_key == 'prospect':
        text = run_prospect(sujet, conv['last_central_q'], messages, data)
    elif agent_key == 'scoring':
        text = run_scoring(sujet, conv['last_central_q'], messages, data)
    elif agent_key == 'product':
        text = run_product(sujet, conv['last_central_q'], messages, data)
    elif agent_key == 'marketing':
        text = run_marketing(sujet, conv['last_central_q'], messages, data)
    elif agent_key == 'optimization':
        text = run_optimization(sujet, conv['last_central_q'], messages, data)
    else:
        text = f"[{agent_cfg.get('name','Agent')}] En traitement..."

    text = text or f"[{agent_cfg.get('name','Agent')}] En traitement..."

    msg = {
        'agent_key':  agent_key,
        'agent_name': agent_cfg.get('name', agent_key),
        'icon':       agent_cfg.get('icon', '●'),
        'color':      agent_cfg.get('color', '#888'),
        'role':       agent_cfg.get('role', ''),
        'message':    text,
        'timestamp':  datetime.now().isoformat(),
        'is_central': agent_key == 'central',
        'phase':      phase
    }

    conv['messages'].append(msg)
    conv['step_count'] += 1
    conv['state'] = NEXT_STATE.get(state, 'done')
    finished = conv['state'] == 'done'

    return jsonify({
        'message':  msg,
        'finished': finished,
        'progress': min(conv['step_count'] / TOTAL_STEPS, 1.0),
        'state':    conv['state']
    })

if __name__ == '__main__':
    print("🧠 ELISA CORE — Multi-Agent System (PostgreSQL live)")
    print("🚀 http://localhost:5000")
    app.run(debug=True, port=5000)