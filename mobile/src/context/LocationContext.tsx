import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ExpoLocation from 'expo-location';
import { Coordinates, hasMovedBeyondThreshold } from '../lib/merchantDistance';

export const USER_LOCATION_STORAGE_KEY = 'userDeliveryLocation';

export interface StoredUserLocation {
  latitude: number;
  longitude: number;
  displayName: string;
  street: string;
}

export type LocationStatus = 'idle' | 'locating' | 'ready' | 'error';

interface LocationContextValue {
  userLocation: Coordinates | null;
  locationStatus: LocationStatus;
  locationError: string | null;
  locationLabel: string;
  locationDisplayName: string;
  requestLocation: () => Promise<void>;
}

const LocationContext = createContext<LocationContextValue | undefined>(undefined);

export const useUserLocation = (): LocationContextValue => {
  const context = useContext(LocationContext);
  if (context === undefined) {
    throw new Error('useUserLocation must be used within a LocationProvider');
  }
  return context;
};

const readSavedLocation = async (): Promise<StoredUserLocation | null> => {
  const raw = await AsyncStorage.getItem(USER_LOCATION_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<StoredUserLocation>;
    if (
      typeof parsed.latitude === 'number' &&
      typeof parsed.longitude === 'number' &&
      typeof parsed.displayName === 'string' &&
      typeof parsed.street === 'string'
    ) {
      return {
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        displayName: parsed.displayName,
        street: parsed.street,
      };
    }
  } catch {
    await AsyncStorage.removeItem(USER_LOCATION_STORAGE_KEY);
  }
  return null;
};

const resolveLocationFromCoords = async (coords: Coordinates): Promise<StoredUserLocation> => {
  const coordsLabel = `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`;
  try {
    const [address] = await ExpoLocation.reverseGeocodeAsync({
      latitude: coords.latitude,
      longitude: coords.longitude,
    });
    if (!address) {
      return {
        latitude: coords.latitude,
        longitude: coords.longitude,
        displayName: coordsLabel,
        street: 'Current location',
      };
    }

    const street = address.street || address.name || 'Current location';
    const displayName = [address.city || address.district, address.region]
      .filter(Boolean)
      .join(', ');
    return {
      latitude: coords.latitude,
      longitude: coords.longitude,
      displayName: displayName || coordsLabel,
      street,
    };
  } catch {
    return {
      latitude: coords.latitude,
      longitude: coords.longitude,
      displayName: coordsLabel,
      street: 'Current location',
    };
  }
};

interface LocationProviderProps {
  children: React.ReactNode;
}

export function LocationProvider({ children }: LocationProviderProps) {
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>('idle');
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationLabel, setLocationLabel] = useState<string>('Set your location');
  const [locationDisplayName, setLocationDisplayName] = useState<string>('');

  // Each geolocation request gets a generation id; callbacks from an older
  // generation are ignored so a slow, stale fix can never overwrite a newer one.
  const requestGenerationRef = useRef(0);

  const applyLocation = useCallback(async (location: StoredUserLocation, save = true) => {
    setUserLocation({ latitude: location.latitude, longitude: location.longitude });
    setLocationLabel(location.street);
    setLocationDisplayName(location.displayName);
    setLocationStatus('ready');
    setLocationError(null);

    if (save) {
      await AsyncStorage.setItem(USER_LOCATION_STORAGE_KEY, JSON.stringify(location));
    }
  }, []);

  const requestLocation = useCallback(async () => {
    const requestId = ++requestGenerationRef.current;

    setLocationStatus('locating');
    setLocationError(null);

    try {
      const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
      if (requestId !== requestGenerationRef.current) return;

      if (status !== 'granted') {
        setLocationStatus('error');
        setLocationError('Location permission was denied. Enable it in Settings to see nearby merchants.');
        return;
      }

      const position = await ExpoLocation.getCurrentPositionAsync({
        accuracy: ExpoLocation.Accuracy.Balanced,
      });
      const resolved = await resolveLocationFromCoords(position.coords);
      if (requestId !== requestGenerationRef.current) return;

      await applyLocation(resolved, true);
    } catch (error: unknown) {
      if (requestId !== requestGenerationRef.current) return;
      setLocationStatus('error');
      setLocationError(
        error instanceof Error ? error.message : 'Unable to get your location.'
      );
    }
  }, [applyLocation]);

  // Silently re-check GPS without touching status/error — the saved location
  // stays usable while (and after) the refresh runs.
  const refreshLocationInBackground = useCallback(
    async (savedLocation: StoredUserLocation) => {
      const requestId = ++requestGenerationRef.current;

      try {
        const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
        if (status !== 'granted' || requestId !== requestGenerationRef.current) return;

        const position = await ExpoLocation.getCurrentPositionAsync({
          accuracy: ExpoLocation.Accuracy.Balanced,
        });
        if (requestId !== requestGenerationRef.current) return;

        // A poor-accuracy fix widens the "not actually moved" band so GPS
        // noise can't silently relocate the user.
        const accuracySlackKm = (position.coords.accuracy ?? 0) / 1000;
        if (!hasMovedBeyondThreshold(savedLocation, position.coords, accuracySlackKm)) {
          return;
        }

        const resolved = await resolveLocationFromCoords(position.coords);
        if (requestId !== requestGenerationRef.current) return;

        await applyLocation(resolved, true);
      } catch {
        // Denied or unavailable — keep the saved location.
      }
    },
    [applyLocation]
  );

  // On every app open: restore the saved location instantly, then re-check GPS.
  useEffect(() => {
    let isCancelled = false;

    const initialize = async () => {
      const savedLocation = await readSavedLocation();
      if (isCancelled) return;

      if (savedLocation) {
        await applyLocation(savedLocation, false);
        await refreshLocationInBackground(savedLocation);
      } else {
        await requestLocation();
      }
    };

    void initialize();

    return () => {
      isCancelled = true;
      // Invalidate in-flight geolocation callbacks on unmount.
      requestGenerationRef.current += 1;
    };
  }, [applyLocation, refreshLocationInBackground, requestLocation]);

  const value: LocationContextValue = {
    userLocation,
    locationStatus,
    locationError,
    locationLabel,
    locationDisplayName,
    requestLocation,
  };

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}
