// AsyncStorage for the address book. All parsing rules live in
// `savedAddresses.ts`; this file only moves strings in and out of the device.
//
// Storage failures are reported and then survived. A customer whose device
// refuses to write should still be able to place the order in front of them —
// the address is in memory, it just will not be there tomorrow.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createAddressId,
  parseLegacyLocation,
  parseSavedAddresses,
  serializeSavedAddresses,
  type SavedAddress,
} from './savedAddresses';

export const SAVED_ADDRESSES_STORAGE_KEY = 'savedDeliveryAddresses';
export const SELECTED_ADDRESS_STORAGE_KEY = 'selectedDeliveryAddressId';

/** The single location older builds stored. Read once, then migrated. */
export const LEGACY_LOCATION_STORAGE_KEY = 'userDeliveryLocation';

export interface AddressBookSnapshot {
  addresses: SavedAddress[];
  selectedId: string | null;
}

const EMPTY_SNAPSHOT: AddressBookSnapshot = { addresses: [], selectedId: null };

const warn = (context: string, error: unknown): void => {
  if (__DEV__) console.warn(`[addresses] ${context}`, error);
};

/**
 * Reads the book, migrating the legacy single-location key the first time.
 * The legacy key is left in place: the web app and older installs still read
 * it, and it costs a few bytes.
 */
export const readAddressBook = async (): Promise<AddressBookSnapshot> => {
  try {
    const [rawAddresses, selectedId] = await Promise.all([
      AsyncStorage.getItem(SAVED_ADDRESSES_STORAGE_KEY),
      AsyncStorage.getItem(SELECTED_ADDRESS_STORAGE_KEY),
    ]);

    if (rawAddresses !== null) {
      return { addresses: parseSavedAddresses(rawAddresses), selectedId };
    }

    const migrated = parseLegacyLocation(
      await AsyncStorage.getItem(LEGACY_LOCATION_STORAGE_KEY),
      { id: createAddressId(), now: Date.now() }
    );
    if (!migrated) return EMPTY_SNAPSHOT;

    const addresses = [migrated];
    await writeAddresses(addresses);
    return { addresses, selectedId: migrated.id };
  } catch (error: unknown) {
    warn('could not read saved addresses', error);
    return EMPTY_SNAPSHOT;
  }
};

export const writeAddresses = async (addresses: readonly SavedAddress[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(SAVED_ADDRESSES_STORAGE_KEY, serializeSavedAddresses(addresses));
  } catch (error: unknown) {
    warn('could not save addresses', error);
  }
};

export const writeSelectedAddressId = async (id: string | null): Promise<void> => {
  try {
    if (id === null) {
      await AsyncStorage.removeItem(SELECTED_ADDRESS_STORAGE_KEY);
      return;
    }
    await AsyncStorage.setItem(SELECTED_ADDRESS_STORAGE_KEY, id);
  } catch (error: unknown) {
    warn('could not save the selected address', error);
  }
};
