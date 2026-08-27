import { useCallback, useEffect, useRef, useState } from 'react';
import { ordersApi } from '../lib/deliveryApi';
import { showNotification } from '../lib/notificationUtils';

const ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000;
const POLL_INTERVAL_MS = 30_000;
const TERMINAL_STATUSES = new Set(['completed', 'cancelled']);

const STATUS_MESSAGES: Record<string, { title: string; body: string }> = {
  confirmed: {
    title: 'Order Confirmed! ✅',
    body: 'The merchant confirmed your order and will start preparing it.',
  },
  preparing: {
    title: 'Order Being Prepared 🍳',
    body: 'Your food is being prepared right now.',
  },
  ready: {
    title: 'Order Ready 📦',
    body: 'Your order is ready for pickup or handoff to a rider.',
  },
  out_for_delivery: {
    title: 'Rider On The Way 🛵',
    body: 'Your order is out for delivery.',
  },
  completed: {
    title: 'Order Delivered 🎉',
    body: 'Enjoy your meal! Thanks for ordering.',
  },
  cancelled: {
    title: 'Order Cancelled',
    body: 'Your order was cancelled. Contact the merchant if this is unexpected.',
  },
};

interface StoredOrderRecord {
  orderId?: string;
  placedAt?: number;
}

function readActiveOrderIds(): string[] {
  try {
    const stored = localStorage.getItem('orderHistory');
    if (!stored) return [];
    const records = JSON.parse(stored) as StoredOrderRecord[];
    if (!Array.isArray(records)) return [];
    return records
      .filter(
        (record) =>
          typeof record?.orderId === 'string' &&
          typeof record?.placedAt === 'number' &&
          Date.now() - record.placedAt < ACTIVE_WINDOW_MS
      )
      .map((record) => record.orderId as string);
  } catch {
    return [];
  }
}

/**
 * Watches the customer's recent orders (from this device's order history) and
 * fires a sound + browser notification when a status changes — e.g. when the
 * merchant confirms the order. Polls while the app is open; statuses seen on
 * the first load never trigger a notification.
 */
export function useCustomerOrderNotifications() {
  const statusesRef = useRef<Map<string, string>>(new Map());
  const primedRef = useRef(false);
  const [watchedIds] = useState<string[]>(readActiveOrderIds);

  const refresh = useCallback(async () => {
    const pendingIds = watchedIds.filter(
      (id) => !TERMINAL_STATUSES.has(statusesRef.current.get(id) ?? '')
    );
    if (pendingIds.length === 0) return;

    const results = await Promise.allSettled(
      pendingIds.map((id) => ordersApi.getPublicById(id))
    );

    const isFirstLoad = !primedRef.current;
    for (const result of results) {
      if (result.status !== 'fulfilled' || !result.value) continue;
      const order = result.value;
      const previous = statusesRef.current.get(order.id);
      statusesRef.current.set(order.id, order.status);

      if (isFirstLoad || previous === order.status || previous === undefined) continue;
      const message = STATUS_MESSAGES[order.status];
      if (message) showNotification(message.title, message.body);
    }
    primedRef.current = true;
  }, [watchedIds]);

  useEffect(() => {
    if (watchedIds.length === 0) return;
    refresh().catch((err) => console.error('Order notification poll failed:', err));
    const intervalId = setInterval(() => {
      refresh().catch((err) => console.error('Order notification poll failed:', err));
    }, POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [watchedIds, refresh]);

  return { refresh, watchedIds };
}
