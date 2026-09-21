// Live positions for the customer's tracking map.
//
// Two different things are watched, and never both at once:
//
//   * Before a rider is assigned, the other riders in the area — so the
//     customer can see the order is being matched rather than ignored.
//   * Afterwards, the assigned rider alone, polled faster because the whole
//     point is watching them approach.
//
// Neither is realtime. rider_presence writes every 20 seconds per rider, so a
// socket would deliver the same handful of updates at more cost than a poll.

import { useEffect, useRef, useState } from 'react';
import {
  riderTrackingApi,
  type AvailableRiderLocation,
  type TrackedRiderPresence,
} from '../lib/riderTrackingApi';

/** The assigned rider is the subject of the screen; this is the refresh rate. */
const ASSIGNED_POLL_MS = 12_000;

/** Ambient riders are context. They can lag without anyone minding. */
const AMBIENT_POLL_MS = 20_000;

export interface OrderTrackingState {
  presence: TrackedRiderPresence | null;
  availableRiders: AvailableRiderLocation[];
}

const EMPTY: OrderTrackingState = { presence: null, availableRiders: [] };

export interface UseOrderTrackingOptions {
  /** The rider assigned to this order, once there is one. */
  riderId?: string | null;
  /** True while the order is waiting to be matched with a rider. */
  isAwaitingRider: boolean;
}

export const useOrderTracking = ({
  riderId,
  isAwaitingRider,
}: UseOrderTrackingOptions): OrderTrackingState => {
  const [state, setState] = useState<OrderTrackingState>(EMPTY);

  // Survives the re-render each poll causes, so the interval is not rebuilt.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!riderId) {
      setState((current) => (current.presence ? { ...current, presence: null } : current));
      return;
    }

    let isCancelled = false;

    const poll = async () => {
      try {
        const presence = await riderTrackingApi.getPresence(riderId);
        if (isCancelled || !isMountedRef.current) return;
        setState((current) => ({ ...current, presence }));
      } catch {
        // Keep the last known position; the next poll retries. A rider who has
        // briefly dropped off the network has not stopped existing.
      }
    };

    void poll();
    const intervalId = setInterval(poll, ASSIGNED_POLL_MS);

    return () => {
      isCancelled = true;
      clearInterval(intervalId);
    };
  }, [riderId]);

  useEffect(() => {
    if (!isAwaitingRider) {
      setState((current) =>
        current.availableRiders.length > 0 ? { ...current, availableRiders: [] } : current
      );
      return;
    }

    let isCancelled = false;

    const poll = async () => {
      try {
        const availableRiders = await riderTrackingApi.listAvailableLocations();
        if (isCancelled || !isMountedRef.current) return;
        setState((current) => ({ ...current, availableRiders }));
      } catch {
        // Context only — an empty map here costs the customer nothing.
      }
    };

    void poll();
    const intervalId = setInterval(poll, AMBIENT_POLL_MS);

    return () => {
      isCancelled = true;
      clearInterval(intervalId);
    };
  }, [isAwaitingRider]);

  return state;
};
