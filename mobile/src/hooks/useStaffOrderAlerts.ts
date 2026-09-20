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
 * Listens for new rows in `notifications` addressed to this user and reacts
 * in-app (vibration, unread bump, optional local banner).
 */
export const useStaffOrderAlerts = (
  userId: string | null | undefined,
  { isPushAvailable, onNotification }: Options
): void => {
  // Kept in refs so option changes never tear down and re-create the channel:
  // `removeChannel` resolves asynchronously, so re-subscribing in the same tick
  // makes supabase-js throw "tried to subscribe multiple times".
  const optionsRef = useRef({ isPushAvailable, onNotification });
  optionsRef.current = { isPushAvailable, onNotification };

  useEffect(() => {
    if (!userId) return;
    // Unique topic per subscription: a remount before the previous channel has
    // finished unsubscribing must not collide with it.
    const channel = supabase
      .channel(`notifications-${userId}-${++channelSeq}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_user_id=eq.${userId}`,
        },
        (payload) => {
          const notification = mapNotification(payload.new as Record<string, unknown>);
          const isNewOrder = notification.kind === 'new_order';
          Vibration.vibrate(VIBRATE_PATTERN);
          // Ring in-app while the app is open (push only plays when backgrounded).
          if (isNewOrder) playNewOrderSound();
          optionsRef.current.onNotification?.();
          if (!optionsRef.current.isPushAvailable) {
            presentLocalNotification(
              notification.title,
              notification.body,
              { ...notification.data, notificationId: notification.id },
              isNewOrder ? NEW_ORDER_NOTIFICATION_SOUND : 'default'
            );
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);
};
