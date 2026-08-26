import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { mapMenuItemRow } from '../lib/mappers';
import { MenuItem } from '../types';

export const useMenu = (merchantId: string | undefined) => {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMenu = useCallback(async () => {
    if (!merchantId) return;
    try {
      setIsLoading(true);
      const { data, error: fetchError } = await supabase
        .from('menu_items')
        .select('*, variations (*), variation_groups (*), add_ons (*)')
        .eq('merchant_id', merchantId)
        .order('created_at', { ascending: true });

      if (fetchError) throw fetchError;

      setMenuItems((data ?? []).map((row) => mapMenuItemRow(row)));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load menu');
    } finally {
      setIsLoading(false);
    }
  }, [merchantId]);

  useEffect(() => {
    fetchMenu();
  }, [fetchMenu]);

  return { menuItems, isLoading, error, refetch: fetchMenu };
};
