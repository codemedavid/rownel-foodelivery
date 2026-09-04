// Deep links into the device's maps app. The rider app has no embedded map;
// navigation hands off to Apple/Google Maps, which riders already use.

import { Linking, Platform } from 'react-native';

export interface MapsDestination {
  latitude?: number;
  longitude?: number;
  address?: string;
}

type MapsPlatform = 'ios' | 'android' | string;

const destinationFor = (dest: MapsDestination): string | null => {
  const { latitude, longitude, address } = dest;
  if (typeof latitude === 'number' && typeof longitude === 'number') {
    return `${latitude},${longitude}`;
  }
  return address?.trim() ? encodeURIComponent(address.trim()) : null;
};

/** Directions URL for the destination, or null when there is nothing to route to. */
export const buildMapsUrl = (dest: MapsDestination, platform: MapsPlatform): string | null => {
  const destination = destinationFor(dest);
  if (!destination) return null;
  return platform === 'ios'
    ? `http://maps.apple.com/?daddr=${destination}`
    : `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
};

/** Opens the maps app. Resolves false when there is no usable destination. */
export const openDirections = async (dest: MapsDestination): Promise<boolean> => {
  const url = buildMapsUrl(dest, Platform.OS);
  if (!url) return false;
  try {
    await Linking.openURL(url);
    return true;
  } catch (err) {
    if (__DEV__) console.warn('Could not open maps:', err);
    return false;
  }
};
