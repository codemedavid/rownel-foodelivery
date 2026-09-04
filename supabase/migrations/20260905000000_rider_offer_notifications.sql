-- Rider offer notifications.
--
-- Dispatch inserts a row into order_offers for each candidate rider, but the
-- only notification trigger lives on `orders` and addresses staff/customers.
-- Riders therefore had no push at all: a backgrounded app silently missed
-- offers that expire in ~30s. This adds the missing half.
--
-- Mirrors notify_order_change(): write notifications rows, collect the ids,
-- hand them to enqueue_push(), and never let the plumbing break the write.

-- ---------------------------------------------------------------------------
-- 'new_offer' notification kind
-- ---------------------------------------------------------------------------

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check
  CHECK (kind IN ('new_order', 'status_change', 'rider_assigned', 'new_offer'));

-- ---------------------------------------------------------------------------
-- notify_new_offer trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION notify_new_offer()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ids uuid[] := '{}';
  ord record;
  merchant_name text;
  short_ref text := upper(left(NEW.order_id::text, 8));
  distance_label text := '';
  notification_id uuid;
BEGIN
  -- Only a live, pending offer is worth waking a rider for.
  IF NEW.status IS DISTINCT FROM 'pending' OR NEW.rider_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT o.merchant_id, o.total, o.delivery_fee INTO ord
    FROM orders o WHERE o.id = NEW.order_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT name INTO merchant_name FROM merchants WHERE id = ord.merchant_id;
  merchant_name := COALESCE(merchant_name, 'A merchant');

  IF NEW.distance_km IS NOT NULL THEN
    distance_label := ' · ' || to_char(NEW.distance_km, 'FM990.0') || ' km';
  END IF;

  INSERT INTO notifications (recipient_user_id, order_id, kind, title, body, data)
  VALUES (
    NEW.rider_id,
    NEW.order_id,
    'new_offer',
    'New delivery offer 🛵',
    merchant_name || ' · #' || short_ref || distance_label
      || ' · ₱' || to_char(COALESCE(ord.delivery_fee, 0), 'FM999,999,990.00'),
    jsonb_build_object(
      'orderId', NEW.order_id,
      'offerId', NEW.id,
      'target', 'rider',
      'expiresAt', NEW.expires_at
    )
  )
  RETURNING id INTO notification_id;

  ids := array[notification_id];
  PERFORM enqueue_push(ids);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never let notification plumbing break dispatch.
  RAISE WARNING 'notify_new_offer failed for offer %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION notify_new_offer() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_new_offer ON order_offers;
CREATE TRIGGER trg_notify_new_offer
  AFTER INSERT ON order_offers
  FOR EACH ROW EXECUTE FUNCTION notify_new_offer();

COMMENT ON FUNCTION notify_new_offer() IS 'Writes a new_offer notification row and enqueues Expo push when a rider is offered an order.';
