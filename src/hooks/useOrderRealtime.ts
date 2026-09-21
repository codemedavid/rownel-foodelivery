import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { isOrderUpdatePayload, type OrderUpdatePayload } from '../lib/orderStatus';

/**
 * Subscribes to the public broadcast topic `order:<id>` that the DB trigger
 * publishes on. Works for guests (no auth). Returns the latest payload and
 * whether the socket is live so callers can relax their polling.
 */
export const useOrderRealtime = (
  orderId: string | null | undefined,
  onUpdate?: (payload: OrderUpdatePayload) => void
) => {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<OrderUpdatePayload | null>(null);
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!orderId) return;
    setIsSubscribed(false);
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`order:${orderId}`, { config: { broadcast: { self: false }, private: false } })
        .on('broadcast', { event: 'order_update' }, (message) => {
          const payload = (message as { payload?: unknown }).payload;
          if (!isOrderUpdatePayload(payload)) return;
          setLastUpdate(payload);
          onUpdateRef.current?.(payload);
        })
        .subscribe((status) => {
          setIsSubscribed(status === 'SUBSCRIBED');
        });
    } catch (err) {
      console.warn('Order realtime unavailable; relying on polling:', err);
    }
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [orderId]);

  return { isSubscribed, lastUpdate };
};
