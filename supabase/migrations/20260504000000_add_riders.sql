-- Migration: Add Delivery Riders
-- Adds rider profiles (identity, vehicle, payment config) and platform-level rider settings.
-- Live operational state (location, online status, ratings per order) lives in Convex.

CREATE TABLE IF NOT EXISTS riders (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text NOT NULL,
  plate_number text NOT NULL,
  vehicle_type text NOT NULL DEFAULT 'motorcycle', -- motorcycle | bicycle | car
  photo_url text,
  is_approved boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  -- Aggregate rating cache; per-order ratings live in Convex riderRatings.
  rating_sum numeric NOT NULL DEFAULT 0,
  rating_count integer NOT NULL DEFAULT 0,
  -- Payment override; null means use platform default in rider_settings.
  payment_mode text CHECK (payment_mode IN ('fixed', 'percentage')),
  payment_value numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_riders_is_approved ON riders(is_approved);
CREATE INDEX idx_riders_is_active ON riders(is_active);

-- Platform-wide rider settings (single row).
CREATE TABLE IF NOT EXISTS rider_settings (
  id integer PRIMARY KEY DEFAULT 1,
  default_payment_mode text NOT NULL DEFAULT 'percentage' CHECK (default_payment_mode IN ('fixed', 'percentage')),
  default_payment_value numeric NOT NULL DEFAULT 80, -- 80% of delivery fee, or 80 pesos if fixed
  offer_radius_km numeric NOT NULL DEFAULT 5,
  offer_expiry_seconds integer NOT NULL DEFAULT 30,
  max_concurrent_offers integer NOT NULL DEFAULT 3,
  location_stale_seconds integer NOT NULL DEFAULT 120,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rider_settings_singleton CHECK (id = 1)
);

INSERT INTO rider_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE riders ENABLE ROW LEVEL SECURITY;
ALTER TABLE rider_settings ENABLE ROW LEVEL SECURITY;

-- Riders can read and update their own profile.
CREATE POLICY "Riders read own profile"
  ON riders FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Riders update own profile"
  ON riders FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND is_approved = (SELECT is_approved FROM riders WHERE id = auth.uid()));

-- Public can read approved riders (so customers can see name/plate/rating on assigned orders).
CREATE POLICY "Public reads approved riders"
  ON riders FOR SELECT TO public
  USING (is_approved = true AND is_active = true);

-- Authenticated (admin/staff path is handled in app code via app_metadata.role) can manage.
CREATE POLICY "Authenticated manage riders"
  ON riders FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "Public reads rider settings"
  ON rider_settings FOR SELECT TO public USING (true);

CREATE POLICY "Authenticated manage rider settings"
  ON rider_settings FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_riders_updated_at
  BEFORE UPDATE ON riders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rider_settings_updated_at
  BEFORE UPDATE ON rider_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE riders IS 'Rider identity and static profile. Live state (location, presence) lives in Convex.';
COMMENT ON COLUMN riders.payment_mode IS 'Per-rider override; null falls back to rider_settings.default_payment_mode.';
COMMENT ON TABLE rider_settings IS 'Platform-wide rider config (singleton row, id=1).';
