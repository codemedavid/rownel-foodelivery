-- Optional customer accounts.
--
-- Customers can browse and order as guests (unchanged). When a customer is
-- signed in at checkout, create_order() stamps the order with auth.uid() so
-- their order history survives across devices. A new list_my_orders() RPC
-- returns the caller's own orders (GPS/IP stripped, same shape as
-- list_orders_by_contact) without widening any table-level RLS.

-- ---------------------------------------------------------------------------
-- 1. orders.customer_user_id
-- ---------------------------------------------------------------------------

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS customer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orders_customer_user_id_idx
  ON orders (customer_user_id)
  WHERE customer_user_id IS NOT NULL;

COMMENT ON COLUMN orders.customer_user_id IS
  'Optional link to the authenticated customer who placed the order. NULL for guest checkouts.';

-- ---------------------------------------------------------------------------
-- 2. create_order: stamp customer_user_id server-side.
--    Only the customer_user_id column is new vs the definition in
--    20260711000000_fix_create_order_delivery_mode_default.sql; the rest is
--    reproduced verbatim because CREATE OR REPLACE requires the full body.
-- ---------------------------------------------------------------------------

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
    notes, total, status, ip_address, receipt_url, customer_user_id
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
    p->>'receiptUrl',
    auth.uid()
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

-- ---------------------------------------------------------------------------
-- 3. list_my_orders: the signed-in customer's own orders.
--    Mirrors list_orders_by_contact (strips GPS/IP) but keys on auth.uid().
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION list_my_orders()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

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
   WHERE o.customer_user_id = auth.uid();
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION list_my_orders() TO authenticated;

COMMENT ON FUNCTION list_my_orders() IS
  'Order history for the signed-in customer (orders stamped with their auth.uid() at checkout).';
