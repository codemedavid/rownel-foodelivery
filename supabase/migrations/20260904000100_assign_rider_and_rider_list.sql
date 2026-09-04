-- Mobile admin + realtime notifications, part 2 of 4.
--
-- Manual rider assignment (override on top of the offer-based auto-dispatch)
-- and a rider picker list for staff. Also aligns the riders RLS admin policy
-- with is_admin() so all_merchants staff can manage riders.

-- ---------------------------------------------------------------------------
-- riders / rider_settings: admin policy via is_admin()
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Admin manage riders" ON riders;
CREATE POLICY "Admin manage riders"
  ON riders FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admin manage rider_settings" ON rider_settings;
CREATE POLICY "Admin manage rider_settings"
  ON rider_settings FOR ALL TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- ---------------------------------------------------------------------------
-- assign_rider_to_order
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION assign_rider_to_order(p_order_id uuid, p_rider_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o orders%ROWTYPE;
  r riders%ROWTYPE;
  max_orders int;
  active_count int;
  previous_rider uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_rider_id IS NULL THEN RAISE EXCEPTION 'Rider is required'; END IF;

  SELECT * INTO o FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT has_merchant_access(o.merchant_id) THEN
    RAISE EXCEPTION 'Unauthorized: No access to this merchant';
  END IF;
  IF o.service_type <> 'delivery' THEN
    RAISE EXCEPTION 'Only delivery orders can be assigned to a rider';
  END IF;
  IF o.status IN ('out_for_delivery','completed','cancelled') THEN
    RAISE EXCEPTION 'Order can no longer be reassigned (status: %)', o.status;
  END IF;
  IF o.assigned_rider_id = p_rider_id THEN
    RETURN; -- already assigned; idempotent
  END IF;

  SELECT * INTO r FROM riders WHERE id = p_rider_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rider not found'; END IF;
  IF NOT r.is_approved OR NOT r.is_active THEN
    RAISE EXCEPTION 'Rider is not approved or is inactive';
  END IF;

  -- Serialize capacity checks per rider so two concurrent assignments cannot
  -- both pass (the order row lock alone does not cover the count).
  PERFORM pg_advisory_xact_lock(hashtext('rider-capacity:' || p_rider_id::text));

  SELECT max_concurrent_orders_per_rider INTO max_orders FROM dispatch_settings WHERE id = 1;
  max_orders := COALESCE(max_orders, 3);
  SELECT count(*) INTO active_count
    FROM orders
   WHERE assigned_rider_id = p_rider_id
     AND status NOT IN ('completed','cancelled');
  IF active_count >= max_orders THEN
    RAISE EXCEPTION 'Rider is at capacity (% active orders)', active_count;
  END IF;

  previous_rider := o.assigned_rider_id;

  UPDATE orders
     SET assigned_rider_id = p_rider_id,
         rider_assigned_at = now(),
         staff_id = auth.uid()
   WHERE id = p_order_id;

  -- Pending offers for this order are moot now.
  UPDATE order_offers SET status = 'expired', responded_at = now()
   WHERE order_id = p_order_id AND status = 'pending';

  IF previous_rider IS NOT NULL THEN
    PERFORM release_rider_capacity(previous_rider, p_order_id);
  END IF;

  -- Flip the new rider to busy once at capacity (mirrors accept_offer).
  IF active_count + 1 >= max_orders THEN
    UPDATE rider_presence SET status = 'busy', updated_at = now()
     WHERE rider_id = p_rider_id AND status = 'available';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- unassign_rider_from_order
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION unassign_rider_from_order(p_order_id uuid)
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
  IF NOT has_merchant_access(o.merchant_id) THEN
    RAISE EXCEPTION 'Unauthorized: No access to this merchant';
  END IF;
  IF o.status IN ('out_for_delivery','completed','cancelled') THEN
    RAISE EXCEPTION 'Order can no longer be unassigned (status: %)', o.status;
  END IF;
  IF o.assigned_rider_id IS NULL THEN RETURN; END IF;

  UPDATE orders
     SET assigned_rider_id = NULL,
         rider_assigned_at = NULL,
         staff_id = auth.uid()
   WHERE id = p_order_id;

  PERFORM release_rider_capacity(o.assigned_rider_id, p_order_id);

  IF o.status = 'ready' AND o.service_type = 'delivery' THEN
    PERFORM dispatch_for_order(p_order_id);
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- list_riders_for_assignment
--
-- Riders are a platform-wide pool (not merchant-scoped), so any active staff
-- member may see the full list including phone (needed to call the rider).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION list_riders_for_assignment()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  max_orders int;
BEGIN
  IF NOT (is_active_staff() OR is_admin()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  SELECT max_concurrent_orders_per_rider INTO max_orders FROM dispatch_settings WHERE id = 1;
  max_orders := COALESCE(max_orders, 3);

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', r.id,
      'name', r.name,
      'phone', r.phone,
      'plateNumber', r.plate_number,
      'vehicleType', r.vehicle_type,
      'presenceStatus', COALESCE(p.status, 'offline'),
      'lastLocationUpdate', p.last_location_update,
      'activeOrderCount', COALESCE(a.active_count, 0),
      'maxOrders', max_orders
    ) ORDER BY r.name)
    FROM riders r
    LEFT JOIN rider_presence p ON p.rider_id = r.id
    LEFT JOIN (
      SELECT assigned_rider_id, count(*)::int AS active_count
        FROM orders
       WHERE assigned_rider_id IS NOT NULL
         AND status NOT IN ('completed','cancelled')
       GROUP BY assigned_rider_id
    ) a ON a.assigned_rider_id = r.id
    WHERE r.is_approved AND r.is_active
  ), '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION assign_rider_to_order(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION unassign_rider_from_order(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION list_riders_for_assignment() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION assign_rider_to_order(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION unassign_rider_from_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION list_riders_for_assignment() TO authenticated;

COMMENT ON FUNCTION assign_rider_to_order(uuid, uuid) IS 'Staff override: assign any approved active rider to a delivery order, expiring pending offers.';
COMMENT ON FUNCTION unassign_rider_from_order(uuid) IS 'Staff override: clear the assigned rider and re-run auto-dispatch when the order is ready.';
