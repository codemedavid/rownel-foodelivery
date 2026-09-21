// On-demand GPS, built so nothing ever waits on it.
//
// The old flow blocked the first launch: it asked for permission, waited for a
// satellite fix, then waited again through a reverse geocode before the app
// showed anything. Three serial waits on a Philippine mobile connection is the
// "too slow" everyone complained about.
//
// This one:
//   * checks the existing permission before prompting, so a returning customer
//     skips the dialog round-trip entirely;
//   * takes the cached fix the OS already has and reports it immediately;
//   * gives the fresh fix a deadline, and keeps the cached one if it misses;
//   * hands the coordinate back the moment it has one and names it afterwards.
//
// The coordinate is the part that matters — merchant distances and delivery
// fees are computed from it. The street name is a label that catches up.

import { useCallback, useRef, useState } from 'react';
import * as ExpoLocation from 'expo-location';
import { formatCoordinateLabel, resolveAddress } from '../lib/resolveAddress';

/** A cached fix older than this is not worth showing as "where you are now". */
const LAST_KNOWN_MAX_AGE_MS = 5 * 60 * 1000;

/** Past this the cached fix is too coarse to seed a delivery pin. */
const LAST_KNOWN_MAX_ACCURACY_M = 500;

/** How long a fresh fix gets before the cached one is kept instead. */
const FRESH_FIX_DEADLINE_MS = 6000;

export type GpsStatus = 'idle' | 'locating' | 'ready' | 'error';

export interface GpsFix {
  latitude: number;
  longitude: number;
  /** Full readable line; '' while it is still being resolved. */
  displayName: string;
  /** Short line for compact UI; '' while it is still being resolved. */
  street: string;
}

export interface GpsLocationState {
  fix: GpsFix | null;
  status: GpsStatus;
  error: string | null;
  /** True while the coordinate is known but its street name is not. */
  isNamingFix: boolean;
  /** Runs a fix and returns it, or null if it could not be taken. */
  detect: () => Promise<GpsFix | null>;
  clearError: () => void;
}

const PERMISSION_DENIED_MESSAGE =
  'Location permission is off. Turn it on in Settings, or type your address instead.';

const UNAVAILABLE_MESSAGE =
  'We could not get a GPS fix. Type your address instead — delivery still works.';

/**
 * Resolves to null rather than hanging when a fresh fix takes too long. The
 * timer is cleared once the race settles, so a fix that arrives early does not
 * leave a pending timeout behind it.
 */
const withDeadline = <T>(promise: Promise<T>, ms: number): Promise<T | null> => {
  let timer: ReturnType<typeof setTimeout>;

  return Promise.race([
    promise,
    new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), ms);
    }),
  ]).finally(() => clearTimeout(timer));
};

const readCachedFix = async (): Promise<ExpoLocation.LocationObject | null> => {
  try {
    return await ExpoLocation.getLastKnownPositionAsync({
      maxAge: LAST_KNOWN_MAX_AGE_MS,
      requiredAccuracy: LAST_KNOWN_MAX_ACCURACY_M,
    });
  } catch {
    // No cached fix on this device yet; the fresh one is the only option.
    return null;
  }
};

/**
 * Grants without prompting when permission is already held. `requestFore-
 * groundPermissionsAsync` is cheap when granted, but on iOS it still crosses
 * the native bridge and can stall behind an in-flight dialog.
 */
const ensurePermission = async (): Promise<boolean> => {
  const existing = await ExpoLocation.getForegroundPermissionsAsync();
  if (existing.granted) return true;
  if (!existing.canAskAgain) return false;

  const requested = await ExpoLocation.requestForegroundPermissionsAsync();
  return requested.granted;
};

export const useGpsLocation = (): GpsLocationState => {
  const [fix, setFix] = useState<GpsFix | null>(null);
  const [status, setStatus] = useState<GpsStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isNamingFix, setIsNamingFix] = useState(false);

  // Each request gets a generation id; a slow fix from an older one can never
  // overwrite a newer one.
  const generationRef = useRef(0);

  const clearError = useCallback(() => setError(null), []);

  const detect = useCallback(async (): Promise<GpsFix | null> => {
    const requestId = ++generationRef.current;
    const isCurrent = () => requestId === generationRef.current;

    setStatus('locating');
    setError(null);

    try {
      if (!(await ensurePermission())) {
        if (!isCurrent()) return null;
        setStatus('error');
        setError(PERMISSION_DENIED_MESSAGE);
        return null;
      }

      // Start both at once: the cached fix usually lands in a millisecond and
      // gets the map moving while the fresh one is still acquiring.
      const freshFix = withDeadline(
        ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.Balanced }),
        FRESH_FIX_DEADLINE_MS
      );

      const cached = await readCachedFix();
      if (!isCurrent()) return null;

      if (cached) {
        setFix({
          latitude: cached.coords.latitude,
          longitude: cached.coords.longitude,
          displayName: '',
          street: '',
        });
        setStatus('ready');
      }

      const position = (await freshFix) ?? cached;
      if (!isCurrent()) return null;

      if (!position) {
        setStatus('error');
        setError(UNAVAILABLE_MESSAGE);
        return null;
      }

      const { latitude, longitude } = position.coords;
      const coordsOnly: GpsFix = { latitude, longitude, displayName: '', street: '' };
      setFix(coordsOnly);
      setStatus('ready');

      // The name is the only part still outstanding, and the app is already
      // usable without it.
      setIsNamingFix(true);
      const resolved = await resolveAddress(latitude, longitude);
      if (!isCurrent()) return coordsOnly;

      const named: GpsFix = {
        latitude,
        longitude,
        displayName: resolved.displayName || formatCoordinateLabel(latitude, longitude),
        street: resolved.street || formatCoordinateLabel(latitude, longitude),
      };
      setFix(named);
      setIsNamingFix(false);
      return named;
    } catch (err: unknown) {
      if (!isCurrent()) return null;
      setStatus('error');
      setError(err instanceof Error ? err.message : UNAVAILABLE_MESSAGE);
      return null;
    } finally {
      if (isCurrent()) setIsNamingFix(false);
    }
  }, []);

  return { fix, status, error, isNamingFix, detect, clearError };
};
