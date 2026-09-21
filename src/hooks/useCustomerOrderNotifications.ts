import { useCallback, useEffect, useRef, useState } from 'react';
import { ordersApi } from '../lib/deliveryApi';
import { supabase } from '../lib/supabase';
import { showNotification } from '../lib/notificationUtils';
import { readActiveOrderIds, subscribeToOrderHistory } from '../lib/orderHistory';
import {
  isOrderUpdatePayload,
  isTerminalStatus,
  messageForTransition,
  type OrderSnapshot,
} from '../lib/orderStatus';

const POLL_INTERVAL_MS = 30_000;

type Channel = ReturnType<typeof supabase.channel>;

const trackingHref = (orderId: string) => `/track/${orderId}`;

/**
 * Watches the orders placed on this device (guest or signed in) and fires a
 * toast + sound + system notification when a status changes or a rider is
 * assigned.
 *
 * Instant updates arrive over the public realtime topic `order:<id>` that the
 * database trigger broadcasts on — no auth needed. A 30 s poll remains as a
 * fallback for browsers that drop the socket. Statuses seen on the first load
 * never trigger a notification, and the watched list refreshes as soon as a
 * new order is saved to local history.
 */
export function useCustomerOrderNotifications() {
  const snapshotsRef = useRef<Map<string, OrderSnapshot>>(new Map());
  const primedRef = useRef(false);
  const channelsRef = useRef<Map<string, Channel>>(new Map());
  const [watchedIds, setWatchedIds] = useState<string[]>(readActiveOrderIds);

  useEffect(() => subscribeToOrderHistory(() => setWatchedIds(readActiveOrderIds())), []);

  const notify = useCallback((orderId: string, previous: OrderSnapshot | undefined, next: OrderSnapshot & { riderName?: string | null }) => {
    const message = messageForTransition(previous, next);
    if (message) showNotification(message.title, message.body, { href: trackingHref(orderId) });
  }, []);

  const unsubscribeFrom = useCallback((orderId: string) => {
    const channel = channelsRef.current.get(orderId);
    if (!channel) return;
    supabase.removeChannel(channel);
    channelsRef.current.delete(orderId);
  }, []);

  const subscribeTo = useCallback(
    (orderId: string) => {
      if (channelsRef.current.has(orderId)) return;
      try {
        const channel = supabase
          .channel(`order:${orderId}`, { config: { broadcast: { self: false }, private: false } })
          .on('broadcast', { event: 'order_update' }, (message) => {
            const payload = (message as { payload?: unknown }).payload;
            if (!isOrderUpdatePayload(payload)) return;
            const previous = snapshotsRef.current.get(orderId);
            const next: OrderSnapshot = { status: payload.status, assignedRiderId: payload.assignedRiderId ?? null };
            snapshotsRef.current.set(orderId, next);
            notify(orderId, previous, { ...next, riderName: payload.riderName });
            if (isTerminalStatus(next.status)) unsubscribeFrom(orderId);
          })
          .subscribe();
        channelsRef.current.set(orderId, channel);
      } catch (err) {
        console.warn('Realtime subscription failed; polling only:', err);
      }
    },
    [notify, unsubscribeFrom]
  );

  const refresh = useCallback(async () => {
    const pendingIds = watchedIds.filter((id) => !isTerminalStatus(snapshotsRef.current.get(id)?.status));
    for (const id of [...channelsRef.current.keys()]) {
      if (!pendingIds.includes(id)) unsubscribeFrom(id);
    }
    if (pendingIds.length === 0) return;

    const results = await Promise.allSettled(pendingIds.map((id) => ordersApi.getPublicById(id)));

    const isFirstLoad = !primedRef.current;
    for (const result of results) {
      if (result.status !== 'fulfilled' || !result.value) continue;
      const order = result.value;
      const previous = snapshotsRef.current.get(order.id);
      const next: OrderSnapshot = { status: order.status, assignedRiderId: order.assignedRiderId ?? null };
      snapshotsRef.current.set(order.id, next);

      if (isTerminalStatus(next.status)) unsubscribeFrom(order.id);
      else subscribeTo(order.id);

      if (isFirstLoad) continue;
      notify(order.id, previous, next);
    }
    primedRef.current = true;
  }, [watchedIds, notify, subscribeTo, unsubscribeFrom]);

  useEffect(() => {
    if (watchedIds.length === 0) return;
    refresh().catch((err) => console.error('Order notification poll failed:', err));
    const intervalId = setInterval(() => {
      refresh().catch((err) => console.error('Order notification poll failed:', err));
    }, POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [watchedIds, refresh]);

  useEffect(() => {
    const channels = channelsRef.current;
    return () => {
      for (const channel of channels.values()) supabase.removeChannel(channel);
      channels.clear();
    };
  }, []);

  return { refresh, watchedIds };
}
