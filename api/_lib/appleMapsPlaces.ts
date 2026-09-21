// Translates Apple Maps Server API responses into the shapes both clients use.
//
// The Server API and MapKit JS describe the same place differently —
// `formattedAddressLines` as an array here against `formattedAddress` as a
// string there, and no place id at all on this side. This module absorbs that,
// so the Expo app receives exactly the objects the web app's
// src/lib/geocoding.ts returns and neither client has to know which Apple
// framework answered.
//
// Pure functions only: no fetch, no env, no token. That keeps the parsing —
// where the coordinate-ordering and missing-field mistakes live — testable
// without a network or an Apple account.

/** The archipelago, as Apple's `searchRegion` wants it: N,E,S,W. */
const PH_NORTH = 21.3218;
const PH_EAST = 126.6042;
const PH_SOUTH = 4.5873;
const PH_WEST = 116.9283;

export const PHILIPPINES_SEARCH_REGION = `${PH_NORTH},${PH_EAST},${PH_SOUTH},${PH_WEST}`;

export const PHILIPPINES_COUNTRY_CODE = 'PH';

// A slightly looser box than the search region: a pin on the coastline should
// still reverse geocode rather than be rejected as foreign.
const PH_LAT_MIN = 4.5;
const PH_LAT_MAX = 21.5;
const PH_LNG_MIN = 116.9;
const PH_LNG_MAX = 126.7;

const COORDINATE_LABEL_PRECISION = 5;

export interface MapPoint {
  latitude: number;
  longitude: number;
}

/** One row in an address autocomplete list. Carries its own coordinate. */
export interface AddressCandidate {
  placeId: string;
  /** Headline for the row: the business or street name on its own. */
  name: string;
  /** The whole address on one line, for a single-line field. */
  displayName: string;
  /** Town / province line, for a secondary row in the UI. */
  context: string;
  latitude: number;
  longitude: number;
  countryCode?: string;
}

export interface ReverseGeocodeResult {
  placeId: string;
  displayName: string;
  /** Short "12 Rizal Street" style line for compact UI. */
  street: string;
  latitude: number;
  longitude: number;
  countryCode?: string;
}

export interface AppleStructuredAddress {
  administrativeArea?: string | null;
  administrativeAreaCode?: string | null;
  locality?: string | null;
  subLocality?: string | null;
  postCode?: string | null;
  thoroughfare?: string | null;
  subThoroughfare?: string | null;
  fullThoroughfare?: string | null;
  areasOfInterest?: (string | null)[] | null;
  dependentLocalities?: (string | null)[] | null;
}

/** Apple's place: the shape /v1/search and /v1/reverseGeocode both return. */
export interface ApplePlace {
  coordinate?: { latitude?: number | null; longitude?: number | null } | null;
  name?: string | null;
  formattedAddressLines?: (string | null)[] | null;
  structuredAddress?: AppleStructuredAddress | null;
  country?: string | null;
  countryCode?: string | null;
}

export const isWithinPhilippines = (latitude: number, longitude: number): boolean =>
  latitude >= PH_LAT_MIN &&
  latitude <= PH_LAT_MAX &&
  longitude >= PH_LNG_MIN &&
  longitude <= PH_LNG_MAX;

export const formatCoordinates = (latitude: number, longitude: number): string =>
  `${latitude.toFixed(COORDINATE_LABEL_PRECISION)}, ${longitude.toFixed(COORDINATE_LABEL_PRECISION)}`;

/** Guards before any coercion: Number(null) is 0, a valid-looking coordinate. */
const readPoint = (
  latitude: unknown,
  longitude: unknown
): MapPoint | null => {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
};

const cleanLines = (lines: (string | null)[] | null | undefined): string[] =>
  (lines ?? []).map((line) => line?.trim() ?? '').filter(Boolean);

const readCountryCode = (code: string | null | undefined): string | undefined =>
  code?.trim().toLowerCase() || undefined;

/**
 * A search result as one autocomplete row.
 *
 * This reads /v1/search rather than /v1/searchAutocomplete. Autocomplete is
 * the obvious endpoint and the wrong one here: its rows carry a `location`
 * only sometimes — a POI completion is a handle to be resolved through its
 * `completionUrl`, not a placed result — so a dropdown built on it comes back
 * empty for exactly the business-name searches Philippine customers rely on.
 * /v1/search answers with real places, every one of which has a coordinate, so
 * picking a row drops the pin with no second round trip.
 */
export const toAddressCandidate = (place: ApplePlace): AddressCandidate | null => {
  const point = readPoint(place.coordinate?.latitude, place.coordinate?.longitude);
  if (!point) return null;
  if (!isWithinPhilippines(point.latitude, point.longitude)) return null;

  const lines = cleanLines(place.formattedAddressLines);
  const name = place.name?.trim() || lines[0] || '';
  if (!name) return null;

  // A plain street address repeats its own first line as the name; a business
  // does not. Dropping the duplicate keeps "Jollibee, Rizal Avenue, Naga" from
  // reading as "Jollibee, Jollibee, Rizal Avenue, Naga".
  const contextLines = lines[0] === name ? lines.slice(1) : lines;

  return {
    // The Server API gives places no stable id. Nothing downstream needs one:
    // the coordinate is what places the pin.
    placeId: '',
    name,
    displayName: [name, ...contextLines].join(', '),
    context: contextLines.join(', '),
    latitude: point.latitude,
    longitude: point.longitude,
    countryCode: readCountryCode(place.countryCode),
  };
};

// The rider needs the house number, so prefer the full thoroughfare, which
// includes it, over the street name on its own.
const readStreet = (place: ApplePlace): string => {
  const address = place.structuredAddress;

  const full = address?.fullThoroughfare?.trim();
  if (full) return full;

  const composed = [address?.subThoroughfare?.trim(), address?.thoroughfare?.trim()]
    .filter(Boolean)
    .join(' ')
    .trim();
  if (composed) return composed;

  return place.name?.trim() || 'Current location';
};

/**
 * A place as the reverse-geocode result for the coordinate that was asked
 * about. The caller's own coordinate is the fallback for every missing field,
 * so an off-grid pin still comes back with a usable label rather than an error.
 */
export const toReverseGeocodeResult = (
  place: ApplePlace | undefined,
  requested: MapPoint
): ReverseGeocodeResult => {
  const coordinateLabel = formatCoordinates(requested.latitude, requested.longitude);

  if (!place) {
    return {
      placeId: '',
      displayName: coordinateLabel,
      street: 'Current location',
      latitude: requested.latitude,
      longitude: requested.longitude,
    };
  }

  const point =
    readPoint(place.coordinate?.latitude, place.coordinate?.longitude) ?? requested;
  const displayName = cleanLines(place.formattedAddressLines).join(', ');

  return {
    placeId: '',
    displayName: displayName || place.name?.trim() || coordinateLabel,
    street: readStreet(place),
    latitude: point.latitude,
    longitude: point.longitude,
    countryCode: readCountryCode(place.countryCode),
  };
};
