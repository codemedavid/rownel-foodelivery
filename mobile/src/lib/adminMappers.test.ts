import { mapNotification, mapOrder, mapRiderSummary, mapStaff } from './adminMappers';

describe('mapOrder', () => {
  it('converts snake_case columns, ISO timestamps and numeric strings', () => {
    const order = mapOrder({
      id: 'o1',
      created_at: '2026-09-04T00:00:00.000Z',
      merchant_id: 'm1',
      customer_name: 'Ana',
      contact_number: '0917',
      service_type: 'delivery',
      payment_method: 'gcash',
      total: '150.50',
      status: 'ready',
      delivery_fee: '49',
      assigned_rider_id: 'r1',
      rider_assigned_at: '2026-09-04T00:10:00.000Z',
      customer_user_id: null,
      order_items: [
        { id: 'i1', order_id: 'o1', item_id: 'x', name: 'Burger', unit_price: '100', quantity: 1, subtotal: '100' },
      ],
    });
    expect(order.createdAt).toBe(Date.parse('2026-09-04T00:00:00.000Z'));
    expect(order.total).toBe(150.5);
    expect(order.deliveryFee).toBe(49);
    expect(order.assignedRiderId).toBe('r1');
    expect(order.riderAssignedAt).toBe(Date.parse('2026-09-04T00:10:00.000Z'));
    expect(order.customerUserId).toBeUndefined();
    expect(order.order_items[0]).toMatchObject({ name: 'Burger', unitPrice: 100, subtotal: 100 });
  });

  it('defaults missing items to an empty array', () => {
    expect(mapOrder({ id: 'o', total: 0, status: 'pending' }).order_items).toEqual([]);
  });
});

describe('mapStaff', () => {
  it('maps the staff row', () => {
    expect(
      mapStaff({ id: 's', supabase_user_id: 'u', email: 'e', name: 'n', merchant_ids: null, all_merchants: 1, is_active: 0, created_at: null })
    ).toEqual({ id: 's', supabaseUserId: 'u', email: 'e', name: 'n', merchantIds: [], allMerchants: true, isActive: false, createdAt: 0 });
  });
});

describe('mapRiderSummary', () => {
  it('maps the list_riders_for_assignment payload', () => {
    expect(
      mapRiderSummary({ id: 'r', name: 'R', phone: null, plateNumber: 'ABC', vehicleType: 'car', presenceStatus: null, lastLocationUpdate: '2026-09-04T00:00:00Z', activeOrderCount: '2', maxOrders: '3' })
    ).toEqual({ id: 'r', name: 'R', phone: '', plateNumber: 'ABC', vehicleType: 'car', presenceStatus: 'offline', lastLocationUpdate: Date.parse('2026-09-04T00:00:00Z'), activeOrderCount: 2, maxOrders: 3 });
  });
});

describe('mapNotification', () => {
  it('maps the notifications row', () => {
    expect(
      mapNotification({ id: 'n', recipient_user_id: 'u', order_id: 'o', kind: 'new_order', title: 't', body: 'b', data: { orderId: 'o', target: 'admin' }, read_at: null, created_at: '2026-09-04T00:00:00Z' })
    ).toEqual({ id: 'n', recipientUserId: 'u', orderId: 'o', kind: 'new_order', title: 't', body: 'b', data: { orderId: 'o', target: 'admin' }, readAt: null, createdAt: Date.parse('2026-09-04T00:00:00Z') });
  });
});
