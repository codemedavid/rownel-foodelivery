-- Mobile admin + realtime notifications, part 1 of 4.
--
--   1. Signed-in customers may SELECT their own orders/order_items so
--      Supabase Realtime (postgres_changes) can deliver row updates to them.
--      Reads still go through the SECURITY DEFINER RPCs.
--   2. notifications table: server-generated in-app inbox for staff/admin
--      (new orders) and customers (status changes, rider assigned). Rows are
--      written only by the order-change trigger (part 4) and pushed to
--      devices by the send-push edge function.
--   3. push_tokens table: Expo push tokens registered by the mobile app.

-- ---------------------------------------------------------------------------
-- 1. Customer RLS on orders / order_items
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Customers read own orders" ON orders;
CREATE POLICY "Customers read own orders" ON orders FOR SELECT TO authenticated
  USING (customer_user_id = auth.uid());

DROP POLICY IF EXISTS "Customers read own order items" ON order_items;
CREATE POLICY "Customers read own order items" ON order_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM orders o
     WHERE o.id = order_items.order_id AND o.customer_user_id = auth.uid()
  ));

-- ---------------------------------------------------------------------------
-- 2. notifications
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('new_order','status_change','rider_assigned')),
  title text NOT NULL,
  body text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  pushed_at timestamptz,
  push_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created
  ON notifications (recipient_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unpushed
  ON notifications (created_at) WHERE pushed_at IS NULL;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own notifications" ON notifications;
CREATE POLICY "Users read own notifications" ON notifications FOR SELECT TO authenticated
  USING (recipient_user_id = auth.uid());

-- Realtime: clients subscribe to INSERTs filtered by recipient_user_id.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION mark_notifications_read(p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN RETURN 0; END IF;
  UPDATE notifications
     SET read_at = now()
   WHERE recipient_user_id = auth.uid()
     AND read_at IS NULL
     AND id = ANY(p_ids);
  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated;
END;
$$;

CREATE OR REPLACE FUNCTION mark_all_notifications_read()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  UPDATE notifications SET read_at = now()
   WHERE recipient_user_id = auth.uid() AND read_at IS NULL;
  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN updated;
END;
$$;

CREATE OR REPLACE FUNCTION my_unread_notification_count()
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int FROM notifications
   WHERE recipient_user_id = auth.uid() AND read_at IS NULL;
$$;

REVOKE EXECUTE ON FUNCTION mark_notifications_read(uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION mark_all_notifications_read() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION my_unread_notification_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION mark_notifications_read(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_all_notifications_read() TO authenticated;
GRANT EXECUTE ON FUNCTION my_unread_notification_count() TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. push_tokens
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS push_tokens (
  token text PRIMARY KEY CHECK (token ~ '^Expo(nent)?PushToken\[.+\]$'),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('ios','android')),
  device_name text,
  app_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens (user_id);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own push tokens" ON push_tokens;
CREATE POLICY "Users manage own push tokens" ON push_tokens FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- A token belongs to one device; re-registering under a different account
-- (shared device, sign out + sign in) must re-home it instead of failing on
-- the primary key. RLS would block the UPDATE of another user's row, so the
-- re-home goes through a SECURITY DEFINER RPC.
CREATE OR REPLACE FUNCTION register_push_token(
  p_token text,
  p_platform text,
  p_device_name text DEFAULT NULL,
  p_app_version text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  INSERT INTO push_tokens (token, user_id, platform, device_name, app_version)
  VALUES (p_token, auth.uid(), p_platform, p_device_name, p_app_version)
  ON CONFLICT (token) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        platform = EXCLUDED.platform,
        device_name = EXCLUDED.device_name,
        app_version = EXCLUDED.app_version,
        updated_at = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION register_push_token(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION register_push_token(text, text, text, text) TO authenticated;

COMMENT ON TABLE notifications IS 'In-app notification inbox; rows created by notify_order_change() trigger, pushed by send-push edge function.';
COMMENT ON TABLE push_tokens IS 'Expo push tokens registered by the mobile app (one row per device).';
