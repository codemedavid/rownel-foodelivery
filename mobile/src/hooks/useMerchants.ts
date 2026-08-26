import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { mapMerchantRow } from '../lib/mappers';
import { Merchant } from '../types';

export const useMerchants = () => {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMerchants = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data, error: fetchError } = await supabase
        .from('merchants')
        .select('*')
        .eq('active', true)
        .order('featured', { ascending: false })
        .order('name', { ascending: true });

      if (fetchError) throw fetchError;

      setMerchants((data ?? []).map(mapMerchantRow));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load restaurants');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMerchants();
  }, [fetchMerchants]);

  return { merchants, isLoading, error, refetch: fetchMerchants };
};

export const useMerchant = (id: string | undefined) => {
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let isActive = true;

    (async () => {
      try {
        setIsLoading(true);
        const { data, error: fetchError } = await supabase
          .from('merchants')
          .select('*')
          .eq('id', id)
          .eq('active', true)
          .single();

        if (fetchError) throw fetchError;
        if (isActive) {
          setMerchant(data ? mapMerchantRow(data) : null);
          setError(null);
        }
      } catch (err) {
        if (isActive) setError(err instanceof Error ? err.message : 'Failed to load restaurant');
      } finally {
        if (isActive) setIsLoading(false);
      }
    })();

    return () => {
      isActive = false;
    };
  }, [id]);

  return { merchant, isLoading, error };
};
