import { canAssignRider, canUnassignRider, nextStatusOptions } from './orderActions';
import type { Order } from './adminTypes';

const order = (overrides: Partial<Order>): Order => ({
  id: 'o1',
  createdAt: 0,
  merchantId: 'm1',
  customerName: 'A',
  contactNumber: '0917',
  serviceType: 'delivery',
  paymentMethod: 'gcash',
  total: 1,
  status: 'pending',
  order_items: [],
  ...overrides,
});

describe('nextStatusOptions', () => {
  it('offers confirm or cancel for pending orders', () => {
    expect(nextStatusOptions(order({ status: 'pending' }))).toEqual(['confirmed', 'cancelled']);
  });

  it('walks confirmed -> preparing -> ready', () => {
    expect(nextStatusOptions(order({ status: 'confirmed' }))).toEqual(['preparing', 'cancelled']);
    expect(nextStatusOptions(order({ status: 'preparing' }))).toEqual(['ready', 'cancelled']);
  });

  it('lets staff complete ready pickup and dine-in orders', () => {
    expect(nextStatusOptions(order({ status: 'ready', serviceType: 'pickup' }))).toEqual(['completed', 'cancelled']);
    expect(nextStatusOptions(order({ status: 'ready', serviceType: 'dine-in' }))).toEqual(['completed', 'cancelled']);
  });

  it('keeps completion of ready delivery orders with the rider flow (cancel only)', () => {
    expect(nextStatusOptions(order({ status: 'ready', serviceType: 'delivery' }))).toEqual(['cancelled']);
  });

  it('offers nothing for out_for_delivery and terminal statuses', () => {
    expect(nextStatusOptions(order({ status: 'out_for_delivery' }))).toEqual([]);
    expect(nextStatusOptions(order({ status: 'completed' }))).toEqual([]);
    expect(nextStatusOptions(order({ status: 'cancelled' }))).toEqual([]);
  });
});

describe('canAssignRider', () => {
  it('allows delivery orders that are not yet out for delivery or terminal', () => {
    expect(canAssignRider(order({ status: 'pending' }))).toBe(true);
    expect(canAssignRider(order({ status: 'ready' }))).toBe(true);
    expect(canAssignRider(order({ status: 'ready', assignedRiderId: 'r1' }))).toBe(true);
  });

  it('rejects non-delivery, out_for_delivery and terminal orders', () => {
    expect(canAssignRider(order({ serviceType: 'pickup' }))).toBe(false);
    expect(canAssignRider(order({ status: 'out_for_delivery' }))).toBe(false);
    expect(canAssignRider(order({ status: 'completed' }))).toBe(false);
    expect(canAssignRider(order({ status: 'cancelled' }))).toBe(false);
  });
});

describe('canUnassignRider', () => {
  it('requires an assigned rider and an assignable order', () => {
    expect(canUnassignRider(order({ status: 'ready', assignedRiderId: 'r1' }))).toBe(true);
    expect(canUnassignRider(order({ status: 'ready' }))).toBe(false);
    expect(canUnassignRider(order({ status: 'out_for_delivery', assignedRiderId: 'r1' }))).toBe(false);
  });
});
