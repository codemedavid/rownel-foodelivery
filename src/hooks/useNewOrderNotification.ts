import { useEffect, useRef, useCallback } from 'react';
import { ConvexOrder } from './useConvexOrders';

/**
 * Plays a notification sound and shows a browser notification when new orders
 * arrive. Tries `/sounds/new-order.mp3` first; falls back to a Web Audio API
 * generated beep if the file is missing or the browser blocks playback.
 */
export const useNewOrderNotification = (orders: ConvexOrder[]) => {
  const prevCountRef = useRef<number>(orders.length);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const initialLoadRef = useRef(true);

  // Create audio element once
  useEffect(() => {
    if (!audioRef.current) {
      const audio = new Audio('/sounds/new-order.mp3');
      audio.volume = 0.7;
      audioRef.current = audio;
    }
  }, []);

  /** Play a Web Audio API beep as a fallback. */
  const playFallbackBeep = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.3;
      oscillator.start();
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      oscillator.stop(ctx.currentTime + 0.5);
    } catch {
      console.warn('Audio notification not available');
    }
  }, []);

  /** Try to play the mp3 file; fall back to a generated beep on failure. */
  const playNotificationSound = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {
        playFallbackBeep();
      });
    } else {
      playFallbackBeep();
    }
  }, [playFallbackBeep]);

  useEffect(() => {
    // Skip the very first render so existing orders don't trigger a sound
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      prevCountRef.current = orders.length;
      return;
    }

    // New orders detected
    if (orders.length > prevCountRef.current) {
      const newOrderCount = orders.length - prevCountRef.current;

      // Play sound
      playNotificationSound();

      // Show browser notification if permitted
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('New Order Received!', {
          body: `${newOrderCount} new order${newOrderCount > 1 ? 's' : ''} received`,
          icon: '/favicon.ico',
        });
      }
    }

    prevCountRef.current = orders.length;
  }, [orders.length, playNotificationSound]);

  /** Request browser notification permission (only prompts when state is 'default'). */
  const requestPermission = useCallback(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  return { requestPermission };
};
