import { useCallback } from 'react';
import { adminRidersApi } from '../lib/adminRidersApi';
import { sortRidersForAssignment } from '../lib/riderSorting';
import { useLiveQuery } from './useLiveQuery';

export const useRidersForAssignment = (enabled: boolean) => {
  const fetcher = useCallback(async () => sortRidersForAssignment(await adminRidersApi.listForAssignment()), []);
  const { data, isLoading, error, refetch } = useLiveQuery(fetcher, [], {
    enabled,
    realtime: enabled ? [{ table: 'rider_presence' }, { table: 'orders' }] : [],
  });
  return { riders: data ?? [], isLoading, error, refetch };
};
