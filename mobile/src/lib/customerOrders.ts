import { isTerminalStatus } from './orderStatus';

export interface CustomerOrder {
  orderId: string;
  merchantName: string;
  total: number;
  placedAt: number;
  status?: string;
}

export interface CustomerOrderSummary {
  orderCount: number;
  totalSpent: number;
  /** Orders that have not reached a terminal status yet. */
  activeCount: number;
}

/**
 * Combines orders placed on this device with the signed-in account's orders,
 * de-duplicated by id and sorted newest first.
 */
export const mergeAccountOrders = (
  local: readonly CustomerOrder[],
  account: readonly CustomerOrder[]
): CustomerOrder[] => {
  const seen = new Set(local.map((entry) => entry.orderId));
  const merged = [...local];
  for (const entry of account) {
    if (!seen.has(entry.orderId)) merged.push(entry);
  }
  return merged.sort((a, b) => b.placedAt - a.placedAt);
};

/** Headline numbers for the profile screen. */
export const summarizeOrders = (orders: readonly CustomerOrder[]): CustomerOrderSummary => ({
  orderCount: orders.length,
  totalSpent: orders.reduce((sum, order) => sum + (Number.isFinite(order.total) ? order.total : 0), 0),
  activeCount: orders.filter((order) => !!order.status && !isTerminalStatus(order.status)).length,
});
