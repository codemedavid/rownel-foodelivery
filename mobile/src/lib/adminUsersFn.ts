import { supabase } from './supabase';

type AdminUsersBody =
  | {
      action: 'create-staff';
      email: string;
      password: string;
      name: string;
      merchantIds: string[];
      allMerchants?: boolean;
    }
  | {
      action: 'create-rider';
      email: string;
      password: string;
      name: string;
      phone: string;
      plateNumber: string;
      vehicleType: string;
      paymentMode?: 'fixed' | 'percentage';
      paymentValue?: number;
    }
  | { action: 'set-role'; userId: string; role: 'staff' | 'rider' };

/** Calls the admin-users edge function and surfaces its error message. */
export const invokeAdminUsers = async <T = unknown>(body: AdminUsersBody): Promise<T> => {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error) {
    const context = (error as { context?: Response }).context;
    if (context && typeof context.json === 'function') {
      try {
        const payload = (await context.json()) as { error?: string };
        if (payload?.error) throw new Error(payload.error);
      } catch (parseErr) {
        if (parseErr instanceof Error && parseErr.message !== error.message) throw parseErr;
      }
    }
    throw new Error(error.message || 'Admin request failed');
  }
  const payload = data as { error?: string } | null;
  if (payload?.error) throw new Error(payload.error);
  return data as T;
};
