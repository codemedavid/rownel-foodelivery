import React, { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { Bike, Phone, MessageCircle, Star, MapPin } from 'lucide-react';
import type { Id } from '../../convex/_generated/dataModel';
import { fetchRiderById, type RiderProfile } from '../hooks/useRiderProfile';
import { supabase } from '../lib/supabase';
import { showNotification, requestNotificationPermission, notificationPermission } from '../lib/notificationUtils';
import OrderChat from './OrderChat';
import RiderTrackingMap from './RiderTrackingMap';

interface Props {
  orderId: Id<'orders'>;
  assignedRiderId: string | undefined;
  orderStatus: string;
  contactNumber: string;
  deliveryLatitude?: number | null;
  deliveryLongitude?: number | null;
}

const PRE_ASSIGN_STATUSES = new Set(['pending', 'confirmed', 'preparing', 'ready']);
const ACTIVE_DELIVERY_STATUSES = new Set(['out_for_delivery']);

const CustomerRiderPanel: React.FC<Props> = ({
  orderId,
  assignedRiderId,
  orderStatus,
  contactNumber,
  deliveryLatitude,
  deliveryLongitude,
}) => {
  const [rider, setRider] = useState<RiderProfile | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [notifDismissed, setNotifDismissed] = useState(false);

  // Track messages to detect new rider messages
  const messages = useQuery(
    api.messages.listByOrder,
    assignedRiderId ? { orderId, contactNumber } : 'skip'
  );
  const riderMsgCount = (messages ?? []).filter((m) => m.senderType === 'rider').length;

  // Notify when rider is first assigned
  const prevAssignedRef = useRef<string | undefined>(undefined);
  const assignedInitRef = useRef(true);
  useEffect(() => {
    if (assignedInitRef.current) {
      assignedInitRef.current = false;
      prevAssignedRef.current = assignedRiderId;
      return;
    }
    if (!prevAssignedRef.current && assignedRiderId) {
      showNotification('Rider Assigned!', 'A rider has been assigned to your order.');
    }
    prevAssignedRef.current = assignedRiderId;
  }, [assignedRiderId]);

  // Notify on new rider message (only when chat is closed)
  const prevMsgCountRef = useRef<number | null>(null);
  useEffect(() => {
    if (prevMsgCountRef.current === null) {
      prevMsgCountRef.current = riderMsgCount;
      return;
    }
    if (riderMsgCount > prevMsgCountRef.current && !chatOpen) {
      showNotification('New Message from Rider', 'Your rider sent you a message.');
    }
    prevMsgCountRef.current = riderMsgCount;
  }, [riderMsgCount, chatOpen]);

  const presence = useQuery(
    api.riders.getPresenceById,
    assignedRiderId ? { supabaseUserId: assignedRiderId } : 'skip'
  );
  const availableRiders = useQuery(
    api.riders.listAvailableLocations,
    !assignedRiderId && PRE_ASSIGN_STATUSES.has(orderStatus) ? {} : 'skip'
  );
  const existingRating = useQuery(api.ratings.getForOrder, { orderId });

  useEffect(() => {
    if (!assignedRiderId) return;
    fetchRiderById(assignedRiderId).then(setRider);
  }, [assignedRiderId]);

  // ── State 1: Searching for a rider ────────────────────────────────────────
  if (!assignedRiderId && PRE_ASSIGN_STATUSES.has(orderStatus)) {
    const riderList = availableRiders ?? [];
    return (
      <div className="space-y-3">
        {/* Status banner */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-3 mb-1">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500" />
            </span>
            <p className="font-semibold text-amber-900 text-sm">Finding your rider…</p>
          </div>
          <p className="text-xs text-amber-700 pl-6">
            {riderList.length > 0
              ? `${riderList.length} rider${riderList.length !== 1 ? 's' : ''} available nearby`
              : 'Matching you with the closest available rider'}
          </p>
        </div>

        {/* Notification permission prompt */}
        {!notifDismissed && notificationPermission() === 'default' && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-blue-500 shrink-0" />
            <p className="text-blue-700 text-xs flex-1">Get notified when your rider is assigned.</p>
            <button
              onClick={() => { requestNotificationPermission(); setNotifDismissed(true); }}
              className="text-xs font-semibold text-blue-700 hover:text-blue-900 whitespace-nowrap"
            >
              Enable
            </button>
            <button onClick={() => setNotifDismissed(true)} className="text-blue-400 hover:text-blue-600 text-base leading-none ml-1">×</button>
          </div>
        )}

        {/* Ambient map */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 px-1">
            <MapPin className="h-3.5 w-3.5 text-gray-400" />
            <p className="text-xs text-gray-500 font-medium">Nearby riders</p>
          </div>
          <RiderTrackingMap
            mode="ambient"
            riders={riderList}
            deliveryLatitude={deliveryLatitude ?? undefined}
            deliveryLongitude={deliveryLongitude ?? undefined}
            height="200px"
          />
          {deliveryLatitude && (
            <p className="text-xs text-gray-400 flex items-center gap-1 px-1">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-600" />
              Your delivery location
              {riderList.length > 0 && (
                <>
                  <span className="mx-1">·</span>
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-orange-500" />
                  Available riders
                </>
              )}
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── State 2: Rider assigned (loading profile) ──────────────────────────────
  if (assignedRiderId && !rider) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-4 border border-red-100 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gray-200 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-200 rounded w-32" />
            <div className="h-3 bg-gray-100 rounded w-24" />
          </div>
        </div>
      </div>
    );
  }

  // ── State 3: Rider found — show card + live map ────────────────────────────
  if (!rider) return null;

  const avg = rider.rating_count > 0 ? rider.rating_sum / rider.rating_count : null;
  const isOnline = presence?.status === 'available' || presence?.status === 'busy';
  const hasLocation = presence?.currentLatitude != null && presence?.currentLongitude != null;
  const isOutForDelivery = ACTIVE_DELIVERY_STATUSES.has(orderStatus);
  const secondsAgo = presence?.lastLocationUpdate
    ? Math.round((Date.now() - presence.lastLocationUpdate) / 1000)
    : null;

  return (
    <div className="space-y-3">
      {/* Live map — shown once rider has location */}
      {hasLocation && (
        <div className="space-y-1">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
              </span>
              <p className="text-xs font-semibold text-gray-700">
                {isOutForDelivery ? 'Rider on the way' : 'Rider location'}
              </p>
            </div>
            {secondsAgo !== null && (
              <p className="text-xs text-gray-400">
                Updated {secondsAgo < 60 ? `${secondsAgo}s` : `${Math.round(secondsAgo / 60)}m`} ago
              </p>
            )}
          </div>
          <RiderTrackingMap
            mode="tracking"
            latitude={presence!.currentLatitude as number}
            longitude={presence!.currentLongitude as number}
            deliveryLatitude={deliveryLatitude ?? undefined}
            deliveryLongitude={deliveryLongitude ?? undefined}
            height="220px"
          />
        </div>
      )}

      {/* Rider card */}
      <div className="bg-white rounded-xl shadow-sm border border-red-100 overflow-hidden">
        <div className="bg-red-600 px-4 py-2.5 flex items-center justify-between">
          <p className="text-xs font-semibold text-red-100 uppercase tracking-wide">Your rider</p>
          <div className="flex items-center gap-1.5">
            <span className={`inline-block w-2 h-2 rounded-full ${isOnline ? 'bg-green-400' : 'bg-gray-400'}`} />
            <span className="text-xs text-red-100">{isOnline ? 'Online' : 'Offline'}</span>
          </div>
        </div>

        <div className="p-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-14 h-14 bg-red-600 rounded-full flex-shrink-0 shadow-md overflow-hidden flex items-center justify-center">
              {rider.photo_url ? (
                <img src={rider.photo_url} alt={rider.name} className="w-full h-full object-cover" />
              ) : (
                <Bike className="h-7 w-7 text-white" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 text-base truncate">{rider.name}</p>
              <p className="text-sm text-gray-500 truncate">
                {rider.vehicle_type} · {rider.plate_number}
              </p>
              {avg !== null && (
                <div className="flex items-center gap-1 mt-0.5">
                  <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                  <span className="text-sm font-semibold text-gray-700">{avg.toFixed(1)}</span>
                  <span className="text-xs text-gray-400">({rider.rating_count})</span>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <a
              href={`tel:${rider.phone}`}
              className="flex items-center justify-center gap-2 bg-red-600 text-white py-3 rounded-xl hover:bg-red-700 active:bg-red-800 text-sm font-semibold transition-colors"
            >
              <Phone className="h-4 w-4" /> Call
            </a>
            <button
              onClick={() => setChatOpen((v) => !v)}
              className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-colors ${
                chatOpen
                  ? 'bg-gray-800 text-white'
                  : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
              }`}
            >
              <MessageCircle className="h-4 w-4" />
              {chatOpen ? 'Close' : 'Chat'}
            </button>
          </div>
        </div>
      </div>

      {chatOpen && (
        <OrderChat
          orderId={orderId}
          senderType="customer"
          contactNumber={contactNumber}
          isCompleted={orderStatus === 'completed'}
        />
      )}

      {orderStatus === 'completed' && !existingRating && (
        <RatingPrompt orderId={orderId} contactNumber={contactNumber} riderId={assignedRiderId!} />
      )}
    </div>
  );
};

// ── Rating prompt ────────────────────────────────────────────────────────────

const RatingPrompt: React.FC<{ orderId: Id<'orders'>; contactNumber: string; riderId: string }> = ({
  orderId,
  contactNumber,
  riderId,
}) => {
  const submit = useMutation(api.ratings.submit);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (rating < 1) return;
    setSubmitting(true);
    setError('');
    try {
      await submit({ orderId, contactNumber, rating, comment: comment.trim() || undefined });
      await supabase
        .rpc('increment_rider_rating', { p_rider_id: riderId, p_rating: rating })
        .catch(async () => {
          const { data } = await supabase
            .from('riders')
            .select('rating_sum,rating_count')
            .eq('id', riderId)
            .single();
          if (data) {
            await supabase
              .from('riders')
              .update({
                rating_sum: (data.rating_sum ?? 0) + rating,
                rating_count: (data.rating_count ?? 0) + 1,
              })
              .eq('id', riderId);
          }
        });
      setDone(true);
    } catch (e: any) {
      setError(e?.message ?? 'Could not submit rating');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
        <p className="text-green-800 font-semibold text-sm">Thanks for the feedback!</p>
        <p className="text-green-600 text-xs mt-1">Your rating helps the community.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-5 border">
      <p className="font-bold text-gray-900 mb-1">How was your delivery?</p>
      <p className="text-xs text-gray-500 mb-4">Rate your experience with the rider</p>
      <div className="flex gap-2 mb-4 justify-center">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => setRating(n)} aria-label={`${n} star`} className="p-1 transition-transform hover:scale-110">
            <Star
              className={`h-8 w-8 transition-colors ${
                n <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200 hover:text-yellow-300'
              }`}
            />
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Leave a comment (optional)"
        rows={2}
        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mb-3 focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
      />
      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
      <button
        onClick={handleSubmit}
        disabled={submitting || rating < 1}
        className="w-full bg-red-600 text-white py-3 rounded-xl font-semibold hover:bg-red-700 disabled:opacity-40 transition-colors"
      >
        {submitting ? 'Submitting…' : 'Submit Rating'}
      </button>
    </div>
  );
};

export default CustomerRiderPanel;
