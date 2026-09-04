export const NOTIFICATIONS_ROUTE = '/notifications';

/**
 * Maps a notification `data` payload (from push or the notifications table)
 * to the screen that should open when it is tapped.
 */
export const parseNotificationRoute = (data: unknown): string => {
  if (!data || typeof data !== 'object') return NOTIFICATIONS_ROUTE;
  const { orderId, target } = data as { orderId?: unknown; target?: unknown };
  if (typeof orderId !== 'string' || !orderId) return NOTIFICATIONS_ROUTE;
  if (target === 'admin') return `/(admin)/order/${orderId}`;
  if (target === 'rider') return `/(rider)/delivery/${orderId}`;
  return `/order/${orderId}`;
};
