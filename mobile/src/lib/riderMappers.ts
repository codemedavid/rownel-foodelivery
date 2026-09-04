// Row -> domain mappers for the rider surface (snake_case + ISO -> camelCase + epoch ms).
// Mirrors adminMappers.ts; `my_earnings_summary` already returns camelCase jsonb,
// but numerics can arrive as strings, so every field is coerced defensively.

import { mapOrder } from './adminMappers';
import type { RiderPresenceStatus } from './adminTypes';
import type {
  EarningsSummary,
  LocationPermission,
  OfferWithOrder,
  OrderOffer,
  Payout,
  RiderPresence,
} from './riderTypes';

type Row = Record<string, unknown>;

const ms = (v: unknown): number | undefined =>
  typeof v === 'string' && v ? new Date(v).getTime() : undefined;

const num = (v: unknown): number | undefined => (v == null ? undefined : Number(v));

const str = (v: unknown): string | undefined => (v == null ? undefined : String(v));

const zero = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const mapOffer = (row: Row): OrderOffer => ({
  id: String(row.id),
  orderId: String(row.order_id ?? ''),
  riderId: String(row.rider_id ?? ''),
  status: (row.status as OrderOffer['status']) ?? 'pending',
  offeredAt: ms(row.offered_at) ?? 0,
  expiresAt: ms(row.expires_at) ?? 0,
  distanceKm: num(row.distance_km),
  respondedAt: ms(row.responded_at),
});

export const mapOfferWithOrder = (row: Row): OfferWithOrder => ({
  offer: mapOffer(row),
  order: row.orders && typeof row.orders === 'object' ? mapOrder(row.orders as Row) : null,
});

export const mapPresence = (row: Row): RiderPresence => ({
  riderId: String(row.rider_id ?? ''),
  latitude: num(row.latitude) ?? null,
  longitude: num(row.longitude) ?? null,
  lastLocationUpdate: ms(row.last_location_update) ?? null,
  status: (row.status as RiderPresenceStatus) ?? 'offline',
  locationPermission: (row.location_permission as LocationPermission) ?? 'unknown',
});

export const mapEarningsSummary = (payload: unknown): EarningsSummary => {
  const row = (payload && typeof payload === 'object' ? payload : {}) as Row;
  return {
    totalEarned: zero(row.totalEarned),
    totalPaid: zero(row.totalPaid),
    pendingPayout: zero(row.pendingPayout),
    unpaidEarnings: zero(row.unpaidEarnings),
    todayEarnings: zero(row.todayEarnings),
    completedCount: zero(row.completedCount),
    todayCount: zero(row.todayCount),
  };
};

export const mapPayout = (row: Row): Payout => ({
  id: String(row.id),
  riderId: String(row.rider_id ?? ''),
  amount: zero(row.amount),
  status: (row.status as Payout['status']) ?? 'pending',
  notes: str(row.notes),
  periodFrom: ms(row.period_from),
  periodTo: ms(row.period_to),
  createdAt: ms(row.created_at) ?? 0,
  paidAt: ms(row.paid_at),
});
