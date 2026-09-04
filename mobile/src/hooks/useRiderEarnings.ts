import { useCallback } from 'react';
import { riderEarningsApi } from '../lib/riderEarningsApi';
import { useLiveQuery } from './useLiveQuery';

const EARNINGS_POLL_MS = 60_000;

/** Earnings summary plus payout history for the signed-in rider. */
export const useRiderEarnings = (riderId: string | null | undefined) => {
  const fetcher = useCallback(async () => {
    if (!riderId) return null;
    const [summary, payouts] = await Promise.all([
      riderEarningsApi.summary(),
      riderEarningsApi.listPayouts(riderId),
    ]);
    return { summary, payouts };
  }, [riderId]);

  const { data, isLoading, error, refetch } = useLiveQuery(fetcher, [riderId], {
    enabled: !!riderId,
    pollMs: EARNINGS_POLL_MS,
    realtime: riderId ? [{ table: 'payouts', filter: `rider_id=eq.${riderId}` }] : [],
  });

  return { summary: data?.summary ?? null, payouts: data?.payouts ?? [], isLoading, error, refetch };
};
