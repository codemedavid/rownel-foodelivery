import type { Order, OrderStatus } from './adminTypes';

export type OrderBucket = 'all' | 'active' | 'ready' | 'completed' | 'cancelled';

export const ACTIVE_STATUSES: readonly OrderStatus[] = ['pending', 'confirmed', 'preparing'];

export interface OrderFilter {
  bucket: OrderBucket;
  merchantId?: string | null;
  search?: string;
}

export const bucketForStatus = (status: OrderStatus): Exclude<OrderBucket, 'all'> => {
  if (ACTIVE_STATUSES.includes(status)) return 'active';
  if (status === 'ready' || status === 'out_for_delivery') return 'ready';
  return status === 'cancelled' ? 'cancelled' : 'completed';
};

const SHORT_ID_LENGTH = 8;

const matchesSearch = (order: Order, needle: string): boolean => {
  const q = needle.trim().toLowerCase();
  if (!q) return true;
  return (
    order.customerName.toLowerCase().includes(q) ||
    order.contactNumber.toLowerCase().includes(q) ||
    order.id.slice(0, SHORT_ID_LENGTH).toLowerCase().includes(q)
  );
};

export const filterOrders = (orders: readonly Order[], filter: OrderFilter): Order[] =>
  orders.filter((order) => {
    if (filter.bucket !== 'all' && bucketForStatus(order.status) !== filter.bucket) return false;
    if (filter.merchantId && order.merchantId !== filter.merchantId) return false;
    if (filter.search && !matchesSearch(order, filter.search)) return false;
    return true;
  });

export const sortNewestFirst = (orders: readonly Order[]): Order[] =>
  [...orders].sort((a, b) => b.createdAt - a.createdAt);

export const countNewSince = (orders: readonly Order[], sinceMs: number): number =>
  orders.filter((order) => order.createdAt > sinceMs).length;
