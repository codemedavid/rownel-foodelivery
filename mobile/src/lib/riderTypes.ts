// Rider-facing domain types. Ported from the web app's src/lib/deliveryTypes.ts
// so both clients speak the same shapes. `Order` is reused from adminTypes.

import type { Order, RiderPresenceStatus } from './adminTypes';

export type OfferStatus = 'pending' | 'accepted' | 'rejected' | 'expired';

export type LocationPermission = 'granted' | 'denied' | 'unknown';

export interface OrderOffer {
  id: string;
  orderId: string;
  riderId: string;
  status: OfferStatus;
  /** Epoch ms. */
  offeredAt: number;
  /** Epoch ms; the offer is dead once `Date.now()` passes this. */
  expiresAt: number;
  distanceKm?: number;
  respondedAt?: number;
}

export interface OfferWithOrder {
  offer: OrderOffer;
  order: Order | null;
}

export interface RiderPresence {
  riderId: string;
  latitude: number | null;
  longitude: number | null;
  lastLocationUpdate: number | null;
  status: RiderPresenceStatus;
  locationPermission: LocationPermission;
}

export type PayoutStatus = 'pending' | 'paid' | 'cancelled';

export interface Payout {
  id: string;
  riderId: string;
  amount: number;
  status: PayoutStatus;
  notes?: string;
  periodFrom?: number;
  periodTo?: number;
  createdAt: number;
  paidAt?: number;
}

export interface EarningsSummary {
  totalEarned: number;
  totalPaid: number;
  pendingPayout: number;
  unpaidEarnings: number;
  todayEarnings: number;
  completedCount: number;
  todayCount: number;
}

export interface RiderCoords {
  latitude: number;
  longitude: number;
}

export interface RiderLocationState {
  permission: LocationPermission;
  coords: RiderCoords | null;
  lastUpdate: number | null;
  error: string | null;
}
