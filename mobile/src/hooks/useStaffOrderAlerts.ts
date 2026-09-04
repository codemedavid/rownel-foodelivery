import { useEffect } from 'react';
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

/**
 * Listens for new rows in `notifications` addressed to this user and reacts
 * in-app (vibration, unread bump, optional local banner).
 */
export const useStaffOrderAlerts = (
  userId: string | null | undefined,
  { isPushAvailable, onNotification }: Options
): void => {
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications-${userId}`)
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
          onNotification?.();
          if (!isPushAvailable) {
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
  }, [userId, isPushAvailable, onNotification]);
};
