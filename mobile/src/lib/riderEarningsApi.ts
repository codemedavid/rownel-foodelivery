import { supabase } from './supabase';
import { mapEarningsSummary, mapPayout } from './riderMappers';
import type { EarningsSummary, Payout } from './riderTypes';

const rows = (data: unknown): Record<string, unknown>[] =>
  Array.isArray(data) ? (data as Record<string, unknown>[]) : [];

export const riderEarningsApi = {
  /**
   * Earnings for one rider. The RPC authorises the caller itself: riders may
   * only read their own row, admins may read any (the "view as" preview).
   */
  async summary(riderId: string): Promise<EarningsSummary> {
    const { data, error } = await supabase.rpc('rider_earnings_summary', { p_rider_id: riderId });
    if (error) throw new Error(error.message);
    return mapEarningsSummary(data);
  },

  async listPayouts(riderId: string): Promise<Payout[]> {
    const { data, error } = await supabase
      .from('payouts')
      .select('*')
      .eq('rider_id', riderId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return rows(data).map(mapPayout);
  },
};
