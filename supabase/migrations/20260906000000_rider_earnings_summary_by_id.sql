/*
  # rider_earnings_summary(p_rider_id)

  my_earnings_summary() reads auth.uid(), so an admin previewing a rider's
  dashboard ("view as") would see their own — empty — earnings. This adds an
  explicit-rider variant callable by the rider themselves or by an admin, and
  reduces my_earnings_summary() to a thin wrapper so the two can never drift.

  Read-only: no schema or data changes.
*/

CREATE OR REPLACE FUNCTION rider_earnings_summary(p_rider_id uuid)
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
  IF p_rider_id IS NULL OR auth.uid() IS NULL THEN RETURN NULL; END IF;
  IF p_rider_id <> auth.uid() AND NOT is_admin() THEN
    RAISE EXCEPTION 'Not authorised to read these earnings';
  END IF;

  SELECT COALESCE(sum(rider_earning), 0), count(*),
         COALESCE(sum(rider_earning) FILTER (WHERE payout_id IS NULL AND COALESCE(rider_earning, 0) > 0), 0),
         COALESCE(sum(rider_earning) FILTER (WHERE COALESCE(delivered_at, created_at) >= v_day_start), 0),
         count(*) FILTER (WHERE COALESCE(delivered_at, created_at) >= v_day_start)
    INTO v_total_earned, v_completed_count, v_unpaid, v_today, v_today_count
    FROM orders
   WHERE assigned_rider_id = p_rider_id AND status = 'completed';

  SELECT COALESCE(sum(amount) FILTER (WHERE status = 'paid'), 0),
         COALESCE(sum(amount) FILTER (WHERE status = 'pending'), 0)
    INTO v_total_paid, v_pending
    FROM payouts
   WHERE rider_id = p_rider_id;

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

REVOKE EXECUTE ON FUNCTION rider_earnings_summary(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION rider_earnings_summary(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION my_earnings_summary()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rider_earnings_summary(auth.uid());
$$;

REVOKE EXECUTE ON FUNCTION my_earnings_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION my_earnings_summary() TO authenticated;

-- Supabase's default privileges on public also grant EXECUTE to anon; the
-- REVOKE FROM PUBLIC above does not remove that explicit grant.
REVOKE EXECUTE ON FUNCTION rider_earnings_summary(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION my_earnings_summary() FROM anon;
