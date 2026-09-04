import { useCallback } from 'react';
import { riderOrdersApi } from '../lib/riderOrdersApi';
import { sortByPickupOrder } from '../lib/riderActions';
import { useLiveQuery } from './useLiveQuery';

const ORDERS_POLL_MS = 30_000;

/** Deliveries the rider is carrying, oldest assignment first. */
export const useRiderDeliveries = (riderId: string | null | undefined) => {
  const fetcher = useCallback(
    () => (riderId ? riderOrdersApi.listActive(riderId) : Promise.resolve([])),
    [riderId]
  );

  const { data, isLoading, error, refetch } = useLiveQuery(fetcher, [riderId], {
    enabled: !!riderId,
    pollMs: ORDERS_POLL_MS,
    realtime: riderId ? [{ table: 'orders', filter: `assigned_rider_id=eq.${riderId}` }] : [],
  });

  return { deliveries: sortByPickupOrder(data ?? []), isLoading, error, refetch };
};
