-- ============================================
-- BASE DE DONNÉES: eseafy
-- STRUCTURE COMPLÈTE
-- ============================================

-- ============================================
-- 1. CRÉATION DES SÉQUENCES
-- ============================================

CREATE SEQUENCE IF NOT EXISTS users_id_seq START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
CREATE SEQUENCE IF NOT EXISTS affilies_id_seq START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
CREATE SEQUENCE IF NOT EXISTS boutiques_id_seq START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
CREATE SEQUENCE IF NOT EXISTS codes_promo_id_seq START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
CREATE SEQUENCE IF NOT EXISTS commandes_id_seq START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
CREATE SEQUENCE IF NOT EXISTS customer_profiles_id_seq START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
CREATE SEQUENCE IF NOT EXISTS elisa_campagnes_id_seq START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
CREATE SEQUENCE IF NOT EXISTS events_id_seq START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
CREATE SEQUENCE IF NOT EXISTS notifications_id_seq START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
CREATE SEQUENCE IF NOT EXISTS produits_id_seq START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
CREATE SEQUENCE IF NOT EXISTS ventes_id_seq START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
CREATE SEQUENCE IF NOT EXISTS visites_id_seq START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
CREATE SEQUENCE IF NOT EXISTS visitors_id_seq START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;

-- ============================================
-- 2. TABLE users
-- ============================================

CREATE TABLE users (
    id INTEGER PRIMARY KEY DEFAULT nextval('users_id_seq'),
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    nom VARCHAR(100),
    prenom VARCHAR(100),
    telephone VARCHAR(20),
    plan VARCHAR(20) DEFAULT 'starter',
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    otp_code VARCHAR(10),
    otp_expire_at TIMESTAMP
);

-- ============================================
-- 3. TABLE boutiques (dépend de users)
-- ============================================

CREATE TABLE boutiques (
    id INTEGER PRIMARY KEY DEFAULT nextval('boutiques_id_seq'),
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    nom VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE,
    description TEXT,
    plan VARCHAR(20) DEFAULT 'starter',
    created_at TIMESTAMP DEFAULT now(),
    fb_pixel_id VARCHAR(50),
    ga_id VARCHAR(30),
    devise VARCHAR(10) DEFAULT 'XOF',
    langue VARCHAR(10) DEFAULT 'fr',
    pays VARCHAR(50) DEFAULT 'Benin',
    updated_at TIMESTAMP DEFAULT now(),
    elisa_actif BOOLEAN DEFAULT false,
    elisa_targeting JSONB DEFAULT '{"age": "tous", "genre": "tous", "device": "tous", "interets": []}',
    elisa_sequences JSONB DEFAULT '{}',
    elisa_emails_sent INTEGER DEFAULT 0,
    elisa_reset_at TIMESTAMP DEFAULT now()
);

-- ============================================
-- 4. TABLE produits (dépend de users, boutiques)
-- ============================================

CREATE TABLE produits (
    id INTEGER PRIMARY KEY DEFAULT nextval('produits_id_seq'),
    boutique_id INTEGER REFERENCES boutiques(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    nom VARCHAR(255) NOT NULL,
    description TEXT,
    prix NUMERIC(12,2) NOT NULL DEFAULT 0,
    prix_barre NUMERIC(12,2),
    type VARCHAR(20) NOT NULL CHECK (type IN ('digital', 'physical')),
    categorie VARCHAR(100),
    tags TEXT[],
    statut VARCHAR(20) DEFAULT 'brouillon' CHECK (statut IN ('publie', 'brouillon')),
    visible BOOLEAN DEFAULT true,
    stock INTEGER,
    images TEXT[],
    seo_titre VARCHAR(255),
    seo_desc TEXT,
    slug VARCHAR(255) UNIQUE,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    fichier_digital VARCHAR(500),
    lien_digital VARCHAR(500),
    dl_max INTEGER,
    duree_acces VARCHAR(20),
    sku VARCHAR(100),
    poids NUMERIC(6,2),
    delai_livraison VARCHAR(20),
    livraisons TEXT[],
    variantes JSONB,
    stock_auto BOOLEAN DEFAULT true
);

-- ============================================
-- 5. TABLE affilies (dépend de users, boutiques)
-- ============================================

CREATE TABLE affilies (
    id INTEGER PRIMARY KEY DEFAULT nextval('affilies_id_seq'),
    boutique_id INTEGER REFERENCES boutiques(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    nom VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    code VARCHAR(50) NOT NULL UNIQUE,
    commission_pct NUMERIC(5,2) DEFAULT 10,
    total_ventes NUMERIC(12,2) DEFAULT 0,
    nb_ventes INTEGER DEFAULT 0,
    actif BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT now()
);

-- ============================================
-- 6. TABLE codes_promo (dépend de users, boutiques)
-- ============================================

CREATE TABLE codes_promo (
    id INTEGER PRIMARY KEY DEFAULT nextval('codes_promo_id_seq'),
    boutique_id INTEGER REFERENCES boutiques(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL UNIQUE,
    type VARCHAR(20) CHECK (type IN ('pourcentage', 'montant_fixe')),
    valeur NUMERIC(12,2) NOT NULL,
    min_commande NUMERIC(12,2) DEFAULT 0,
    max_utilisations INTEGER,
    nb_utilisations INTEGER DEFAULT 0,
    actif BOOLEAN DEFAULT true,
    expire_le TIMESTAMP,
    created_at TIMESTAMP DEFAULT now()
);

-- ============================================
-- 7. TABLE commandes (dépend de users, boutiques)
-- ============================================

CREATE TABLE commandes (
    id INTEGER PRIMARY KEY DEFAULT nextval('commandes_id_seq'),
    boutique_id INTEGER REFERENCES boutiques(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    reference VARCHAR(50) NOT NULL UNIQUE,
    statut VARCHAR(20) DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'paye', 'rembourse', 'annule', 'traitement', 'expedie')),
    total NUMERIC(12,2) NOT NULL DEFAULT 0,
    nom_client VARCHAR(255),
    email_client VARCHAR(255),
    telephone VARCHAR(20),
    adresse TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

-- ============================================
-- 8. TABLE ventes (dépend de commandes, produits, boutiques, users)
-- ============================================

CREATE TABLE ventes (
    id INTEGER PRIMARY KEY DEFAULT nextval('ventes_id_seq'),
    commande_id INTEGER REFERENCES commandes(id) ON DELETE CASCADE,
    produit_id INTEGER REFERENCES produits(id) ON DELETE SET NULL,
    boutique_id INTEGER REFERENCES boutiques(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    nom_produit VARCHAR(255),
    prix_unitaire NUMERIC(12,2) NOT NULL,
    quantite INTEGER DEFAULT 1,
    total NUMERIC(12,2) NOT NULL,
    created_at TIMESTAMP DEFAULT now()
);

-- ============================================
-- 9. TABLE events (dépend de boutiques, produits)
-- ============================================

CREATE TABLE events (
    id INTEGER PRIMARY KEY DEFAULT nextval('events_id_seq'),
    session_id VARCHAR(100),
    boutique_id INTEGER REFERENCES boutiques(id) ON DELETE CASCADE,
    produit_id INTEGER REFERENCES produits(id) ON DELETE SET NULL,
    event_type VARCHAR(50) NOT NULL,
    page_url VARCHAR(500),
    element_clicked VARCHAR(100),
    scroll_depth INTEGER,
    time_on_page INTEGER,
    price NUMERIC(12,2),
    payload JSONB,
    ip VARCHAR(50),
    ts TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_events_boutique ON events(boutique_id);
CREATE INDEX idx_events_session ON events(session_id);
CREATE INDEX idx_events_type ON events(event_type);

-- ============================================
-- 10. TABLE visites (dépend de boutiques, produits, users)
-- ============================================

CREATE TABLE visites (
    id INTEGER PRIMARY KEY DEFAULT nextval('visites_id_seq'),
    boutique_id INTEGER REFERENCES boutiques(id) ON DELETE CASCADE,
    produit_id INTEGER REFERENCES produits(id) ON DELETE SET NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(20) CHECK (type IN ('boutique', 'produit')),
    ip VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT now()
);

-- ============================================
-- 11. TABLE visitors (dépend de boutiques)
-- ============================================

CREATE TABLE visitors (
    id INTEGER PRIMARY KEY DEFAULT nextval('visitors_id_seq'),
    session_id VARCHAR(100) NOT NULL UNIQUE,
    boutique_id INTEGER REFERENCES boutiques(id) ON DELETE CASCADE,
    email VARCHAR(255),
    telephone VARCHAR(30),
    country VARCHAR(100),
    city VARCHAR(100),
    language VARCHAR(20),
    timezone VARCHAR(50),
    device_type VARCHAR(20),
    os VARCHAR(50),
    browser VARCHAR(50),
    screen_res VARCHAR(20),
    connection_type VARCHAR(20),
    ram_gb NUMERIC(4,1),
    cpu_cores INTEGER,
    referrer VARCHAR(500),
    utm_source VARCHAR(100),
    utm_campaign VARCHAR(100),
    landing_page VARCHAR(500),
    gender_inferred VARCHAR(10),
    age_bracket_inferred VARCHAR(20),
    income_bracket_inferred VARCHAR(20),
    visit_count INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_visitors_session ON visitors(session_id);

-- ============================================
-- 12. TABLE customer_profiles (dépend de boutiques)
-- ============================================

CREATE TABLE customer_profiles (
    id INTEGER PRIMARY KEY DEFAULT nextval('customer_profiles_id_seq'),
    session_id VARCHAR(100),
    boutique_id INTEGER REFERENCES boutiques(id) ON DELETE CASCADE,
    email VARCHAR(255),
    telephone VARCHAR(30),
    preferred_categories TEXT[],
    price_max_seen NUMERIC(12,2) DEFAULT 0,
    price_max_bought NUMERIC(12,2) DEFAULT 0,
    promo_sensitive BOOLEAN DEFAULT false,
    avg_session_duration INTEGER DEFAULT 0,
    visit_count INTEGER DEFAULT 0,
    total_spent NUMERIC(12,2) DEFAULT 0,
    last_seen TIMESTAMP DEFAULT now(),
    best_hour_to_contact INTEGER,
    purchase_score NUMERIC(5,2) DEFAULT 0,
    churn_risk NUMERIC(5,2) DEFAULT 0,
    ltv_estimated NUMERIC(12,2) DEFAULT 0,
    acquisition_source VARCHAR(100),
    acquisition_campaign VARCHAR(100),
    created_at TIMESTAMP DEFAULT now(),
    updated_at TIMESTAMP DEFAULT now(),
    UNIQUE(session_id, boutique_id)
);

CREATE INDEX idx_profiles_email ON customer_profiles(email);
CREATE INDEX idx_profiles_score ON customer_profiles(purchase_score DESC);

-- ============================================
-- 13. TABLE elisa_campagnes (dépend de boutiques)
-- ============================================

CREATE TABLE elisa_campagnes (
    id INTEGER PRIMARY KEY DEFAULT nextval('elisa_campagnes_id_seq'),
    boutique_id INTEGER REFERENCES boutiques(id) ON DELETE CASCADE,
    nom VARCHAR(255) NOT NULL,
    sequence_num INTEGER DEFAULT 1 CHECK (sequence_num IN (1,2,3)),
    destinataires JSONB NOT NULL DEFAULT '[]',
    targeting JSONB DEFAULT '{}',
    statut VARCHAR(20) DEFAULT 'programmee' CHECK (statut IN ('programmee', 'envoyee', 'vide', 'erreur')),
    send_at TIMESTAMP NOT NULL,
    sent_at TIMESTAMP,
    envoyes INTEGER DEFAULT 0,
    echecs INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT now(),
    sequences JSONB DEFAULT '{}'
);

CREATE INDEX idx_elisa_send_at ON elisa_campagnes(send_at);
CREATE INDEX idx_elisa_statut ON elisa_campagnes(statut);

-- ============================================
-- 14. TABLE notifications (dépend de users)
-- ============================================

CREATE TABLE notifications (
    id INTEGER PRIMARY KEY DEFAULT nextval('notifications_id_seq'),
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50),
    titre VARCHAR(255),
    message TEXT,
    lu BOOLEAN DEFAULT false,
    data JSONB,
    created_at TIMESTAMP DEFAULT now()
);

-- ============================================
-- FIN DU SCRIPT
-- ============================================
