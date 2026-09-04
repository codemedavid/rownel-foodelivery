import React, { useEffect, useState } from 'react';
import { Bike, RefreshCw } from 'lucide-react';
import { ordersApi, ridersApi } from '../lib/deliveryApi';
import type { Order, RiderSummary } from '../lib/deliveryTypes';

interface Props {
  order: Order;
  /** Called after a successful assign/unassign so the parent can refresh. */
  onChanged?: () => void;
}

const REASSIGNABLE_STATUSES = new Set(['pending', 'confirmed', 'preparing', 'ready']);

const presenceLabel = (rider: RiderSummary): string => {
  const load = `${rider.activeOrderCount}/${rider.maxOrders}`;
  return `${rider.name} · ${rider.presenceStatus} · ${load}`;
};

/**
 * Manual rider assignment for delivery orders (override on top of
 * auto-dispatch). Riders at capacity are listed but disabled.
 */
const AssignRiderSelect: React.FC<Props> = ({ order, onChanged }) => {
  const [riders, setRiders] = useState<RiderSummary[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canEdit = order.serviceType === 'delivery' && REASSIGNABLE_STATUSES.has(order.status);

  const loadRiders = async () => {
    setIsLoading(true);
    setError(null);
    try {
      setRiders(await ridersApi.listForAssignment());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load riders');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (canEdit) loadRiders();
  }, [canEdit, order.id]);

  if (!canEdit) return null;

  const run = async (action: () => Promise<void>) => {
    setIsBusy(true);
    setError(null);
    try {
      await action();
      setSelectedId('');
      onChanged?.();
      await loadRiders();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Bike className="h-4 w-4 text-gray-600" />
        <span className="font-semibold text-gray-900">
          {order.assignedRiderId ? 'Reassign rider' : 'Assign rider'}
        </span>
        <button
          type="button"
          onClick={loadRiders}
          disabled={isLoading}
          className="ml-auto text-gray-500 hover:text-gray-800 disabled:opacity-50"
          aria-label="Refresh riders"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          disabled={isBusy || isLoading}
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
          aria-label="Rider"
        >
          <option value="">Select a rider…</option>
          {riders.map((rider) => {
            const atCapacity = rider.activeOrderCount >= rider.maxOrders;
            return (
              <option key={rider.id} value={rider.id} disabled={atCapacity || rider.id === order.assignedRiderId}>
                {presenceLabel(rider)}{atCapacity ? ' (full)' : ''}
              </option>
            );
          })}
        </select>
        <button
          type="button"
          disabled={!selectedId || isBusy}
          onClick={() => run(() => ordersApi.assignRider(order.id, selectedId))}
          className="px-4 py-2 rounded-md bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 disabled:opacity-50"
        >
          {isBusy ? 'Saving…' : 'Assign'}
        </button>
        {order.assignedRiderId && (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => {
              if (window.confirm('Remove the assigned rider? Auto-dispatch will retry if the order is ready.')) {
                run(() => ordersApi.unassignRider(order.id));
              }
            }}
            className="px-4 py-2 rounded-md border border-red-300 text-red-700 text-sm font-semibold hover:bg-red-50 disabled:opacity-50"
          >
            Remove rider
          </button>
        )}
      </div>
      {riders.length === 0 && !isLoading && !error && (
        <p className="text-xs text-gray-500 mt-2">No approved, active riders available.</p>
      )}
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
};

export default AssignRiderSelect;
