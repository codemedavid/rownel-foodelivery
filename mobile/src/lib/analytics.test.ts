import { dateRangePreset, percentChange, shapeSalesSummary } from './analytics';

describe('shapeSalesSummary', () => {
  it('fills defaults when the payload is empty or null', () => {
    const shaped = shapeSalesSummary(null);
    expect(shaped.totals).toEqual({
      grossSales: 0,
      deliveryFees: 0,
      orderCount: 0,
      completedCount: 0,
      cancelledCount: 0,
      avgOrderValue: 0,
    });
    expect(shaped.daily).toEqual([]);
    expect(shaped.topItems).toEqual([]);
    expect(shaped.topMerchants).toEqual([]);
    expect(shaped.countsByStatus.pending).toBe(0);
  });

  it('coerces numeric strings and keeps every status key', () => {
    const shaped = shapeSalesSummary({
      totals: { grossSales: '1234.5', orderCount: '3' },
      countsByStatus: { completed: '2' },
      daily: [{ day: '2026-09-01', sales: '10', orders: '1', completed: '1' }],
      topItems: [{ itemId: 'i1', name: 'Burger', quantity: '4', sales: '400' }],
      topMerchants: [{ merchantId: 'm1', name: 'Shop', sales: '400', orders: '2' }],
    });
    expect(shaped.totals.grossSales).toBe(1234.5);
    expect(shaped.totals.orderCount).toBe(3);
    expect(shaped.countsByStatus.completed).toBe(2);
    expect(shaped.countsByStatus.cancelled).toBe(0);
    expect(shaped.daily[0]).toEqual({ day: '2026-09-01', sales: 10, orders: 1, completed: 1 });
    expect(shaped.topItems[0].quantity).toBe(4);
    expect(shaped.topMerchants[0].orders).toBe(2);
  });
});

describe('dateRangePreset', () => {
  // 2026-09-04T15:30:00+08:00 (Manila)
  const now = new Date('2026-09-04T07:30:00.000Z');

  it('today starts at Manila midnight and ends now', () => {
    const { from, to } = dateRangePreset('today', now);
    expect(from.toISOString()).toBe('2026-09-03T16:00:00.000Z');
    expect(to.getTime()).toBe(now.getTime());
  });

  it('7d and 30d include today plus the previous days', () => {
    expect(dateRangePreset('7d', now).from.toISOString()).toBe('2026-08-28T16:00:00.000Z');
    expect(dateRangePreset('30d', now).from.toISOString()).toBe('2026-08-05T16:00:00.000Z');
  });
});

describe('percentChange', () => {
  it('returns null when the previous value is zero', () => {
    expect(percentChange(10, 0)).toBeNull();
  });

  it('computes the relative change', () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, 100)).toBe(-50);
  });
});
