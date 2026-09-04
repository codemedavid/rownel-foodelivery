import { useCallback } from 'react';
import { analyticsApi } from '../lib/analyticsApi';
import { useLiveQuery } from './useLiveQuery';

export const useSalesSummary = (
  range: { from: Date; to: Date } | null,
  merchantId: string | null,
  enabled: boolean
) => {
  const fromMs = range?.from.getTime() ?? 0;
  const toMs = range?.to.getTime() ?? 0;
  const fetcher = useCallback(
    () => analyticsApi.salesSummary(new Date(fromMs), new Date(toMs), merchantId),
    [fromMs, toMs, merchantId]
  );
  return useLiveQuery(fetcher, [fromMs, toMs, merchantId], {
    enabled: enabled && !!range,
  });
};
