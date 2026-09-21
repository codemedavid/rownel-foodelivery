// Calls the Apple Maps Server API on the Expo app's behalf.
//
// The Expo app cannot run MapKit JS, so it cannot geocode the way the browser
// does. It could call Apple directly, but that would mean handing a Maps access
// token to every phone — and unlike the browser's `mapkit_js` token, a
// `server_api` token takes no `origin` claim, so a copied one would spend this
// account's quota from anywhere. Proxying keeps the token on the server.
//
// Every search is clamped to the Philippines here rather than at each call
// site, so a client cannot widen it by omitting a parameter.

import {
  PHILIPPINES_COUNTRY_CODE,
  PHILIPPINES_SEARCH_REGION,
  toAddressCandidate,
  toReverseGeocodeResult,
  type AddressCandidate,
  type ApplePlace,
  type MapPoint,
  type ReverseGeocodeResult,
} from './appleMapsPlaces.js';
import { getAppleMapsAccessToken } from './appleMapsAccessToken.js';

// /v1/search, not /v1/searchAutocomplete. Autocomplete looks like the right
// endpoint for a suggestion list and is not: its rows are handles to resolve,
// and a `location` comes back only sometimes — searching "jollibee naga"
// through it returns nothing placeable at all. Search answers with real places
// that always carry a coordinate, for the same one service call.
const SEARCH_URL = 'https://maps-api.apple.com/v1/search';
const REVERSE_GEOCODE_URL = 'https://maps-api.apple.com/v1/reverseGeocode';

const LANGUAGE = 'en-US';

const REQUEST_TIMEOUT_MS = 8000;

/** An Apple request that came back with a status we cannot use. */
export class AppleMapsRequestError extends Error {
  readonly status: number;
  readonly detail?: string;

  constructor(message: string, status: number, detail?: string) {
    super(message);
    this.name = 'AppleMapsRequestError';
    this.status = status;
    this.detail = detail;
  }
}

const requestJson = async <T>(url: string): Promise<T> => {
  const accessToken = await getAppleMapsAccessToken();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => undefined);
    throw new AppleMapsRequestError(
      `Apple Maps refused the request (${response.status})`,
      response.status,
      detail
    );
  }

  return (await response.json()) as T;
};

const toCoordinateParam = ({ latitude, longitude }: MapPoint): string =>
  `${latitude},${longitude}`;

export interface SearchOptions {
  /** A point to rank results around — usually the phone's last GPS fix. */
  proximity?: MapPoint | null;
  limit: number;
}

/**
 * Address suggestions for a partial query, bounded to the Philippines.
 *
 * `resultTypeFilter` is deliberately not sent. Left off, Apple returns both
 * addresses and businesses, which is what a Philippine customer searching by
 * store name needs — and an unrecognised filter value is silently honoured as
 * "match nothing" rather than refused, which is a bad way to find out.
 */
export const searchAddresses = async (
  query: string,
  options: SearchOptions
): Promise<AddressCandidate[]> => {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const params = new URLSearchParams({
    q: trimmed,
    lang: LANGUAGE,
    limitToCountries: PHILIPPINES_COUNTRY_CODE,
    searchRegion: PHILIPPINES_SEARCH_REGION,
  });
  if (options.proximity) {
    params.set('searchLocation', toCoordinateParam(options.proximity));
  }

  const body = await requestJson<{ results?: ApplePlace[] }>(`${SEARCH_URL}?${params}`);

  return (body.results ?? [])
    .map(toAddressCandidate)
    .filter((candidate): candidate is AddressCandidate => candidate !== null)
    .slice(0, options.limit);
};

/** Street-level address for a coordinate. Never throws on "no match". */
export const reverseGeocodePoint = async (
  point: MapPoint
): Promise<ReverseGeocodeResult> => {
  const params = new URLSearchParams({
    loc: toCoordinateParam(point),
    lang: LANGUAGE,
  });

  const body = await requestJson<{ results?: ApplePlace[] }>(
    `${REVERSE_GEOCODE_URL}?${params}`
  );

  return toReverseGeocodeResult(body.results?.[0], point);
};
