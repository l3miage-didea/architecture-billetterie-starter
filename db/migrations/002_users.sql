CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  login TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Une réservation appartient à l'utilisateur dont l'identifiant est stocké dans customer_ref.
-- Pas de clé étrangère : les réservations créées avant le TP 3 portent des références fictives.
CREATE INDEX IF NOT EXISTS reservations_customer_idx ON reservations (customer_ref);
