import React, { useEffect, useState } from 'react';
import { ChevronRight, Phone, Search } from 'lucide-react';
import type { Order } from '../../lib/deliveryTypes';
import { ordersApi } from '../../lib/deliveryApi';
import { useOrdersByPhone } from '../../hooks/useOrdersData';
import { useAuth } from '../../contexts/AuthContext';
import { readOrderHistory, subscribeToOrderHistory, type LocalOrderRecord } from '../../lib/orderHistory';
import { STATUS_LABELS } from '../../lib/orderStatus';
import { EmptyState, Spinner, formatPeso } from '../ui';

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  confirmed: 'bg-blue-100 text-blue-800',
  preparing: 'bg-orange-100 text-orange-800',
  ready: 'bg-brand-100 text-brand-800',
  out_for_delivery: 'bg-brand-100 text-brand-800',
  completed: 'bg-gray-100 text-gray-700',
  cancelled: 'bg-red-100 text-red-700',
};

export const StatusBadge: React.FC<{ status: string }> = ({ status }) => (
  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[status] ?? 'bg-gray-100 text-gray-700'}`}>
    {STATUS_LABELS[status] ?? status}
  </span>
);

const formatWhen = (ms: number) =>
  new Date(ms).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

const OrderRow: React.FC<{
  title: string;
  subtitle: string;
  when: number;
  total: number;
  status?: string;
  onClick: () => void;
}> = ({ title, subtitle, when, total, status, onClick }) => (
  <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm hover:shadow-md">
    <div className="min-w-0 flex-1">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-bold text-gray-900">{title}</p>
        {status && <StatusBadge status={status} />}
      </div>
      <p className="mt-0.5 truncate text-xs text-gray-500">{subtitle}</p>
      <p className="mt-1 text-xs text-gray-400">{formatWhen(when)}</p>
    </div>
    <div className="flex flex-shrink-0 items-center gap-1">
      <span className="text-sm font-bold text-gray-900">{formatPeso(total)}</span>
      <ChevronRight className="h-4 w-4 text-gray-400" />
    </div>
  </button>
);

/** Orders placed on this device (guest history) plus the account's orders when signed in. */
export const MyOrdersTab: React.FC<{ onSelect: (id: string) => void }> = ({ onSelect }) => {
  const { user } = useAuth();
  const [history, setHistory] = useState<LocalOrderRecord[]>(readOrderHistory);
  const [accountOrders, setAccountOrders] = useState<Order[]>([]);
  const [loadingAccount, setLoadingAccount] = useState(false);

  useEffect(() => subscribeToOrderHistory(() => setHistory(readOrderHistory())), []);

  useEffect(() => {
    if (!user) {
      setAccountOrders([]);
      return;
    }
    let cancelled = false;
    setLoadingAccount(true);
    ordersApi
      .listMine()
      .then((orders) => {
        if (!cancelled) setAccountOrders(orders);
      })
      .catch((err) => console.error('Failed to load account orders:', err))
      .finally(() => {
        if (!cancelled) setLoadingAccount(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const localIds = new Set(history.map((h) => h.orderId));
  const extraAccountOrders = accountOrders.filter((o) => !localIds.has(o.id));

  if (history.length === 0 && extraAccountOrders.length === 0 && !loadingAccount) {
    return <EmptyState emoji="🧾" title="No orders yet" body="Orders you place on this device show up here — no account needed." />;
  }

  return (
    <div className="space-y-3">
      {history.map((record) => (
        <OrderRow
          key={record.orderId}
          title={record.merchantName}
          subtitle={record.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}
          when={record.placedAt}
          total={record.total}
          onClick={() => onSelect(record.orderId)}
        />
      ))}
      {loadingAccount && extraAccountOrders.length === 0 && (
        <div className="flex justify-center py-4"><Spinner className="h-6 w-6" /></div>
      )}
      {extraAccountOrders.length > 0 && (
        <>
          <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-gray-500">From your account</p>
          {extraAccountOrders.map((order) => (
            <OrderRow
              key={order.id}
              title={`Order #${order.id.slice(0, 8).toUpperCase()}`}
              subtitle={order.order_items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}
              when={order.createdAt}
              total={order.total}
              status={order.status}
              onClick={() => onSelect(order.id)}
            />
          ))}
        </>
      )}
    </div>
  );
};

/** Find orders by the mobile number used at checkout (for a new device). */
export const PhoneLookupTab: React.FC<{ onSelect: (id: string) => void }> = ({ onSelect }) => {
  const [phoneInput, setPhoneInput] = useState('');
  const [searchPhone, setSearchPhone] = useState<string | null>(null);
  const { orders, loading } = useOrdersByPhone(searchPhone);

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (phoneInput.trim()) setSearchPhone(phoneInput.trim());
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="tel"
            inputMode="tel"
            value={phoneInput}
            onChange={(e) => setPhoneInput(e.target.value)}
            placeholder="Mobile number used at checkout"
            className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-9 pr-3 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
          />
        </div>
        <button type="submit" aria-label="Find orders" className="rounded-xl bg-brand-600 px-4 text-white hover:bg-brand-700">
          <Search className="h-5 w-5" />
        </button>
      </form>

      {loading && searchPhone && <div className="flex justify-center py-6"><Spinner className="h-6 w-6" /></div>}
      {!loading && searchPhone && orders.length === 0 && <EmptyState emoji="📱" title="No orders found" body="No orders were placed with this number." />}
      {!loading && orders.length > 0 && (
        <div className="space-y-3">
          {orders.map((order) => (
            <OrderRow
              key={order.id}
              title={`Order #${order.id.slice(0, 8).toUpperCase()}`}
              subtitle={order.order_items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}
              when={order.createdAt}
              total={order.total}
              status={order.status}
              onClick={() => onSelect(order.id)}
            />
          ))}
        </div>
      )}
      {!searchPhone && <EmptyState emoji="🔎" title="Find your orders" body="Enter the mobile number you used when ordering." />}
    </div>
  );
};
