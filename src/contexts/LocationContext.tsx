import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { reverseGeocode } from '../lib/osm';
import { Coordinates } from '../utils/geolocation';
import { hasMovedBeyondThreshold } from '../utils/merchantDistance';

export const USER_LOCATION_STORAGE_KEY = 'userDeliveryLocation';

const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 60000,
};

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
  locationStreet: string;
  locationDisplayName: string;
  isManualPromptRequested: boolean;
  dismissManualPrompt: () => void;
  requestLocation: (promptManualOnError?: boolean) => void;
  applyLocation: (location: StoredUserLocation, save?: boolean) => void;
}

const LocationContext = createContext<LocationContextValue | undefined>(undefined);

export const useUserLocation = (): LocationContextValue => {
  const context = useContext(LocationContext);
  if (context === undefined) {
    throw new Error('useUserLocation must be used within a LocationProvider');
  }
  return context;
};

const readSavedLocation = (): StoredUserLocation | null => {
  const raw = localStorage.getItem(USER_LOCATION_STORAGE_KEY);
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
    localStorage.removeItem(USER_LOCATION_STORAGE_KEY);
  }
  return null;
};

const persistLocation = (location: StoredUserLocation | null): void => {
  if (!location) {
    localStorage.removeItem(USER_LOCATION_STORAGE_KEY);
    return;
  }
  localStorage.setItem(USER_LOCATION_STORAGE_KEY, JSON.stringify(location));
};

const resolveLocationFromCoords = async (coords: Coordinates): Promise<StoredUserLocation> => {
  try {
    const reverse = await reverseGeocode(coords.latitude, coords.longitude);
    return {
      latitude: reverse.latitude,
      longitude: reverse.longitude,
      displayName: reverse.displayName,
      street: reverse.street,
    };
  } catch {
    return {
      latitude: coords.latitude,
      longitude: coords.longitude,
      displayName: `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`,
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
  const [locationStreet, setLocationStreet] = useState<string>('Set your location');
  const [locationDisplayName, setLocationDisplayName] = useState<string>('');
  const [isManualPromptRequested, setIsManualPromptRequested] = useState(false);

  const applyLocation = useCallback((location: StoredUserLocation, save = true) => {
    setUserLocation({ latitude: location.latitude, longitude: location.longitude });
    setLocationStreet(location.street);
    setLocationDisplayName(location.displayName);
    setLocationStatus('ready');
    setLocationError(null);

    if (save) {
      persistLocation(location);
    }
  }, []);

  const requestLocation = useCallback(
    (promptManualOnError = false) => {
      if (!navigator.geolocation) {
        setLocationStatus('error');
        setLocationError('Location is not supported by this browser.');
        if (promptManualOnError) {
          setIsManualPromptRequested(true);
        }
        return;
      }

      setLocationStatus('locating');
      setLocationError(null);

      navigator.geolocation.getCurrentPosition(
        async ({ coords }) => {
          const resolved = await resolveLocationFromCoords(coords);
          applyLocation(resolved, true);
          setIsManualPromptRequested(false);
        },
        (error) => {
          setLocationStatus('error');
          setLocationError(error.message || 'Unable to get your location.');

          const hasSavedLocation = Boolean(localStorage.getItem(USER_LOCATION_STORAGE_KEY));
          if (promptManualOnError && !hasSavedLocation) {
            setIsManualPromptRequested(true);
          }
        },
        GEOLOCATION_OPTIONS
      );
    },
    [applyLocation]
  );

  // Silently re-check GPS without touching status/error — the saved location
  // stays usable while (and after) the refresh runs.
  const refreshLocationInBackground = useCallback(
    (savedLocation: StoredUserLocation) => {
      if (!navigator.geolocation) return;

      navigator.geolocation.getCurrentPosition(
        async ({ coords }) => {
          if (!hasMovedBeyondThreshold(savedLocation, coords)) {
            return;
          }
          const resolved = await resolveLocationFromCoords(coords);
          applyLocation(resolved, true);
        },
        () => {
          // Denied or unavailable — keep the saved location.
        },
        GEOLOCATION_OPTIONS
      );
    },
    [applyLocation]
  );

  // On every app open: restore the saved location instantly, then re-check GPS.
  useEffect(() => {
    const savedLocation = readSavedLocation();
    if (savedLocation) {
      applyLocation(savedLocation, false);
      refreshLocationInBackground(savedLocation);
      return;
    }

    requestLocation(true);
  }, [applyLocation, refreshLocationInBackground, requestLocation]);

  const dismissManualPrompt = useCallback(() => {
    setIsManualPromptRequested(false);
  }, []);

  const value: LocationContextValue = {
    userLocation,
    locationStatus,
    locationError,
    locationStreet,
    locationDisplayName,
    isManualPromptRequested,
    dismissManualPrompt,
    requestLocation,
    applyLocation,
  };

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}
