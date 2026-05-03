import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useConvexAuth } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import {
  Bike, MapPin, Phone, LogOut, AlertTriangle, CheckCircle, XCircle,
  MessageCircle, Map, User, Home, Package, Navigation, Star,
  Clock, Zap, ChevronRight, Camera, Loader2, Save, Wallet,
  TrendingUp, DollarSign, CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useRiderProfile, ratingAverage } from '../hooks/useRiderProfile';
import { useRiderLocation } from '../hooks/useRiderLocation';
import { useRiderNotifications } from '../hooks/useRiderNotifications';
import { requestNotificationPermission, notificationPermission } from '../lib/notificationUtils';
import { compressImage, uploadRiderPhotoToCloudinary } from '../lib/cloudinary';
import RiderTrackingMap from './RiderTrackingMap';
import OrderChat from './OrderChat';

type Tab = 'home' | 'chats' | 'map' | 'earnings' | 'profile';

// ─── Root ────────────────────────────────────────────────────────────────────
const RiderDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { profile } = useRiderProfile();
  const { isAuthenticated: convexReady } = useConvexAuth();

  const presence = useQuery(api.riders.myPresence);
  const offers = useQuery(api.offers.listMyOffers) ?? [];
  const activeOrders = useQuery(api.riders.myActiveOrders) ?? [];
  const totalUnread = (useQuery(api.messages.unreadCountForRider) ?? 0) as number;

  const setOnline = useMutation(api.riders.setOnline);
  const setPermission = useMutation(api.riders.setLocationPermission);
  const updateLocation = useMutation(api.riders.updateLocation);
  const acceptOffer = useMutation(api.offers.acceptOffer);
  const rejectOffer = useMutation(api.offers.rejectOffer);
  const markPickedUp = useMutation(api.orders.markPickedUp);
  const markDelivered = useMutation(api.orders.markDelivered);

  useRiderNotifications(offers, totalUnread);

  const isOnline = presence?.status === 'available' || presence?.status === 'busy';
  const [enableTracking, setEnableTracking] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [error, setError] = useState('');
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [notifDismissed, setNotifDismissed] = useState(false);

  useEffect(() => { if (isOnline) setEnableTracking(true); }, [isOnline]);
  const location = useRiderLocation(enableTracking || isOnline);

  const locationStale = useMemo(() => {
    if (!location.lastUpdate) return true;
    return Date.now() - location.lastUpdate > 60_000;
  }, [location.lastUpdate]);

  const locationReady =
    location.permission === 'granted' && !!location.coords && !locationStale;

  const goOnline = async () => {
    setError('');
    if (!convexReady) { setError('Still connecting — try again.'); return; }
    try {
      if (!location.coords) { setError('Waiting for GPS fix — try again in a moment.'); return; }
      await updateLocation({ latitude: location.coords.latitude, longitude: location.coords.longitude });
      await setOnline({ online: true });
    } catch (e: any) { setError(e?.message ?? 'Could not go online'); }
  };

  const goOffline = async () => {
    await setOnline({ online: false });
    setEnableTracking(false);
  };

  const handleAccept = async (offerId: any) => {
    try { await acceptOffer({ offerId }); setActiveTab('home'); }
    catch (e: any) { setError(e?.message ?? 'Could not accept offer'); }
  };

  const handlePickup = async (orderId: Id<'orders'>) => {
    setBusyOrderId(orderId); setError('');
    try { await markPickedUp({ orderId }); }
    catch (e: any) { setError(e?.message ?? 'Failed'); }
    finally { setBusyOrderId(null); }
  };

  const handleDeliver = async (orderId: Id<'orders'>) => {
    setBusyOrderId(orderId); setError('');
    try { await markDelivered({ orderId }); }
    catch (e: any) { setError(e?.message ?? 'Failed'); }
    finally { setBusyOrderId(null); }
  };

  const avg = ratingAverage(profile);
  const sortedOrders = useMemo(
    () => [...activeOrders].sort((a, b) => (a.riderAssignedAt ?? 0) - (b.riderAssignedAt ?? 0)),
    [activeOrders]
  );

  return (
    <div className="h-[100dvh] bg-gray-100 flex flex-col overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="bg-white border-b z-20 shrink-0">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 bg-red-600 rounded-full flex items-center justify-center shrink-0">
              <Bike className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm text-black leading-tight truncate">
                {profile?.name ?? 'Rider'}
              </p>
              <p className="text-[11px] text-gray-400 truncate">
                {profile?.plate_number ?? ''}
                {avg ? ` • ★ ${avg.toFixed(1)} (${profile?.rating_count})` : ''}
              </p>
            </div>
          </div>

          <button
            onClick={locationReady ? (isOnline ? goOffline : goOnline) : () => setEnableTracking(true)}
            disabled={!convexReady && locationReady}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 ${
              !convexReady && locationReady
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : isOnline
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-red-600 text-white shadow-sm'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-500' : 'bg-white opacity-80'}`} />
            {!convexReady && locationReady ? 'Connecting…' : isOnline ? 'Online' : 'Go Online'}
          </button>
        </div>

        {error && (
          <div className="max-w-lg mx-auto px-4 pb-2">
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
              <p className="text-red-700 text-xs flex-1">{error}</p>
              <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
            </div>
          </div>
        )}

        {!notifDismissed && notificationPermission() === 'default' && (
          <div className="max-w-lg mx-auto px-4 pb-2">
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 flex items-center gap-2">
              <MessageCircle className="h-3.5 w-3.5 text-blue-500 shrink-0" />
              <p className="text-blue-700 text-xs flex-1">Enable notifications to get alerts for new orders and messages.</p>
              <button
                onClick={() => { requestNotificationPermission(); setNotifDismissed(true); }}
                className="text-xs font-semibold text-blue-700 hover:text-blue-900 whitespace-nowrap"
              >
                Enable
              </button>
              <button onClick={() => setNotifDismissed(true)} className="text-blue-400 hover:text-blue-600 text-lg leading-none ml-1">×</button>
            </div>
          </div>
        )}
      </header>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        {activeTab === 'home' && (
          <HomeTab
            location={location}
            locationStale={locationStale}
            isOnline={isOnline}
            convexReady={convexReady}
            offers={offers}
            sortedOrders={sortedOrders}
            busyOrderId={busyOrderId}
            onRequestLocation={() => setEnableTracking(true)}
            onGoOnline={goOnline}
            onGoOffline={goOffline}
            onSetDenied={() => setPermission({ permission: 'denied' })}
            onAcceptOffer={handleAccept}
            onRejectOffer={(offerId) => rejectOffer({ offerId })}
            onPickup={handlePickup}
            onDeliver={handleDeliver}
            onViewDetail={(orderId) => navigate(`/rider/order/${orderId}`)}
          />
        )}
        {activeTab === 'chats' && <ChatsTab orders={sortedOrders} />}
        {activeTab === 'map' && <MapTab location={location} orders={sortedOrders} />}
        {activeTab === 'earnings' && <EarningsTab />}
        {activeTab === 'profile' && (
          <ProfileTab
            profile={profile}
            avg={avg}
            isOnline={isOnline}
            convexReady={convexReady}
            location={location}
            locationStale={locationStale}
            onRequestLocation={() => setEnableTracking(true)}
            onGoOnline={goOnline}
            onGoOffline={goOffline}
            onSignOut={() => signOut().then(() => navigate('/rider/login'))}
          />
        )}
      </main>

      {/* ── Bottom nav ──────────────────────────────────────────────────────── */}
      <nav className="shrink-0 bg-white border-t z-20">
        <div className="max-w-lg mx-auto flex">
          <NavTab
            active={activeTab === 'home'}
            onClick={() => setActiveTab('home')}
            icon={<Home className="h-[22px] w-[22px]" />}
            label="Orders"
            badge={offers.length || undefined}
          />
          <NavTab
            active={activeTab === 'chats'}
            onClick={() => setActiveTab('chats')}
            icon={<MessageCircle className="h-[22px] w-[22px]" />}
            label="Chats"
            badge={totalUnread || undefined}
          />
          <NavTab
            active={activeTab === 'map'}
            onClick={() => setActiveTab('map')}
            icon={<Map className="h-[22px] w-[22px]" />}
            label="Map"
          />
          <NavTab
            active={activeTab === 'earnings'}
            onClick={() => setActiveTab('earnings')}
            icon={<Wallet className="h-[22px] w-[22px]" />}
            label="Earnings"
          />
          <NavTab
            active={activeTab === 'profile'}
            onClick={() => setActiveTab('profile')}
            icon={<User className="h-[22px] w-[22px]" />}
            label="Profile"
          />
        </div>
      </nav>
    </div>
  );
};

// ─── Home Tab ────────────────────────────────────────────────────────────────
interface HomeTabProps {
  location: ReturnType<typeof useRiderLocation>;
  locationStale: boolean;
  isOnline: boolean;
  convexReady: boolean;
  offers: any[];
  sortedOrders: any[];
  busyOrderId: string | null;
  onRequestLocation: () => void;
  onGoOnline: () => void;
  onGoOffline: () => void;
  onSetDenied: () => void;
  onAcceptOffer: (offerId: any) => void;
  onRejectOffer: (offerId: any) => void;
  onPickup: (orderId: Id<'orders'>) => void;
  onDeliver: (orderId: Id<'orders'>) => void;
  onViewDetail: (orderId: string) => void;
}

const HomeTab: React.FC<HomeTabProps> = ({
  location, locationStale, isOnline, convexReady,
  offers, sortedOrders, busyOrderId,
  onRequestLocation, onGoOnline, onGoOffline, onSetDenied,
  onAcceptOffer, onRejectOffer, onPickup, onDeliver, onViewDetail,
}) => (
  <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
    <LocationBanner
      permission={location.permission}
      coords={location.coords}
      stale={locationStale}
      isOnline={isOnline}
      convexReady={convexReady}
      onRequest={onRequestLocation}
      onGoOnline={onGoOnline}
      onGoOffline={onGoOffline}
      onSetDenied={onSetDenied}
    />

    {offers.length > 0 && (
      <section>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
          <h2 className="font-bold text-sm text-black uppercase tracking-wide">
            New Offers ({offers.length})
          </h2>
        </div>
        <div className="space-y-3">
          {offers.map(({ offer, order }) =>
            order ? (
              <OfferCard
                key={offer._id}
                offer={offer}
                order={order}
                onAccept={() => onAcceptOffer(offer._id)}
                onReject={() => onRejectOffer(offer._id)}
              />
            ) : null
          )}
        </div>
      </section>
    )}

    <section>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="font-bold text-sm text-black uppercase tracking-wide">My Deliveries</h2>
        {sortedOrders.length > 0 && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
            sortedOrders.length > 1 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
          }`}>
            {sortedOrders.length > 1 ? `Batched × ${sortedOrders.length}` : '1 active'}
          </span>
        )}
      </div>

      {sortedOrders.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 text-center">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Package className="h-7 w-7 text-gray-400" />
          </div>
          <p className="text-gray-500 text-sm font-medium">No active deliveries</p>
          <p className="text-gray-400 text-xs mt-1">
            {isOnline ? 'Waiting for new orders…' : 'Go online to receive orders'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedOrders.map((order, idx) => (
            <ActiveOrderCard
              key={order._id}
              order={order}
              index={sortedOrders.length > 1 ? idx + 1 : undefined}
              busy={busyOrderId === order._id}
              onPickup={() => onPickup(order._id)}
              onDeliver={() => onDeliver(order._id)}
              onViewDetail={() => onViewDetail(order._id)}
            />
          ))}
        </div>
      )}
    </section>
  </div>
);

// ─── Offer Card ──────────────────────────────────────────────────────────────
const OfferCard: React.FC<{
  offer: any;
  order: any;
  onAccept: () => void;
  onReject: () => void;
}> = ({ offer, order, onAccept, onReject }) => (
  <div className={`bg-white rounded-2xl overflow-hidden shadow-sm border-2 ${
    order.deliveryMode === 'priority' ? 'border-orange-400' : 'border-red-500'
  }`}>
    <div className={`px-4 py-2 flex items-center justify-between ${
      order.deliveryMode === 'priority' ? 'bg-orange-50' : 'bg-red-50'
    }`}>
      <div className="flex items-center gap-2">
        {order.deliveryMode === 'priority' ? (
          <>
            <Zap className="h-3.5 w-3.5 text-orange-600" />
            <span className="text-xs font-bold text-orange-700 uppercase">Rush Order</span>
          </>
        ) : (
          <span className="text-xs font-bold text-red-700 uppercase">New Delivery</span>
        )}
      </div>
      <ExpiryCountdown expiresAt={offer.expiresAt} />
    </div>

    <div className="p-4">
      <p className="font-bold text-base text-black mb-1">{order.customerName}</p>
      <p className="text-sm text-gray-600 flex items-start gap-1.5 mb-1">
        <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5 text-gray-400" />
        <span className="leading-snug">{order.address ?? 'No address'}</span>
      </p>
      <div className="flex items-center gap-3 mt-2">
        <span className="text-sm font-semibold text-green-700">
          ₱{(order.deliveryFee ?? 0).toFixed(0)} fee
        </span>
        <span className="text-xs text-gray-400">
          {offer.distanceKm?.toFixed(1)} km from merchant
        </span>
      </div>
    </div>

    <div className="px-4 pb-4 flex gap-2">
      <button
        onClick={onAccept}
        className="flex-1 bg-red-600 text-white py-3 rounded-xl hover:bg-red-700 active:scale-[0.98] transition-all font-semibold flex items-center justify-center gap-2"
      >
        <CheckCircle className="h-4 w-4" /> Accept
      </button>
      <button
        onClick={onReject}
        className="w-24 bg-gray-100 text-gray-600 py-3 rounded-xl hover:bg-gray-200 active:scale-[0.98] transition-all font-medium flex items-center justify-center gap-1.5"
      >
        <XCircle className="h-4 w-4" /> Skip
      </button>
    </div>
  </div>
);

// ─── Active Order Card ────────────────────────────────────────────────────────
const ActiveOrderCard: React.FC<{
  order: any;
  index?: number;
  busy: boolean;
  onPickup: () => void;
  onDeliver: () => void;
  onViewDetail: () => void;
}> = ({ order, index, busy, onPickup, onDeliver, onViewDetail }) => {
  const mapsHref =
    order.deliveryLatitude && order.deliveryLongitude
      ? `https://www.google.com/maps/dir/?api=1&destination=${order.deliveryLatitude},${order.deliveryLongitude}`
      : null;

  const itemsPreview = (order.order_items ?? [])
    .slice(0, 3)
    .map((i: any) => `${i.quantity}× ${i.name}`)
    .join(', ');
  const extraItems = (order.order_items?.length ?? 0) - 3;

  const isReady = order.status === 'ready';
  const isDelivering = order.status === 'out_for_delivery';
  const isDone = order.status === 'completed';

  const statusStyle = isReady
    ? 'bg-blue-100 text-blue-700'
    : isDelivering
      ? 'bg-amber-100 text-amber-700'
      : 'bg-green-100 text-green-700';

  const statusLabel = isReady ? 'Ready for Pickup' : isDelivering ? 'Out for Delivery' : 'Delivered';

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 pt-3.5 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {index != null && (
            <span className="text-xs font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">
              #{index}
            </span>
          )}
          <p className="font-bold text-black truncate">{order.customerName}</p>
          {order.deliveryMode === 'priority' && (
            <span className="text-[10px] px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded font-bold uppercase shrink-0">
              Rush
            </span>
          )}
        </div>
        <span className={`text-xs px-2 py-1 rounded-full font-semibold shrink-0 ml-2 ${statusStyle}`}>
          {statusLabel}
        </span>
      </div>

      <div className="px-4 pb-2 flex items-start gap-2">
        <MapPin className="h-3.5 w-3.5 text-gray-400 shrink-0 mt-0.5" />
        <p className="text-sm text-gray-700 leading-snug">{order.address ?? 'No address'}</p>
      </div>

      {itemsPreview && (
        <div className="px-4 pb-2">
          <p className="text-xs text-gray-500 truncate">
            {itemsPreview}{extraItems > 0 ? ` +${extraItems} more` : ''}
          </p>
        </div>
      )}

      <div className="px-4 pb-3 flex items-center gap-3 flex-wrap">
        <span className="text-xs font-semibold text-green-700">
          ₱{(order.deliveryFee ?? 0).toFixed(0)} fee
        </span>
        <span className="text-xs text-gray-500">
          {order.paymentMethod?.toLowerCase() === 'cod' ? '💵 COD' : '✓ Paid'}
        </span>
        {order.notes && (
          <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full truncate max-w-[160px]">
            📝 {order.notes}
          </span>
        )}
      </div>

      <div className="px-4 pb-3 pt-3 flex items-center gap-2 border-t flex-wrap">
        <a
          href={`tel:${order.contactNumber}`}
          className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-xl text-sm font-medium transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <Phone className="h-3.5 w-3.5" /> Call
        </a>

        {!isDone && <OrderChatBadge orderId={order._id} />}

        {mapsHref && (
          <a
            href={mapsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-xl text-sm font-medium transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <Navigation className="h-3.5 w-3.5" /> Directions
          </a>
        )}

        <button
          onClick={onViewDetail}
          className="ml-auto flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
        >
          Details <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {isReady && (
        <div className="px-4 pb-4">
          <button
            onClick={onPickup}
            disabled={busy}
            className="w-full bg-red-600 text-white py-3.5 rounded-xl hover:bg-red-700 active:scale-[0.98] disabled:opacity-50 transition-all font-semibold flex items-center justify-center gap-2 text-sm"
          >
            {busy
              ? <span className="animate-pulse">Updating…</span>
              : <><Package className="h-4 w-4" /> Mark as Picked Up</>
            }
          </button>
        </div>
      )}
      {isDelivering && (
        <div className="px-4 pb-4">
          <button
            onClick={onDeliver}
            disabled={busy}
            className="w-full bg-green-600 text-white py-3.5 rounded-xl hover:bg-green-700 active:scale-[0.98] disabled:opacity-50 transition-all font-semibold flex items-center justify-center gap-2 text-sm"
          >
            {busy
              ? <span className="animate-pulse">Updating…</span>
              : <><CheckCircle className="h-4 w-4" /> Mark as Delivered</>
            }
          </button>
        </div>
      )}
      {isDone && (
        <div className="px-4 pb-4 flex items-center justify-center gap-2 text-green-700 font-semibold text-sm">
          <CheckCircle className="h-4 w-4" /> Delivered
        </div>
      )}
    </div>
  );
};

const OrderChatBadge: React.FC<{ orderId: Id<'orders'> }> = ({ orderId }) => {
  const messages = useQuery(api.messages.listByOrder, { orderId }) ?? [];
  const unread = (messages as any[]).filter((m) => m.senderType === 'customer' && !m.readAt).length;
  return (
    <span className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium ${
      unread > 0 ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
    }`}>
      <MessageCircle className="h-3.5 w-3.5" />
      Chat
      {unread > 0 && (
        <span className="bg-red-600 text-white text-[10px] rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 font-bold">
          {unread}
        </span>
      )}
    </span>
  );
};

// ─── Chats Tab ───────────────────────────────────────────────────────────────
const ChatsTab: React.FC<{ orders: any[] }> = ({ orders }) => {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (orders.length === 0) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <MessageCircle className="h-7 w-7 text-gray-400" />
        </div>
        <p className="text-gray-500 font-medium text-sm">No active chats</p>
        <p className="text-gray-400 text-xs mt-1">Customer messages will appear here</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto py-2">
      <div className="space-y-px">
        {orders.map((order) => (
          <ChatOrderRow
            key={order._id}
            order={order}
            expanded={expanded === order._id}
            onToggle={() => setExpanded(expanded === order._id ? null : order._id)}
          />
        ))}
      </div>
    </div>
  );
};

const ChatOrderRow: React.FC<{
  order: any;
  expanded: boolean;
  onToggle: () => void;
}> = ({ order, expanded, onToggle }) => {
  const messages = useQuery(api.messages.listByOrder, { orderId: order._id }) ?? [];
  const unread = (messages as any[]).filter((m) => m.senderType === 'customer' && !m.readAt).length;
  const lastMsg = (messages as any[])[messages.length - 1];

  const timeLabel = lastMsg
    ? (() => {
        const diff = Date.now() - lastMsg._creationTime;
        if (diff < 60_000) return 'Now';
        if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
        return `${Math.floor(diff / 3_600_000)}h`;
      })()
    : '';

  return (
    <div className="bg-white">
      <button
        onClick={onToggle}
        className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-gray-50 active:bg-gray-100 transition-colors text-left"
      >
        <div className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 font-bold text-sm ${
          unread > 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'
        }`}>
          {order.customerName.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <p className={`text-sm truncate ${unread > 0 ? 'font-bold text-black' : 'font-semibold text-gray-800'}`}>
              {order.customerName}
            </p>
            <div className="flex items-center gap-1.5 shrink-0">
              {timeLabel && <span className="text-[11px] text-gray-400">{timeLabel}</span>}
              {unread > 0 && (
                <span className="bg-red-600 text-white text-[10px] rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 font-bold">
                  {unread}
                </span>
              )}
            </div>
          </div>
          <p className={`text-xs truncate ${unread > 0 ? 'text-gray-700' : 'text-gray-400'}`}>
            {lastMsg
              ? lastMsg.senderType === 'rider'
                ? `You: ${lastMsg.text}`
                : lastMsg.text
              : 'No messages yet — say hello!'}
          </p>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t bg-gray-50">
          <div className="pt-3">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400 font-medium shrink-0">
                {order.address ?? 'Delivery'}
              </span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>
            <OrderChat orderId={order._id} senderType="rider" isCompleted={order.status === 'completed'} />
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Map Tab ─────────────────────────────────────────────────────────────────
const MapTab: React.FC<{
  location: ReturnType<typeof useRiderLocation>;
  orders: any[];
}> = ({ location, orders }) => {
  if (!location.coords) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
          <Map className="h-8 w-8 text-gray-400" />
        </div>
        <p className="text-gray-500 font-medium">Location not available</p>
        <p className="text-gray-400 text-sm">Enable GPS to see live map</p>
      </div>
    );
  }

  const deliveryOrder =
    orders.find((o) => o.status === 'out_for_delivery') ?? orders[0];

  return (
    <RiderTrackingMap
      mode="tracking"
      latitude={location.coords.latitude}
      longitude={location.coords.longitude}
      deliveryLatitude={deliveryOrder?.deliveryLatitude}
      deliveryLongitude={deliveryOrder?.deliveryLongitude}
      height="100%"
    />
  );
};

// ─── Profile Tab ─────────────────────────────────────────────────────────────
const ProfileTab: React.FC<{
  profile: any;
  avg: number | null;
  isOnline: boolean;
  convexReady: boolean;
  location: ReturnType<typeof useRiderLocation>;
  locationStale: boolean;
  onRequestLocation: () => void;
  onGoOnline: () => void;
  onGoOffline: () => void;
  onSignOut: () => void;
}> = ({ profile, avg, isOnline, convexReady, location, locationStale, onRequestLocation, onGoOnline, onGoOffline, onSignOut }) => {
  const { user } = useAuth();
  const { updateProfile } = useRiderProfile();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(profile?.name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; msg: string } | null>(null);

  useEffect(() => {
    setName(profile?.name ?? '');
    setPhone(profile?.phone ?? '');
  }, [profile?.name, profile?.phone]);

  const handlePhotoChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setFeedback(null);
    setUploadingPhoto(true);
    try {
      const compressed = await compressImage(file, 800, 0.85);
      const url = await uploadRiderPhotoToCloudinary(compressed, user.id);
      await updateProfile({ photo_url: url });
      setFeedback({ type: 'success', msg: 'Photo updated.' });
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err?.message ?? 'Failed to upload photo.' });
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  }, [user, updateProfile]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setFeedback({ type: 'error', msg: 'Name is required.' }); return; }
    setFeedback(null);
    setSaving(true);
    try {
      await updateProfile({ name: name.trim(), phone: phone.trim() });
      setFeedback({ type: 'success', msg: 'Profile saved.' });
    } catch (err: any) {
      setFeedback({ type: 'error', msg: err?.message ?? 'Failed to save.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
      {/* Photo + identity */}
      <div className="bg-white rounded-2xl p-5">
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <div className="w-16 h-16 bg-red-600 rounded-full overflow-hidden flex items-center justify-center">
              {profile?.photo_url ? (
                <img src={profile.photo_url} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <span className="text-white text-2xl font-bold">
                  {(profile?.name ?? 'R').charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingPhoto}
              className="absolute bottom-0 right-0 bg-white border border-gray-300 rounded-full p-1 shadow hover:bg-gray-50 disabled:opacity-50"
              aria-label="Change photo"
            >
              {uploadingPhoto
                ? <Loader2 className="h-3 w-3 animate-spin text-red-600" />
                : <Camera className="h-3 w-3 text-gray-600" />
              }
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handlePhotoChange}
            />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-lg text-black truncate">{profile?.name ?? 'Rider'}</p>
            <p className="text-sm text-gray-500">{profile?.plate_number}</p>
            <p className="text-sm text-gray-500 capitalize">{profile?.vehicle_type ?? ''}</p>
          </div>
        </div>
        {avg != null && (
          <div className="mt-4 pt-4 border-t flex items-center gap-2">
            <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
            <span className="font-semibold text-black">{avg.toFixed(1)}</span>
            <span className="text-gray-500 text-sm">({profile?.rating_count} ratings)</span>
          </div>
        )}
      </div>

      {/* Editable fields */}
      <form onSubmit={handleSave} className="bg-white rounded-2xl p-5 space-y-4">
        <h3 className="font-semibold text-black text-sm uppercase tracking-wide">Edit Profile</h3>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Full Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            placeholder="Your name"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            placeholder="+63 9XX XXX XXXX"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Plate Number</label>
          <input value={profile?.plate_number ?? ''} disabled className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 text-gray-400" />
        </div>

        {feedback && (
          <p className={`text-xs rounded-lg px-3 py-2 ${feedback.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
            {feedback.msg}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-red-600 text-white py-3 rounded-xl hover:bg-red-700 active:scale-[0.98] disabled:opacity-50 transition-all font-semibold flex items-center justify-center gap-2 text-sm"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </form>

      {/* Status */}
      <div className="bg-white rounded-2xl p-5">
        <h3 className="font-semibold text-black mb-4 text-sm uppercase tracking-wide">Status</h3>
        <LocationBanner
          permission={location.permission}
          coords={location.coords}
          stale={locationStale}
          isOnline={isOnline}
          convexReady={convexReady}
          onRequest={onRequestLocation}
          onGoOnline={onGoOnline}
          onGoOffline={onGoOffline}
          onSetDenied={() => {}}
        />
      </div>

      <button
        onClick={onSignOut}
        className="w-full bg-white rounded-2xl p-4 flex items-center gap-3 text-red-600 hover:bg-red-50 transition-colors font-medium"
      >
        <LogOut className="h-5 w-5" />
        Sign Out
      </button>
    </div>
  );
};

// ─── Location Banner ──────────────────────────────────────────────────────────
interface LocationBannerProps {
  permission: 'granted' | 'denied' | 'unknown';
  coords: { latitude: number; longitude: number } | null;
  stale: boolean;
  isOnline: boolean;
  convexReady: boolean;
  onRequest: () => void;
  onGoOnline: () => void;
  onGoOffline: () => void;
  onSetDenied: () => void;
}

const LocationBanner: React.FC<LocationBannerProps> = ({
  permission, coords, stale, isOnline, convexReady,
  onRequest, onGoOnline, onGoOffline,
}) => {
  if (permission === 'denied') {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-amber-900 text-sm">Location blocked</p>
          <p className="text-amber-800 text-xs mt-0.5">
            Enable location in your browser settings, then reload the page.
          </p>
        </div>
      </div>
    );
  }

  if (permission === 'unknown' || !coords) {
    return (
      <button
        onClick={onRequest}
        className="w-full bg-red-600 text-white py-3.5 rounded-xl hover:bg-red-700 active:scale-[0.98] transition-all font-semibold flex items-center justify-center gap-2"
      >
        <MapPin className="h-4 w-4" /> Enable Location to Start
      </button>
    );
  }

  if (stale) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2">
        <Clock className="h-4 w-4 text-amber-600 shrink-0" />
        <p className="text-amber-800 text-sm">Waiting for GPS fix…</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-gray-400'}`} />
          <span className="text-sm font-medium text-black">
            {isOnline ? 'Online — receiving orders' : 'Offline'}
          </span>
        </div>
        <span className="text-[11px] text-gray-400 font-mono">
          {coords.latitude.toFixed(4)}, {coords.longitude.toFixed(4)}
        </span>
      </div>
      <button
        onClick={isOnline ? onGoOffline : onGoOnline}
        disabled={!convexReady}
        className={`w-full py-3 rounded-xl font-semibold transition-all active:scale-[0.98] ${
          !convexReady
            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
            : isOnline
              ? 'bg-gray-800 text-white hover:bg-gray-900'
              : 'bg-red-600 text-white hover:bg-red-700'
        }`}
      >
        {!convexReady ? 'Connecting…' : isOnline ? 'Go Offline' : 'Go Online'}
      </button>
    </div>
  );
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const ExpiryCountdown: React.FC<{ expiresAt: number }> = ({ expiresAt }) => {
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const seconds = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  return (
    <div className={`flex items-center gap-1 text-sm font-mono font-bold ${seconds <= 10 ? 'text-red-600' : 'text-gray-700'}`}>
      <Clock className="h-3.5 w-3.5" />
      0:{seconds.toString().padStart(2, '0')}
    </div>
  );
};

const NavTab: React.FC<{
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number;
}> = ({ active, onClick, icon, label, badge }) => (
  <button
    onClick={onClick}
    className={`flex-1 flex flex-col items-center gap-0.5 py-3 pb-4 relative transition-colors ${
      active ? 'text-red-600' : 'text-gray-400 hover:text-gray-600'
    }`}
  >
    <div className="relative">
      {icon}
      {badge != null && badge > 0 && (
        <span className="absolute -top-1 -right-1.5 bg-red-600 text-white text-[9px] rounded-full min-w-[14px] h-3.5 flex items-center justify-center px-1 font-bold leading-none">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </div>
    <span className="text-[10px] font-semibold">{label}</span>
    {active && (
      <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-red-600 rounded-full" />
    )}
  </button>
);

// ─── Earnings Tab ────────────────────────────────────────────────────────────
const EarningsTab: React.FC = () => {
  const summary = useQuery(api.earnings.myEarningsSummary);
  const payouts = (useQuery(api.earnings.myPayouts) ?? []) as any[];
  const recentDeliveries = (useQuery(api.earnings.myRecentDeliveries) ?? []) as any[];

  const fmt = (n: number) =>
    `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const fmtDate = (ts: number) =>
    new Date(ts).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

  if (!summary) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
      {/* Today's snapshot */}
      <div className="bg-red-600 rounded-2xl p-5 text-white">
        <p className="text-red-200 text-xs font-medium uppercase tracking-wide mb-1">Today's Earnings</p>
        <p className="text-3xl font-bold">{fmt(summary.todayEarnings)}</p>
        <p className="text-red-200 text-xs mt-1">{summary.todayCount} deliveries today</p>
      </div>

      {/* Summary grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-3.5 w-3.5 text-green-600" />
            <span className="text-xs text-gray-500">Total Earned</span>
          </div>
          <p className="font-bold text-black">{fmt(summary.totalEarned)}</p>
          <p className="text-xs text-gray-400">{summary.completedCount} deliveries</p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-blue-600" />
            <span className="text-xs text-gray-500">Total Paid</span>
          </div>
          <p className="font-bold text-black">{fmt(summary.totalPaid)}</p>
          <p className="text-xs text-gray-400">{payouts.filter((p) => p.status === 'paid').length} payouts</p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-3.5 w-3.5 text-amber-600" />
            <span className="text-xs text-gray-500">Pending Payout</span>
          </div>
          <p className="font-bold text-black">{fmt(summary.pendingPayout)}</p>
          <p className="text-xs text-gray-400">{payouts.filter((p) => p.status === 'pending').length} processing</p>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="h-3.5 w-3.5 text-red-600" />
            <span className="text-xs text-gray-500">Unpaid</span>
          </div>
          <p className="font-bold text-black">{fmt(summary.unpaidEarnings)}</p>
          <p className="text-xs text-gray-400">not yet processed</p>
        </div>
      </div>

      {/* Recent payouts */}
      {payouts.length > 0 && (
        <section className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b">
            <h3 className="font-semibold text-sm text-black uppercase tracking-wide">Payout History</h3>
          </div>
          <div className="divide-y">
            {payouts.slice(0, 10).map((p) => (
              <div key={p._id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-black">{fmt(p.amount)}</p>
                  <p className="text-xs text-gray-400">
                    {fmtDate(p.createdAt)}
                    {p.notes ? ` · ${p.notes}` : ''}
                  </p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 ${
                  p.status === 'paid'
                    ? 'bg-green-100 text-green-700'
                    : p.status === 'cancelled'
                      ? 'bg-gray-100 text-gray-500'
                      : 'bg-amber-100 text-amber-700'
                }`}>
                  {p.status}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent deliveries */}
      {recentDeliveries.length > 0 && (
        <section className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b">
            <h3 className="font-semibold text-sm text-black uppercase tracking-wide">Recent Deliveries</h3>
          </div>
          <div className="divide-y">
            {recentDeliveries.slice(0, 15).map((order: any) => (
              <div key={order._id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-black truncate">{order.customerName}</p>
                  <p className="text-xs text-gray-400">{fmtDate(order.deliveredAt ?? order._creationTime)}</p>
                </div>
                <div className="text-right shrink-0">
                  {order.riderEarning != null ? (
                    <p className="font-semibold text-green-700 text-sm">{fmt(order.riderEarning)}</p>
                  ) : (
                    <p className="text-xs text-gray-400">—</p>
                  )}
                  {order.payoutId ? (
                    <p className="text-[10px] text-blue-600">paid</p>
                  ) : (
                    <p className="text-[10px] text-amber-600">unpaid</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {recentDeliveries.length === 0 && payouts.length === 0 && (
        <div className="bg-white rounded-2xl p-8 text-center">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Wallet className="h-7 w-7 text-gray-400" />
          </div>
          <p className="text-gray-500 text-sm font-medium">No earnings yet</p>
          <p className="text-gray-400 text-xs mt-1">Complete deliveries to start earning</p>
        </div>
      )}
    </div>
  );
};

export default RiderDashboard;
