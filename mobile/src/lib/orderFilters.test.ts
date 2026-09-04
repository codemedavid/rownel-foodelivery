import {
  ACTIVE_STATUSES,
  bucketForStatus,
  countNewSince,
  filterOrders,
  sortNewestFirst,
} from './orderFilters';
import type { Order } from './adminTypes';

const order = (overrides: Partial<Order>): Order => ({
  id: 'aaaaaaaa-0000-0000-0000-000000000000',
  createdAt: 1000,
  merchantId: 'm1',
  customerName: 'Ana Cruz',
  contactNumber: '09171234567',
  serviceType: 'delivery',
  paymentMethod: 'gcash',
  total: 100,
  status: 'pending',
  order_items: [],
  ...overrides,
});

describe('bucketForStatus', () => {
  it('maps statuses to list buckets', () => {
    expect(bucketForStatus('pending')).toBe('active');
    expect(bucketForStatus('preparing')).toBe('active');
    expect(bucketForStatus('ready')).toBe('ready');
    expect(bucketForStatus('out_for_delivery')).toBe('ready');
    expect(bucketForStatus('completed')).toBe('completed');
    expect(bucketForStatus('cancelled')).toBe('cancelled');
  });

  it('exposes the active statuses set', () => {
    expect(ACTIVE_STATUSES).toEqual(['pending', 'confirmed', 'preparing']);
  });
});

describe('filterOrders', () => {
  const orders = [
    order({ id: 'o1', status: 'pending', merchantId: 'm1' }),
    order({ id: 'o2', status: 'ready', merchantId: 'm2', customerName: 'Ben Reyes' }),
    order({ id: 'o3', status: 'completed', merchantId: 'm1', contactNumber: '09990001111' }),
  ];

  it('filters by bucket', () => {
    expect(filterOrders(orders, { bucket: 'active' }).map((o) => o.id)).toEqual(['o1']);
    expect(filterOrders(orders, { bucket: 'ready' }).map((o) => o.id)).toEqual(['o2']);
  });

  it('filters by merchant', () => {
    expect(filterOrders(orders, { bucket: 'all', merchantId: 'm1' }).map((o) => o.id)).toEqual(['o1', 'o3']);
  });

  it('searches name, contact number and short id case-insensitively', () => {
    expect(filterOrders(orders, { bucket: 'all', search: 'ben' }).map((o) => o.id)).toEqual(['o2']);
    expect(filterOrders(orders, { bucket: 'all', search: '0999' }).map((o) => o.id)).toEqual(['o3']);
    expect(filterOrders(orders, { bucket: 'all', search: 'O2' }).map((o) => o.id)).toEqual(['o2']);
  });

  it('does not mutate the input', () => {
    const copy = [...orders];
    filterOrders(orders, { bucket: 'active' });
    expect(orders).toEqual(copy);
  });
});

describe('sortNewestFirst', () => {
  it('sorts descending by createdAt without mutating', () => {
    const list = [order({ id: 'a', createdAt: 1 }), order({ id: 'b', createdAt: 3 })];
    expect(sortNewestFirst(list).map((o) => o.id)).toEqual(['b', 'a']);
    expect(list[0].id).toBe('a');
  });
});

describe('countNewSince', () => {
  it('counts orders created after the timestamp', () => {
    const list = [order({ createdAt: 5 }), order({ createdAt: 10 }), order({ createdAt: 15 })];
    expect(countNewSince(list, 10)).toBe(1);
  });
});
