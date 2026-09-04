import { useCallback } from 'react';
import { riderPresenceApi } from '../lib/riderPresenceApi';
import { useLiveQuery } from './useLiveQuery';

const PRESENCE_POLL_MS = 30_000;

/** Live presence row for the signed-in rider (online/offline + last fix). */
export const useRiderPresence = (riderId: string | null | undefined) => {
  const fetcher = useCallback(
    () => (riderId ? riderPresenceApi.getMine(riderId) : Promise.resolve(null)),
    [riderId]
  );

  const { data, isLoading, error, refetch } = useLiveQuery(fetcher, [riderId], {
    enabled: !!riderId,
    pollMs: PRESENCE_POLL_MS,
    realtime: riderId ? [{ table: 'rider_presence', filter: `rider_id=eq.${riderId}` }] : [],
  });

  const status = data?.status ?? 'offline';
  return { presence: data, isOnline: status === 'available' || status === 'busy', isLoading, error, refetch };
};
