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
