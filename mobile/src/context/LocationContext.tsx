// Where the order goes.
//
// Two sources feed one answer, and the precedence is deliberate:
//
//   1. the saved address the customer picked — they said it, so it wins;
//   2. a GPS fix they asked for by tapping.
//
// There is no third case where the app decides for them. The old version
// auto-detected on every launch and silently re-detected in the background,
// which meant a customer ordering from the office could watch their delivery
// address change under them. A saved address now stays put until it is changed
// on purpose.
//
// GPS is never awaited on the launch path. The app opens on the saved address
// if there is one, and on "Set your address" if there is not.

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Coordinates } from '../lib/merchantDistance';
import { useAddressBook, type AddressBookState } from '../hooks/useAddressBook';
import { useGpsLocation, type GpsStatus } from '../hooks/useGpsLocation';
import { formatCoordinateLabel } from '../lib/resolveAddress';
import type { AddressDraft, SavedAddress } from '../lib/savedAddresses';

export { LEGACY_LOCATION_STORAGE_KEY as USER_LOCATION_STORAGE_KEY } from '../lib/addressStorage';

export type LocationStatus = GpsStatus;

const NO_LOCATION_LABEL = 'Set your address';

interface LocationContextValue {
  /** The point the order is delivered to, or null when nothing is set yet. */
  userLocation: Coordinates | null;
  /** Short line for headers and rows. */
  locationLabel: string;
  /** Full address line, for checkout and the rider. */
  locationDisplayName: string;
  /** Unit/gate notes from the selected saved address, or ''. */
  locationNotes: string;
  /** True when the live location came from a saved address rather than GPS. */
  isUsingSavedAddress: boolean;

  /** Reflects the GPS request only — a saved address needs no status. */
  locationStatus: LocationStatus;
  locationError: string | null;
  /** True while a GPS coordinate is known but its street name is not. */
  isNamingLocation: boolean;
  /** Takes a GPS fix. Only ever called from a tap. */
  requestLocation: () => Promise<void>;
  /** Delivers to the phone's current position instead of a saved address. */
  deliverToCurrentLocation: () => Promise<void>;
  clearLocationError: () => void;

  // The address book, passed straight through.
  addresses: SavedAddress[];
  selectedAddress: SavedAddress | null;
  isAddressBookReady: boolean;
  isAddressBookFull: boolean;
  saveAddress: (draft: AddressDraft) => Promise<SavedAddress | null>;
  deleteAddress: (id: string) => Promise<void>;
  selectAddress: (id: string) => Promise<void>;
  makeAddressDefault: (id: string) => Promise<void>;
}

const LocationContext = createContext<LocationContextValue | undefined>(undefined);

export const useUserLocation = (): LocationContextValue => {
  const context = useContext(LocationContext);
  if (context === undefined) {
    throw new Error('useUserLocation must be used within a LocationProvider');
  }
  return context;
};

interface LocationProviderProps {
  children: React.ReactNode;
}

export function LocationProvider({ children }: LocationProviderProps) {
  const book: AddressBookState = useAddressBook();
  const gps = useGpsLocation();

  // "Deliver where I am right now", chosen over a saved address. Deliberately
  // not persisted: restoring it on the next launch would put GPS back on the
  // startup path, which is the slow first launch this rewrite removed. A new
  // session opens on the saved default and this is one tap away.
  const [isGpsPreferred, setIsGpsPreferred] = useState(false);

  const selectedAddress = isGpsPreferred ? null : book.selectedAddress;

  const requestLocation = useCallback(async (): Promise<void> => {
    await gps.detect();
  }, [gps]);

  const deliverToCurrentLocation = useCallback(async (): Promise<void> => {
    setIsGpsPreferred(true);
    const fix = await gps.detect();
    // A refused or failed fix must not leave the customer with no address at
    // all when they had a perfectly good saved one.
    if (!fix) setIsGpsPreferred(false);
  }, [gps]);

  const selectAddress = useCallback(
    async (id: string): Promise<void> => {
      setIsGpsPreferred(false);
      await book.selectAddress(id);
    },
    [book]
  );

  const saveAddress = useCallback(
    async (draft: AddressDraft): Promise<SavedAddress | null> => {
      const saved = await book.saveAddress(draft);
      if (saved) setIsGpsPreferred(false);
      return saved;
    },
    [book]
  );

  const value = useMemo<LocationContextValue>(() => {
    const gpsFix = gps.fix;

    // The saved address wins unless the customer explicitly asked for GPS.
    const userLocation: Coordinates | null = selectedAddress
      ? { latitude: selectedAddress.latitude, longitude: selectedAddress.longitude }
      : gpsFix
        ? { latitude: gpsFix.latitude, longitude: gpsFix.longitude }
        : null;

    const gpsCoordinateLabel = gpsFix
      ? formatCoordinateLabel(gpsFix.latitude, gpsFix.longitude)
      : '';

    const locationLabel = selectedAddress
      ? selectedAddress.label
      : gpsFix
        ? gpsFix.street || gpsCoordinateLabel
        : NO_LOCATION_LABEL;

    const locationDisplayName = selectedAddress
      ? selectedAddress.displayName
      : gpsFix
        ? gpsFix.displayName || gpsCoordinateLabel
        : '';

    return {
      userLocation,
      locationLabel,
      locationDisplayName,
      locationNotes: selectedAddress?.notes ?? '',
      isUsingSavedAddress: selectedAddress !== null,

      locationStatus: gps.status,
      locationError: gps.error,
      isNamingLocation: gps.isNamingFix,
      requestLocation,
      deliverToCurrentLocation,
      clearLocationError: gps.clearError,

      addresses: book.addresses,
      selectedAddress,
      isAddressBookReady: book.isReady,
      isAddressBookFull: book.isFull,
      saveAddress,
      deleteAddress: book.deleteAddress,
      selectAddress,
      makeAddressDefault: book.makeDefault,
    };
  }, [
    book,
    gps,
    requestLocation,
    saveAddress,
    selectAddress,
    selectedAddress,
    deliverToCurrentLocation,
  ]);

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}
