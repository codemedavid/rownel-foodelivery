import { supabase } from './supabase';
import { mapPresence } from './riderMappers';
import type { LocationPermission, RiderPresence } from './riderTypes';

export const riderPresenceApi = {
  async getMine(riderId: string): Promise<RiderPresence | null> {
    const { data, error } = await supabase
      .from('rider_presence')
      .select('*')
      .eq('rider_id', riderId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapPresence(data as Record<string, unknown>) : null;
  },

  async setOnline(isOnline: boolean): Promise<void> {
    const { error } = await supabase.rpc('rider_set_online', { p_online: isOnline });
    if (error) throw new Error(error.message);
  },

  async updateLocation(latitude: number, longitude: number): Promise<void> {
    const { error } = await supabase.rpc('rider_update_location', {
      p_latitude: latitude,
      p_longitude: longitude,
    });
    if (error) throw new Error(error.message);
  },

  async setLocationPermission(permission: LocationPermission): Promise<void> {
    const { error } = await supabase.rpc('rider_set_location_permission', {
      p_permission: permission,
    });
    if (error) throw new Error(error.message);
  },
};
