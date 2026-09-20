// Address search and reverse geocoding via the Mapbox Geocoding API v6.
//
// Results are always returned with named `latitude` / `longitude` fields rather
// than a coordinate tuple: Mapbox orders coordinates [lng, lat] while the rest
// of this app works in (lat, lng), and named fields make that flip impossible
// to get wrong at a call site.

// Address autocomplete uses the Search Box API rather than the Geocoding API:
// only Search Box indexes businesses and landmarks, and Philippine customers
// locate themselves by store name far more often than by house number.
// Reverse geocoding (dropped pins, GPS) stays on Geocoding v6, which is
// purpose-built for coordinate -> address and needs no session.
const SUGGEST_URL = 'https://api.mapbox.com/search/searchbox/v1/suggest';
const RETRIEVE_URL = 'https://api.mapbox.com/search/searchbox/v1/retrieve';
const REVERSE_URL = 'https://api.mapbox.com/search/geocode/v6/reverse';

// 10 is the Mapbox maximum; fewer than that and the one place the customer
// actually means often falls off the end of the list.
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

/**
 * One row in the autocomplete dropdown. Search Box `suggest` deliberately
 * withholds coordinates; call {@link retrieveAddress} once the customer picks.
 */
export interface AddressCandidate {
  placeId: string;
  /** Headline for the row: the business or street name on its own. */
  name: string;
  /** Full label written into the input once picked. */
  displayName: string;
  /** Town / province line, for a secondary row in the UI. */
  context: string;
  featureType?: string;
}

interface SuggestItem {
  name?: string;
  mapbox_id?: string;
  feature_type?: string;
  full_address?: string;
  place_formatted?: string;
}

const toProximityParam = (proximity?: ProximityPoint | null): string => {
  if (!proximity) return IP_PROXIMITY;
  const { latitude, longitude } = proximity;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return IP_PROXIMITY;
  // Mapbox takes [lng, lat] — the opposite order to the rest of this app.
  return `${longitude},${latitude}`;
};

/**
 * Mapbox bills one Search Box session per token, covering every keystroke plus
 * the single retrieve that ends it — so reuse a token across a search and mint
 * a fresh one afterwards.
 */
export const createSearchSessionToken = (): string => {
  const globalCrypto = globalThis.crypto;
  if (globalCrypto?.randomUUID) {
    return globalCrypto.randomUUID();
  }
  // Safari < 15.4 has no randomUUID; the token only has to be unique per
  // session, not cryptographically strong.
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
};

/**
 * A POI's `full_address` is its street address and omits the business name, so
 * "Buko Spot" would otherwise display as "Phase 4, Lucena". Lead with the name
 * unless the full address already does.
 */
const composeLabel = (
  name: string | undefined,
  placeFormatted: string | undefined,
  fullAddress: string | undefined
): string => {
  const trimmedName = name?.trim() ?? '';
  const trimmedPlace = placeFormatted?.trim() ?? '';
  const trimmedFull = fullAddress?.trim() ?? '';

  if (trimmedFull && trimmedName && trimmedFull.startsWith(trimmedName)) {
    return trimmedFull;
  }
  if (trimmedName && trimmedPlace) {
    return `${trimmedName}, ${trimmedPlace}`;
  }
  return trimmedFull || trimmedName || trimmedPlace;
};

const toCandidate = (item: SuggestItem): AddressCandidate | null => {
  const placeId = item.mapbox_id?.trim();
  const displayName = composeLabel(item.name, item.place_formatted, item.full_address);

  // Without an id the row cannot be retrieved, so it could never yield a pin.
  if (!placeId || !displayName) return null;

  return {
    placeId,
    name: item.name?.trim() || displayName,
    displayName,
    context: item.place_formatted?.trim() ?? '',
    featureType: item.feature_type,
  };
};

/** Autocomplete rows for a partial query. Bounded to the Philippines. */
export const suggestAddresses = async (
  query: string,
  options: { sessionToken: string; limit?: number; proximity?: ProximityPoint | null }
): Promise<AddressCandidate[]> => {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const limit = Math.min(options.limit ?? DEFAULT_SUGGESTION_LIMIT, MAX_SUGGESTION_LIMIT);
  const url = buildUrl(SUGGEST_URL, {
    q: trimmed,
    limit: String(limit),
    country: PHILIPPINES_COUNTRY_CODE,
    bbox: PHILIPPINES_BBOX,
    proximity: toProximityParam(options.proximity),
    language: 'en',
    session_token: options.sessionToken,
  });

  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error('Failed to fetch address suggestions');
  }

  const data = (await response.json()) as { suggestions?: SuggestItem[] };
  return (data.suggestions ?? [])
    .map(toCandidate)
    .filter((candidate): candidate is AddressCandidate => candidate !== null);
};

/**
 * Resolves a chosen suggestion to coordinates. Returns null when the place
 * cannot be pinned or sits outside the Philippines, which the caller should
 * surface rather than treat as a successful selection.
 */
export const retrieveAddress = async (
  placeId: string,
  options: { sessionToken: string }
): Promise<AddressSuggestion | null> => {
  const url = buildUrl(`${RETRIEVE_URL}/${encodeURIComponent(placeId)}`, {
    session_token: options.sessionToken,
  });

  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error('Failed to resolve the selected address');
  }

  const data = (await response.json()) as MapboxFeatureCollection;
  const feature = data.features?.[0];
  if (!feature) return null;

  const coordinates = readCoordinates(feature);
  if (!coordinates) return null;
  if (!isWithinPhilippines(coordinates.latitude, coordinates.longitude)) return null;

  return {
    placeId: feature.properties?.mapbox_id || placeId,
    displayName: composeLabel(
      feature.properties?.name,
      feature.properties?.place_formatted,
      feature.properties?.full_address
    ),
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    countryCode: readCountryCode(feature),
  };
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
