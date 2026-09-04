import { supabase } from './supabase';
import { mapOfferWithOrder } from './riderMappers';
import type { OfferWithOrder } from './riderTypes';

const OFFER_WITH_ORDER = '*, orders(*, order_items(*))';

const rows = (data: unknown): Record<string, unknown>[] =>
  Array.isArray(data) ? (data as Record<string, unknown>[]) : [];

export const riderOffersApi = {
  /** Pending, unexpired offers for the signed-in rider. */
  async listMine(riderId: string): Promise<OfferWithOrder[]> {
    const { data, error } = await supabase
      .from('order_offers')
      .select(OFFER_WITH_ORDER)
      .eq('rider_id', riderId)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString());
    if (error) throw new Error(error.message);
    return rows(data).map(mapOfferWithOrder);
  },

  /** Returns the accepted order id. Races are resolved server-side. */
  async accept(offerId: string): Promise<string> {
    const { data, error } = await supabase.rpc('accept_offer', { p_offer_id: offerId });
    if (error) throw new Error(error.message);
    return String(data);
  },

  async reject(offerId: string): Promise<void> {
    const { error } = await supabase.rpc('reject_offer', { p_offer_id: offerId });
    if (error) throw new Error(error.message);
  },
};
