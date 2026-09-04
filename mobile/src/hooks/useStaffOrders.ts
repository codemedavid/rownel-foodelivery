import { useCallback, useMemo } from 'react';
import { adminOrdersApi } from '../lib/adminOrdersApi';
import type { RoleContext } from '../lib/roles';
import { useLiveQuery, type RealtimeSource } from './useLiveQuery';

const ORDERS_POLL_MS = 60_000;

/** Live order list scoped to the caller's merchants (admin sees everything). */
export const useStaffOrders = (ctx: RoleContext) => {
  const merchantKey = ctx.merchantIds.join(',');

  const fetcher = useCallback(
    () => (ctx.isAdmin ? adminOrdersApi.listAll() : adminOrdersApi.listByMerchants(ctx.merchantIds)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx.isAdmin, merchantKey]
  );

  const realtime = useMemo<RealtimeSource[]>(
    () =>
      ctx.isAdmin
        ? [{ table: 'orders' }]
        : ctx.merchantIds.map((id) => ({ table: 'orders', filter: `merchant_id=eq.${id}` })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx.isAdmin, merchantKey]
  );

  const { data, isLoading, error, refetch } = useLiveQuery(fetcher, [ctx.isAdmin, merchantKey], {
    pollMs: ORDERS_POLL_MS,
    realtime,
    enabled: ctx.isStaff,
  });

  return { orders: data ?? [], isLoading, error, refetch };
};
