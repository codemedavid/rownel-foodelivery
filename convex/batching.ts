export interface BatchSettings {
  maxConcurrentOrdersPerRider: number;
  batchTimeWindowMs: number;
  batchProximityKm: number;
}

export interface ActiveOrder {
  merchantId: string;
  merchantLatitude?: number | null;
  merchantLongitude?: number | null;
  riderAssignedAt?: number | null;
  deliveryMode?: "priority" | "economy" | null;
}

export interface CandidateOrder {
  merchantId: string;
  merchantLatitude?: number | null;
  merchantLongitude?: number | null;
  deliveryMode?: "priority" | "economy" | null;
}

export type BatchResult = { ok: true } | { ok: false; reason: string };

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Returns whether a rider with the given active orders may accept a new
 * candidate order, based on batching rules:
 *
 * - Idle riders (no active orders) always pass.
 * - Capacity: rider must be under maxConcurrentOrdersPerRider.
 * - Priority cross-merchant: a priority order never stacks across merchants
 *   (neither a priority candidate onto a busy rider, nor any order onto a
 *   rider already carrying a priority order cross-merchant).
 * - Time gate: the most recent riderAssignedAt must be within batchTimeWindowMs.
 * - Spatial gate (AND with time): candidate merchant must share merchantId with
 *   one of the active orders, OR be within batchProximityKm of one.
 */
export function canBatchForRider(
  activeOrders: ActiveOrder[],
  candidate: CandidateOrder,
  settings: BatchSettings,
  now = Date.now()
): BatchResult {
  if (activeOrders.length === 0) return { ok: true };

  if (activeOrders.length >= settings.maxConcurrentOrdersPerRider) {
    return { ok: false, reason: "Rider is at full capacity" };
  }

  const isCandidatePriority = candidate.deliveryMode === "priority";
  const hasSameMerchant = activeOrders.some((o) => o.merchantId === candidate.merchantId);

  // Priority candidate across merchants — needs a fresh rider
  if (isCandidatePriority && !hasSameMerchant) {
    return { ok: false, reason: "Priority orders require a free rider or same-merchant pickup" };
  }

  // Rider carrying a priority order from a different merchant — they're on a rush
  const hasActivePriority = activeOrders.some((o) => o.deliveryMode === "priority");
  if (hasActivePriority && !hasSameMerchant) {
    return { ok: false, reason: "Rider has a priority order in progress" };
  }

  // Time gate: last accept must be within the batch window
  const lastAssignedAt = Math.max(...activeOrders.map((o) => o.riderAssignedAt ?? 0));
  if (now - lastAssignedAt > settings.batchTimeWindowMs) {
    return { ok: false, reason: "Last accepted order is too old to batch" };
  }

  // Spatial gate: same merchant satisfies it; otherwise proximity check
  if (hasSameMerchant) return { ok: true };

  const candidateLat = candidate.merchantLatitude;
  const candidateLng = candidate.merchantLongitude;
  if (candidateLat == null || candidateLng == null) {
    return { ok: false, reason: "Candidate order has no merchant coordinates" };
  }

  const withinProximity = activeOrders.some((order) => {
    if (order.merchantLatitude == null || order.merchantLongitude == null) return false;
    return (
      haversineKm(candidateLat, candidateLng, order.merchantLatitude, order.merchantLongitude) <=
      settings.batchProximityKm
    );
  });

  if (!withinProximity) {
    return { ok: false, reason: "Merchants too far apart to batch" };
  }

  return { ok: true };
}
