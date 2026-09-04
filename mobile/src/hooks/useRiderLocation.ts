import { useEffect, useRef, useState } from 'react';
import * as ExpoLocation from 'expo-location';
import { riderPresenceApi } from '../lib/riderPresenceApi';
import type { RiderLocationState } from '../lib/riderTypes';

// 20s between writes keeps a full shift around ~180 location updates/hour per
// rider — comfortable headroom on Supabase free-tier request volume.
const MIN_UPDATE_INTERVAL_MS = 20_000;
const WATCH_DISTANCE_M = 25;

const INITIAL_STATE: RiderLocationState = {
  permission: 'unknown',
  coords: null,
  lastUpdate: null,
  error: null,
};

/**
 * Watches the rider's location while `enabled` and pushes throttled updates to
 * Supabase. Foreground only: dispatch needs a recent fix, so the dashboard
 * warns when the app is backgrounded long enough for the fix to go stale.
 */
export const useRiderLocation = (enabled: boolean): RiderLocationState => {
  const [state, setState] = useState<RiderLocationState>(INITIAL_STATE);
  const lastSentRef = useRef(0);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let subscription: ExpoLocation.LocationSubscription | undefined;

    const push = (latitude: number, longitude: number) => {
      const now = Date.now();
      if (inFlightRef.current || now - lastSentRef.current < MIN_UPDATE_INTERVAL_MS) return;
      inFlightRef.current = true;
      lastSentRef.current = now;
      // Swallowed on purpose — the usual cause is a brief auth gap during a
      // token refresh, and the next watch tick retries.
      riderPresenceApi
        .updateLocation(latitude, longitude)
        .catch(() => undefined)
        .finally(() => {
          inFlightRef.current = false;
        });
    };

    (async () => {
      try {
        const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
        if (cancelled) return;

        if (status !== 'granted') {
          setState((s) => ({ ...s, permission: 'denied', error: 'Location permission denied' }));
          riderPresenceApi.setLocationPermission('denied').catch(() => undefined);
          return;
        }

        setState((s) => ({ ...s, permission: 'granted', error: null }));
        riderPresenceApi.setLocationPermission('granted').catch(() => undefined);

        subscription = await ExpoLocation.watchPositionAsync(
          {
            accuracy: ExpoLocation.Accuracy.Balanced,
            timeInterval: MIN_UPDATE_INTERVAL_MS,
            distanceInterval: WATCH_DISTANCE_M,
          },
          ({ coords }) => {
            if (cancelled) return;
            setState({
              permission: 'granted',
              coords: { latitude: coords.latitude, longitude: coords.longitude },
              lastUpdate: Date.now(),
              error: null,
            });
            push(coords.latitude, coords.longitude);
          }
        );
        if (cancelled) subscription.remove();
      } catch (err) {
        if (cancelled) return;
        setState((s) => ({ ...s, error: err instanceof Error ? err.message : 'Location unavailable' }));
      }
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [enabled]);

  return state;
};
