import { useCallback, useEffect, useRef, useState } from 'react';
import { ridersApi } from '../lib/deliveryApi';
import { HEARTBEAT_CHECK_MS, isHeartbeatDue } from '../lib/riderGps';
import type { LocationPermission } from '../lib/deliveryTypes';

export type { LocationPermission };

interface Coords {
  latitude: number;
  longitude: number;
}

interface State {
  permission: LocationPermission;
  coords: Coords | null;
  lastUpdate: number | null;
  error: string | null;
}

export interface RiderLocationTracking extends State {
  /** When the current search began; null once a fix has landed. */
  searchStartedAt: number | null;
  /** Restart the watch after a failed or slow search. */
  retry: () => void;
}

export interface RiderLocationOptions {
  /** Push fixes to Supabase. Defaults to true — off while only previewing. */
  publish?: boolean;
}

// 20s between movement-driven writes keeps a full shift around ~180 location
// updates/hour per rider — comfortable headroom on Supabase free-tier volume.
const MIN_UPDATE_INTERVAL_MS = 20_000;

const WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 10_000,
  timeout: 30_000,
};

// The seeding read may use a cached, coarser fix: having *a* position is what
// unblocks going online, and the watch refines it moments later.
const FIRST_FIX_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  maximumAge: 60_000,
  timeout: 15_000,
};

const INITIAL_STATE: State = {
  permission: 'unknown',
  coords: null,
  lastUpdate: null,
  error: null,
};

/**
 * Watches the rider's geolocation while `enabled` and pushes updates to
 * Supabase while `publish`.
 *
 * Two things the server forces on us:
 *  - rider_set_online rejects anyone without a fix from the last 120s, so the
 *    watch cannot wait for the rider to be online — that is a deadlock.
 *  - dispatch_for_order skips a rider whose fix has aged out, and the browser
 *    only reports a position on movement, so a parked rider needs a heartbeat.
 */
export function useRiderLocation(
  enabled: boolean,
  { publish = true }: RiderLocationOptions = {}
): RiderLocationTracking {
  const [state, setState] = useState<State>(INITIAL_STATE);
  const [searchStartedAt, setSearchStartedAt] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);

  const lastSentRef = useRef(0);
  const watchIdRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  const coordsRef = useRef<Coords | null>(null);
  const hasFixRef = useRef(false);
  // Read inside long-lived callbacks so toggling publish never tears down the watch.
  const publishRef = useRef(publish);

  useEffect(() => {
    publishRef.current = publish;
  }, [publish]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      hasFixRef.current = false;
      coordsRef.current = null;
      setSearchStartedAt(null);
      return;
    }

    if (!('geolocation' in navigator)) {
      setState((s) => ({ ...s, error: 'Geolocation not supported' }));
      return;
    }

    const push = (latitude: number, longitude: number) => {
      if (!publishRef.current) return;
      const now = Date.now();
      if (inFlightRef.current || now - lastSentRef.current < MIN_UPDATE_INTERVAL_MS) return;
      inFlightRef.current = true;
      lastSentRef.current = now;
      // Swallow errors silently — the most common cause is a brief auth gap
      // during a token refresh. The next watch tick or heartbeat retries.
      ridersApi
        .updateLocation(latitude, longitude)
        .catch(() => {})
        .finally(() => {
          inFlightRef.current = false;
        });
    };

    const applyFix = ({ latitude, longitude }: Coords) => {
      coordsRef.current = { latitude, longitude };
      hasFixRef.current = true;
      setSearchStartedAt(null);
      setState((s) =>
        // Skip a re-render if the coords haven't actually moved enough.
        s.coords &&
        Math.abs(s.coords.latitude - latitude) < 1e-6 &&
        Math.abs(s.coords.longitude - longitude) < 1e-6 &&
        s.permission === 'granted'
          ? { ...s, lastUpdate: Date.now(), error: null }
          : {
              permission: 'granted',
              coords: { latitude, longitude },
              lastUpdate: Date.now(),
              error: null,
            }
      );
      push(latitude, longitude);
    };

    const onError = (err: GeolocationPositionError) => {
      const denied = err.code === err.PERMISSION_DENIED;
      if (denied) {
        setSearchStartedAt(null);
        setState((s) => ({ ...s, permission: 'denied', error: err.message }));
        ridersApi.setLocationPermission('denied').catch(() => {});
        return;
      }
      // A timeout between updates is normal once we already have a position;
      // only a failure with nothing to show should reach the rider.
      if (hasFixRef.current) return;
      setSearchStartedAt(null);
      setState((s) => ({ ...s, error: err.message }));
    };

    setSearchStartedAt(Date.now());
    hasFixRef.current = false;
    setState((s) => ({ ...s, error: null }));

    const id = navigator.geolocation.watchPosition(
      (pos) => applyFix(pos.coords),
      onError,
      WATCH_OPTIONS
    );
    watchIdRef.current = id;

    // watchPosition can idle until the rider moves, and a rider standing still
    // must still be able to go online: ask for a position outright.
    navigator.geolocation.getCurrentPosition(
      (pos) => applyFix(pos.coords),
      onError,
      FIRST_FIX_OPTIONS
    );

    // Keeps a standing-still rider inside the server's freshness window.
    const heartbeat = setInterval(() => {
      const coords = coordsRef.current;
      if (!coords || !publishRef.current) return;
      if (isHeartbeatDue(lastSentRef.current, Date.now())) {
        push(coords.latitude, coords.longitude);
      }
    }, HEARTBEAT_CHECK_MS);

    return () => {
      navigator.geolocation.clearWatch(id);
      watchIdRef.current = null;
      clearInterval(heartbeat);
    };
  }, [enabled, attempt]);

  return { ...state, searchStartedAt, retry };
}
