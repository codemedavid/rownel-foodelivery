export interface OrderStatusSnapshot {
  orderId: string;
  status: string;
}

export interface StatusTransition {
  orderId: string;
  status: string;
  title: string;
  body: string;
}

export const STATUS_MESSAGES: Record<string, { title: string; body: string }> = {
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

const TERMINAL_STATUSES = new Set(['completed', 'cancelled']);

export const isTerminalStatus = (status: string): boolean => TERMINAL_STATUSES.has(status);

/**
 * Compares fresh order statuses against the previously seen ones and returns
 * the customer-facing notifications to fire. Orders with no known previous
 * status (first load) never produce a transition.
 */
export const detectStatusTransitions = (
  previous: ReadonlyMap<string, string>,
  current: readonly OrderStatusSnapshot[]
): StatusTransition[] => {
  const transitions: StatusTransition[] = [];
  for (const { orderId, status } of current) {
    const prev = previous.get(orderId);
    if (prev === undefined || prev === status) continue;
    const message = STATUS_MESSAGES[status];
    if (!message) continue;
    transitions.push({ orderId, status, title: message.title, body: message.body });
  }
  return transitions;
};
