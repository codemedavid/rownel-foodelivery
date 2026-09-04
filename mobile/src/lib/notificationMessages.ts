import { STATUS_MESSAGES } from './orderStatus';

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

export interface NotificationMessage {
  title: string;
  body: string;
}

export const RIDER_ASSIGNED_MESSAGE: NotificationMessage = {
  title: 'Rider Assigned 🛵',
  body: 'A rider will deliver your order.',
};

export const riderAssignedMessage = (riderName: string | null): NotificationMessage =>
  riderName
    ? { ...RIDER_ASSIGNED_MESSAGE, body: `${riderName} will deliver your order.` }
    : RIDER_ASSIGNED_MESSAGE;

/**
 * Decides which local notification (if any) a broadcast should produce given
 * the last snapshot the device saw. Status changes win over rider assignment.
 */
export const messageForBroadcast = (
  previous: OrderSnapshot | null,
  payload: OrderUpdatePayload
): NotificationMessage | null => {
  if (!previous) return null;
  if (previous.status !== payload.status) {
    return STATUS_MESSAGES[payload.status] ?? null;
  }
  if (payload.assignedRiderId && previous.assignedRiderId !== payload.assignedRiderId) {
    return riderAssignedMessage(payload.riderName);
  }
  return null;
};

export const isOrderUpdatePayload = (value: unknown): value is OrderUpdatePayload => {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.orderId === 'string' && typeof v.status === 'string';
};
