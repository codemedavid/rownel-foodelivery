-- Riders could only read orders already assigned to them, so an incoming
-- offer's embedded order came back NULL: the offer card showed "New delivery"
-- with no store, address, items or fee, and the rider had to accept blind.
--
-- Let a rider read an order (and its items) while they hold a live, pending
-- offer for it. Visibility ends when the offer is answered or expires.

CREATE OR REPLACE FUNCTION rider_has_live_offer(p_order_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM order_offers
     WHERE order_id = p_order_id
       AND rider_id = auth.uid()
       AND status = 'pending'
       AND expires_at > now()
  );
$$;

REVOKE ALL ON FUNCTION rider_has_live_offer(uuid) FROM public;
GRANT EXECUTE ON FUNCTION rider_has_live_offer(uuid) TO authenticated;

DROP POLICY IF EXISTS "Riders read offered orders" ON orders;
CREATE POLICY "Riders read offered orders" ON orders FOR SELECT TO authenticated
  USING (rider_has_live_offer(id));

DROP POLICY IF EXISTS "Riders read offered order items" ON order_items;
CREATE POLICY "Riders read offered order items" ON order_items FOR SELECT TO authenticated
  USING (rider_has_live_offer(order_id));
