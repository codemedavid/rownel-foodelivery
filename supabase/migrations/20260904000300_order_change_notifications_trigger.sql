-- Mobile admin + realtime notifications, part 4 of 4.
--
-- Trigger on orders that:
--   * writes notifications rows (staff: new_order; customer: status_change,
--     rider_assigned),
--   * broadcasts a public realtime message on topic 'order:<id>' so guests
--     (no auth) get instant status updates,
--   * asks the send-push edge function to deliver Expo push via pg_net.
-- A pg_cron sweeper retries anything not pushed within 2 minutes.
--
-- Push config lives in Vault (never committed):
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/send-push', 'send_push_url');
--   select vault.create_secret('<random>', 'send_push_secret');

-- ---------------------------------------------------------------------------
-- pg_net (guarded, like pg_cron in 20260612)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_net') THEN
    CREATE EXTENSION IF NOT EXISTS pg_net;
  ELSE
    RAISE NOTICE 'pg_net not available; push delivery relies on the cron sweep / manual invocation';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not enable pg_net: %', SQLERRM;
END $$;

-- ---------------------------------------------------------------------------
-- order_status_message: SQL mirror of STATUS_MESSAGES in
-- mobile/src/lib/orderStatus.ts. Keep both in sync (a jest test pins the
-- key set on the TS side).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION order_status_message(p_status text)
RETURNS TABLE (title text, body text)
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT m.title, m.body FROM (VALUES
    ('confirmed',        'Order Confirmed! ✅',       'The merchant confirmed your order and will start preparing it.'),
    ('preparing',        'Order Being Prepared 🍳',  'Your food is being prepared right now.'),
    ('ready',            'Order Ready 📦',           'Your order is ready for pickup or handoff to a rider.'),
    ('out_for_delivery', 'Rider On The Way 🛵',      'Your order is out for delivery.'),
    ('completed',        'Order Delivered 🎉',       'Enjoy your meal! Thanks for ordering.'),
    ('cancelled',        'Order Cancelled',          'Your order was cancelled. Contact the merchant if this is unexpected.')
  ) AS m(status, title, body)
  WHERE m.status = p_status;
$$;

-- ---------------------------------------------------------------------------
-- push_config / enqueue_push
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION push_config()
RETURNS TABLE (url text, secret text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'send_push_url'    LIMIT 1),
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'send_push_secret' LIMIT 1);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'push_config unavailable: %', SQLERRM;
  RETURN QUERY SELECT NULL::text, NULL::text;
END;
$$;

REVOKE EXECUTE ON FUNCTION push_config() FROM PUBLIC, anon, authenticated;

-- p_ids NULL => sweep mode: the edge function looks up unpushed rows itself.
CREATE OR REPLACE FUNCTION enqueue_push(p_ids uuid[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg record;
  payload jsonb;
BEGIN
  IF p_ids IS NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM notifications
       WHERE pushed_at IS NULL AND push_error IS NULL
         AND created_at > now() - interval '1 hour'
    ) THEN
      RETURN;
    END IF;
    payload := jsonb_build_object('sweep', true);
  ELSIF array_length(p_ids, 1) IS NULL THEN
    RETURN;
  ELSE
    payload := jsonb_build_object('notificationIds', to_jsonb(p_ids));
  END IF;

  SELECT * INTO cfg FROM push_config();
  IF cfg.url IS NULL OR cfg.secret IS NULL THEN RETURN; END IF;
  IF to_regproc('net.http_post') IS NULL THEN RETURN; END IF;

  PERFORM net.http_post(
    url := cfg.url,
    body := payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', cfg.secret
    ),
    timeout_milliseconds := 5000
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'enqueue_push failed: %', SQLERRM;
END;
$$;

REVOKE EXECUTE ON FUNCTION enqueue_push(uuid[]) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- notify_order_change trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION notify_order_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ids uuid[] := '{}';
  merchant_name text;
  rider_name text;
  msg record;
  status_changed boolean := false;
  rider_assigned boolean := false;
  short_ref text := upper(left(NEW.id::text, 8));
  -- Customer-supplied; keep notification text bounded.
  customer_label text := left(regexp_replace(COALESCE(NEW.customer_name, 'Customer'), '[[:cntrl:]]', '', 'g'), 60);
BEGIN
  SELECT name INTO merchant_name FROM merchants WHERE id = NEW.merchant_id;
  merchant_name := COALESCE(merchant_name, 'the restaurant');

  IF NEW.assigned_rider_id IS NOT NULL THEN
    SELECT name INTO rider_name FROM riders WHERE id = NEW.assigned_rider_id;
  END IF;

  IF TG_OP = 'INSERT' THEN
    WITH recipients AS (
      SELECT s.supabase_user_id AS uid FROM staff s
       WHERE s.is_active AND s.supabase_user_id IS NOT NULL
         AND (s.all_merchants OR NEW.merchant_id = ANY(s.merchant_ids))
      UNION
      SELECT u.id FROM auth.users u
       WHERE u.raw_app_meta_data ->> 'role' = 'admin'
    ), inserted AS (
      INSERT INTO notifications (recipient_user_id, order_id, kind, title, body, data)
      SELECT r.uid, NEW.id, 'new_order',
             'New order at ' || merchant_name,
             customer_label || ' · ' || NEW.service_type || ' · ₱' || to_char(NEW.total, 'FM999,999,990.00'),
             jsonb_build_object('orderId', NEW.id, 'status', NEW.status,
                                'merchantId', NEW.merchant_id, 'target', 'admin')
        FROM recipients r
      RETURNING id
    )
    SELECT COALESCE(array_agg(id), '{}') INTO ids FROM inserted;
  ELSE
    status_changed := NEW.status IS DISTINCT FROM OLD.status;
    rider_assigned := NEW.assigned_rider_id IS NOT NULL
                      AND NEW.assigned_rider_id IS DISTINCT FROM OLD.assigned_rider_id;

    IF status_changed THEN
      IF NEW.customer_user_id IS NOT NULL THEN
        SELECT * INTO msg FROM order_status_message(NEW.status);
        IF FOUND THEN
          WITH inserted AS (
            INSERT INTO notifications (recipient_user_id, order_id, kind, title, body, data)
            VALUES (NEW.customer_user_id, NEW.id, 'status_change', msg.title, msg.body,
                    jsonb_build_object('orderId', NEW.id, 'status', NEW.status,
                                       'merchantId', NEW.merchant_id, 'target', 'customer'))
            RETURNING id
          )
          SELECT ids || array_agg(id) INTO ids FROM inserted;
        END IF;
      END IF;

      -- Rider-driven transitions: tell the merchant's staff too.
      IF NEW.status IN ('out_for_delivery','completed') AND NEW.assigned_rider_id IS NOT NULL THEN
        WITH recipients AS (
          SELECT s.supabase_user_id AS uid FROM staff s
           WHERE s.is_active AND s.supabase_user_id IS NOT NULL
             AND (s.all_merchants OR NEW.merchant_id = ANY(s.merchant_ids))
        ), inserted AS (
          INSERT INTO notifications (recipient_user_id, order_id, kind, title, body, data)
          SELECT r.uid, NEW.id, 'status_change',
                 CASE NEW.status WHEN 'out_for_delivery' THEN 'Order picked up' ELSE 'Order delivered' END,
                 COALESCE(rider_name, 'Rider') || ' · #' || short_ref || ' · ' || merchant_name,
                 jsonb_build_object('orderId', NEW.id, 'status', NEW.status,
                                    'merchantId', NEW.merchant_id, 'target', 'admin')
            FROM recipients r
          RETURNING id
        )
        SELECT ids || COALESCE(array_agg(id), '{}') INTO ids FROM inserted;
      END IF;
    END IF;

    IF rider_assigned THEN
      IF NEW.customer_user_id IS NOT NULL THEN
        WITH inserted AS (
          INSERT INTO notifications (recipient_user_id, order_id, kind, title, body, data)
          VALUES (NEW.customer_user_id, NEW.id, 'rider_assigned', 'Rider assigned',
                  COALESCE(rider_name, 'A rider') || ' will deliver your order.',
                  jsonb_build_object('orderId', NEW.id, 'status', NEW.status,
                                     'merchantId', NEW.merchant_id, 'target', 'customer',
                                     'riderName', rider_name))
          RETURNING id
        )
        SELECT ids || array_agg(id) INTO ids FROM inserted;
      END IF;

      -- accept_offer() runs as the rider; manual assignment runs as staff.
      -- Only the rider-driven case needs a staff notice.
      IF auth.uid() IS NOT DISTINCT FROM NEW.assigned_rider_id THEN
        WITH recipients AS (
          SELECT s.supabase_user_id AS uid FROM staff s
           WHERE s.is_active AND s.supabase_user_id IS NOT NULL
             AND (s.all_merchants OR NEW.merchant_id = ANY(s.merchant_ids))
        ), inserted AS (
          INSERT INTO notifications (recipient_user_id, order_id, kind, title, body, data)
          SELECT r.uid, NEW.id, 'rider_assigned', 'Rider accepted order',
                 COALESCE(rider_name, 'Rider') || ' · #' || short_ref || ' · ' || merchant_name,
                 jsonb_build_object('orderId', NEW.id, 'status', NEW.status,
                                    'merchantId', NEW.merchant_id, 'target', 'admin')
            FROM recipients r
          RETURNING id
        )
        SELECT ids || COALESCE(array_agg(id), '{}') INTO ids FROM inserted;
      END IF;
    END IF;

    IF status_changed OR rider_assigned THEN
      BEGIN
        PERFORM realtime.send(
          jsonb_build_object(
            'orderId', NEW.id,
            'status', NEW.status,
            'assignedRiderId', NEW.assigned_rider_id,
            'riderName', rider_name,
            'changedAt', now()
          ),
          'order_update',
          'order:' || NEW.id::text,
          false
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'realtime.send failed for order %: %', NEW.id, SQLERRM;
      END;
    END IF;
  END IF;

  IF array_length(ids, 1) IS NOT NULL THEN
    PERFORM enqueue_push(ids);
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never let notification plumbing break an order write.
  RAISE WARNING 'notify_order_change failed for order %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION notify_order_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_order_change ON orders;
CREATE TRIGGER trg_notify_order_change
  AFTER INSERT OR UPDATE OF status, assigned_rider_id ON orders
  FOR EACH ROW EXECUTE FUNCTION notify_order_change();

-- ---------------------------------------------------------------------------
-- Push sweep (retry safety net) every 2 minutes.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'push-sweep';
    PERFORM cron.schedule('push-sweep', '*/2 * * * *', 'SELECT public.enqueue_push(NULL)');
  ELSE
    RAISE NOTICE 'pg_cron not installed; push sweep not scheduled';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not schedule push sweep: %', SQLERRM;
END $$;

COMMENT ON FUNCTION notify_order_change() IS 'Writes notifications rows, broadcasts order:<id> realtime events, and enqueues Expo push on order insert/status/rider changes.';
