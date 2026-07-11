-- Fix: NOT-NULL violation on orders.delivery_mode during checkout.
--
-- Root cause: create_order() inserted p->>'deliveryMode' directly. When a
-- client sends a null/missing deliveryMode (e.g. a merchant with no economy
-- option), Postgres inserts an explicit NULL, which OVERRIDES the column
-- DEFAULT 'priority' and violates the NOT-NULL constraint.
--
-- Fix: COALESCE the value to 'priority' so any null/missing/empty deliveryMode
-- from any client can never break order creation again. Behaviour-preserving
-- for valid input ('priority' | 'economy' pass through unchanged).
--
-- Only the delivery_mode VALUES expression changes vs the definition in
-- 20260612000000_move_delivery_ops_to_supabase.sql; the rest is reproduced
-- verbatim because CREATE OR REPLACE requires the full function body.

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
    COALESCE(NULLIF(p->>'deliveryMode', ''), 'priority'),
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

GRANT EXECUTE ON FUNCTION create_order(jsonb) TO anon, authenticated;
