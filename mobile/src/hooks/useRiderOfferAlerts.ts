import { useEffect, useRef } from 'react';
import { Vibration } from 'react-native';
import { supabase } from '../lib/supabase';
import { mapNotification } from '../lib/adminMappers';
import { presentLocalNotification } from '../lib/notifications';
import { NEW_ORDER_NOTIFICATION_SOUND, playNewOrderSound } from '../lib/sounds';

interface Options {
  /** When push is registered, the server already delivers a banner; skip the local one. */
  isPushAvailable: boolean;
  onNotification?: () => void;
}

const VIBRATE_PATTERN = [0, 200, 100, 200];

let channelSeq = 0;

/**
 * Rider counterpart of useStaffOrderAlerts: reacts in-app to new offers and
 * delivery updates addressed to this rider.
 */
export const useRiderOfferAlerts = (
  riderId: string | null | undefined,
  { isPushAvailable, onNotification }: Options
): void => {
  // Kept in refs so option changes never tear down and re-create the channel:
  // removeChannel resolves asynchronously, so re-subscribing in the same tick
  // makes supabase-js throw "tried to subscribe multiple times".
  const optionsRef = useRef({ isPushAvailable, onNotification });
  optionsRef.current = { isPushAvailable, onNotification };

  useEffect(() => {
    if (!riderId) return;
    // Unique topic per subscription, matching useLiveQuery's channelSeq: a
    // remount before the previous channel finished unsubscribing must not collide.
    const channel = supabase
      .channel(`rider-notifications-${riderId}-${++channelSeq}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_user_id=eq.${riderId}`,
        },
        (payload) => {
          const notification = mapNotification(payload.new as Record<string, unknown>);
          const isNewOffer = notification.kind === 'new_offer';
          Vibration.vibrate(VIBRATE_PATTERN);
          // Offers expire in ~30s — ring in-app so an open app never misses one.
          if (isNewOffer) playNewOrderSound();
          optionsRef.current.onNotification?.();
          if (!optionsRef.current.isPushAvailable) {
            presentLocalNotification(
              notification.title,
              notification.body,
              { ...notification.data, notificationId: notification.id },
              isNewOffer ? NEW_ORDER_NOTIFICATION_SOUND : 'default'
            );
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [riderId]);
};
