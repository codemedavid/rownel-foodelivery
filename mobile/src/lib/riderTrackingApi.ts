// Rider positions for the maps a customer and an admin watch.
//
// Both calls go through RPCs rather than selecting from rider_presence, because
// a customer is not allowed to read that table — get_rider_presence exposes only
// the assigned rider's position, and available_rider_locations exposes position
// without identity. The web app uses exactly these two.

import { supabase } from './supabase';

export interface TrackedRiderPresence {
  status: string;
  latitude: number | null;
  longitude: number | null;
  /** Epoch ms of the last position write, for the "updated Ns ago" line. */
  lastLocationUpdate: number | null;
}

export interface AvailableRiderLocation {
  id: string;
  latitude: number;
  longitude: number;
}

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toEpochMs = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || !value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

export const riderTrackingApi = {
  /** The assigned rider's live position. Null before they have shared one. */
  async getPresence(riderId: string): Promise<TrackedRiderPresence | null> {
    const { data, error } = await supabase.rpc('get_rider_presence', { p_rider_id: riderId });
    if (error) throw new Error(error.message);
    if (!data) return null;

    const row = data as Record<string, unknown>;
    return {
      status: typeof row.status === 'string' ? row.status : 'offline',
      latitude: toNumber(row.currentLatitude),
      longitude: toNumber(row.currentLongitude),
      lastLocationUpdate: toEpochMs(row.lastLocationUpdate),
    };
  },

  /** Positions of riders currently available, with no identity attached. */
  async listAvailableLocations(): Promise<AvailableRiderLocation[]> {
    const { data, error } = await supabase.rpc('available_rider_locations');
    if (error) throw new Error(error.message);

    return ((data as Record<string, unknown>[]) ?? [])
      .map((row) => {
        const latitude = toNumber(row.latitude);
        const longitude = toNumber(row.longitude);
        if (latitude === null || longitude === null) return null;
        return { id: String(row.id), latitude, longitude };
      })
      .filter((rider): rider is AvailableRiderLocation => rider !== null);
  },
};
