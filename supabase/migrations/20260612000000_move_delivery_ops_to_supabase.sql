/*
  Migrate delivery operations from Convex to Supabase.

  Adds everything that previously lived in Convex:
    - orders: delivery/rider/payout columns (extends the existing table)
    - staff, rider_presence, order_offers, order_messages,
      dispatch_settings, payouts, rider_ratings
    - Authorization helpers (admin / staff-per-merchant)
    - RPCs for order lifecycle, rider dispatch + batching, chat, ratings,
      earnings and payouts
    - RLS on all new tables; tightens the legacy public policies on orders
    - pg_cron tick that expires stale offers and re-dispatches unassigned
      delivery orders

  Design notes (free-tier friendly):
    - Customers (anonymous) never get table-level SELECT on orders; they read
      through SECURITY DEFINER RPCs keyed by order id / contact number, and the
      frontend polls those instead of holding realtime channels.
    - Realtime is only used by authenticated dashboards (staff orders, rider
      offers/orders). rider_presence and order_messages are NOT in the realtime
      publication — they are polled at low frequency.
*/

-- ===========================================================================
-- 1. orders: new columns for delivery / rider / payout state
-- ===========================================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_latitude double precision,
  ADD COLUMN IF NOT EXISTS delivery_longitude double precision,
  ADD COLUMN IF NOT EXISTS merchant_latitude double precision,
  ADD COLUMN IF NOT EXISTS merchant_longitude double precision,
  ADD COLUMN IF NOT EXISTS distance_km double precision,
  ADD COLUMN IF NOT EXISTS delivery_fee numeric(12,2),
  ADD COLUMN IF NOT EXISTS delivery_fee_breakdown jsonb,
  ADD COLUMN IF NOT EXISTS delivery_mode text CHECK (delivery_mode IN ('priority', 'economy')),
  ADD COLUMN IF NOT EXISTS staff_id uuid,
  ADD COLUMN IF NOT EXISTS assigned_rider_id uuid,
  ADD COLUMN IF NOT EXISTS rider_assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS picked_up_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS rider_earning numeric(12,2),
  ADD COLUMN IF NOT EXISTS payout_id uuid;

-- Convex stored dine-in time as a plain string (e.g. "18:30"); the legacy
-- Supabase column was timestamptz. Use text so the frontend value round-trips.
ALTER TABLE orders ALTER COLUMN dine_in_time TYPE text USING dine_in_time::text;

-- Status set now includes the rider flow states.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (
  status IN ('pending','confirmed','preparing','ready','out_for_delivery','completed','cancelled')
) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_merchant_status ON orders(merchant_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_contact_number ON orders(contact_number, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_assigned_rider ON orders(assigned_rider_id) WHERE assigned_rider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_payout ON orders(payout_id) WHERE payout_id IS NOT NULL;

-- ===========================================================================
-- 2. New tables
-- ===========================================================================

CREATE TABLE IF NOT EXISTS staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supabase_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text NOT NULL,
  merchant_ids uuid[] NOT NULL DEFAULT '{}',
  all_merchants boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rider_presence (
  rider_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  latitude double precision,
  longitude double precision,
  last_location_update timestamptz,
  status text NOT NULL DEFAULT 'offline' CHECK (status IN ('offline','available','busy')),
  location_permission text NOT NULL DEFAULT 'unknown' CHECK (location_permission IN ('granted','denied','unknown')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rider_presence_status ON rider_presence(status);

CREATE TABLE IF NOT EXISTS order_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  rider_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','expired')),
  offered_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  distance_km double precision,
  responded_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_order_offers_order ON order_offers(order_id, status);
CREATE INDEX IF NOT EXISTS idx_order_offers_rider ON order_offers(rider_id, status);

CREATE TABLE IF NOT EXISTS order_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sender_type text NOT NULL CHECK (sender_type IN ('customer','rider')),
  sender_id text NOT NULL,
  text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 1000),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_messages_order ON order_messages(order_id, created_at);

CREATE TABLE IF NOT EXISTS dispatch_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  offer_radius_km numeric NOT NULL DEFAULT 5 CHECK (offer_radius_km > 0 AND offer_radius_km <= 100),
  offer_expiry_ms integer NOT NULL DEFAULT 30000 CHECK (offer_expiry_ms BETWEEN 5000 AND 600000),
  max_concurrent_offers integer NOT NULL DEFAULT 3 CHECK (max_concurrent_offers BETWEEN 1 AND 20),
  location_stale_ms integer NOT NULL DEFAULT 120000 CHECK (location_stale_ms BETWEEN 30000 AND 1800000),
  dispatch_on_create boolean NOT NULL DEFAULT true,
  max_concurrent_orders_per_rider integer NOT NULL DEFAULT 3 CHECK (max_concurrent_orders_per_rider BETWEEN 1 AND 10),
  batch_time_window_ms integer NOT NULL DEFAULT 600000 CHECK (batch_time_window_ms BETWEEN 60000 AND 1800000),
  batch_proximity_km numeric NOT NULL DEFAULT 2.0 CHECK (batch_proximity_km > 0 AND batch_proximity_km <= 20),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO dispatch_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','cancelled')),
  notes text,
  period_from timestamptz,
  period_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  created_by uuid NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payouts_rider ON payouts(rider_id, status);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON payouts(status);

ALTER TABLE orders
  ADD CONSTRAINT orders_payout_fk FOREIGN KEY (payout_id) REFERENCES payouts(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS rider_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  rider_id uuid NOT NULL,
  customer_contact text NOT NULL,
  rating numeric NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rider_ratings_rider ON rider_ratings(rider_id, created_at DESC);

-- ===========================================================================
-- 3. Authorization helpers
-- ===========================================================================

CREATE OR REPLACE FUNCTION app_role()
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '');
$$;

-- Admin = app_metadata.role 'admin', the legacy admin account, or an active
-- staff record flagged all_merchants.
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF app_role() = 'admin' THEN RETURN true; END IF;
  IF lower(COALESCE(auth.jwt() ->> 'email', '')) = 'admin@clickeats.com' THEN RETURN true; END IF;
  RETURN EXISTS (
    SELECT 1 FROM staff
    WHERE supabase_user_id = auth.uid() AND is_active AND all_merchants
  );
END;
$$;

CREATE OR REPLACE FUNCTION is_active_staff()
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM staff WHERE supabase_user_id = auth.uid() AND is_active
  );
END;
$$;

CREATE OR REPLACE FUNCTION has_merchant_access(p_merchant_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF is_admin() THEN RETURN true; END IF;
  RETURN EXISTS (
    SELECT 1 FROM staff
    WHERE supabase_user_id = auth.uid()
      AND is_active
      AND (all_merchants OR p_merchant_id = ANY(merchant_ids))
  );
END;
$$;

-- haversine_km(double precision x4) RETURNS numeric already exists from the
-- geospatial delivery pricing migration; the dispatch functions reuse it.

-- ===========================================================================
-- 4. Batching gate (port of convex/batching.ts)
--    Returns NULL when the rider may take the order, otherwise the reason.
-- ===========================================================================

CREATE OR REPLACE FUNCTION can_batch_for_rider(
  p_rider_id uuid,
  p_merchant_id uuid,
  p_merchant_lat double precision,
  p_merchant_lng double precision,
  p_delivery_mode text
)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s dispatch_settings%ROWTYPE;
  active_count int;
  has_same_merchant boolean;
  has_active_priority boolean;
  last_assigned timestamptz;
  within_proximity boolean;
BEGIN
  SELECT * INTO s FROM dispatch_settings WHERE id = 1;

  SELECT count(*),
         bool_or(merchant_id = p_merchant_id),
         bool_or(delivery_mode = 'priority'),
         max(rider_assigned_at)
    INTO active_count, has_same_merchant, has_active_priority, last_assigned
    FROM orders
   WHERE assigned_rider_id = p_rider_id
     AND status NOT IN ('completed','cancelled');

  IF active_count = 0 THEN RETURN NULL; END IF;

  IF active_count >= s.max_concurrent_orders_per_rider THEN
    RETURN 'Rider is at full capacity';
  END IF;

  IF p_delivery_mode = 'priority' AND NOT COALESCE(has_same_merchant, false) THEN
    RETURN 'Priority orders require a free rider or same-merchant pickup';
  END IF;

  IF COALESCE(has_active_priority, false) AND NOT COALESCE(has_same_merchant, false) THEN
    RETURN 'Rider has a priority order in progress';
  END IF;

  IF last_assigned IS NULL OR now() - last_assigned > make_interval(secs => s.batch_time_window_ms / 1000.0) THEN
    RETURN 'Last accepted order is too old to batch';
  END IF;

  IF COALESCE(has_same_merchant, false) THEN RETURN NULL; END IF;

  IF p_merchant_lat IS NULL OR p_merchant_lng IS NULL THEN
    RETURN 'Candidate order has no merchant coordinates';
  END IF;

  SELECT bool_or(
           haversine_km(p_merchant_lat, p_merchant_lng, merchant_latitude, merchant_longitude)
             <= s.batch_proximity_km
         )
    INTO within_proximity
    FROM orders
   WHERE assigned_rider_id = p_rider_id
     AND status NOT IN ('completed','cancelled')
     AND merchant_latitude IS NOT NULL
     AND merchant_longitude IS NOT NULL;

  IF NOT COALESCE(within_proximity, false) THEN
    RETURN 'Merchants too far apart to batch';
  END IF;

  RETURN NULL;
END;
$$;

-- ===========================================================================
-- 5. Dispatch
-- ===========================================================================

-- Creates pending offers for the nearest eligible available riders.
-- Internal: not granted to client roles; called from RPCs and the cron tick.
CREATE OR REPLACE FUNCTION dispatch_for_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o orders%ROWTYPE;
  s dispatch_settings%ROWTYPE;
  c record;
  offers_made int := 0;
BEGIN
  SELECT * INTO o FROM orders WHERE id = p_order_id;
  IF NOT FOUND OR o.service_type <> 'delivery' OR o.assigned_rider_id IS NOT NULL THEN RETURN; END IF;
  IF o.merchant_latitude IS NULL OR o.merchant_longitude IS NULL THEN RETURN; END IF;
  IF o.status IN ('completed','cancelled') THEN RETURN; END IF;

  SELECT * INTO s FROM dispatch_settings WHERE id = 1;

  FOR c IN
    SELECT rp.rider_id,
           haversine_km(rp.latitude, rp.longitude, o.merchant_latitude, o.merchant_longitude) AS distance_km
      FROM rider_presence rp
     WHERE rp.status = 'available'
       AND rp.latitude IS NOT NULL AND rp.longitude IS NOT NULL
       AND rp.last_location_update IS NOT NULL
       AND now() - rp.last_location_update < make_interval(secs => s.location_stale_ms / 1000.0)
       AND NOT EXISTS (
         SELECT 1 FROM order_offers oo
          WHERE oo.order_id = p_order_id AND oo.rider_id = rp.rider_id
       )
     ORDER BY 2 ASC
  LOOP
    EXIT WHEN offers_made >= s.max_concurrent_offers;
    CONTINUE WHEN c.distance_km > s.offer_radius_km;
    CONTINUE WHEN can_batch_for_rider(c.rider_id, o.merchant_id, o.merchant_latitude,
                                      o.merchant_longitude, o.delivery_mode) IS NOT NULL;
    INSERT INTO order_offers (order_id, rider_id, status, offered_at, expires_at, distance_km)
    VALUES (p_order_id, c.rider_id, 'pending', now(),
            now() + make_interval(secs => s.offer_expiry_ms / 1000.0), c.distance_km);
    offers_made := offers_made + 1;
  END LOOP;
END;
$$;

-- Cron tick: expire overdue offers, then re-dispatch unassigned delivery
-- orders that have no live offers. Replaces Convex's scheduler chain.
CREATE OR REPLACE FUNCTION expire_offers_and_redispatch()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  UPDATE order_offers
     SET status = 'expired', responded_at = now()
   WHERE status = 'pending' AND expires_at <= now();

  FOR r IN
    SELECT o.id
      FROM orders o
     WHERE o.service_type = 'delivery'
       AND o.assigned_rider_id IS NULL
       AND o.status IN ('pending','confirmed','preparing','ready')
       AND o.merchant_latitude IS NOT NULL
       AND o.merchant_longitude IS NOT NULL
       AND o.created_at > now() - interval '24 hours'
       AND NOT EXISTS (
         SELECT 1 FROM order_offers oo
          WHERE oo.order_id = o.id AND oo.status = 'pending' AND oo.expires_at > now()
       )
  LOOP
    PERFORM dispatch_for_order(r.id);
  END LOOP;
END;
$$;

-- ===========================================================================
-- 6. Order lifecycle RPCs
-- ===========================================================================

-- Public order creation. Validates pricing integrity, inserts the order and
-- its items, decrements inventory, and kicks off dispatch for deliveries.
-- The legacy IP rate-limit triggers on orders still apply to this insert.
CREATE OR REPLACE FUNCTION create_order(p jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id uuid;
  item jsonb;
  v_items_total numeric := 0;
  v_delivery_fee numeric := COALESCE((p->>'deliveryFee')::numeric, 0);
  v_total numeric := (p->>'total')::numeric;
  v_dispatch boolean;
BEGIN
  IF v_delivery_fee < 0 THEN RAISE EXCEPTION 'Invalid delivery fee'; END IF;
  IF p->'items' IS NULL OR jsonb_array_length(p->'items') = 0 THEN
    RAISE EXCEPTION 'Order has no items';
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(p->'items') LOOP
    IF (item->>'unitPrice')::numeric <= 0 THEN RAISE EXCEPTION 'Invalid item price'; END IF;
    IF (item->>'quantity')::numeric <= 0 THEN RAISE EXCEPTION 'Invalid item quantity'; END IF;
    IF abs(round((item->>'unitPrice')::numeric * (item->>'quantity')::numeric, 2)
           - round((item->>'subtotal')::numeric, 2)) > 0.01 THEN
      RAISE EXCEPTION 'Price calculation mismatch in order items';
    END IF;
    v_items_total := v_items_total + (item->>'subtotal')::numeric;
  END LOOP;

  IF abs(round(v_total, 2) - round(v_items_total + v_delivery_fee, 2)) > 0.01 THEN
    RAISE EXCEPTION 'Order total does not match item subtotals plus delivery fee';
  END IF;

  INSERT INTO orders (
    merchant_id, customer_name, contact_number, service_type, address,
    delivery_latitude, delivery_longitude, merchant_latitude, merchant_longitude,
    distance_km, delivery_fee, delivery_fee_breakdown, delivery_mode,
    pickup_time, party_size, dine_in_time, payment_method, reference_number,
    notes, total, status, ip_address, receipt_url
  ) VALUES (
    (p->>'merchantId')::uuid,
    p->>'customerName',
    p->>'contactNumber',
    p->>'serviceType',
    p->>'address',
    (p->>'deliveryLatitude')::double precision,
    (p->>'deliveryLongitude')::double precision,
    (p->>'merchantLatitude')::double precision,
    (p->>'merchantLongitude')::double precision,
    (p->>'distanceKm')::double precision,
    NULLIF(p->>'deliveryFee', '')::numeric,
    p->'deliveryFeeBreakdown',
    p->>'deliveryMode',
    p->>'pickupTime',
    (p->>'partySize')::numeric::int,
    p->>'dineInTime',
    p->>'paymentMethod',
    p->>'referenceNumber',
    p->>'notes',
    v_total,
    'pending',
    p->>'ipAddress',
    p->>'receiptUrl'
  ) RETURNING id INTO v_order_id;

  INSERT INTO order_items (order_id, item_id, name, variation, add_ons, unit_price, quantity, subtotal)
  SELECT v_order_id,
         i->>'itemId',
         i->>'name',
         i->'variation',
         i->'addOns',
         (i->>'unitPrice')::numeric,
         (i->>'quantity')::numeric::int,
         (i->>'subtotal')::numeric
    FROM jsonb_array_elements(p->'items') AS i;

  IF p->'stockAdjustments' IS NOT NULL AND jsonb_array_length(p->'stockAdjustments') > 0 THEN
    PERFORM decrement_menu_item_stock(p->'stockAdjustments');
  END IF;

  IF p->>'serviceType' = 'delivery'
     AND p->>'merchantLatitude' IS NOT NULL
     AND p->>'merchantLongitude' IS NOT NULL THEN
    SELECT dispatch_on_create INTO v_dispatch FROM dispatch_settings WHERE id = 1;
    IF COALESCE(v_dispatch, true) THEN
      PERFORM dispatch_for_order(v_order_id);
    END IF;
  END IF;

  RETURN v_order_id;
END;
$$;

-- Staff updates order status; dispatch kicks in when a delivery becomes ready.
CREATE OR REPLACE FUNCTION update_order_status(p_order_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o orders%ROWTYPE;
BEGIN
  IF p_status NOT IN ('pending','confirmed','preparing','ready','completed','cancelled') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;
  SELECT * INTO o FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT has_merchant_access(o.merchant_id) THEN
    RAISE EXCEPTION 'Unauthorized: No access to this merchant';
  END IF;

  UPDATE orders SET status = p_status, staff_id = auth.uid() WHERE id = p_order_id;

  IF p_status = 'ready' AND o.service_type = 'delivery' AND o.assigned_rider_id IS NULL THEN
    PERFORM dispatch_for_order(p_order_id);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION mark_order_picked_up(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT * INTO o FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.assigned_rider_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Not your delivery'; END IF;
  IF o.status <> 'ready' THEN RAISE EXCEPTION 'Order is not ready for pickup'; END IF;
  UPDATE orders SET status = 'out_for_delivery', picked_up_at = now() WHERE id = p_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION mark_order_delivered(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o orders%ROWTYPE;
  remaining int;
  max_orders int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT * INTO o FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.assigned_rider_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Not your delivery'; END IF;
  IF o.status <> 'out_for_delivery' THEN RAISE EXCEPTION 'Order is not out for delivery'; END IF;

  UPDATE orders SET status = 'completed', delivered_at = now() WHERE id = p_order_id;

  -- Free up a rider who was pinned at max capacity.
  SELECT max_concurrent_orders_per_rider INTO max_orders FROM dispatch_settings WHERE id = 1;
  SELECT count(*) INTO remaining
    FROM orders
   WHERE assigned_rider_id = auth.uid()
     AND id <> p_order_id
     AND status NOT IN ('completed','cancelled');
  IF remaining < COALESCE(max_orders, 3) THEN
    UPDATE rider_presence SET status = 'available', updated_at = now()
     WHERE rider_id = auth.uid() AND status = 'busy';
  END IF;
END;
$$;

-- ===========================================================================
-- 7. Offer RPCs (rider-facing)
-- ===========================================================================

CREATE OR REPLACE FUNCTION accept_offer(p_offer_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ofr order_offers%ROWTYPE;
  o orders%ROWTYPE;
  batch_reason text;
  active_count int;
  s dispatch_settings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT * INTO ofr FROM order_offers WHERE id = p_offer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Offer not found'; END IF;
  IF ofr.rider_id <> auth.uid() THEN RAISE EXCEPTION 'Not your offer'; END IF;
  IF ofr.status <> 'pending' THEN RAISE EXCEPTION 'Offer no longer available'; END IF;
  IF ofr.expires_at <= now() THEN RAISE EXCEPTION 'Offer expired'; END IF;

  -- Row lock makes concurrent accepts race-safe.
  SELECT * INTO o FROM orders WHERE id = ofr.order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.assigned_rider_id IS NOT NULL THEN RAISE EXCEPTION 'Order already assigned'; END IF;

  batch_reason := can_batch_for_rider(auth.uid(), o.merchant_id, o.merchant_latitude,
                                      o.merchant_longitude, o.delivery_mode);
  IF batch_reason IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot accept: %', batch_reason;
  END IF;

  UPDATE orders SET assigned_rider_id = auth.uid(), rider_assigned_at = now()
   WHERE id = ofr.order_id;

  UPDATE order_offers SET status = 'accepted', responded_at = now() WHERE id = p_offer_id;
  UPDATE order_offers SET status = 'rejected', responded_at = now()
   WHERE order_id = ofr.order_id AND status = 'pending' AND id <> p_offer_id;

  SELECT * INTO s FROM dispatch_settings WHERE id = 1;
  SELECT count(*) INTO active_count
    FROM orders
   WHERE assigned_rider_id = auth.uid() AND status NOT IN ('completed','cancelled');
  IF active_count >= s.max_concurrent_orders_per_rider THEN
    UPDATE rider_presence SET status = 'busy', updated_at = now()
     WHERE rider_id = auth.uid() AND status = 'available';
  END IF;

  RETURN ofr.order_id;
END;
$$;

CREATE OR REPLACE FUNCTION reject_offer(p_offer_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  UPDATE order_offers SET status = 'rejected', responded_at = now()
   WHERE id = p_offer_id AND rider_id = auth.uid() AND status = 'pending';
END;
$$;

-- ===========================================================================
-- 8. Rider presence RPCs
-- ===========================================================================

CREATE OR REPLACE FUNCTION rider_update_location(p_latitude double precision, p_longitude double precision)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;  -- silent no-op during token churn
  INSERT INTO rider_presence (rider_id, latitude, longitude, last_location_update, location_permission, updated_at)
  VALUES (auth.uid(), p_latitude, p_longitude, now(), 'granted', now())
  ON CONFLICT (rider_id) DO UPDATE
    SET latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        last_location_update = now(),
        location_permission = 'granted',
        updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION rider_set_location_permission(p_permission text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  IF p_permission NOT IN ('granted','denied','unknown') THEN RAISE EXCEPTION 'Invalid permission'; END IF;
  INSERT INTO rider_presence (rider_id, location_permission, status, updated_at)
  VALUES (auth.uid(), p_permission, 'offline', now())
  ON CONFLICT (rider_id) DO UPDATE
    SET location_permission = EXCLUDED.location_permission,
        status = CASE WHEN EXCLUDED.location_permission = 'denied' THEN 'offline' ELSE rider_presence.status END,
        updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION rider_set_online(p_online boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p rider_presence%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  INSERT INTO rider_presence (rider_id) VALUES (auth.uid())
  ON CONFLICT (rider_id) DO NOTHING;
  SELECT * INTO p FROM rider_presence WHERE rider_id = auth.uid();

  IF NOT p_online THEN
    UPDATE rider_presence SET status = 'offline', updated_at = now() WHERE rider_id = auth.uid();
    RETURN;
  END IF;

  IF p.location_permission <> 'granted' THEN
    RAISE EXCEPTION 'Enable location access before going online';
  END IF;
  IF p.last_location_update IS NULL OR now() - p.last_location_update > interval '120 seconds' THEN
    RAISE EXCEPTION 'Location not detected — share your current location';
  END IF;
  UPDATE rider_presence SET status = 'available', updated_at = now() WHERE rider_id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION admin_set_rider_offline(p_rider_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Unauthorized: Admin access required'; END IF;
  UPDATE rider_presence SET status = 'offline', updated_at = now() WHERE rider_id = p_rider_id;
END;
$$;

-- ===========================================================================
-- 9. Public read RPCs (anonymous customers)
-- ===========================================================================

-- Single order with items for customer tracking (strips ip_address).
CREATE OR REPLACE FUNCTION get_order_public(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT to_jsonb(o) - 'ip_address'
         || jsonb_build_object('order_items', COALESCE(items.arr, '[]'::jsonb))
    INTO result
    FROM orders o
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(to_jsonb(oi) ORDER BY oi.created_at) AS arr
        FROM order_items oi WHERE oi.order_id = o.id
    ) items ON true
   WHERE o.id = p_order_id;
  RETURN result;
END;
$$;

-- Orders by contact number for customer self-lookup (strips GPS + ip).
CREATE OR REPLACE FUNCTION list_orders_by_contact(p_contact_number text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(
           (to_jsonb(o) - 'ip_address' - 'delivery_latitude' - 'delivery_longitude')
           || jsonb_build_object('order_items', COALESCE(items.arr, '[]'::jsonb))
           ORDER BY o.created_at DESC), '[]'::jsonb)
    INTO result
    FROM orders o
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(to_jsonb(oi) ORDER BY oi.created_at) AS arr
        FROM order_items oi WHERE oi.order_id = o.id
    ) items ON true
   WHERE o.contact_number = p_contact_number;
  RETURN result;
END;
$$;

-- Active delivery count for a rider (no PII) — customer ETA context.
CREATE OR REPLACE FUNCTION public_rider_summary(p_rider_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('activeDeliveries', count(*))
    FROM orders
   WHERE assigned_rider_id = p_rider_id AND status IN ('ready','out_for_delivery');
$$;

-- Lat/lng of available riders (no PII) — customer "finding rider" map.
CREATE OR REPLACE FUNCTION available_rider_locations()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', rider_id, 'latitude', latitude, 'longitude', longitude)), '[]'::jsonb)
    FROM rider_presence
   WHERE status = 'available' AND latitude IS NOT NULL AND longitude IS NOT NULL;
$$;

-- Presence for one rider — customer live tracking of their assigned rider.
CREATE OR REPLACE FUNCTION get_rider_presence(p_rider_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
           'status', status,
           'lastLocationUpdate', last_location_update,
           'currentLatitude', latitude,
           'currentLongitude', longitude)
    FROM rider_presence
   WHERE rider_id = p_rider_id;
$$;

-- ===========================================================================
-- 10. Chat RPCs (contact-number auth for customers, uid for riders)
-- ===========================================================================

CREATE OR REPLACE FUNCTION send_order_message(
  p_order_id uuid,
  p_sender_type text,
  p_text text,
  p_contact_number text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o orders%ROWTYPE;
  v_text text := trim(p_text);
  v_sender_id text;
BEGIN
  IF v_text = '' OR v_text IS NULL THEN RAISE EXCEPTION 'Message is empty'; END IF;
  IF char_length(v_text) > 1000 THEN RAISE EXCEPTION 'Message too long'; END IF;
  IF p_sender_type NOT IN ('customer','rider') THEN RAISE EXCEPTION 'Invalid sender type'; END IF;

  SELECT * INTO o FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.assigned_rider_id IS NULL THEN RAISE EXCEPTION 'No rider assigned yet'; END IF;

  IF p_sender_type = 'rider' THEN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
    IF o.assigned_rider_id <> auth.uid() THEN RAISE EXCEPTION 'Not your delivery'; END IF;
    v_sender_id := auth.uid()::text;
  ELSE
    IF p_contact_number IS NULL THEN RAISE EXCEPTION 'Contact number required'; END IF;
    IF o.contact_number <> p_contact_number THEN RAISE EXCEPTION 'Contact number does not match'; END IF;
    v_sender_id := p_contact_number;
  END IF;

  INSERT INTO order_messages (order_id, sender_type, sender_id, text)
  VALUES (p_order_id, p_sender_type, v_sender_id, v_text);
END;
$$;

CREATE OR REPLACE FUNCTION list_order_messages(p_order_id uuid, p_contact_number text DEFAULT NULL)
RETURNS SETOF order_messages
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o orders%ROWTYPE;
BEGIN
  SELECT * INTO o FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF NOT ((auth.uid() IS NOT NULL AND o.assigned_rider_id = auth.uid())
          OR (p_contact_number IS NOT NULL AND o.contact_number = p_contact_number)) THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT * FROM order_messages
     WHERE order_id = p_order_id
     ORDER BY created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION mark_order_messages_read(p_order_id uuid, p_contact_number text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o orders%ROWTYPE;
  reader text;
BEGIN
  SELECT * INTO o FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF auth.uid() IS NOT NULL AND o.assigned_rider_id = auth.uid() THEN
    reader := 'rider';
  ELSIF p_contact_number IS NOT NULL AND o.contact_number = p_contact_number THEN
    reader := 'customer';
  ELSE
    RETURN;
  END IF;

  UPDATE order_messages SET read_at = now()
   WHERE order_id = p_order_id AND sender_type <> reader AND read_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION rider_unread_message_count()
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(count(*), 0)::int
    FROM order_messages m
    JOIN orders o ON o.id = m.order_id
   WHERE o.assigned_rider_id = auth.uid()
     AND o.status IN ('ready','out_for_delivery')
     AND m.sender_type = 'customer'
     AND m.read_at IS NULL;
$$;

-- ===========================================================================
-- 11. Ratings RPCs
-- ===========================================================================

CREATE OR REPLACE FUNCTION submit_rider_rating(
  p_order_id uuid,
  p_contact_number text,
  p_rating numeric,
  p_comment text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o orders%ROWTYPE;
BEGIN
  IF p_rating < 1 OR p_rating > 5 THEN RAISE EXCEPTION 'Invalid rating'; END IF;

  SELECT * INTO o FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.contact_number <> p_contact_number THEN RAISE EXCEPTION 'Contact number does not match'; END IF;
  IF o.status <> 'completed' THEN RAISE EXCEPTION 'Order not delivered yet'; END IF;
  IF o.assigned_rider_id IS NULL THEN RAISE EXCEPTION 'No rider to rate'; END IF;
  IF EXISTS (SELECT 1 FROM rider_ratings WHERE order_id = p_order_id) THEN
    RAISE EXCEPTION 'Already rated';
  END IF;

  INSERT INTO rider_ratings (order_id, rider_id, customer_contact, rating, comment)
  VALUES (p_order_id, o.assigned_rider_id, p_contact_number, p_rating, p_comment);

  -- Keep the aggregate cache on riders in sync (Convex left this to clients).
  UPDATE riders
     SET rating_sum = rating_sum + p_rating,
         rating_count = rating_count + 1
   WHERE id = o.assigned_rider_id;
END;
$$;

-- Public rating lookup for an order (no customer contact exposed).
CREATE OR REPLACE FUNCTION get_order_rating(p_order_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object('rating', rating, 'comment', comment, 'createdAt', created_at)
    FROM rider_ratings
   WHERE order_id = p_order_id;
$$;

-- ===========================================================================
-- 12. Earnings / payout RPCs
-- ===========================================================================

CREATE OR REPLACE FUNCTION admin_create_payout(
  p_rider_id uuid,
  p_amount numeric,
  p_order_earnings jsonb,      -- [{orderId, earning}]
  p_notes text DEFAULT NULL,
  p_period_from timestamptz DEFAULT NULL,
  p_period_to timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payout_id uuid;
  e jsonb;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Unauthorized: Admin access required'; END IF;

  INSERT INTO payouts (rider_id, amount, status, notes, period_from, period_to, created_by)
  VALUES (p_rider_id, p_amount, 'pending', p_notes, p_period_from, p_period_to, auth.uid())
  RETURNING id INTO v_payout_id;

  FOR e IN SELECT * FROM jsonb_array_elements(COALESCE(p_order_earnings, '[]'::jsonb)) LOOP
    UPDATE orders
       SET payout_id = v_payout_id,
           rider_earning = COALESCE((e->>'earning')::numeric, rider_earning)
     WHERE id = (e->>'orderId')::uuid;
  END LOOP;

  RETURN v_payout_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin_mark_payout_paid(p_payout_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p payouts%ROWTYPE;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Unauthorized: Admin access required'; END IF;
  SELECT * INTO p FROM payouts WHERE id = p_payout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payout not found'; END IF;
  IF p.status = 'paid' THEN RAISE EXCEPTION 'Already marked as paid'; END IF;
  UPDATE payouts SET status = 'paid', paid_at = now() WHERE id = p_payout_id;
END;
$$;

CREATE OR REPLACE FUNCTION admin_cancel_payout(p_payout_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p payouts%ROWTYPE;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Unauthorized: Admin access required'; END IF;
  SELECT * INTO p FROM payouts WHERE id = p_payout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payout not found'; END IF;
  IF p.status = 'paid' THEN RAISE EXCEPTION 'Cannot cancel a paid payout'; END IF;
  UPDATE orders SET payout_id = NULL WHERE payout_id = p_payout_id;
  UPDATE payouts SET status = 'cancelled' WHERE id = p_payout_id;
END;
$$;

CREATE OR REPLACE FUNCTION my_earnings_summary()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_earned numeric;
  v_completed_count int;
  v_unpaid numeric;
  v_today numeric;
  v_today_count int;
  v_total_paid numeric;
  v_pending numeric;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE(sum(rider_earning), 0), count(*),
         COALESCE(sum(rider_earning) FILTER (WHERE payout_id IS NULL AND COALESCE(rider_earning, 0) > 0), 0),
         COALESCE(sum(rider_earning) FILTER (WHERE COALESCE(delivered_at, created_at) >= date_trunc('day', now())), 0),
         count(*) FILTER (WHERE COALESCE(delivered_at, created_at) >= date_trunc('day', now()))
    INTO v_total_earned, v_completed_count, v_unpaid, v_today, v_today_count
    FROM orders
   WHERE assigned_rider_id = auth.uid() AND status = 'completed';

  SELECT COALESCE(sum(amount) FILTER (WHERE status = 'paid'), 0),
         COALESCE(sum(amount) FILTER (WHERE status = 'pending'), 0)
    INTO v_total_paid, v_pending
    FROM payouts
   WHERE rider_id = auth.uid();

  RETURN jsonb_build_object(
    'totalEarned', v_total_earned,
    'totalPaid', v_total_paid,
    'pendingPayout', v_pending,
    'unpaidEarnings', v_unpaid,
    'todayEarnings', v_today,
    'completedCount', v_completed_count,
    'todayCount', v_today_count
  );
END;
$$;

-- ===========================================================================
-- 13. Dispatch settings RPC (validation lives in CHECK constraints)
-- ===========================================================================

CREATE OR REPLACE FUNCTION update_dispatch_settings(p jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Unauthorized: Admin access required'; END IF;
  UPDATE dispatch_settings SET
    offer_radius_km = COALESCE((p->>'offerRadiusKm')::numeric, offer_radius_km),
    offer_expiry_ms = COALESCE((p->>'offerExpiryMs')::int, offer_expiry_ms),
    max_concurrent_offers = COALESCE((p->>'maxConcurrentOffers')::int, max_concurrent_offers),
    location_stale_ms = COALESCE((p->>'locationStaleMs')::int, location_stale_ms),
    dispatch_on_create = COALESCE((p->>'dispatchOnCreate')::boolean, dispatch_on_create),
    max_concurrent_orders_per_rider = COALESCE((p->>'maxConcurrentOrdersPerRider')::int, max_concurrent_orders_per_rider),
    batch_time_window_ms = COALESCE((p->>'batchTimeWindowMs')::int, batch_time_window_ms),
    batch_proximity_km = COALESCE((p->>'batchProximityKm')::numeric, batch_proximity_km),
    updated_at = now()
  WHERE id = 1;
END;
$$;

-- ===========================================================================
-- 14. RLS
-- ===========================================================================

ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE rider_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE rider_ratings ENABLE ROW LEVEL SECURITY;

-- Replace the legacy wide-open policies on orders/order_items. Anonymous
-- customers now read via the SECURITY DEFINER RPCs above; inserts go through
-- create_order().
DROP POLICY IF EXISTS "Public can insert orders" ON orders;
DROP POLICY IF EXISTS "Public can select orders" ON orders;
DROP POLICY IF EXISTS "Public can insert order items" ON order_items;
DROP POLICY IF EXISTS "Public can select order items" ON order_items;

CREATE POLICY "Staff and riders read orders" ON orders FOR SELECT TO authenticated
  USING (has_merchant_access(merchant_id) OR assigned_rider_id = auth.uid());

CREATE POLICY "Staff and riders read order items" ON order_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM orders o
     WHERE o.id = order_items.order_id
       AND (has_merchant_access(o.merchant_id) OR o.assigned_rider_id = auth.uid())
  ));

-- staff: admins manage everything; users can read their own record.
CREATE POLICY "Admins manage staff" ON staff FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Staff read own record" ON staff FOR SELECT TO authenticated
  USING (supabase_user_id = auth.uid());

-- rider_presence: riders read their own row; admins/staff read all (for the
-- dispatch dashboard). Public reads go through the RPCs. Writes are RPC-only.
CREATE POLICY "Riders read own presence" ON rider_presence FOR SELECT TO authenticated
  USING (rider_id = auth.uid() OR is_active_staff() OR is_admin());

-- order_offers: riders see their own offers; admins see all. Writes RPC-only.
CREATE POLICY "Riders read own offers" ON order_offers FOR SELECT TO authenticated
  USING (rider_id = auth.uid() OR is_admin());

-- order_messages: riders read messages on their deliveries; customers use RPCs.
CREATE POLICY "Riders read own order messages" ON order_messages FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM orders o WHERE o.id = order_messages.order_id AND o.assigned_rider_id = auth.uid()
  ) OR is_admin());

CREATE POLICY "Authenticated read dispatch settings" ON dispatch_settings FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Riders and admins read payouts" ON payouts FOR SELECT TO authenticated
  USING (rider_id = auth.uid() OR is_admin());

CREATE POLICY "Riders and admins read ratings" ON rider_ratings FOR SELECT TO authenticated
  USING (rider_id = auth.uid() OR is_admin());

-- ===========================================================================
-- 15. Grants — client roles only call the intended RPCs.
-- ===========================================================================

REVOKE EXECUTE ON FUNCTION dispatch_for_order(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION expire_offers_and_redispatch() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION can_batch_for_rider(uuid, uuid, double precision, double precision, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION create_order(jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_order_public(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION list_orders_by_contact(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public_rider_summary(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION available_rider_locations() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_rider_presence(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION send_order_message(uuid, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION list_order_messages(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION mark_order_messages_read(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION submit_rider_rating(uuid, text, numeric, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_order_rating(uuid) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION update_order_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_order_picked_up(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_order_delivered(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION accept_offer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION reject_offer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION rider_update_location(double precision, double precision) TO authenticated;
GRANT EXECUTE ON FUNCTION rider_set_location_permission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION rider_set_online(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_set_rider_offline(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION rider_unread_message_count() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_create_payout(uuid, numeric, jsonb, text, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_mark_payout_paid(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_cancel_payout(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION my_earnings_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION update_dispatch_settings(jsonb) TO authenticated;

-- ===========================================================================
-- 16. Realtime — only what the authenticated dashboards subscribe to.
--     orders/order_items are already in the publication; add order_offers.
-- ===========================================================================

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE order_offers;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ===========================================================================
-- 17. Dispatch tick via pg_cron (every 30s; falls back to no-op if pg_cron
--     is unavailable, e.g. local dev — offers are also lazily filtered
--     client-side by expires_at).
-- ===========================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    PERFORM cron.schedule('dispatch-tick', '30 seconds', 'SELECT public.expire_offers_and_redispatch()');
  ELSE
    RAISE NOTICE 'pg_cron not available; schedule expire_offers_and_redispatch() externally';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not schedule dispatch tick: %', SQLERRM;
END $$;

COMMENT ON FUNCTION create_order(jsonb) IS 'Public order creation with pricing validation, inventory decrement and rider dispatch. Replaces Convex orders.create.';
COMMENT ON TABLE staff IS 'Staff accounts and merchant access. Replaces Convex staff table.';
COMMENT ON TABLE rider_presence IS 'Live rider state (location/status). Replaces Convex riderPresence.';
COMMENT ON TABLE order_offers IS 'Rider dispatch offers. Replaces Convex orderOffers.';
COMMENT ON TABLE dispatch_settings IS 'Singleton dispatch configuration. Replaces Convex dispatchSettings.';
