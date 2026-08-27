import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { supabase } from '../lib/supabase';
import { activeOrderIds } from '../lib/orderHistory';
import { detectStatusTransitions, isTerminalStatus } from '../lib/orderStatus';

const POLL_INTERVAL_MS = 30_000;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export const requestOrderNotificationPermission = async (): Promise<void> => {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      await Notifications.requestPermissionsAsync();
    }
  } catch {
    // Permission is best-effort; ordering must never fail because of it.
  }
};

/**
 * Polls this device's recent orders while the app is open and fires a local
 * notification whenever a status changes (confirmed, preparing, out for
 * delivery, ...). Statuses seen on the first poll never notify.
 */
export const useOrderStatusNotifications = (): void => {
  const statusesRef = useRef<Map<string, string>>(new Map());
  const primedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const ids = await activeOrderIds();
        const pending = ids.filter(
          (id) => !isTerminalStatus(statusesRef.current.get(id) ?? '')
        );
        if (pending.length === 0) return;

        const results = await Promise.allSettled(
          pending.map((id) => supabase.rpc('get_order_public', { p_order_id: id }))
        );
        if (cancelled) return;

        const snapshots = results.flatMap((result, index) => {
          if (result.status !== 'fulfilled' || result.value.error || !result.value.data) return [];
          const row = result.value.data as { status?: string };
          return row.status ? [{ orderId: pending[index], status: row.status }] : [];
        });

        const transitions = primedRef.current
          ? detectStatusTransitions(statusesRef.current, snapshots)
          : [];
        for (const { orderId, status } of snapshots) {
          statusesRef.current.set(orderId, status);
        }
        primedRef.current = true;

        for (const transition of transitions) {
          await Notifications.scheduleNotificationAsync({
            content: { title: transition.title, body: transition.body },
            trigger: null,
          });
        }
      } catch (err) {
        console.warn('Order status poll failed:', err);
      }
    };

    poll();
    const intervalId = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);
};
