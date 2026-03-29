-- Créer la base de données (à exécuter une seule fois)
-- psql -U postgres
-- CREATE DATABASE eseafy;

-- Table utilisateurs
CREATE TABLE IF NOT EXISTS users (
  id          SERIAL PRIMARY KEY,
  email       VARCHAR(255) UNIQUE NOT NULL,
  password    VARCHAR(255) NOT NULL,
  nom         VARCHAR(100),
  prenom      VARCHAR(100),
  telephone   VARCHAR(20),
  plan        VARCHAR(20) DEFAULT 'starter',
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);

-- Table boutiques (un user peut avoir plusieurs boutiques)
CREATE TABLE IF NOT EXISTS boutiques (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
  nom         VARCHAR(255) NOT NULL,
  slug        VARCHAR(255) UNIQUE,
  description TEXT,
  plan        VARCHAR(20) DEFAULT 'starter',
  created_at  TIMESTAMP DEFAULT NOW()
);


CREATE TABLE commandes (
  id            SERIAL PRIMARY KEY,
  boutique_id   INTEGER REFERENCES boutiques(id) ON DELETE CASCADE,
  user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
  reference     VARCHAR(50) UNIQUE NOT NULL,
  statut        VARCHAR(20) DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'paye', 'rembourse', 'annule')),
  total         NUMERIC(12,2) NOT NULL DEFAULT 0,
  nom_client    VARCHAR(255),
  email_client  VARCHAR(255),
  telephone     VARCHAR(20),
  adresse       TEXT,
  notes         TEXT,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE ventes (
  id            SERIAL PRIMARY KEY,
  commande_id   INTEGER REFERENCES commandes(id) ON DELETE CASCADE,
  produit_id    INTEGER REFERENCES produits(id) ON DELETE SET NULL,
  boutique_id   INTEGER REFERENCES boutiques(id) ON DELETE CASCADE,
  user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
  nom_produit   VARCHAR(255),
  prix_unitaire NUMERIC(12,2) NOT NULL,
  quantite      INTEGER DEFAULT 1,
  total         NUMERIC(12,2) NOT NULL,
  created_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE visites (
  id          SERIAL PRIMARY KEY,
  boutique_id INTEGER REFERENCES boutiques(id) ON DELETE CASCADE,
  produit_id  INTEGER REFERENCES produits(id) ON DELETE SET NULL,
  user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
  type        VARCHAR(20) CHECK (type IN ('boutique', 'produit')),
  ip          VARCHAR(50),
  user_agent  TEXT,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE codes_promo (
  id            SERIAL PRIMARY KEY,
  boutique_id   INTEGER REFERENCES boutiques(id) ON DELETE CASCADE,
  user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
  code          VARCHAR(50) UNIQUE NOT NULL,
  type          VARCHAR(20) CHECK (type IN ('pourcentage', 'montant_fixe')),
  valeur        NUMERIC(12,2) NOT NULL,
  min_commande  NUMERIC(12,2) DEFAULT 0,
  max_utilisations INTEGER,
  nb_utilisations  INTEGER DEFAULT 0,
  actif         BOOLEAN DEFAULT true,
  expire_le     TIMESTAMP,
  created_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE affilies (
  id            SERIAL PRIMARY KEY,
  boutique_id   INTEGER REFERENCES boutiques(id) ON DELETE CASCADE,
  user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
  nom           VARCHAR(255) NOT NULL,
  email         VARCHAR(255),
  code          VARCHAR(50) UNIQUE NOT NULL,
  commission_pct NUMERIC(5,2) DEFAULT 10,
  total_ventes  NUMERIC(12,2) DEFAULT 0,
  nb_ventes     INTEGER DEFAULT 0,
  actif         BOOLEAN DEFAULT true,
  created_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE notifications (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  type       VARCHAR(50),
  titre      VARCHAR(255),
  message    TEXT,
  lu         BOOLEAN DEFAULT false,
  data       JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE notifications (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  type       VARCHAR(50),
  titre      VARCHAR(255),
  message    TEXT,
  lu         BOOLEAN DEFAULT false,
  data       JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE visitors (
  id                      SERIAL PRIMARY KEY,
  session_id              VARCHAR(100) UNIQUE NOT NULL,
  boutique_id             INTEGER REFERENCES boutiques(id) ON DELETE CASCADE,
  email                   VARCHAR(255),
  telephone               VARCHAR(30),
  country                 VARCHAR(100),
  city                    VARCHAR(100),
  language                VARCHAR(20),
  timezone                VARCHAR(50),
  device_type             VARCHAR(20),
  os                      VARCHAR(50),
  browser                 VARCHAR(50),
  screen_res              VARCHAR(20),
  connection_type         VARCHAR(20),
  ram_gb                  NUMERIC(4,1),
  cpu_cores               INTEGER,
  referrer                VARCHAR(500),
  utm_source              VARCHAR(100),
  utm_campaign            VARCHAR(100),
  landing_page            VARCHAR(500),
  gender_inferred         VARCHAR(10),
  age_bracket_inferred    VARCHAR(20),
  income_bracket_inferred VARCHAR(20),
  visit_count             INTEGER DEFAULT 1,
  created_at              TIMESTAMP DEFAULT NOW(),
  updated_at              TIMESTAMP DEFAULT NOW()
);

CREATE TABLE events (
  id              SERIAL PRIMARY KEY,
  session_id      VARCHAR(100),
  boutique_id     INTEGER REFERENCES boutiques(id) ON DELETE CASCADE,
  produit_id      INTEGER REFERENCES produits(id) ON DELETE SET NULL,
  event_type      VARCHAR(50) NOT NULL,
  page_url        VARCHAR(500),
  element_clicked VARCHAR(100),
  scroll_depth    INTEGER,
  time_on_page    INTEGER,
  price           NUMERIC(12,2),
  payload         JSONB,
  ip              VARCHAR(50),
  ts              TIMESTAMP DEFAULT NOW()
);

CREATE TABLE customer_profiles (
  id                    SERIAL PRIMARY KEY,
  session_id            VARCHAR(100),
  boutique_id           INTEGER REFERENCES boutiques(id) ON DELETE CASCADE,
  email                 VARCHAR(255),
  telephone             VARCHAR(30),
  preferred_categories  TEXT[],
  price_max_seen        NUMERIC(12,2) DEFAULT 0,
  price_max_bought      NUMERIC(12,2) DEFAULT 0,
  promo_sensitive       BOOLEAN DEFAULT false,
  avg_session_duration  INTEGER DEFAULT 0,
  visit_count           INTEGER DEFAULT 0,
  total_spent           NUMERIC(12,2) DEFAULT 0,
  last_seen             TIMESTAMP DEFAULT NOW(),
  best_hour_to_contact  INTEGER,
  purchase_score        NUMERIC(5,2) DEFAULT 0,
  churn_risk            NUMERIC(5,2) DEFAULT 0,
  ltv_estimated         NUMERIC(12,2) DEFAULT 0,
  acquisition_source    VARCHAR(100),
  acquisition_campaign  VARCHAR(100),
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_events_session   ON events(session_id);
CREATE INDEX idx_events_type      ON events(event_type);
CREATE INDEX idx_events_boutique  ON events(boutique_id);
CREATE INDEX idx_visitors_session ON visitors(session_id);
CREATE INDEX idx_profiles_email   ON customer_profiles(email);
CREATE INDEX idx_profiles_score   ON customer_profiles(purchase_score DESC);

ALTER TABLE commandes 
DROP CONSTRAINT commandes_statut_check;

ALTER TABLE commandes 
ADD CONSTRAINT commandes_statut_check 
CHECK (statut IN (
  'en_attente',
  'paye',
  'rembourse',
  'annule',
  'traitement',
  'expedie'
));
