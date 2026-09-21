import { describe, expect, it } from 'vitest';
import { STATUS_MESSAGES, isOrderUpdatePayload, isTerminalStatus, messageForTransition } from './orderStatus';

describe('orderStatus', () => {
  it('treats completed and cancelled as terminal', () => {
    expect(isTerminalStatus('completed')).toBe(true);
    expect(isTerminalStatus('cancelled')).toBe(true);
    expect(isTerminalStatus('pending')).toBe(false);
    expect(isTerminalStatus(undefined)).toBe(false);
  });

  it('never produces a message without a previous snapshot', () => {
    expect(messageForTransition(null, { status: 'confirmed', assignedRiderId: null })).toBeNull();
    expect(messageForTransition(undefined, { status: 'confirmed', assignedRiderId: null })).toBeNull();
  });

  it('returns the status message when the status changes', () => {
    const message = messageForTransition({ status: 'pending', assignedRiderId: null }, { status: 'confirmed', assignedRiderId: null });
    expect(message).toEqual(STATUS_MESSAGES.confirmed);
  });

  it('returns a rider message when only the rider changes', () => {
    const message = messageForTransition(
      { status: 'ready', assignedRiderId: null },
      { status: 'ready', assignedRiderId: 'r1', riderName: 'Ben' }
    );
    expect(message?.body).toMatch(/Ben/);
  });

  it('prefers the status change over the rider change', () => {
    const message = messageForTransition(
      { status: 'ready', assignedRiderId: null },
      { status: 'out_for_delivery', assignedRiderId: 'r1', riderName: 'Ben' }
    );
    expect(message).toEqual(STATUS_MESSAGES.out_for_delivery);
  });

  it('returns null when nothing changed', () => {
    expect(messageForTransition({ status: 'ready', assignedRiderId: 'r1' }, { status: 'ready', assignedRiderId: 'r1' })).toBeNull();
  });

  it('validates broadcast payloads', () => {
    expect(isOrderUpdatePayload({ orderId: 'o1', status: 'ready' })).toBe(true);
    expect(isOrderUpdatePayload({ status: 'ready' })).toBe(false);
    expect(isOrderUpdatePayload(null)).toBe(false);
  });
});
