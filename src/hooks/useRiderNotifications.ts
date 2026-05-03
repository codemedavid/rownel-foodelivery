import { useEffect, useRef } from 'react';
import { showNotification } from '../lib/notificationUtils';

export function useRiderNotifications(offers: unknown[], totalUnread: number) {
  const prevOffersRef = useRef<number | null>(null);
  const prevUnreadRef = useRef<number | null>(null);

  useEffect(() => {
    if (prevOffersRef.current === null) {
      prevOffersRef.current = offers.length;
      return;
    }
    if (offers.length > prevOffersRef.current) {
      showNotification('New Delivery Order!', 'A new order is waiting for you — tap to view.');
    }
    prevOffersRef.current = offers.length;
  }, [offers.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (prevUnreadRef.current === null) {
      prevUnreadRef.current = totalUnread;
      return;
    }
    if (totalUnread > prevUnreadRef.current) {
      showNotification('New Message', 'A customer sent you a message.');
    }
    prevUnreadRef.current = totalUnread;
  }, [totalUnread]);
}
