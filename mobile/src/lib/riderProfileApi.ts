import { supabase } from './supabase';
import { mapRider } from './adminMappers';
import type { RiderRecord } from './adminTypes';

export interface RiderProfilePatch {
  name?: string;
  phone?: string;
}

export const riderProfileApi = {
  async getMine(riderId: string): Promise<RiderRecord | null> {
    const { data, error } = await supabase
      .from('riders')
      .select('*')
      .eq('id', riderId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapRider(data as Record<string, unknown>) : null;
  },

  async update(riderId: string, patch: RiderProfilePatch): Promise<void> {
    const { error } = await supabase
      .from('riders')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', riderId);
    if (error) throw new Error(error.message);
  },
};
