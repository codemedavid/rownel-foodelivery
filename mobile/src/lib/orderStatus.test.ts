import {
  detectStatusTransitions,
  isTerminalStatus,
  STATUS_MESSAGES,
  type OrderStatusSnapshot,
} from './orderStatus';

const snap = (id: string, status: string): OrderStatusSnapshot => ({ orderId: id, status });

describe('orderStatus', () => {
  it('reports no transitions when previous statuses are unknown (first load)', () => {
    const transitions = detectStatusTransitions(new Map(), [snap('o1', 'confirmed')]);
    expect(transitions).toEqual([]);
  });

  it('detects a pending → confirmed transition with a customer-facing message', () => {
    const prev = new Map([['o1', 'pending']]);
    const transitions = detectStatusTransitions(prev, [snap('o1', 'confirmed')]);

    expect(transitions).toHaveLength(1);
    expect(transitions[0].orderId).toBe('o1');
    expect(transitions[0].title).toMatch(/confirmed/i);
  });

  it('ignores unchanged statuses', () => {
    const prev = new Map([['o1', 'confirmed']]);
    expect(detectStatusTransitions(prev, [snap('o1', 'confirmed')])).toEqual([]);
  });

  it('covers every notifiable status with a message', () => {
    for (const status of ['confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled']) {
      expect(STATUS_MESSAGES[status]).toBeDefined();
    }
  });

  it('skips statuses without a message instead of crashing', () => {
    const prev = new Map([['o1', 'pending']]);
    expect(detectStatusTransitions(prev, [snap('o1', 'weird_status')])).toEqual([]);
  });

  it('flags completed and cancelled as terminal', () => {
    expect(isTerminalStatus('completed')).toBe(true);
    expect(isTerminalStatus('cancelled')).toBe(true);
    expect(isTerminalStatus('confirmed')).toBe(false);
  });
});
