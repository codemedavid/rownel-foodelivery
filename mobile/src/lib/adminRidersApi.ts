import { supabase } from './supabase';
import { mapRider, mapRiderSummary } from './adminMappers';
import type { RiderPresenceStatus, RiderRecord, RiderSummary } from './adminTypes';
import { invokeAdminUsers } from './adminUsersFn';

export interface RiderPresenceRow {
  riderId: string;
  status: RiderPresenceStatus;
  lastLocationUpdate: number | null;
}

export interface CreateRiderInput {
  email: string;
  password: string;
  name: string;
  phone: string;
  plateNumber: string;
  vehicleType: string;
}

const rows = (data: unknown): Record<string, unknown>[] =>
  Array.isArray(data) ? (data as Record<string, unknown>[]) : [];

export const adminRidersApi = {
  async listForAssignment(): Promise<RiderSummary[]> {
    const { data, error } = await supabase.rpc('list_riders_for_assignment');
    if (error) throw new Error(error.message);
    return rows(data).map(mapRiderSummary);
  },

  async listAll(): Promise<RiderRecord[]> {
    const { data, error } = await supabase.from('riders').select('*').order('name');
    if (error) throw new Error(error.message);
    return rows(data).map(mapRider);
  },

  async listPresence(): Promise<RiderPresenceRow[]> {
    const { data, error } = await supabase
      .from('rider_presence')
      .select('rider_id, status, last_location_update');
    if (error) throw new Error(error.message);
    return rows(data).map((row) => ({
      riderId: String(row.rider_id),
      status: (row.status as RiderPresenceStatus) ?? 'offline',
      lastLocationUpdate:
        typeof row.last_location_update === 'string'
          ? new Date(row.last_location_update).getTime()
          : null,
    }));
  },

  async setApproved(riderId: string, isApproved: boolean): Promise<void> {
    const { error } = await supabase
      .from('riders')
      .update({ is_approved: isApproved, updated_at: new Date().toISOString() })
      .eq('id', riderId);
    if (error) throw new Error(error.message);
  },

  async setActive(riderId: string, isActive: boolean): Promise<void> {
    const { error } = await supabase
      .from('riders')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', riderId);
    if (error) throw new Error(error.message);
  },

  async forceOffline(riderId: string): Promise<void> {
    const { error } = await supabase.rpc('admin_set_rider_offline', { p_rider_id: riderId });
    if (error) throw new Error(error.message);
  },

  async create(input: CreateRiderInput): Promise<void> {
    await invokeAdminUsers({ action: 'create-rider', ...input });
  },
};
