// Turns a coordinate into something a person can read.
//
// Apple Maps first, through the web deployment's proxy: it returns the house
// number and full street line the website shows, which is what a rider actually
// needs to find the door. Expo's on-device geocoder usually drops the number,
// so it is the fallback rather than the first choice.
//
// Nothing here ever throws. A coordinate is a usable delivery point even with
// no name attached, and failing the whole flow over a missing label would be
// the app refusing to work because it could not think of what to call a place.

import * as ExpoLocation from 'expo-location';
import { reverseGeocode } from './geocoding';
import { logGeocodingError } from './geocodingError';

/**
 * Short, because a customer is watching a spinner while this runs. The default
 * 8s budget is right for a background refresh and much too long for a tap.
 */
export const INTERACTIVE_REVERSE_TIMEOUT_MS = 3500;

export interface ResolvedAddress {
  /** Full readable line, or '' when nothing could name this coordinate. */
  displayName: string;
  /** Short "12 Rizal Street" line for compact UI, or ''. */
  street: string;
}

const EMPTY: ResolvedAddress = { displayName: '', street: '' };

const fromExpo = async (
  latitude: number,
  longitude: number
): Promise<ResolvedAddress> => {
  const [address] = await ExpoLocation.reverseGeocodeAsync({ latitude, longitude });
  if (!address) return EMPTY;

  const street =
    [address.streetNumber ?? '', address.street].filter(Boolean).join(' ').trim() ||
    address.name ||
    '';

  const displayName = [street, address.district, address.city || address.subregion, address.region]
    .filter(Boolean)
    .join(', ');

  return { displayName, street: street || displayName };
};

/**
 * Best available name for a coordinate. Returns empty strings rather than
 * throwing; callers decide what to show when there is no name.
 */
export const resolveAddress = async (
  latitude: number,
  longitude: number,
  timeoutMs: number = INTERACTIVE_REVERSE_TIMEOUT_MS
): Promise<ResolvedAddress> => {
  try {
    const resolved = await reverseGeocode(latitude, longitude, { timeoutMs });
    if (resolved.displayName) {
      return { displayName: resolved.displayName, street: resolved.street || resolved.displayName };
    }
  } catch (error: unknown) {
    // Unreachable, unconfigured or rate-limited — try the on-device geocoder.
    logGeocodingError('reverse geocode', error);
  }

  try {
    return await fromExpo(latitude, longitude);
  } catch (error: unknown) {
    logGeocodingError('on-device reverse geocode', error);
    return EMPTY;
  }
};

/** What the UI shows when a coordinate could not be named. */
export const formatCoordinateLabel = (latitude: number, longitude: number): string =>
  `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
