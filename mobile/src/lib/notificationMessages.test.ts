import { messageForBroadcast, RIDER_ASSIGNED_MESSAGE, type OrderUpdatePayload } from './notificationMessages';
import { STATUS_MESSAGES } from './orderStatus';

const payload = (overrides: Partial<OrderUpdatePayload>): OrderUpdatePayload => ({
  orderId: 'o1',
  status: 'confirmed',
  assignedRiderId: null,
  riderName: null,
  changedAt: '2026-09-04T00:00:00Z',
  ...overrides,
});

describe('messageForBroadcast', () => {
  it('returns the status message when the status changed', () => {
    const msg = messageForBroadcast({ status: 'pending', assignedRiderId: null }, payload({ status: 'confirmed' }));
    expect(msg).toEqual(STATUS_MESSAGES.confirmed);
  });

  it('returns the rider assigned message with the rider name when a rider was newly assigned', () => {
    const msg = messageForBroadcast(
      { status: 'ready', assignedRiderId: null },
      payload({ status: 'ready', assignedRiderId: 'r1', riderName: 'Carlo' })
    );
    expect(msg?.title).toBe(RIDER_ASSIGNED_MESSAGE.title);
    expect(msg?.body).toContain('Carlo');
  });

  it('prefers the status message when both changed', () => {
    const msg = messageForBroadcast(
      { status: 'ready', assignedRiderId: null },
      payload({ status: 'out_for_delivery', assignedRiderId: 'r1', riderName: 'Carlo' })
    );
    expect(msg).toEqual(STATUS_MESSAGES.out_for_delivery);
  });

  it('returns null when nothing notifiable changed', () => {
    expect(messageForBroadcast({ status: 'confirmed', assignedRiderId: null }, payload({ status: 'confirmed' }))).toBeNull();
  });

  it('returns null on first sight (no previous snapshot)', () => {
    expect(messageForBroadcast(null, payload({ status: 'confirmed' }))).toBeNull();
  });
});

describe('STATUS_MESSAGES contract with SQL order_status_message()', () => {
  // Keep in sync with supabase/migrations/20260904000300_order_change_notifications_trigger.sql
  it('covers exactly the six notifiable statuses', () => {
    expect(Object.keys(STATUS_MESSAGES).sort()).toEqual(
      ['cancelled', 'completed', 'confirmed', 'out_for_delivery', 'preparing', 'ready']
    );
  });
});
