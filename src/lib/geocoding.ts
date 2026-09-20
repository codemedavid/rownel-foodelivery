// Address search and reverse geocoding via the Mapbox Geocoding API v6.
//
// Results are always returned with named `latitude` / `longitude` fields rather
// than a coordinate tuple: Mapbox orders coordinates [lng, lat] while the rest
// of this app works in (lat, lng), and named fields make that flip impossible
// to get wrong at a call site.

const FORWARD_URL = 'https://api.mapbox.com/search/geocode/v6/forward';
const REVERSE_URL = 'https://api.mapbox.com/search/geocode/v6/reverse';

// 10 is the Mapbox forward-geocoding maximum; fewer than that and the one
// street the customer actually lives on often falls off the end of the list.
const MAX_SUGGESTION_LIMIT = 10;
const DEFAULT_SUGGESTION_LIMIT = MAX_SUGGESTION_LIMIT;

// Without a reference point Mapbox ranks a "Rizal Street" in Davao level with
// one two blocks away. 'ip' lets Mapbox infer the searcher's region when the
// caller has no coordinates of its own to offer.
const IP_PROXIMITY = 'ip';

// The app delivers only inside the Philippines, so every search is clamped to
// the archipelago rather than leaving it to each call site to remember.
const PH_WEST = 116.9283;
const PH_SOUTH = 4.5873;
const PH_EAST = 126.6042;
const PH_NORTH = 21.3218;

// minLon,minLat,maxLon,maxLat — the Mapbox `bbox` query parameter.
const PHILIPPINES_BBOX = `${PH_WEST},${PH_SOUTH},${PH_EAST},${PH_NORTH}`;
const PHILIPPINES_COUNTRY_CODE = 'ph';

/**
 * [southwest, northeast] in Mapbox [lng, lat] order, for `maxBounds` on a map.
 * Panning is confined to this box so a pin can never be dropped abroad.
 */
export const PHILIPPINES_BOUNDS: [[number, number], [number, number]] = [
  [PH_WEST, PH_SOUTH],
  [PH_EAST, PH_NORTH],
];

const PH_LAT_MIN = 4.5;
const PH_LAT_MAX = 21.5;
const PH_LNG_MIN = 116.9;
const PH_LNG_MAX = 126.7;

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

interface MapboxContext {
  address?: { address_number?: string; street_name?: string; name?: string };
  street?: { name?: string };
  place?: { name?: string };
  region?: { name?: string };
  country?: { name?: string; country_code?: string };
}

interface MapboxFeature {
  properties?: {
    mapbox_id?: string;
    feature_type?: string;
    full_address?: string;
    name?: string;
    place_formatted?: string;
    coordinates?: { longitude?: number | null; latitude?: number | null };
    context?: MapboxContext;
  };
}

interface MapboxFeatureCollection {
  features?: MapboxFeature[];
}

export const isWithinPhilippines = (lat: number, lng: number): boolean =>
  lat >= PH_LAT_MIN && lat <= PH_LAT_MAX && lng >= PH_LNG_MIN && lng <= PH_LNG_MAX;

const requireAccessToken = (): string => {
  const token = import.meta.env.VITE_MAPBOX_TOKEN;
  if (!token) {
    throw new Error(
      'Missing VITE_MAPBOX_TOKEN. Add a Mapbox public token to your environment.'
    );
  }
  return token;
};

const buildUrl = (baseUrl: string, params: Record<string, string>): string =>
  `${baseUrl}?${new URLSearchParams({ ...params, access_token: requireAccessToken() })}`;

const formatCoordinates = (latitude: number, longitude: number): string =>
  `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;

const readCoordinates = (
  feature: MapboxFeature
): { latitude: number; longitude: number } | null => {
  const { latitude, longitude } = feature.properties?.coordinates ?? {};

  // Guard before Number(): Number(null) is 0, which would read as a valid
  // coordinate off the coast of Africa rather than as missing data.
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return null;
  }
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  return { latitude, longitude };
};

const readDisplayName = (feature: MapboxFeature): string =>
  feature.properties?.full_address || feature.properties?.name || '';

const readCountryCode = (feature: MapboxFeature): string | undefined =>
  feature.properties?.context?.country?.country_code?.toLowerCase();

// The rider needs the house number, so prefer the address context over the
// street context, which omits it.
const readStreet = (feature: MapboxFeature): string => {
  const address = feature.properties?.context?.address;
  const houseNumber = address?.address_number?.trim() || '';
  const streetName =
    address?.street_name?.trim() || feature.properties?.context?.street?.name?.trim() || '';
  const composed = [houseNumber, streetName].filter(Boolean).join(' ').trim();

  if (composed) return composed;
  return feature.properties?.name?.trim() || 'Current location';
};

const toSuggestion = (feature: MapboxFeature): AddressSuggestion | null => {
  const coordinates = readCoordinates(feature);
  const displayName = readDisplayName(feature);

  if (!coordinates || !displayName) return null;

  return {
    placeId: feature.properties?.mapbox_id || '',
    displayName,
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    countryCode: readCountryCode(feature),
  };
};

/** A point to rank results around — usually the pin or the customer's GPS fix. */
export interface ProximityPoint {
  latitude: number;
  longitude: number;
}

const toProximityParam = (proximity?: ProximityPoint | null): string => {
  if (!proximity) return IP_PROXIMITY;
  const { latitude, longitude } = proximity;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return IP_PROXIMITY;
  // Mapbox takes [lng, lat] — the opposite order to the rest of this app.
  return `${longitude},${latitude}`;
};

export const searchAddresses = async (
  query: string,
  options?: { limit?: number; proximity?: ProximityPoint | null }
): Promise<AddressSuggestion[]> => {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const limit = Math.min(options?.limit ?? DEFAULT_SUGGESTION_LIMIT, MAX_SUGGESTION_LIMIT);
  const url = buildUrl(FORWARD_URL, {
    q: trimmed,
    limit: String(limit),
    country: PHILIPPINES_COUNTRY_CODE,
    bbox: PHILIPPINES_BBOX,
    proximity: toProximityParam(options?.proximity),
  });

  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error('Failed to fetch address suggestions');
  }

  const data = (await response.json()) as MapboxFeatureCollection;
  return (data.features ?? [])
    .map(toSuggestion)
    .filter((suggestion): suggestion is AddressSuggestion => suggestion !== null)
    // Belt and braces: the country filter above should already have done this,
    // but a foreign suggestion is worse than no suggestion for a PH-only app.
    .filter((suggestion) => isWithinPhilippines(suggestion.latitude, suggestion.longitude));
};

export const reverseGeocode = async (
  latitude: number,
  longitude: number
): Promise<ReverseGeocodeResult> => {
  const url = buildUrl(REVERSE_URL, {
    latitude: String(latitude),
    longitude: String(longitude),
  });

  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error('Failed to reverse geocode location');
  }

  const data = (await response.json()) as MapboxFeatureCollection;
  const feature = data.features?.[0];

  // No match is not an error — a pin dropped off-grid still needs a usable
  // label, so fall back to the coordinates the caller asked about.
  if (!feature) {
    return {
      placeId: '',
      displayName: formatCoordinates(latitude, longitude),
      street: 'Current location',
      latitude,
      longitude,
    };
  }

  const coordinates = readCoordinates(feature) ?? { latitude, longitude };

  return {
    placeId: feature.properties?.mapbox_id || '',
    displayName: readDisplayName(feature) || formatCoordinates(latitude, longitude),
    street: readStreet(feature),
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    countryCode: readCountryCode(feature),
  };
};
