import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import {
  ArrowLeft, MapPin, Phone, Package, CheckCircle,
  ChevronRight, Navigation, MessageCircle, AlertTriangle,
} from 'lucide-react';
import type { Id } from '../../convex/_generated/dataModel';
import OrderChat from './OrderChat';
import RiderTrackingMap from './RiderTrackingMap';
import { useRiderLocation } from '../hooks/useRiderLocation';

const RiderOrderDetail: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const order = useQuery(api.orders.getById, orderId ? { orderId: orderId as Id<'orders'> } : 'skip');
  const activeOrders = useQuery(api.riders.myActiveOrders) ?? [];
  const messages = useQuery(api.messages.listByOrder, orderId ? { orderId: orderId as Id<'orders'> } : 'skip') ?? [];
  const markPickedUp = useMutation(api.orders.markPickedUp);
  const markDelivered = useMutation(api.orders.markDelivered);
  const location = useRiderLocation(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [chatOpen, setChatOpen] = useState(false);

  if (order === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-gray-400 text-sm animate-pulse">Loading order…</div>
      </div>
    );
  }
  if (order === null) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-gray-100">
        <p className="text-gray-700">Order not found.</p>
        <Link to="/rider/dashboard" className="text-red-600 hover:underline text-sm">
          ← Back to dashboard
        </Link>
      </div>
    );
  }

  const handlePickup = async () => {
    setBusy(true); setError('');
    try { await markPickedUp({ orderId: order._id }); }
    catch (e: any) { setError(e?.message ?? 'Failed'); }
    finally { setBusy(false); }
  };

  const handleDeliver = async () => {
    setBusy(true); setError('');
    try {
      await markDelivered({ orderId: order._id });
      navigate('/rider/dashboard');
    } catch (e: any) { setError(e?.message ?? 'Failed'); }
    finally { setBusy(false); }
  };

  const mapsHref =
    order.deliveryLatitude && order.deliveryLongitude
      ? `https://www.google.com/maps/dir/?api=1&destination=${order.deliveryLatitude},${order.deliveryLongitude}`
      : null;

  const nextOrder = [...activeOrders]
    .filter((o) => o._id !== order._id && o.status !== 'completed' && o.status !== 'cancelled')
    .sort((a, b) => (a.riderAssignedAt ?? 0) - (b.riderAssignedAt ?? 0))[0] ?? null;

  const isReady = order.status === 'ready';
  const isDelivering = order.status === 'out_for_delivery';
  const isDone = order.status === 'completed';
  const unread = (messages as any[]).filter((m) => m.senderType === 'customer' && !m.readAt).length;

  return (
    <div className="h-[100dvh] bg-gray-100 flex flex-col overflow-hidden">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="bg-white border-b z-20 shrink-0">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate('/rider/dashboard')}
            className="p-2 -ml-2 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-gray-700" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-black text-sm truncate">{order.customerName}</p>
            <p className="text-xs text-gray-500 truncate">{order.address ?? 'Delivery'}</p>
          </div>
          <StatusPill status={order.status} />
        </div>
      </header>

      {/* ── Scrollable body ──────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto pb-24">
        <div className="max-w-lg mx-auto px-4 py-4 space-y-3">
          {/* Map preview */}
          {location.coords && (
            <div className="rounded-2xl overflow-hidden shadow-sm">
              <RiderTrackingMap
                mode="tracking"
                latitude={location.coords.latitude}
                longitude={location.coords.longitude}
                deliveryLatitude={order.deliveryLatitude}
                deliveryLongitude={order.deliveryLongitude}
                height="180px"
              />
            </div>
          )}

          {/* Customer info */}
          <div className="bg-white rounded-2xl p-4">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Customer</p>
            <p className="font-bold text-lg text-black">{order.customerName}</p>
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <a
                href={`tel:${order.contactNumber}`}
                className="flex items-center gap-2 bg-red-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-red-700 active:scale-[0.98] transition-all"
              >
                <Phone className="h-4 w-4" /> Call {order.contactNumber}
              </a>
              <button
                onClick={() => setChatOpen((v) => !v)}
                className={`relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-[0.98] ${
                  chatOpen ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <MessageCircle className="h-4 w-4" />
                Chat
                {unread > 0 && !chatOpen && (
                  <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 font-bold">
                    {unread}
                  </span>
                )}
              </button>
            </div>

            {chatOpen && (
              <div className="mt-3">
                <OrderChat orderId={order._id} senderType="rider" />
              </div>
            )}
          </div>

          {/* Delivery address */}
          <div className="bg-white rounded-2xl p-4">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Delivery Address</p>
            <p className="text-gray-900 flex items-start gap-2 text-sm">
              <MapPin className="h-4 w-4 mt-0.5 text-gray-400 shrink-0" />
              <span className="leading-relaxed">{order.address ?? 'No address provided'}</span>
            </p>
            {mapsHref && (
              <a
                href={mapsHref}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-2 bg-gray-900 text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-black active:scale-[0.98] transition-all"
              >
                <Navigation className="h-4 w-4" /> Open in Google Maps
              </a>
            )}
          </div>

          {/* Order items */}
          <div className="bg-white rounded-2xl p-4">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-3">Order Items</p>
            <div className="space-y-2.5">
              {(order.order_items ?? []).map((item: any) => (
                <div key={item._id} className="flex justify-between items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-gray-900">
                      <span className="font-semibold">{item.quantity}×</span> {item.name}
                    </span>
                    {item.variation && (
                      <p className="text-xs text-gray-400 mt-0.5">{JSON.stringify(item.variation)}</p>
                    )}
                  </div>
                  <span className="text-sm text-gray-700 shrink-0">₱{item.subtotal.toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div className="border-t mt-3 pt-3 space-y-1.5">
              <div className="flex justify-between text-sm text-gray-500">
                <span>Delivery fee</span>
                <span>₱{(order.deliveryFee ?? 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-base">
                <span>Total</span>
                <span>₱{order.total.toFixed(2)}</span>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-3 flex-wrap">
              <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                order.paymentMethod?.toLowerCase() === 'cod'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-green-100 text-green-700'
              }`}>
                {order.paymentMethod?.toLowerCase() === 'cod' ? '💵 Collect Cash' : '✓ Already Paid'}
              </span>
            </div>

            {order.notes && (
              <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800">{order.notes}</p>
              </div>
            )}
          </div>

          {/* Next order */}
          {nextOrder && (
            <Link
              to={`/rider/order/${nextOrder._id}`}
              className="flex items-center justify-between bg-white rounded-2xl p-4 hover:bg-gray-50 transition-colors shadow-sm"
            >
              <div className="min-w-0">
                <p className="text-xs text-gray-400 mb-0.5 uppercase font-semibold tracking-wide">Next Order</p>
                <p className="font-bold text-black">{nextOrder.customerName}</p>
                <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                  <MapPin className="h-3 w-3" />
                  {(nextOrder as any).address ?? 'No address'}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 text-gray-400 shrink-0" />
            </Link>
          )}
        </div>
      </main>

      {/* ── Sticky bottom action ─────────────────────────────────────────────── */}
      {(isReady || isDelivering) && (
        <div className="shrink-0 bg-white border-t px-4 py-4 z-20">
          <div className="max-w-lg mx-auto space-y-2">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            {isReady && (
              <button
                onClick={handlePickup}
                disabled={busy}
                className="w-full bg-red-600 text-white py-4 rounded-xl hover:bg-red-700 active:scale-[0.98] disabled:opacity-50 transition-all font-bold flex items-center justify-center gap-2"
              >
                {busy
                  ? <span className="animate-pulse">Updating…</span>
                  : <><Package className="h-5 w-5" /> Mark as Picked Up</>
                }
              </button>
            )}

            {isDelivering && (
              <button
                onClick={handleDeliver}
                disabled={busy}
                className="w-full bg-green-600 text-white py-4 rounded-xl hover:bg-green-700 active:scale-[0.98] disabled:opacity-50 transition-all font-bold flex items-center justify-center gap-2"
              >
                {busy
                  ? <span className="animate-pulse">Updating…</span>
                  : <><CheckCircle className="h-5 w-5" /> Mark as Delivered</>
                }
              </button>
            )}
          </div>
        </div>
      )}

      {isDone && (
        <div className="shrink-0 bg-white border-t px-4 py-4 z-20">
          <div className="max-w-lg mx-auto flex items-center justify-center gap-2 text-green-700 font-bold">
            <CheckCircle className="h-5 w-5" /> Delivered Successfully
          </div>
        </div>
      )}
    </div>
  );
};

const StatusPill: React.FC<{ status: string }> = ({ status }) => {
  const map: Record<string, { label: string; cls: string }> = {
    ready: { label: 'Ready for Pickup', cls: 'bg-blue-100 text-blue-700' },
    out_for_delivery: { label: 'Out for Delivery', cls: 'bg-amber-100 text-amber-700' },
    completed: { label: 'Delivered', cls: 'bg-green-100 text-green-700' },
  };
  const m = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold shrink-0 ${m.cls}`}>
      {m.label}
    </span>
  );
};

export default RiderOrderDetail;
