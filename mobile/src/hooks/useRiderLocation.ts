import { useCallback, useEffect, useRef, useState } from 'react';
import * as ExpoLocation from 'expo-location';
import { riderPresenceApi } from '../lib/riderPresenceApi';
import { HEARTBEAT_CHECK_MS, isHeartbeatDue } from '../lib/riderGps';
import type { RiderCoords, RiderLocationState } from '../lib/riderTypes';

// 20s between movement-driven writes keeps a full shift around ~180 location
// updates/hour per rider — comfortable headroom on Supabase free-tier volume.
const MIN_UPDATE_INTERVAL_MS = 20_000;
const WATCH_DISTANCE_M = 25;

export interface RiderLocationOptions {
  /** Watch the sensor. Must be on before the rider can go online. */
  enabled: boolean;
  /** Push fixes to Supabase. Only true once the rider is on shift. */
  publish: boolean;
}

export interface RiderLocationTracking extends RiderLocationState {
  /** When the current search began; null once a fix has landed. */
  searchStartedAt: number | null;
  /** Restart permission + watch after a failed or slow search. */
  retry: () => void;
}

const INITIAL_STATE: RiderLocationState = {
  permission: 'unknown',
  coords: null,
  lastUpdate: null,
  error: null,
};

/**
 * Watches the rider's location while `enabled` and pushes throttled updates to
 * Supabase while `publish`.
 *
 * Two things this has to get right, both of which the server enforces:
 *  - The watch runs whether or not the rider is online, because rider_set_online
 *    rejects anyone without a fix from the last 120s. Gating the watch on being
 *    online would mean never being able to go online.
 *  - A parked rider still gets a heartbeat write. The OS only reports a position
 *    when the device moves, so without it dispatch_for_order drops a stationary
 *    rider two minutes into their shift.
 *
 * Foreground only: the dashboard warns when the fix goes stale.
 */
export const useRiderLocation = ({
  enabled,
  publish,
}: RiderLocationOptions): RiderLocationTracking => {
  const [state, setState] = useState<RiderLocationState>(INITIAL_STATE);
  const [searchStartedAt, setSearchStartedAt] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);

  const lastSentRef = useRef(0);
  const inFlightRef = useRef(false);
  const coordsRef = useRef<RiderCoords | null>(null);
  const hasFixRef = useRef(false);
  // Read inside long-lived callbacks so toggling publish never tears down the watch.
  const publishRef = useRef(publish);

  useEffect(() => {
    publishRef.current = publish;
  }, [publish]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) {
      setState(INITIAL_STATE);
      setSearchStartedAt(null);
      hasFixRef.current = false;
      coordsRef.current = null;
      return;
    }

    let cancelled = false;
    let subscription: ExpoLocation.LocationSubscription | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;

    const push = (latitude: number, longitude: number) => {
      if (!publishRef.current) return;
      const now = Date.now();
      if (inFlightRef.current || now - lastSentRef.current < MIN_UPDATE_INTERVAL_MS) return;
      inFlightRef.current = true;
      lastSentRef.current = now;
      // Swallowed on purpose — the usual cause is a brief auth gap during a
      // token refresh, and the next watch tick or heartbeat retries.
      riderPresenceApi
        .updateLocation(latitude, longitude)
        .catch(() => undefined)
        .finally(() => {
          inFlightRef.current = false;
        });
    };

    const applyFix = ({ latitude, longitude }: RiderCoords) => {
      if (cancelled) return;
      coordsRef.current = { latitude, longitude };
      hasFixRef.current = true;
      setSearchStartedAt(null);
      setState({
        permission: 'granted',
        coords: { latitude, longitude },
        lastUpdate: Date.now(),
        error: null,
      });
      push(latitude, longitude);
    };

    setSearchStartedAt(Date.now());
    setState((s) => ({ ...s, error: null }));
    hasFixRef.current = false;

    (async () => {
      try {
        const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
        if (cancelled) return;

        if (status !== 'granted') {
          setState((s) => ({ ...s, permission: 'denied', error: 'Location permission denied' }));
          setSearchStartedAt(null);
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
          ({ coords }) => applyFix(coords)
        );
        if (cancelled) {
          subscription.remove();
          return;
        }

        // Keeps a standing-still rider inside the server's freshness window.
        heartbeat = setInterval(() => {
          const coords = coordsRef.current;
          if (!coords || !publishRef.current) return;
          if (isHeartbeatDue(lastSentRef.current, Date.now())) {
            push(coords.latitude, coords.longitude);
          }
        }, HEARTBEAT_CHECK_MS);

        // The watch alone can idle until the rider moves, so force the first
        // fix — that is the one standing between them and going online.
        try {
          const current = await ExpoLocation.getCurrentPositionAsync({
            accuracy: ExpoLocation.Accuracy.Balanced,
          });
          applyFix(current.coords);
        } catch (err) {
          // Only a failure with nothing to show is worth reporting; the watch
          // stays up either way and may still deliver a fix.
          if (cancelled || hasFixRef.current) return;
          setState((s) => ({
            ...s,
            error: err instanceof Error ? err.message : 'Could not get a GPS fix',
          }));
          setSearchStartedAt(null);
        }
      } catch (err) {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          error: err instanceof Error ? err.message : 'Location unavailable',
        }));
        setSearchStartedAt(null);
      }
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
      if (heartbeat) clearInterval(heartbeat);
    };
  }, [enabled, attempt]);

  return { ...state, searchStartedAt, retry };
};
