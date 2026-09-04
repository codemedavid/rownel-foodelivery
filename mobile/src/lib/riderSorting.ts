import type { RiderPresenceStatus, RiderSummary } from './adminTypes';

const PRESENCE_RANK: Record<RiderPresenceStatus, number> = { available: 0, busy: 1, offline: 2 };

export const isRiderAtCapacity = (rider: RiderSummary): boolean =>
  rider.activeOrderCount >= rider.maxOrders;

/** Available riders first, then by current load, then by name. Pure. */
export const sortRidersForAssignment = (riders: readonly RiderSummary[]): RiderSummary[] =>
  [...riders].sort(
    (a, b) =>
      PRESENCE_RANK[a.presenceStatus] - PRESENCE_RANK[b.presenceStatus] ||
      a.activeOrderCount - b.activeOrderCount ||
      a.name.localeCompare(b.name)
  );
