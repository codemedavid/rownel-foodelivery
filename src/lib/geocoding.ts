// Address search and reverse geocoding via Apple MapKit JS.
//
// Results are always returned with named `latitude` / `longitude` fields rather
// than a coordinate tuple, so the (lat, lng) ordering can never be flipped at a
// call site.
//
// Autocomplete uses MapKit's Search service, which indexes businesses and
// landmarks as well as street addresses — Philippine customers locate
// themselves by store name far more often than by house number. Unlike the
// Mapbox Search Box this replaced, MapKit returns the coordinate with each
// suggestion, so picking one needs no second round trip.

import { loadMapkit } from './mapkit/loadMapkit';
import { GeocodingError, isAbortError } from './geocodingError';

// The app delivers only inside the Philippines, so every search is clamped to
// the archipelago rather than leaving it to each call site to remember.
const PH_SOUTH = 4.5873;
const PH_NORTH = 21.3218;
const PH_WEST = 116.9283;
const PH_EAST = 126.6042;

const PHILIPPINES_COUNTRY_CODE = 'PH';

/**
 * The archipelago as a MapKit region: centre plus span. Used to bias searches
 * and, as a map's `cameraBoundary`, to stop a pin being dropped abroad.
 */
export const PHILIPPINES_REGION = {
  center: {
    latitude: (PH_SOUTH + PH_NORTH) / 2,
    longitude: (PH_WEST + PH_EAST) / 2,
  },
  span: {
    latitudeDelta: PH_NORTH - PH_SOUTH,
    longitudeDelta: PH_EAST - PH_WEST,
  },
} as const;

// A slightly looser box than the search region: a pin on the coastline should
// still reverse geocode rather than be rejected as foreign.
const PH_LAT_MIN = 4.5;
const PH_LAT_MAX = 21.5;
const PH_LNG_MIN = 116.9;
const PH_LNG_MAX = 126.7;

// MapKit returns as many completions as it has; more than this and the dropdown
// stops being usable on a phone.
const DEFAULT_SUGGESTION_LIMIT = 10;

const COORDINATE_LABEL_PRECISION = 5;

export interface AddressSuggestion {
  placeId: string;
  displayName: string;
  latitude: number;
  longitude: number;
  countryCode?: string;
}

export interface ReverseGeocodeResult {
  placeId: string;
  displayName: string;
  street: string;
  latitude: number;
  longitude: number;
  countryCode?: string;
}

/** A point to rank results around — usually the pin or the customer's GPS fix. */
export interface ProximityPoint {
  latitude: number;
  longitude: number;
}

/**
 * One row in the autocomplete dropdown. It already carries the coordinate, so
 * selecting a row places the pin immediately.
 */
export interface AddressCandidate extends AddressSuggestion {
  /** Headline for the row: the business or street name on its own. */
  name: string;
  /** Town / province line, for a secondary row in the UI. */
  context: string;
}

export interface SuggestOptions {
  limit?: number;
  proximity?: ProximityPoint | null;
  /** Cancels a request the customer's next keystroke has superseded. */
  signal?: AbortSignal;
}

export const isWithinPhilippines = (lat: number, lng: number): boolean =>
  lat >= PH_LAT_MIN && lat <= PH_LAT_MAX && lng >= PH_LNG_MIN && lng <= PH_LNG_MAX;

const formatCoordinates = (latitude: number, longitude: number): string =>
  `${latitude.toFixed(COORDINATE_LABEL_PRECISION)}, ${longitude.toFixed(COORDINATE_LABEL_PRECISION)}`;

/**
 * Wraps whatever MapKit threw. An abort is kept distinct because it means the
 * app cancelled the request itself, which callers must not show as a failure.
 */
const toGeocodingError = (error: unknown, message: string): GeocodingError => {
  if (error instanceof GeocodingError) return error;
  if (isAbortError(error)) return new GeocodingError('aborted', message, { cause: error });
  return new GeocodingError('unknown', message, { cause: error });
};

const readCoordinate = (
  coordinate: { latitude?: number; longitude?: number } | null | undefined
): ProximityPoint | null => {
  const latitude = coordinate?.latitude;
  const longitude = coordinate?.longitude;

  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
};

interface AutocompleteResultLike {
  id?: string | null;
  name?: string | null;
  displayLines?: string[] | null;
  coordinate?: { latitude?: number; longitude?: number } | null;
  countryCode?: string | null;
}

/**
 * MapKit formats `displayLines` for the locale — typically the place name on
 * the first line and the town/province on the rest. Using them verbatim keeps
 * the label consistent with what Apple Maps itself would show.
 */
const toCandidate = (result: AutocompleteResultLike): AddressCandidate | null => {
  const coordinate = readCoordinate(result.coordinate);
  // A completion with no coordinate is a bare query suggestion; it could never
  // place a pin, so it has no business in a delivery address field.
  if (!coordinate) return null;
  if (!isWithinPhilippines(coordinate.latitude, coordinate.longitude)) return null;

  const lines = (result.displayLines ?? []).map((line) => line.trim()).filter(Boolean);
  const displayName = lines.join(', ');
  const name = result.name?.trim() || lines[0] || '';
  if (!displayName || !name) return null;

  return {
    placeId: result.id?.trim() || '',
    name,
    displayName,
    context: lines.slice(1).join(', '),
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    countryCode: result.countryCode?.toLowerCase(),
  };
};

/** Autocomplete rows for a partial query. Bounded to the Philippines. */
export const suggestAddresses = async (
  query: string,
  options: SuggestOptions = {}
): Promise<AddressCandidate[]> => {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const limit = options.limit ?? DEFAULT_SUGGESTION_LIMIT;
  const proximity = options.proximity;

  try {
    const mapkit = await loadMapkit();
    const search = new mapkit.Search({ getsUserLocation: false });

    const response = await search.autocomplete(trimmed, {
      language: 'en',
      limitToCountries: PHILIPPINES_COUNTRY_CODE,
      region: PHILIPPINES_REGION,
      includeAddresses: true,
      includePointsOfInterest: true,
      // Bare query completions carry no coordinate and would only be discarded.
      includeQueries: false,
      ...(proximity ? { coordinate: proximity } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    });

    return (response.results ?? [])
      .map(toCandidate)
      .filter((candidate): candidate is AddressCandidate => candidate !== null)
      .slice(0, limit);
  } catch (error: unknown) {
    throw toGeocodingError(error, 'Failed to fetch address suggestions');
  }
};

interface PlaceLike {
  id?: string | null;
  name?: string | null;
  formattedAddress?: string | null;
  coordinate?: { latitude?: number; longitude?: number } | null;
  fullThoroughfare?: string | null;
  thoroughfare?: string | null;
  subThoroughfare?: string | null;
  countryCode?: string | null;
}

// The rider needs the house number, so prefer the full thoroughfare, which
// includes it, over the street name on its own.
const readStreet = (place: PlaceLike): string => {
  const full = place.fullThoroughfare?.trim();
  if (full) return full;

  const composed = [place.subThoroughfare?.trim(), place.thoroughfare?.trim()]
    .filter(Boolean)
    .join(' ')
    .trim();
  if (composed) return composed;

  return place.name?.trim() || 'Current location';
};

export const reverseGeocode = async (
  latitude: number,
  longitude: number
): Promise<ReverseGeocodeResult> => {
  let place: PlaceLike | undefined;

  try {
    const mapkit = await loadMapkit();
    const geocoder = new mapkit.Geocoder({ getsUserLocation: false, language: 'en' });
    const response = await geocoder.reverseLookup(
      new mapkit.Coordinate(latitude, longitude),
      { language: 'en' }
    );
    place = response.results?.[0];
  } catch (error: unknown) {
    throw toGeocodingError(error, 'Failed to reverse geocode location');
  }

  // No match is not an error — a pin dropped off-grid still needs a usable
  // label, so fall back to the coordinates the caller asked about.
  if (!place) {
    return {
      placeId: '',
      displayName: formatCoordinates(latitude, longitude),
      street: 'Current location',
      latitude,
      longitude,
    };
  }

  const coordinate = readCoordinate(place.coordinate) ?? { latitude, longitude };

  return {
    placeId: place.id?.trim() || '',
    displayName:
      place.formattedAddress?.trim() ||
      place.name?.trim() ||
      formatCoordinates(latitude, longitude),
    street: readStreet(place),
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    countryCode: place.countryCode?.toLowerCase(),
  };
};
