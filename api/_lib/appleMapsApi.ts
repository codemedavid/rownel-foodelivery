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
  type AppleAutocompleteResult,
  type ApplePlace,
  type MapPoint,
  type ReverseGeocodeResult,
} from './appleMapsPlaces.js';
import { getAppleMapsAccessToken } from './appleMapsAccessToken.js';

const AUTOCOMPLETE_URL = 'https://maps-api.apple.com/v1/searchAutocomplete';
const REVERSE_GEOCODE_URL = 'https://maps-api.apple.com/v1/reverseGeocode';

const LANGUAGE = 'en-US';

// Addresses and businesses, but not bare query completions: those carry no
// coordinate and would only be discarded on the way back out.
const RESULT_TYPES = 'Address,Poi';

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

export interface AutocompleteOptions {
  /** A point to rank results around — usually the phone's last GPS fix. */
  proximity?: MapPoint | null;
  limit: number;
}

/** Address autocomplete, bounded to the Philippines. */
export const autocompleteAddresses = async (
  query: string,
  options: AutocompleteOptions
): Promise<AddressCandidate[]> => {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const params = new URLSearchParams({
    q: trimmed,
    lang: LANGUAGE,
    limitToCountries: PHILIPPINES_COUNTRY_CODE,
    searchRegion: PHILIPPINES_SEARCH_REGION,
    resultTypeFilter: RESULT_TYPES,
  });
  if (options.proximity) {
    params.set('searchLocation', toCoordinateParam(options.proximity));
  }

  const body = await requestJson<{ results?: AppleAutocompleteResult[] }>(
    `${AUTOCOMPLETE_URL}?${params}`
  );

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
