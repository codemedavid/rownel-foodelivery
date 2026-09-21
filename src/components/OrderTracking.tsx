import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Bell, BellOff, MapPin, Store, X, Search } from 'lucide-react';
import { useOrderById } from '../hooks/useOrdersData';
import { useOrderRealtime } from '../hooks/useOrderRealtime';
import { useMerchant } from '../contexts/MerchantContext';
import { notificationPermission, requestNotificationPermission } from '../lib/notificationUtils';
import CustomerRiderPanel from './CustomerRiderPanel';
import OrderStatusCard from './tracking/OrderStatusCard';
import { MyOrdersTab, PhoneLookupTab } from './tracking/OrderLists';
import { EmptyState, Spinner, formatPeso } from './ui';

type Tab = 'mine' | 'phone';
const NOTIFY_PROMPT_DISMISSED_KEY = 'rownel:notify-prompt-dismissed';

/**
 * Prompt to enable system notifications. Must be triggered by a tap, so it
 * appears as a banner rather than firing automatically. In-app toasts and
 * sound work regardless, so this is an upgrade rather than a requirement.
 */
const NotificationPrompt: React.FC<{ emphasised: boolean }> = ({ emphasised }) => {
  const [permission, setPermission] = useState(notificationPermission);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(NOTIFY_PROMPT_DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  });

  if (permission !== 'default' || (dismissed && !emphasised)) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(NOTIFY_PROMPT_DISMISSED_KEY, '1');
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-3">
      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-brand-600 text-white">
        <Bell className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900">Get notified about this order</p>
        <p className="text-xs text-gray-600">We’ll alert you when it’s confirmed and when the rider is on the way, even if this tab is in the background.</p>
      </div>
      <button
        type="button"
        onClick={async () => setPermission(await requestNotificationPermission())}
        className="flex-shrink-0 rounded-xl bg-brand-600 px-3 py-2 text-xs font-semibold text-white"
      >
        Turn on
      </button>
      <button type="button" onClick={dismiss} aria-label="Dismiss" className="flex-shrink-0 rounded-full p-1 text-gray-400 hover:bg-white">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

const OrderTracking: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { merchants } = useMerchant();
  const justPlaced = Boolean((location.state as { justPlaced?: boolean } | null)?.justPlaced);
  const [tab, setTab] = useState<Tab>('mine');
  const [lookupId, setLookupId] = useState('');

  const { order, loading, refetch } = useOrderById(orderId ?? null);
  const { isSubscribed } = useOrderRealtime(orderId ?? null, () => refetch());

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [orderId]);

  const merchant = order ? merchants.find((m) => m.id === order.merchantId) : undefined;

  if (!orderId) {
    return (
      <main className="min-h-screen bg-gray-50 pb-24">
        <div className="sticky top-0 z-30 border-b border-gray-100 bg-white">
          <div className="mx-auto max-w-2xl px-4 pt-4">
            <h1 className="text-lg font-bold text-gray-900">My orders</h1>
            <div className="mt-3 flex gap-6">
              {(
                [
                  { key: 'mine', label: 'This device' },
                  { key: 'phone', label: 'Find by number' },
                ] as const
              ).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`border-b-2 pb-2 text-sm font-semibold ${tab === t.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mx-auto max-w-2xl space-y-4 px-4 py-4">
          <NotificationPrompt emphasised={false} />
          {tab === 'mine' ? <MyOrdersTab onSelect={(id) => navigate(`/track/${id}`)} /> : <PhoneLookupTab onSelect={(id) => navigate(`/track/${id}`)} />}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (lookupId.trim()) navigate(`/track/${lookupId.trim()}`);
            }}
            className="flex gap-2 pt-2"
          >
            <input
              type="text"
              value={lookupId}
              onChange={(e) => setLookupId(e.target.value)}
              placeholder="Have an order ID? Paste it here"
              className="flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
            />
            <button type="submit" aria-label="Track order id" className="rounded-xl border border-gray-200 bg-white px-3 text-gray-700">
              <Search className="h-4 w-4" />
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-24">
      <div className="sticky top-0 z-30 border-b border-gray-100 bg-white">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-3 py-3">
          <button type="button" onClick={() => navigate('/orders')} aria-label="Back to orders" className="rounded-full p-2 text-gray-700 hover:bg-gray-100">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-bold text-gray-900">Track order</h1>
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-4 px-4 py-4">
        {loading && !order && <div className="flex justify-center py-12"><Spinner /></div>}

        {!loading && !order && (
          <EmptyState
            emoji="🔍"
            title="Order not found"
            body={`We couldn’t find an order with ID ${orderId}.`}
            action={<button type="button" onClick={() => navigate('/orders')} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white">Back to my orders</button>}
          />
        )}

        {order && (
          <>
            {justPlaced && (
              <div className="rounded-2xl border border-brand-200 bg-white p-4 text-center shadow-sm">
                <div className="text-3xl">🎉</div>
                <p className="mt-1 text-base font-bold text-gray-900">Order placed!</p>
                <p className="text-xs text-gray-600">We’ll keep you posted right here as the store and rider update it.</p>
              </div>
            )}
            <NotificationPrompt emphasised={justPlaced} />
            {notificationPermission() === 'unsupported' && justPlaced && (
              <p className="flex items-center gap-2 text-xs text-gray-500"><BellOff className="h-4 w-4" /> Keep this page open to hear a sound when your order status changes.</p>
            )}

            <OrderStatusCard order={order} isLive={isSubscribed} />

            {order.serviceType === 'delivery' && order.status !== 'cancelled' && (
              <CustomerRiderPanel
                orderId={order.id}
                assignedRiderId={order.assignedRiderId}
                orderStatus={order.status}
                contactNumber={order.contactNumber}
                deliveryLatitude={order.deliveryLatitude}
                deliveryLongitude={order.deliveryLongitude}
              />
            )}

            <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <Store className="h-4 w-4 text-brand-700" />
                <h2 className="text-sm font-bold text-gray-900">{merchant?.name ?? 'Store'}</h2>
              </div>
              <div className="mt-3 space-y-2">
                {order.order_items.map((item) => (
                  <div key={item.id} className="flex items-start justify-between gap-3 text-sm">
                    <span className="min-w-0 text-gray-800">
                      <span className="font-medium">{item.quantity}× {item.name}</span>
                      {item.variation ? (
                        <span className="block text-xs text-gray-500">
                          {typeof (item.variation as { name?: string }).name === 'string'
                            ? (item.variation as { name: string }).name
                            : Object.values(item.variation as Record<string, { name?: string }>).map((v) => v?.name).filter(Boolean).join(', ')}
                        </span>
                      ) : null}
                      {Array.isArray(item.addOns) && item.addOns.length > 0 && (
                        <span className="block text-xs text-gray-500">+ {(item.addOns as { name: string }[]).map((a) => a.name).join(', ')}</span>
                      )}
                    </span>
                    <span className="whitespace-nowrap font-semibold text-gray-900">{formatPeso(item.subtotal)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 space-y-1 border-t border-dashed border-gray-200 pt-3 text-sm">
                {order.deliveryFee != null && order.deliveryFee > 0 && (
                  <div className="flex justify-between text-gray-600"><span>Delivery fee {order.deliveryMode === 'economy' ? '(Pasabay)' : ''}</span><span>{formatPeso(order.deliveryFee)}</span></div>
                )}
                <div className="flex justify-between text-base font-bold text-gray-900"><span>Total</span><span>{formatPeso(order.total)}</span></div>
                <p className="text-xs text-gray-500">Paid via {order.paymentMethod}{order.referenceNumber ? ` · Ref ${order.referenceNumber}` : ''}</p>
              </div>
            </section>

            <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-bold text-gray-900">Details</h2>
              <dl className="mt-2 space-y-1.5 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-gray-500">Name</dt><dd className="text-right font-medium text-gray-900">{order.customerName}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-gray-500">Type</dt><dd className="text-right font-medium capitalize text-gray-900">{order.serviceType === 'pickup' ? 'Pick-up' : order.deliveryMode === 'economy' ? 'Pasabay delivery' : 'Rush delivery'}</dd></div>
                {order.address && (
                  <div className="flex justify-between gap-3"><dt className="flex items-center gap-1 text-gray-500"><MapPin className="h-3.5 w-3.5" /> Address</dt><dd className="max-w-[65%] text-right font-medium text-gray-900">{order.address}</dd></div>
                )}
                {order.notes && <div className="flex justify-between gap-3"><dt className="text-gray-500">Notes</dt><dd className="max-w-[65%] text-right text-gray-900">{order.notes}</dd></div>}
                <div className="flex justify-between gap-3"><dt className="text-gray-500">Placed</dt><dd className="text-right text-gray-900">{new Date(order.createdAt).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-gray-500">Order ID</dt><dd className="break-all text-right font-mono text-xs text-gray-500">{order.id}</dd></div>
              </dl>
            </section>
          </>
        )}
      </div>
    </main>
  );
};

export default OrderTracking;
