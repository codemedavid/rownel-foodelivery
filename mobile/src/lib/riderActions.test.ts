import { canGoOnline, isLocationFresh, nextRiderAction, sortByPickupOrder } from './riderActions';
import type { Order } from './adminTypes';

const order = (overrides: Partial<Order> = {}): Order => ({
  id: 'o1',
  createdAt: 0,
  merchantId: 'm1',
  customerName: 'Ana Cruz',
  contactNumber: '09171234567',
  serviceType: 'delivery',
  paymentMethod: 'gcash',
  total: 100,
  status: 'ready',
  order_items: [],
  ...overrides,
});

describe('nextRiderAction', () => {
  it('asks for pickup on a ready order', () => {
    expect(nextRiderAction(order({ status: 'ready' }))).toBe('pickup');
  });

  it('asks for delivery once out for delivery', () => {
    expect(nextRiderAction(order({ status: 'out_for_delivery' }))).toBe('deliver');
  });

  it('offers nothing before the merchant is ready or after the run ends', () => {
    for (const status of ['pending', 'confirmed', 'preparing', 'completed', 'cancelled'] as const) {
      expect(nextRiderAction(order({ status }))).toBeNull();
    }
  });
});

describe('isLocationFresh', () => {
  it('is fresh within the stale window', () => {
    expect(isLocationFresh(1_000, 30_000)).toBe(true);
  });

  it('is stale past the window or with no fix at all', () => {
    expect(isLocationFresh(1_000, 90_000)).toBe(false);
    expect(isLocationFresh(null, 1_000)).toBe(false);
  });
});

describe('canGoOnline', () => {
  it('requires granted permission and a fix', () => {
    expect(canGoOnline({ permission: 'granted', coords: { latitude: 1, longitude: 2 } })).toBe(true);
  });

  it('refuses without permission or without coords', () => {
    expect(canGoOnline({ permission: 'denied', coords: { latitude: 1, longitude: 2 } })).toBe(false);
    expect(canGoOnline({ permission: 'unknown', coords: { latitude: 1, longitude: 2 } })).toBe(false);
    expect(canGoOnline({ permission: 'granted', coords: null })).toBe(false);
  });
});

describe('sortByPickupOrder', () => {
  it('sorts by assignment time, oldest first, without mutating', () => {
    const list = [
      order({ id: 'second', riderAssignedAt: 200 }),
      order({ id: 'first', riderAssignedAt: 100 }),
    ];
    expect(sortByPickupOrder(list).map((o) => o.id)).toEqual(['first', 'second']);
    expect(list[0].id).toBe('second');
  });

  it('treats a missing assignment time as oldest', () => {
    const list = [order({ id: 'timed', riderAssignedAt: 100 }), order({ id: 'untimed' })];
    expect(sortByPickupOrder(list).map((o) => o.id)).toEqual(['untimed', 'timed']);
  });
});
