import { supabase } from './supabase';
import { shapeSalesSummary } from './analytics';
import type { SalesSummary } from './adminTypes';

export const analyticsApi = {
  async salesSummary(from: Date, to: Date, merchantId?: string | null): Promise<SalesSummary> {
    const { data, error } = await supabase.rpc('admin_sales_summary', {
      p_from: from.toISOString(),
      p_to: to.toISOString(),
      p_merchant_id: merchantId ?? null,
    });
    if (error) throw new Error(error.message);
    return shapeSalesSummary(data);
  },
};
