import { supabase } from './supabase';
import { mapStaff } from './adminMappers';
import type { StaffRecord } from './adminTypes';
import { invokeAdminUsers } from './adminUsersFn';

export interface CreateStaffInput {
  email: string;
  password: string;
  name: string;
  merchantIds: string[];
  allMerchants: boolean;
}

const rows = (data: unknown): Record<string, unknown>[] =>
  Array.isArray(data) ? (data as Record<string, unknown>[]) : [];

export const adminStaffApi = {
  async list(): Promise<StaffRecord[]> {
    const { data, error } = await supabase.from('staff').select('*').order('name');
    if (error) throw new Error(error.message);
    return rows(data).map(mapStaff);
  },

  async getMine(userId: string): Promise<StaffRecord | null> {
    const { data, error } = await supabase
      .from('staff')
      .select('*')
      .eq('supabase_user_id', userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapStaff(data as Record<string, unknown>) : null;
  },

  async setActive(staffId: string, isActive: boolean): Promise<void> {
    const { error } = await supabase.from('staff').update({ is_active: isActive }).eq('id', staffId);
    if (error) throw new Error(error.message);
  },

  async updateAccess(
    staffId: string,
    access: { merchantIds: string[]; allMerchants: boolean }
  ): Promise<void> {
    const { error } = await supabase
      .from('staff')
      .update({ merchant_ids: access.merchantIds, all_merchants: access.allMerchants })
      .eq('id', staffId);
    if (error) throw new Error(error.message);
  },

  async create(input: CreateStaffInput): Promise<void> {
    await invokeAdminUsers({ action: 'create-staff', ...input });
  },
};
