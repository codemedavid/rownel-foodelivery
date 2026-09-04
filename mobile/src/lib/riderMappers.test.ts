import { mapEarningsSummary, mapOfferWithOrder, mapPayout, mapPresence } from './riderMappers';

describe('mapOfferWithOrder', () => {
  const row = {
    id: 'of1',
    order_id: 'o1',
    rider_id: 'r1',
    status: 'pending',
    offered_at: '2026-09-04T10:00:00.000Z',
    expires_at: '2026-09-04T10:00:30.000Z',
    distance_km: 2.4,
    responded_at: null,
    orders: {
      id: 'o1',
      merchant_id: 'm1',
      customer_name: 'Ana Cruz',
      contact_number: '09171234567',
      service_type: 'delivery',
      payment_method: 'gcash',
      total: '250',
      status: 'ready',
      created_at: '2026-09-04T09:59:00.000Z',
      order_items: [],
    },
  };

  it('converts timestamps to epoch ms and nests the mapped order', () => {
    const result = mapOfferWithOrder(row);
    expect(result.offer).toEqual({
      id: 'of1',
      orderId: 'o1',
      riderId: 'r1',
      status: 'pending',
      offeredAt: Date.parse('2026-09-04T10:00:00.000Z'),
      expiresAt: Date.parse('2026-09-04T10:00:30.000Z'),
      distanceKm: 2.4,
      respondedAt: undefined,
    });
    expect(result.order?.customerName).toBe('Ana Cruz');
    expect(result.order?.total).toBe(250);
  });

  it('tolerates a missing joined order', () => {
    expect(mapOfferWithOrder({ ...row, orders: null }).order).toBeNull();
  });
});

describe('mapPresence', () => {
  it('maps the rider_presence row', () => {
    expect(
      mapPresence({
        rider_id: 'r1',
        latitude: 14.6,
        longitude: 120.98,
        last_location_update: '2026-09-04T10:00:00.000Z',
        status: 'available',
        location_permission: 'granted',
      })
    ).toEqual({
      riderId: 'r1',
      latitude: 14.6,
      longitude: 120.98,
      lastLocationUpdate: Date.parse('2026-09-04T10:00:00.000Z'),
      status: 'available',
      locationPermission: 'granted',
    });
  });

  it('defaults an empty presence row to offline with unknown permission', () => {
    expect(mapPresence({ rider_id: 'r1' })).toEqual({
      riderId: 'r1',
      latitude: null,
      longitude: null,
      lastLocationUpdate: null,
      status: 'offline',
      locationPermission: 'unknown',
    });
  });
});

describe('mapEarningsSummary', () => {
  it('coerces numeric strings from postgres into numbers', () => {
    expect(
      mapEarningsSummary({
        totalEarned: '1200.5',
        totalPaid: '400',
        pendingPayout: '100',
        unpaidEarnings: '700.5',
        todayEarnings: '250',
        completedCount: 12,
        todayCount: 3,
      })
    ).toEqual({
      totalEarned: 1200.5,
      totalPaid: 400,
      pendingPayout: 100,
      unpaidEarnings: 700.5,
      todayEarnings: 250,
      completedCount: 12,
      todayCount: 3,
    });
  });

  it('returns a zeroed summary for a null payload', () => {
    expect(mapEarningsSummary(null)).toEqual({
      totalEarned: 0,
      totalPaid: 0,
      pendingPayout: 0,
      unpaidEarnings: 0,
      todayEarnings: 0,
      completedCount: 0,
      todayCount: 0,
    });
  });
});

describe('mapPayout', () => {
  it('maps a payout row with optional period bounds', () => {
    expect(
      mapPayout({
        id: 'p1',
        rider_id: 'r1',
        amount: '750',
        status: 'paid',
        notes: 'week 36',
        period_from: '2026-08-31T00:00:00.000Z',
        period_to: '2026-09-06T00:00:00.000Z',
        created_at: '2026-09-07T00:00:00.000Z',
        paid_at: '2026-09-07T01:00:00.000Z',
      })
    ).toEqual({
      id: 'p1',
      riderId: 'r1',
      amount: 750,
      status: 'paid',
      notes: 'week 36',
      periodFrom: Date.parse('2026-08-31T00:00:00.000Z'),
      periodTo: Date.parse('2026-09-06T00:00:00.000Z'),
      createdAt: Date.parse('2026-09-07T00:00:00.000Z'),
      paidAt: Date.parse('2026-09-07T01:00:00.000Z'),
    });
  });

  it('leaves optional fields undefined when absent', () => {
    const payout = mapPayout({ id: 'p2', rider_id: 'r1', amount: 0, status: 'pending', created_at: null });
    expect(payout.notes).toBeUndefined();
    expect(payout.periodFrom).toBeUndefined();
    expect(payout.paidAt).toBeUndefined();
    expect(payout.createdAt).toBe(0);
  });
});
