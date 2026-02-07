import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface Promotion {
  id: string;
  title: string;
  subtitle: string | null;
  cta_text: string | null;
  cta_link: string | null;
  banner_image_url: string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export const usePromotions = () => {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPromotions = async () => {
    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('promotions')
        .select('*')
        .eq('active', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setPromotions(data || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching promotions:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch promotions');
    } finally {
      setLoading(false);
    }
  };

  const fetchAllPromotions = async () => {
    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('promotions')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setPromotions(data || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching all promotions:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch promotions');
    } finally {
      setLoading(false);
    }
  };

  const addPromotion = async (
    promotion: Omit<Promotion, 'id' | 'created_at' | 'updated_at'>
  ) => {
    const { data, error: insertError } = await supabase
      .from('promotions')
      .insert(promotion)
      .select('*')
      .single();

    if (insertError) throw insertError;

    await fetchAllPromotions();
    return data;
  };

  const updatePromotion = async (id: string, updates: Partial<Promotion>) => {
    const { error: updateError } = await supabase
      .from('promotions')
      .update(updates)
      .eq('id', id);

    if (updateError) throw updateError;

    await fetchAllPromotions();
  };

  const deletePromotion = async (id: string) => {
    const { error: deleteError } = await supabase
      .from('promotions')
      .delete()
      .eq('id', id);

    if (deleteError) throw deleteError;

    await fetchAllPromotions();
  };

  useEffect(() => {
    fetchPromotions();
  }, []);

  return {
    promotions,
    loading,
    error,
    addPromotion,
    updatePromotion,
    deletePromotion,
    refetch: fetchPromotions,
    refetchAll: fetchAllPromotions,
  };
};
