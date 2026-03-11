export interface OSMAddressSuggestion {
  placeId: string;
  displayName: string;
  latitude: number;
  longitude: number;
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

interface NominatimReverseResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    house_number?: string;
    road?: string;
    pedestrian?: string;
    footway?: string;
    path?: string;
    street?: string;
    neighbourhood?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
}

export interface ReverseGeocodeResult {
  placeId: string;
  displayName: string;
  street: string;
  latitude: number;
  longitude: number;
}

interface NominatimDetailedResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    house_number?: string;
    road?: string;
    pedestrian?: string;
    footway?: string;
    path?: string;
    street?: string;
    neighbourhood?: string;
    suburb?: string;
    village?: string;
    town?: string;
    city?: string;
    municipality?: string;
    county?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
}

const formatDisplayName = (item: NominatimDetailedResult): string => {
  if (!item.address) return item.display_name;

  const addr = item.address;
  const parts = [
    addr.house_number,
    addr.road || addr.pedestrian || addr.street,
    addr.neighbourhood,
    addr.suburb,
    addr.village || addr.town || addr.municipality,
    addr.city,
    addr.county,
    addr.state,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(', ') : item.display_name;
};

const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';

export const searchAddresses = async (
  query: string,
  options?: { limit?: number; countryCodes?: string[] }
): Promise<OSMAddressSuggestion[]> => {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const params = new URLSearchParams({
    q: trimmed,
    format: 'jsonv2',
    addressdetails: '1',
    limit: String(options?.limit ?? 8),
    dedupe: '1',
  });

  if (options?.countryCodes && options.countryCodes.length > 0) {
    params.set('countrycodes', options.countryCodes.join(','));

    if (options.countryCodes.map((c) => c.toLowerCase()).includes('ph')) {
      params.set('viewbox', '116.9283,4.5873,126.6042,21.3218');
      params.set('bounded', '0');
    }
  }

  const response = await fetch(`${NOMINATIM_BASE_URL}?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch address suggestions');
  }

  const data = (await response.json()) as NominatimDetailedResult[];
  return (data || [])
    .filter((item) => item.display_name && item.lat && item.lon)
    .map((item) => ({
      placeId: String(item.place_id),
      displayName: formatDisplayName(item),
      latitude: Number(item.lat),
      longitude: Number(item.lon),
    }))
    .filter(
      (item) =>
        Number.isFinite(item.latitude) &&
        Number.isFinite(item.longitude) &&
        Boolean(item.displayName)
    );
};

export const reverseGeocode = async (
  latitude: number,
  longitude: number
): Promise<ReverseGeocodeResult> => {
  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    format: 'jsonv2',
    addressdetails: '1',
  });

  const response = await fetch(`${NOMINATIM_REVERSE_URL}?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to reverse geocode location');
  }

  const data = (await response.json()) as NominatimReverseResult;
  const parsedLatitude = Number(data.lat);
  const parsedLongitude = Number(data.lon);
  const road =
    data.address?.road ||
    data.address?.pedestrian ||
    data.address?.footway ||
    data.address?.path ||
    data.address?.street ||
    '';
  const houseNumber = data.address?.house_number?.trim() || '';
  const fallbackStreet = data.display_name?.split(',')[0]?.trim() || 'Current location';
  const street = [houseNumber, road].filter(Boolean).join(' ').trim() || fallbackStreet;

  if (!Number.isFinite(parsedLatitude) || !Number.isFinite(parsedLongitude)) {
    throw new Error('Invalid reverse geocode coordinates');
  }

  return {
    placeId: String(data.place_id),
    displayName: data.display_name || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
    street,
    latitude: parsedLatitude,
    longitude: parsedLongitude,
  };
};
