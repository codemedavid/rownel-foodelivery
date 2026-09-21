/**
 * Customer-facing order status vocabulary. Mirrors order_status_message() in
 * supabase/migrations/20260904000300 and mobile/src/lib/orderStatus.ts — keep
 * the three in sync.
 */

export interface NotificationMessage {
  title: string;
  body: string;
}

export const STATUS_MESSAGES: Record<string, NotificationMessage> = {
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

export const STATUS_LABELS: Record<string, string> = {
  pending: 'Waiting for confirmation',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready: 'Ready',
  out_for_delivery: 'On the way',
  completed: 'Delivered',
  cancelled: 'Cancelled',
};

const TERMINAL_STATUSES: ReadonlySet<string> = new Set(['completed', 'cancelled']);

export const isTerminalStatus = (status: string | undefined | null): boolean =>
  TERMINAL_STATUSES.has(status ?? '');

/** Payload broadcast by the notify_order_change() trigger on topic `order:<id>`. */
export interface OrderUpdatePayload {
  orderId: string;
  status: string;
  assignedRiderId: string | null;
  riderName: string | null;
  changedAt: string;
}

export interface OrderSnapshot {
  status: string;
  assignedRiderId: string | null;
}

export const RIDER_ASSIGNED_MESSAGE: NotificationMessage = {
  title: 'Rider Assigned 🛵',
  body: 'A rider will deliver your order.',
};

export const riderAssignedMessage = (riderName: string | null): NotificationMessage =>
  riderName ? { ...RIDER_ASSIGNED_MESSAGE, body: `${riderName} will deliver your order.` } : RIDER_ASSIGNED_MESSAGE;

/**
 * Decides which notification (if any) a fresh snapshot should produce given
 * the last snapshot the device saw. Status changes win over rider assignment.
 * A missing previous snapshot (first load) never produces a message.
 */
export const messageForTransition = (
  previous: OrderSnapshot | null | undefined,
  next: OrderSnapshot & { riderName?: string | null }
): NotificationMessage | null => {
  if (!previous) return null;
  if (previous.status !== next.status) {
    return STATUS_MESSAGES[next.status] ?? null;
  }
  if (next.assignedRiderId && previous.assignedRiderId !== next.assignedRiderId) {
    return riderAssignedMessage(next.riderName ?? null);
  }
  return null;
};

export const isOrderUpdatePayload = (value: unknown): value is OrderUpdatePayload => {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.orderId === 'string' && typeof v.status === 'string';
};
