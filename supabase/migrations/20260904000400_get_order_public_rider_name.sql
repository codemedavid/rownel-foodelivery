-- Expose the assigned rider's display name on the public order RPC so the
-- customer tracking screen can show "Your rider" without a second call.
-- Rider names are already public via public_rider_summary(); no new exposure.

CREATE OR REPLACE FUNCTION get_order_public(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT to_jsonb(o) - 'ip_address'
         || jsonb_build_object(
              'order_items', COALESCE(items.arr, '[]'::jsonb),
              'rider_name', r.name
            )
    INTO result
    FROM orders o
    LEFT JOIN riders r ON r.id = o.assigned_rider_id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(to_jsonb(oi) ORDER BY oi.created_at) AS arr
        FROM order_items oi WHERE oi.order_id = o.id
    ) items ON true
   WHERE o.id = p_order_id;
  RETURN result;
END;
$$;
