/*
  Harden rider dispatch + lifecycle.

  Fixes a set of correctness/safety bugs in the delivery flow:

    1. accept_offer accepted offers for orders that were already cancelled or
       completed (cancellation never expired pending offers, and accept only
       checked assigned_rider_id IS NULL).
    2. update_order_status('cancelled') leaked state: pending offers were left
       live and an assigned rider pinned at 'busy' stayed busy forever, so they
       silently stopped receiving new offers.
    3. rider_set_online / accept_offer never verified the caller is an approved,
       active rider. The UI blocks deactivated riders but the RPCs did not, so a
       deactivated/unapproved account could still go online and take deliveries.
    4. my_earnings_summary "today" bucketed by UTC midnight (08:00 Manila) for a
       ₱/en-PH app.
    5. rider_set_online hardcoded a 120s location-staleness window instead of the
       admin-tunable dispatch_settings.location_stale_ms.
*/

-- ---------------------------------------------------------------------------
-- Helper: is the caller an approved, active rider?
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION is_active_rider()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM riders
     WHERE id = auth.uid() AND is_approved AND is_active
  );
$$;

REVOKE EXECUTE ON FUNCTION is_active_rider() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_active_rider() TO authenticated;

-- ---------------------------------------------------------------------------
-- Helper: release a rider's presence back to 'available' when they drop below
-- capacity. Shared by mark_order_delivered and the cancellation path so the
-- logic stays in one place. p_exclude_order_id is treated as already inactive.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION release_rider_capacity(p_rider_id uuid, p_exclude_order_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  remaining int;
  max_orders int;
BEGIN
  IF p_rider_id IS NULL THEN RETURN; END IF;
  SELECT max_concurrent_orders_per_rider INTO max_orders FROM dispatch_settings WHERE id = 1;
  SELECT count(*) INTO remaining
    FROM orders
   WHERE assigned_rider_id = p_rider_id
     AND id <> p_exclude_order_id
     AND status NOT IN ('completed','cancelled');
  IF remaining < COALESCE(max_orders, 3) THEN
    UPDATE rider_presence SET status = 'available', updated_at = now()
     WHERE rider_id = p_rider_id AND status = 'busy';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION release_rider_capacity(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- update_order_status: clean up dispatch state on cancellation.
-- ---------------------------------------------------------------------------

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
  SELECT * INTO o FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT has_merchant_access(o.merchant_id) THEN
    RAISE EXCEPTION 'Unauthorized: No access to this merchant';
  END IF;

  UPDATE orders SET status = p_status, staff_id = auth.uid() WHERE id = p_order_id;

  IF p_status = 'cancelled' THEN
    -- Stop offering a dead order to riders.
    UPDATE order_offers SET status = 'expired', responded_at = now()
     WHERE order_id = p_order_id AND status = 'pending';
    -- An assigned rider pinned at capacity must be freed; otherwise they stay
    -- 'busy' indefinitely and stop receiving offers.
    PERFORM release_rider_capacity(o.assigned_rider_id, p_order_id);
  ELSIF p_status = 'ready' AND o.service_type = 'delivery' AND o.assigned_rider_id IS NULL THEN
    PERFORM dispatch_for_order(p_order_id);
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- mark_order_delivered: reuse the shared capacity-release helper.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION mark_order_delivered(p_order_id uuid)
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
  IF o.status <> 'out_for_delivery' THEN RAISE EXCEPTION 'Order is not out for delivery'; END IF;

  UPDATE orders SET status = 'completed', delivered_at = now() WHERE id = p_order_id;

  PERFORM release_rider_capacity(auth.uid(), p_order_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- accept_offer: refuse terminal orders + require an active rider.
-- ---------------------------------------------------------------------------

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
  IF NOT is_active_rider() THEN RAISE EXCEPTION 'Rider account is not active'; END IF;

  SELECT * INTO ofr FROM order_offers WHERE id = p_offer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Offer not found'; END IF;
  IF ofr.rider_id <> auth.uid() THEN RAISE EXCEPTION 'Not your offer'; END IF;
  IF ofr.status <> 'pending' THEN RAISE EXCEPTION 'Offer no longer available'; END IF;
  IF ofr.expires_at <= now() THEN RAISE EXCEPTION 'Offer expired'; END IF;

  -- Row lock makes concurrent accepts race-safe.
  SELECT * INTO o FROM orders WHERE id = ofr.order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF o.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'Order is no longer available'; END IF;
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

-- ---------------------------------------------------------------------------
-- rider_set_online: require an active rider + use the configured staleness.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION rider_set_online(p_online boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p rider_presence%ROWTYPE;
  stale_ms int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  INSERT INTO rider_presence (rider_id) VALUES (auth.uid())
  ON CONFLICT (rider_id) DO NOTHING;
  SELECT * INTO p FROM rider_presence WHERE rider_id = auth.uid();

  IF NOT p_online THEN
    UPDATE rider_presence SET status = 'offline', updated_at = now() WHERE rider_id = auth.uid();
    RETURN;
  END IF;

  IF NOT is_active_rider() THEN
    RAISE EXCEPTION 'Rider account is not approved or has been deactivated';
  END IF;
  IF p.location_permission <> 'granted' THEN
    RAISE EXCEPTION 'Enable location access before going online';
  END IF;

  SELECT location_stale_ms INTO stale_ms FROM dispatch_settings WHERE id = 1;
  IF p.last_location_update IS NULL
     OR now() - p.last_location_update > make_interval(secs => COALESCE(stale_ms, 120000) / 1000.0) THEN
    RAISE EXCEPTION 'Location not detected — share your current location';
  END IF;
  UPDATE rider_presence SET status = 'available', updated_at = now() WHERE rider_id = auth.uid();
END;
$$;

-- ---------------------------------------------------------------------------
-- my_earnings_summary: bucket "today" by Manila local day, not UTC.
-- ---------------------------------------------------------------------------

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
  v_day_start timestamptz := date_trunc('day', now() AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'Asia/Manila';
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE(sum(rider_earning), 0), count(*),
         COALESCE(sum(rider_earning) FILTER (WHERE payout_id IS NULL AND COALESCE(rider_earning, 0) > 0), 0),
         COALESCE(sum(rider_earning) FILTER (WHERE COALESCE(delivered_at, created_at) >= v_day_start), 0),
         count(*) FILTER (WHERE COALESCE(delivered_at, created_at) >= v_day_start)
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
