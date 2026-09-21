import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACTIVE_ORDER_WINDOW_MS,
  addOrderToHistory,
  readActiveOrderIds,
  readOrderHistory,
  subscribeToOrderHistory,
  type LocalOrderRecord,
} from './orderHistory';

const record = (orderId: string, placedAt: number): LocalOrderRecord => ({
  orderId,
  merchantId: 'm1',
  merchantName: 'Store',
  customerName: 'Juan',
  total: 100,
  deliveryFee: 0,
  paymentMethod: 'gcash',
  placedAt,
  items: [],
});

describe('orderHistory', () => {
  beforeEach(() => localStorage.clear());

  it('returns an empty list when nothing is stored or storage is corrupt', () => {
    expect(readOrderHistory()).toEqual([]);
    localStorage.setItem('orderHistory', '{not json');
    expect(readOrderHistory()).toEqual([]);
  });

  it('prepends new orders and replaces duplicates', () => {
    addOrderToHistory(record('a', 1));
    addOrderToHistory(record('b', 2));
    addOrderToHistory(record('a', 3));
    expect(readOrderHistory().map((r) => r.orderId)).toEqual(['a', 'b']);
    expect(readOrderHistory()[0].placedAt).toBe(3);
  });

  it('only reports recent orders as active', () => {
    const now = Date.now();
    addOrderToHistory(record('old', now - ACTIVE_ORDER_WINDOW_MS - 1));
    addOrderToHistory(record('fresh', now - 1000));
    expect(readActiveOrderIds(now)).toEqual(['fresh']);
  });

  it('notifies subscribers when history changes', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToOrderHistory(listener);
    addOrderToHistory(record('a', 1));
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    addOrderToHistory(record('b', 2));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
