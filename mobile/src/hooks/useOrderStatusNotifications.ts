import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { activeOrderIds } from '../lib/orderHistory';
import { detectStatusTransitions, isTerminalStatus } from '../lib/orderStatus';
import {
  isOrderUpdatePayload,
  messageForBroadcast,
  type OrderSnapshot,
} from '../lib/notificationMessages';
import { presentLocalNotification, requestNotificationPermission } from '../lib/notifications';
import { useAuth } from '../context/AuthContext';

const POLL_INTERVAL_MS = 30_000;

/** Kept for checkout.tsx; the implementation now lives in lib/notifications. */
export const requestOrderNotificationPermission = async (): Promise<void> => {
  await requestNotificationPermission();
};

/**
 * Watches this device's recent orders and fires a local notification on
 * status changes and rider assignment. Realtime broadcasts (topic
 * `order:<id>`, sent by the DB trigger) deliver updates instantly for guests
 * and signed-in customers alike; the 30 s poll remains as a fallback. Devices
 * with a registered push token skip local banners to avoid duplicates.
 */
export const useOrderStatusNotifications = (): void => {
  const { isPushAvailable } = useAuth();
  const snapshotsRef = useRef<Map<string, OrderSnapshot>>(new Map());
  const primedRef = useRef(false);
  const pushRef = useRef(isPushAvailable);
  pushRef.current = isPushAvailable;

  useEffect(() => {
    let cancelled = false;
    const channels = new Map<string, ReturnType<typeof supabase.channel>>();

    const notify = (title: string, body: string, orderId: string) => {
      if (pushRef.current) return;
      presentLocalNotification(title, body, { orderId, target: 'customer' });
    };

    const subscribeTo = (orderId: string) => {
      if (channels.has(orderId)) return;
      const channel = supabase
        .channel(`order:${orderId}`, { config: { broadcast: { self: false }, private: false } })
        .on('broadcast', { event: 'order_update' }, (message) => {
          const payload = (message as { payload?: unknown }).payload;
          if (!isOrderUpdatePayload(payload)) return;
          const previous = snapshotsRef.current.get(orderId) ?? null;
          const next: OrderSnapshot = { status: payload.status, assignedRiderId: payload.assignedRiderId };
          snapshotsRef.current.set(orderId, next);
          const text = messageForBroadcast(previous, payload);
          if (text) notify(text.title, text.body, orderId);
        })
        .subscribe();
      channels.set(orderId, channel);
    };

    const unsubscribeFrom = (orderId: string) => {
      const channel = channels.get(orderId);
      if (!channel) return;
      supabase.removeChannel(channel);
      channels.delete(orderId);
    };

    const poll = async () => {
      try {
        const ids = await activeOrderIds();
        const pending = ids.filter(
          (id) => !isTerminalStatus(snapshotsRef.current.get(id)?.status ?? '')
        );
        for (const id of channels.keys()) {
          if (!pending.includes(id)) unsubscribeFrom(id);
        }
        if (pending.length === 0) return;

        const results = await Promise.allSettled(
          pending.map((id) => supabase.rpc('get_order_public', { p_order_id: id }))
        );
        if (cancelled) return;

        const snapshots = results.flatMap((result, index) => {
          if (result.status !== 'fulfilled' || result.value.error || !result.value.data) return [];
          const row = result.value.data as { status?: string; assigned_rider_id?: string | null };
          return row.status
            ? [{ orderId: pending[index], status: row.status, assignedRiderId: row.assigned_rider_id ?? null }]
            : [];
        });

        const previousStatuses = new Map(
          [...snapshotsRef.current.entries()].map(([id, snap]) => [id, snap.status])
        );
        const transitions = primedRef.current ? detectStatusTransitions(previousStatuses, snapshots) : [];
        for (const snap of snapshots) {
          snapshotsRef.current.set(snap.orderId, { status: snap.status, assignedRiderId: snap.assignedRiderId });
          if (!isTerminalStatus(snap.status)) subscribeTo(snap.orderId);
          else unsubscribeFrom(snap.orderId);
        }
        primedRef.current = true;

        for (const transition of transitions) {
          notify(transition.title, transition.body, transition.orderId);
        }
      } catch (err) {
        if (__DEV__) console.warn('Order status poll failed:', err);
      }
    };

    poll();
    const pollId = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(pollId);
      for (const id of [...channels.keys()]) unsubscribeFrom(id);
    };
  }, []);
};
