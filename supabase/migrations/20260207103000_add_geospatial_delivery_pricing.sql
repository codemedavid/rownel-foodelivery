-- Add geospatial delivery pricing support for merchants and orders

-- Merchant location and dynamic delivery pricing config
ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision,
  ADD COLUMN IF NOT EXISTS formatted_address text,
  ADD COLUMN IF NOT EXISTS osm_place_id text,
  ADD COLUMN IF NOT EXISTS base_delivery_fee numeric(10,2),
  ADD COLUMN IF NOT EXISTS delivery_fee_per_km numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_delivery_fee numeric(10,2),
  ADD COLUMN IF NOT EXISTS max_delivery_fee numeric(10,2),
  ADD COLUMN IF NOT EXISTS max_delivery_distance_km numeric(10,2);

-- Keep old data working by mirroring delivery_fee into base_delivery_fee
UPDATE merchants
SET base_delivery_fee = delivery_fee
WHERE base_delivery_fee IS NULL;

-- Sensible defaults for new config fields
ALTER TABLE merchants
  ALTER COLUMN base_delivery_fee SET DEFAULT 0,
  ALTER COLUMN delivery_fee_per_km SET DEFAULT 0,
  ALTER COLUMN max_delivery_distance_km SET DEFAULT 20;

ALTER TABLE merchants
  ADD CONSTRAINT merchants_delivery_fee_per_km_non_negative CHECK (delivery_fee_per_km >= 0),
  ADD CONSTRAINT merchants_base_delivery_fee_non_negative CHECK (base_delivery_fee >= 0),
  ADD CONSTRAINT merchants_min_delivery_fee_non_negative CHECK (min_delivery_fee IS NULL OR min_delivery_fee >= 0),
  ADD CONSTRAINT merchants_max_delivery_fee_non_negative CHECK (max_delivery_fee IS NULL OR max_delivery_fee >= 0),
  ADD CONSTRAINT merchants_max_delivery_distance_non_negative CHECK (max_delivery_distance_km IS NULL OR max_delivery_distance_km >= 0),
  ADD CONSTRAINT merchants_delivery_fee_bounds CHECK (
    min_delivery_fee IS NULL OR max_delivery_fee IS NULL OR min_delivery_fee <= max_delivery_fee
  );

CREATE INDEX IF NOT EXISTS idx_merchants_lat_lng ON merchants(latitude, longitude);

-- Persist delivery quote snapshot on orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_latitude double precision,
  ADD COLUMN IF NOT EXISTS delivery_longitude double precision,
  ADD COLUMN IF NOT EXISTS distance_km numeric(10,3),
  ADD COLUMN IF NOT EXISTS delivery_fee numeric(10,2),
  ADD COLUMN IF NOT EXISTS delivery_fee_breakdown jsonb;

-- Great-circle distance helper
CREATE OR REPLACE FUNCTION public.haversine_km(
  lat1 double precision,
  lon1 double precision,
  lat2 double precision,
  lon2 double precision
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT round(
    (
      6371 * 2 * asin(
        sqrt(
          power(sin(radians((lat2 - lat1) / 2)), 2) +
          cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians((lon2 - lon1) / 2)), 2)
        )
      )
    )::numeric,
    3
  );
$$;

-- Server-side quote calculator (single merchant)
CREATE OR REPLACE FUNCTION public.calculate_delivery_quote(
  p_merchant_id uuid,
  p_delivery_latitude double precision,
  p_delivery_longitude double precision
)
RETURNS TABLE (
  merchant_id uuid,
  distance_km numeric,
  delivery_fee numeric,
  is_deliverable boolean,
  breakdown jsonb
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  m merchants%ROWTYPE;
  v_distance_km numeric;
  v_base_fee numeric;
  v_per_km_fee numeric;
  v_raw_fee numeric;
  v_final_fee numeric;
  v_is_deliverable boolean;
BEGIN
  SELECT *
  INTO m
  FROM merchants
  WHERE id = p_merchant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Merchant not found: %', p_merchant_id;
  END IF;

  IF m.latitude IS NULL OR m.longitude IS NULL THEN
    merchant_id := m.id;
    distance_km := NULL;
    delivery_fee := NULL;
    is_deliverable := false;
    breakdown := jsonb_build_object(
      'reason', 'merchant_location_missing',
      'base_delivery_fee', m.base_delivery_fee,
      'delivery_fee_per_km', m.delivery_fee_per_km,
      'max_delivery_distance_km', m.max_delivery_distance_km
    );
    RETURN NEXT;
    RETURN;
  END IF;

  v_distance_km := public.haversine_km(m.latitude, m.longitude, p_delivery_latitude, p_delivery_longitude);
  v_base_fee := COALESCE(m.base_delivery_fee, m.delivery_fee, 0);
  v_per_km_fee := COALESCE(m.delivery_fee_per_km, 0);
  v_raw_fee := v_base_fee + (v_distance_km * v_per_km_fee);

  v_final_fee := v_raw_fee;

  IF m.min_delivery_fee IS NOT NULL THEN
    v_final_fee := GREATEST(v_final_fee, m.min_delivery_fee);
  END IF;

  IF m.max_delivery_fee IS NOT NULL THEN
    v_final_fee := LEAST(v_final_fee, m.max_delivery_fee);
  END IF;

  v_final_fee := round(v_final_fee, 2);
  v_is_deliverable := (m.max_delivery_distance_km IS NULL OR v_distance_km <= m.max_delivery_distance_km);

  merchant_id := m.id;
  distance_km := v_distance_km;
  delivery_fee := CASE WHEN v_is_deliverable THEN v_final_fee ELSE NULL END;
  is_deliverable := v_is_deliverable;
  breakdown := jsonb_build_object(
    'base_delivery_fee', v_base_fee,
    'delivery_fee_per_km', v_per_km_fee,
    'raw_fee', round(v_raw_fee, 2),
    'min_delivery_fee', m.min_delivery_fee,
    'max_delivery_fee', m.max_delivery_fee,
    'max_delivery_distance_km', m.max_delivery_distance_km,
    'distance_km', v_distance_km,
    'rounded_fee', v_final_fee
  );

  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.haversine_km(double precision, double precision, double precision, double precision) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_delivery_quote(uuid, double precision, double precision) TO anon, authenticated;
