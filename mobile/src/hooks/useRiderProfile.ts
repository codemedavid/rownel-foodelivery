import { useCallback } from 'react';
import { riderProfileApi } from '../lib/riderProfileApi';
import { useLiveQuery } from './useLiveQuery';

/** The signed-in rider's own `riders` row. */
export const useRiderProfile = (riderId: string | null | undefined) => {
  const fetcher = useCallback(
    () => (riderId ? riderProfileApi.getMine(riderId) : Promise.resolve(null)),
    [riderId]
  );

  const { data, isLoading, error, refetch } = useLiveQuery(fetcher, [riderId], {
    enabled: !!riderId,
    realtime: riderId ? [{ table: 'riders', filter: `id=eq.${riderId}` }] : [],
  });

  return { profile: data, isLoading, error, refetch };
};
