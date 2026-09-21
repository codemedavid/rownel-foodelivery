import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Bike } from 'lucide-react';
import { ordersApi } from '../../lib/deliveryApi';
import { readActiveOrderIds, readOrderHistory, subscribeToOrderHistory } from '../../lib/orderHistory';
import { STATUS_LABELS, isTerminalStatus } from '../../lib/orderStatus';
import { useOrderRealtime } from '../../hooks/useOrderRealtime';

const REFRESH_MS = 30_000;

interface ActiveOrderSummary {
  orderId: string;
  merchantName: string;
  status: string;
}

/**
 * Grab-style "order in progress" card on Home. Works for guests: reads the
 * device's order history and shows the most recent order still in flight.
 */
const ActiveOrdersBanner: React.FC = () => {
  const navigate = useNavigate();
  const [active, setActive] = useState<ActiveOrderSummary | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const ids = readActiveOrderIds();
      if (ids.length === 0) {
        setActive(null);
        return;
      }
      const history = readOrderHistory();
      const results = await Promise.allSettled(ids.map((id) => ordersApi.getPublicById(id)));
      if (cancelled) return;
      for (let i = 0; i < ids.length; i += 1) {
        const result = results[i];
        if (result.status !== 'fulfilled' || !result.value) continue;
        if (isTerminalStatus(result.value.status)) continue;
        const record = history.find((r) => r.orderId === ids[i]);
        setActive({ orderId: ids[i], merchantName: record?.merchantName ?? 'Your order', status: result.value.status });
        return;
      }
      setActive(null);
    };

    load().catch(() => undefined);
    const interval = setInterval(() => load().catch(() => undefined), REFRESH_MS);
    const unsubscribe = subscribeToOrderHistory(() => load().catch(() => undefined));
    return () => {
      cancelled = true;
      clearInterval(interval);
      unsubscribe();
    };
  }, []);

  useOrderRealtime(active?.orderId ?? null, (payload) => {
    setActive((prev) => {
      if (!prev || prev.orderId !== payload.orderId) return prev;
      return isTerminalStatus(payload.status) ? null : { ...prev, status: payload.status };
    });
  });

  if (!active) return null;

  return (
    <button
      type="button"
      onClick={() => navigate(`/track/${active.orderId}`)}
      className="flex w-full items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-3 text-left shadow-sm"
    >
      <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-brand-600 text-white">
        <Bike className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold uppercase tracking-wide text-brand-700">Order in progress</span>
        <span className="block truncate text-sm font-bold text-gray-900">{active.merchantName}</span>
        <span className="block text-xs text-gray-600">{STATUS_LABELS[active.status] ?? active.status}</span>
      </span>
      <ChevronRight className="h-5 w-5 flex-shrink-0 text-brand-700" />
    </button>
  );
};

export default ActiveOrdersBanner;
