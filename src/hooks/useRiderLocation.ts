import { useEffect, useRef, useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';

export type LocationPermission = 'granted' | 'denied' | 'unknown';

interface State {
  permission: LocationPermission;
  coords: { latitude: number; longitude: number } | null;
  lastUpdate: number | null;
  error: string | null;
}

const MIN_UPDATE_INTERVAL_MS = 15_000;

// Watches the rider's geolocation while `enabled` is true and pushes updates
// to Convex. Returns permission state for the dashboard's location gate.
export function useRiderLocation(enabled: boolean) {
  const updateLocation = useMutation(api.riders.updateLocation);
  const setPermission = useMutation(api.riders.setLocationPermission);

  // Stash mutations in refs so the watch effect's deps stay [enabled] only.
  // If we listed the mutation refs in deps, any unstable identity would
  // tear down and recreate the geolocation watch on every render.
  const updateLocationRef = useRef(updateLocation);
  const setPermissionRef = useRef(setPermission);
  useEffect(() => {
    updateLocationRef.current = updateLocation;
    setPermissionRef.current = setPermission;
  }, [updateLocation, setPermission]);

  const [state, setState] = useState<State>({
    permission: 'unknown',
    coords: null,
    lastUpdate: null,
    error: null,
  });
  const lastSentRef = useRef<number>(0);
  const watchIdRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    if (!('geolocation' in navigator)) {
      setState((s) => ({ ...s, error: 'Geolocation not supported' }));
      return;
    }

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const now = Date.now();
        setState((s) =>
          // Skip a re-render if the coords haven't actually moved enough.
          s.coords &&
          Math.abs(s.coords.latitude - latitude) < 1e-6 &&
          Math.abs(s.coords.longitude - longitude) < 1e-6 &&
          s.permission === 'granted'
            ? { ...s, lastUpdate: now }
            : {
                permission: 'granted',
                coords: { latitude, longitude },
                lastUpdate: now,
                error: null,
              }
        );
        if (
          !inFlightRef.current &&
          now - lastSentRef.current >= MIN_UPDATE_INTERVAL_MS
        ) {
          inFlightRef.current = true;
          lastSentRef.current = now;
          // Swallow errors silently — the most common cause is a brief Convex
          // auth gap during a Supabase token refresh. The next watch tick
          // will retry, so logging would just spam the console.
          updateLocationRef.current({ latitude, longitude })
            .catch(() => {})
            .finally(() => {
              inFlightRef.current = false;
            });
        }
      },
      (err) => {
        const denied = err.code === err.PERMISSION_DENIED;
        setState((s) => ({
          ...s,
          permission: denied ? 'denied' : s.permission,
          error: err.message,
        }));
        if (denied) {
          setPermissionRef.current({ permission: 'denied' }).catch(() => {});
        }
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 }
    );

    watchIdRef.current = id;
    return () => {
      navigator.geolocation.clearWatch(id);
      watchIdRef.current = null;
    };
  }, [enabled]);

  return state;
}
