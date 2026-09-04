// Pure decision logic for the rider run. Screens stay dumb; this is what tests pin.

import type { Order } from './adminTypes';
import type { RiderLocationState } from './riderTypes';

export type RiderAction = 'pickup' | 'deliver';

/** A rider's own location is treated as stale after a minute without a fix. */
export const LOCATION_STALE_MS = 60_000;

/**
 * The single action a rider can take on an order. Staff move an order to
 * `ready`; from there the rider drives it to completion via
 * mark_order_picked_up / mark_order_delivered.
 */
export const nextRiderAction = (order: Order): RiderAction | null => {
  if (order.status === 'ready') return 'pickup';
  if (order.status === 'out_for_delivery') return 'deliver';
  return null;
};

export const isLocationFresh = (
  lastUpdate: number | null,
  now: number,
  staleMs: number = LOCATION_STALE_MS
): boolean => lastUpdate !== null && now - lastUpdate <= staleMs;

/** Dispatch only reaches riders with a real fix, so block going online without one. */
export const canGoOnline = (location: Pick<RiderLocationState, 'permission' | 'coords'>): boolean =>
  location.permission === 'granted' && !!location.coords;

/** Deliveries in the order they were taken on — oldest assignment first. */
export const sortByPickupOrder = (orders: readonly Order[]): Order[] =>
  orders.slice().sort((a, b) => (a.riderAssignedAt ?? 0) - (b.riderAssignedAt ?? 0));
