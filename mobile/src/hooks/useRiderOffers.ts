import { useCallback, useEffect, useMemo, useState } from 'react';
import { riderOffersApi } from '../lib/riderOffersApi';
import { liveOffers } from '../lib/offerFilters';
import { useLiveQuery } from './useLiveQuery';

const OFFERS_POLL_MS = 15_000;
const COUNTDOWN_TICK_MS = 1_000;

/**
 * Pending offers for the rider. Offers expire in ~30s, so a local 1s tick
 * re-derives the visible list instead of waiting for the next poll.
 */
export const useRiderOffers = (riderId: string | null | undefined, isOnline: boolean) => {
  const enabled = !!riderId && isOnline;

  const fetcher = useCallback(
    () => (riderId ? riderOffersApi.listMine(riderId) : Promise.resolve([])),
    [riderId]
  );

  const { data, isLoading, error, refetch } = useLiveQuery(fetcher, [riderId, isOnline], {
    enabled,
    pollMs: OFFERS_POLL_MS,
    realtime: riderId ? [{ table: 'order_offers', filter: `rider_id=eq.${riderId}` }] : [],
  });

  const [now, setNow] = useState(() => Date.now());
  const pendingCount = data?.length ?? 0;

  useEffect(() => {
    if (pendingCount === 0) return;
    const timer = setInterval(() => setNow(Date.now()), COUNTDOWN_TICK_MS);
    return () => clearInterval(timer);
  }, [pendingCount]);

  const offers = useMemo(() => liveOffers(data ?? [], now), [data, now]);

  return { offers, now, isLoading, error, refetch };
};
