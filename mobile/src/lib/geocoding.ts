// Mapbox Geocoding v6 — mirrors the web app's src/lib/geocoding.ts so mobile
// shows the same street-level addresses as the website. Expo's built-in
// reverse geocoder often omits the house number, which is the part a rider needs.

const FORWARD_URL = 'https://api.mapbox.com/search/geocode/v6/forward';
const REVERSE_URL = 'https://api.mapbox.com/search/geocode/v6/reverse';

const REQUEST_TIMEOUT_MS = 8000;
// 10 is the Mapbox forward-geocoding maximum.
const MAX_SUGGESTION_LIMIT = 10;
const DEFAULT_SUGGESTION_LIMIT = MAX_SUGGESTION_LIMIT;

// Lets Mapbox rank nearby streets above same-named ones across the country
// when the caller has no coordinates of its own to offer.
const IP_PROXIMITY = 'ip';

// minLon,minLat,maxLon,maxLat — bounds autocomplete to the archipelago.
const PHILIPPINES_BBOX = '116.9283,4.5873,126.6042,21.3218';
const PHILIPPINES_COUNTRY_CODE = 'ph';
const PH_LAT_MIN = 4.5;
const PH_LAT_MAX = 21.5;
const PH_LNG_MIN = 116.9;
const PH_LNG_MAX = 126.7;

export interface MapboxFeatureProperties {
  mapbox_id?: string;
  feature_type?: string;
  full_address?: string;
  name?: string;
  place_formatted?: string;
  coordinates?: { longitude?: number | null; latitude?: number | null };
  context?: {
    address?: { address_number?: string; street_name?: string };
    street?: { name?: string };
    country?: { country_code?: string };
  };
}

interface MapboxFeatureCollection {
  features?: { properties?: MapboxFeatureProperties }[];
}

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

export const isWithinPhilippines = (latitude: number, longitude: number): boolean =>
  latitude >= PH_LAT_MIN &&
  latitude <= PH_LAT_MAX &&
  longitude >= PH_LNG_MIN &&
  longitude <= PH_LNG_MAX;

/** The full "1 Rizal Street, Poblacion, …" line the web app displays. */
export const formatDisplayName = (properties: MapboxFeatureProperties): string =>
  properties.full_address || properties.name || '';

/** "1 Rizal Street" — house number + street, falling back to the feature name. */
export const formatStreetLine = (properties: MapboxFeatureProperties): string => {
  const address = properties.context?.address;
  const houseNumber = address?.address_number?.trim() ?? '';
  const streetName = address?.street_name?.trim() || properties.context?.street?.name?.trim() || '';
  const composed = [houseNumber, streetName].filter(Boolean).join(' ').trim();

  return composed || properties.name?.trim() || 'Current location';
};

/** A point to rank results around — usually the phone's last GPS fix. */
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

const requireAccessToken = (): string => {
  const token = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
  if (!token) {
    throw new Error('Missing EXPO_PUBLIC_MAPBOX_TOKEN. Add a Mapbox public token to the app env.');
  }
  return token;
};

const buildUrl = (baseUrl: string, params: Record<string, string>): string =>
  `${baseUrl}?${new URLSearchParams({ ...params, access_token: requireAccessToken() })}`;

const formatCoordinates = (latitude: number, longitude: number): string =>
  `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;

const readCoordinates = (
  properties: MapboxFeatureProperties
): { latitude: number; longitude: number } | null => {
  const { latitude, longitude } = properties.coordinates ?? {};

  // Guard before any coercion: Number(null) is 0, a valid-looking coordinate.
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return { latitude, longitude };
};

const readCountryCode = (properties: MapboxFeatureProperties): string | undefined =>
  properties.context?.country?.country_code?.toLowerCase();

const fetchFeatures = async (url: string): Promise<MapboxFeatureProperties[]> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Mapbox request failed (${response.status})`);
    }
    const data = (await response.json()) as MapboxFeatureCollection;
    return (data.features ?? []).map((feature) => feature.properties ?? {});
  } finally {
    clearTimeout(timer);
  }
};

/** Street-level address for a GPS fix. Throws when Mapbox is unreachable. */
export const reverseGeocode = async (
  latitude: number,
  longitude: number
): Promise<ReverseGeocodeResult> => {
  const features = await fetchFeatures(
    buildUrl(REVERSE_URL, { latitude: String(latitude), longitude: String(longitude) })
  );
  const properties = features[0];

  // No match is not an error — an off-grid pin still needs a usable label.
  if (!properties) {
    return {
      placeId: '',
      displayName: formatCoordinates(latitude, longitude),
      street: 'Current location',
      latitude,
      longitude,
    };
  }

  const coordinates = readCoordinates(properties) ?? { latitude, longitude };

  return {
    placeId: properties.mapbox_id ?? '',
    displayName: formatDisplayName(properties) || formatCoordinates(latitude, longitude),
    street: formatStreetLine(properties),
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    countryCode: readCountryCode(properties),
  };
};

/** Address autocomplete, bounded to the Philippines like the web checkout. */
export const searchAddresses = async (
  query: string,
  options?: { limit?: number; proximity?: ProximityPoint | null }
): Promise<AddressSuggestion[]> => {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const limit = Math.min(options?.limit ?? DEFAULT_SUGGESTION_LIMIT, MAX_SUGGESTION_LIMIT);
  const features = await fetchFeatures(
    buildUrl(FORWARD_URL, {
      q: trimmed,
      limit: String(limit),
      country: PHILIPPINES_COUNTRY_CODE,
      bbox: PHILIPPINES_BBOX,
      proximity: toProximityParam(options?.proximity),
    })
  );

  return features
    .map((properties) => {
      const coordinates = readCoordinates(properties);
      const displayName = formatDisplayName(properties);
      if (!coordinates || !displayName) return null;

      return {
        placeId: properties.mapbox_id ?? '',
        displayName,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        countryCode: readCountryCode(properties),
      };
    })
    .filter((suggestion): suggestion is AddressSuggestion => suggestion !== null)
    // Belt and braces: the country filter should already have done this, but a
    // foreign suggestion is worse than no suggestion for a PH-only app.
    .filter((suggestion) => isWithinPhilippines(suggestion.latitude, suggestion.longitude));
};
