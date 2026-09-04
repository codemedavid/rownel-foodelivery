-- Mobile admin + realtime notifications, part 3 of 4.
--
-- admin_sales_summary(): one round-trip sales/analytics payload for the
-- admin dashboard. Days are bucketed in Asia/Manila to match
-- my_earnings_summary(). "Sales" means sum(total) of completed orders.

CREATE OR REPLACE FUNCTION admin_sales_summary(
  p_from timestamptz,
  p_to timestamptz,
  p_merchant_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_totals jsonb;
  v_by_status jsonb;
  v_by_service jsonb;
  v_daily jsonb;
  v_top_items jsonb;
  v_top_merchants jsonb;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to <= p_from THEN
    RAISE EXCEPTION 'Invalid date range';
  END IF;
  IF p_to - p_from > interval '400 days' THEN
    RAISE EXCEPTION 'Date range too large (max 400 days)';
  END IF;

  WITH scoped AS (
    SELECT * FROM orders o
     WHERE o.created_at >= p_from AND o.created_at < p_to
       AND (p_merchant_id IS NULL OR o.merchant_id = p_merchant_id)
  )
  SELECT jsonb_build_object(
    'grossSales', COALESCE(sum(total) FILTER (WHERE status = 'completed'), 0),
    'deliveryFees', COALESCE(sum(delivery_fee) FILTER (WHERE status = 'completed'), 0),
    'orderCount', count(*),
    'completedCount', count(*) FILTER (WHERE status = 'completed'),
    'cancelledCount', count(*) FILTER (WHERE status = 'cancelled'),
    'avgOrderValue', CASE
      WHEN count(*) FILTER (WHERE status = 'completed') = 0 THEN 0
      ELSE round(sum(total) FILTER (WHERE status = 'completed')
               / count(*) FILTER (WHERE status = 'completed'), 2)
    END
  ) INTO v_totals FROM scoped;

  SELECT COALESCE(jsonb_object_agg(status, n), '{}'::jsonb) INTO v_by_status
    FROM (
      SELECT status, count(*)::int AS n FROM orders o
       WHERE o.created_at >= p_from AND o.created_at < p_to
         AND (p_merchant_id IS NULL OR o.merchant_id = p_merchant_id)
       GROUP BY status
    ) s;

  SELECT COALESCE(jsonb_object_agg(service_type, jsonb_build_object('orders', n, 'sales', sales)), '{}'::jsonb)
    INTO v_by_service
    FROM (
      SELECT service_type,
             count(*)::int AS n,
             COALESCE(sum(total) FILTER (WHERE status = 'completed'), 0) AS sales
        FROM orders o
       WHERE o.created_at >= p_from AND o.created_at < p_to
         AND (p_merchant_id IS NULL OR o.merchant_id = p_merchant_id)
       GROUP BY service_type
    ) s;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'day', to_char(d.day, 'YYYY-MM-DD'),
           'sales', COALESCE(agg.sales, 0),
           'orders', COALESCE(agg.n, 0),
           'completed', COALESCE(agg.completed, 0)
         ) ORDER BY d.day), '[]'::jsonb)
    INTO v_daily
    FROM generate_series(
           date_trunc('day', p_from AT TIME ZONE 'Asia/Manila'),
           date_trunc('day', (p_to - interval '1 microsecond') AT TIME ZONE 'Asia/Manila'),
           interval '1 day'
         ) AS d(day)
    LEFT JOIN (
      SELECT date_trunc('day', o.created_at AT TIME ZONE 'Asia/Manila') AS day,
             count(*)::int AS n,
             count(*) FILTER (WHERE status = 'completed') AS completed,
             COALESCE(sum(total) FILTER (WHERE status = 'completed'), 0) AS sales
        FROM orders o
       WHERE o.created_at >= p_from AND o.created_at < p_to
         AND (p_merchant_id IS NULL OR o.merchant_id = p_merchant_id)
       GROUP BY 1
    ) agg ON agg.day = d.day;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'itemId', t.item_id, 'name', t.name, 'quantity', t.qty, 'sales', t.sales
         ) ORDER BY t.qty DESC, t.sales DESC), '[]'::jsonb)
    INTO v_top_items
    FROM (
      SELECT oi.item_id, min(oi.name) AS name,
             sum(oi.quantity)::int AS qty, sum(oi.subtotal) AS sales
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
       WHERE o.status = 'completed'
         AND o.created_at >= p_from AND o.created_at < p_to
         AND (p_merchant_id IS NULL OR o.merchant_id = p_merchant_id)
       GROUP BY oi.item_id
       ORDER BY qty DESC, sales DESC
       LIMIT 10
    ) t;

  IF p_merchant_id IS NULL THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'merchantId', t.merchant_id, 'name', t.name,
             'orders', t.n, 'sales', t.sales
           ) ORDER BY t.sales DESC, t.n DESC), '[]'::jsonb)
      INTO v_top_merchants
      FROM (
        SELECT o.merchant_id, COALESCE(m.name, 'Unknown') AS name,
               count(*)::int AS n,
               COALESCE(sum(o.total) FILTER (WHERE o.status = 'completed'), 0) AS sales
          FROM orders o
          LEFT JOIN merchants m ON m.id = o.merchant_id
         WHERE o.created_at >= p_from AND o.created_at < p_to
         GROUP BY o.merchant_id, m.name
         ORDER BY sales DESC, n DESC
         LIMIT 10
      ) t;
  ELSE
    v_top_merchants := '[]'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'merchantId', p_merchant_id,
    'totals', v_totals,
    'countsByStatus', v_by_status,
    'byServiceType', v_by_service,
    'daily', v_daily,
    'topItems', v_top_items,
    'topMerchants', v_top_merchants
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_sales_summary(timestamptz, timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_sales_summary(timestamptz, timestamptz, uuid) TO authenticated;

COMMENT ON FUNCTION admin_sales_summary(timestamptz, timestamptz, uuid) IS 'Admin-only sales & analytics summary (totals, status/service breakdowns, Manila daily series, top items/merchants).';
