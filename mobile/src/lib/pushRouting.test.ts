import { parseNotificationRoute } from './pushRouting';

describe('parseNotificationRoute', () => {
  it('routes admin-target notifications to the admin order detail', () => {
    expect(parseNotificationRoute({ orderId: 'o1', target: 'admin' })).toBe('/(admin)/order/o1');
  });

  it('routes customer notifications to the customer order screen', () => {
    expect(parseNotificationRoute({ orderId: 'o1', target: 'customer' })).toBe('/order/o1');
    expect(parseNotificationRoute({ orderId: 'o1' })).toBe('/order/o1');
  });

  it('falls back to the notifications list when there is no order id', () => {
    expect(parseNotificationRoute({})).toBe('/notifications');
    expect(parseNotificationRoute(null)).toBe('/notifications');
    expect(parseNotificationRoute('junk')).toBe('/notifications');
  });

  it('ignores non-string order ids', () => {
    expect(parseNotificationRoute({ orderId: 42 })).toBe('/notifications');
  });
});
