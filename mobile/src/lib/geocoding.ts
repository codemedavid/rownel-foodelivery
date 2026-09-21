// Address search and reverse geocoding via Apple Maps.
//
// This used to call Mapbox directly with a token compiled into the app. It now
// goes through the web deployment's /api/maps-search and /api/maps-reverse,
// which call Apple's Maps Server API — the same Apple account the website's
// MapKit JS maps use, so a customer sees identical suggestions in both places.
//
// Two reasons it proxies rather than calling Apple from the phone:
//   * An Apple `server_api` token takes no `origin` claim, so one shipped in
//     the app could spend this account's quota from anywhere.
//   * A token in an installed binary cannot be rotated without a new release.
//
// Results carry named `latitude` / `longitude` rather than a coordinate tuple,
// so the ordering can never be flipped at a call site.

import { buildReverseUrl, buildSearchUrl, MapsConfigError } from './map/mapsConfig';
import { classifyHttpStatus, GeocodingError, isAbortError } from './geocodingError';

const REQUEST_TIMEOUT_MS = 8000;

// More than this and the dropdown stops being usable on a phone. The proxy
// enforces the same ceiling; asking for more is a 400.
const MAX_SUGGESTION_LIMIT = 10;
const DEFAULT_SUGGESTION_LIMIT = MAX_SUGGESTION_LIMIT;

// A slightly looser box than the search region: a pin on the coastline should
// still reverse geocode rather than be rejected as foreign.
const PH_LAT_MIN = 4.5;
const PH_LAT_MAX = 21.5;
const PH_LNG_MIN = 116.9;
const PH_LNG_MAX = 126.7;

export interface ReverseGeocodeResult {
  placeId: string;
  /** Full readable address, house number first. */
  displayName: string;
  /** Short "12 Rizal Street" style line for compact UI. */
  street: string;
  latitude: number;
  longitude: number;
  countryCode?: string;
}

export interface AddressSuggestion {
  placeId: string;
  displayName: string;
  latitude: number;
  longitude: number;
  countryCode?: string;
}

/**
 * One row in the autocomplete list. It already carries the coordinate, so
 * selecting a row places the pin immediately — no second lookup.
 */
export interface AddressCandidate extends AddressSuggestion {
  /** Headline for the row: the business or street name on its own. */
  name: string;
  /** Town / province line, for a secondary row in the UI. */
  context: string;
}

/** A point to rank results around — usually the phone's last GPS fix. */
export interface ProximityPoint {
  latitude: number;
  longitude: number;
}

export interface ReverseGeocodeOptions {
  /**
   * Shorter than the default when someone is watching a spinner. The caller
   * decides what it does with the failure — a GPS fix falls back to the
   * on-device geocoder, a dropped pin falls back to a coordinate label.
   */
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface SuggestOptions {
  limit?: number;
  proximity?: ProximityPoint | null;
  /** Cancels a request the customer's next keystroke has superseded. */
  signal?: AbortSignal;
}

export const isWithinPhilippines = (latitude: number, longitude: number): boolean =>
  latitude >= PH_LAT_MIN &&
  latitude <= PH_LAT_MAX &&
  longitude >= PH_LNG_MIN &&
  longitude <= PH_LNG_MAX;

const isUsablePoint = (point: ProximityPoint | null | undefined): point is ProximityPoint =>
  !!point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude);

/**
 * Runs one proxy request, mapping every way it can fail onto a kind the UI can
 * act on. A timeout aborts the fetch, which is why an abort raised by our own
 * controller is reported as a network failure rather than a cancellation —
 * the caller's own signal is checked first.
 */
const requestJson = async <T>(
  url: string,
  callerSignal?: AbortSignal,
  timeoutMs: number = REQUEST_TIMEOUT_MS
): Promise<T> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const onCallerAbort = () => controller.abort();
  callerSignal?.addEventListener('abort', onCallerAbort);

  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new GeocodingError(
        classifyHttpStatus(response.status),
        `Address lookup failed (${response.status})`,
        { status: response.status }
      );
    }

    return (await response.json()) as T;
  } catch (error: unknown) {
    if (error instanceof GeocodingError) throw error;

    if (isAbortError(error)) {
      // The caller superseded this request; that is not a failure.
      if (callerSignal?.aborted) {
        throw new GeocodingError('aborted', 'Address lookup was cancelled', { cause: error });
      }
      throw new GeocodingError('network', 'Address lookup timed out', { cause: error });
    }

    throw new GeocodingError('network', 'Could not reach the address service', { cause: error });
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', onCallerAbort);
  }
};

/** A missing EXPO_PUBLIC_WEB_ORIGIN is a build problem, not an outage. */
const toGeocodingError = (error: unknown): GeocodingError => {
  if (error instanceof GeocodingError) return error;
  if (error instanceof MapsConfigError) {
    return new GeocodingError('config', error.message, { cause: error });
  }
  return new GeocodingError('unknown', 'Address lookup failed', { cause: error });
};

/**
 * Autocomplete rows for a partial query, bounded to the Philippines by the
 * proxy. Businesses and landmarks are indexed as well as street addresses —
 * Philippine customers locate themselves by store name far more often than by
 * house number.
 */
export const suggestAddresses = async (
  query: string,
  options: SuggestOptions = {}
): Promise<AddressCandidate[]> => {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const params = new URLSearchParams({
    q: trimmed,
    limit: String(Math.min(options.limit ?? DEFAULT_SUGGESTION_LIMIT, MAX_SUGGESTION_LIMIT)),
  });
  if (isUsablePoint(options.proximity)) {
    params.set('lat', String(options.proximity.latitude));
    params.set('lng', String(options.proximity.longitude));
  }

  try {
    const body = await requestJson<{ results?: AddressCandidate[] }>(
      buildSearchUrl(params),
      options.signal
    );
    return body.results ?? [];
  } catch (error: unknown) {
    throw toGeocodingError(error);
  }
};

/**
 * Kept for callers that only need a flat suggestion list. The proxy returns the
 * richer candidate shape; this drops the parts they do not use.
 */
export const searchAddresses = async (
  query: string,
  options: SuggestOptions = {}
): Promise<AddressSuggestion[]> => suggestAddresses(query, options);

/**
 * Street-level address for a GPS fix or a dropped pin. A coordinate Apple has
 * no match for is not an error — the result carries a coordinate label, so an
 * off-grid pin is still usable.
 */
export const reverseGeocode = async (
  latitude: number,
  longitude: number,
  options: ReverseGeocodeOptions = {}
): Promise<ReverseGeocodeResult> => {
  const params = new URLSearchParams({ lat: String(latitude), lng: String(longitude) });

  try {
    return await requestJson<ReverseGeocodeResult>(
      buildReverseUrl(params),
      options.signal,
      options.timeoutMs
    );
  } catch (error: unknown) {
    throw toGeocodingError(error);
  }
};
