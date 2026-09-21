jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  LEGACY_LOCATION_STORAGE_KEY,
  SAVED_ADDRESSES_STORAGE_KEY,
  SELECTED_ADDRESS_STORAGE_KEY,
  readAddressBook,
  writeAddresses,
  writeSelectedAddressId,
} from './addressStorage';
import type { SavedAddress } from './savedAddresses';

const HOME: SavedAddress = {
  id: 'addr-home',
  label: 'Home',
  displayName: '12 Rizal Street, Vigan, Ilocos Sur',
  street: '12 Rizal Street',
  latitude: 17.5747,
  longitude: 120.3869,
  notes: 'Green gate',
  isDefault: true,
  updatedAt: 1_000,
};

describe('readAddressBook', () => {
  beforeEach(async () => {
    jest.restoreAllMocks();
    await AsyncStorage.clear();
  });

  test('returns nothing on a fresh install', async () => {
    expect(await readAddressBook()).toEqual({ addresses: [], selectedId: null });
  });

  test('reads back what was written, with the selected id', async () => {
    await writeAddresses([HOME]);
    await writeSelectedAddressId(HOME.id);

    expect(await readAddressBook()).toEqual({ addresses: [HOME], selectedId: HOME.id });
  });

  test('migrates the single location an older build stored', async () => {
    await AsyncStorage.setItem(
      LEGACY_LOCATION_STORAGE_KEY,
      JSON.stringify({
        latitude: 17.5747,
        longitude: 120.3869,
        displayName: '12 Rizal Street, Vigan',
        street: '12 Rizal Street',
      })
    );

    const { addresses, selectedId } = await readAddressBook();

    expect(addresses).toHaveLength(1);
    expect(addresses[0].displayName).toBe('12 Rizal Street, Vigan');
    expect(addresses[0].isDefault).toBe(true);
    expect(selectedId).toBe(addresses[0].id);

    // Persisted, so the migration runs once rather than on every launch.
    expect(await AsyncStorage.getItem(SAVED_ADDRESSES_STORAGE_KEY)).toContain('12 Rizal Street');
  });

  test('does not re-migrate once the book has been written', async () => {
    await writeAddresses([]);
    await AsyncStorage.setItem(
      LEGACY_LOCATION_STORAGE_KEY,
      JSON.stringify({
        latitude: 17.5747,
        longitude: 120.3869,
        displayName: '12 Rizal Street, Vigan',
        street: '12 Rizal Street',
      })
    );

    expect((await readAddressBook()).addresses).toEqual([]);
  });

  test('survives a device that refuses to read', async () => {
    // Thrown rather than rejected: `readAddressBook` reads two keys through
    // Promise.all, and a second rejected promise would go unhandled and fail a
    // later test instead of this one.
    const getItem = jest.spyOn(AsyncStorage, 'getItem').mockImplementation(() => {
      throw new Error('storage unavailable');
    });

    try {
      expect(await readAddressBook()).toEqual({ addresses: [], selectedId: null });
    } finally {
      // Restored here rather than left to restoreAllMocks: AsyncStorage's jest
      // mock is itself made of jest.fn()s, which restoreAllMocks does not put
      // back, and a leaked throwing getItem fails the next test instead.
      getItem.mockRestore();
    }
  });
});

describe('writes', () => {
  beforeEach(async () => {
    jest.restoreAllMocks();
    await AsyncStorage.clear();
  });

  test('clearing the selection removes the key rather than storing "null"', async () => {
    await writeSelectedAddressId(HOME.id);
    await writeSelectedAddressId(null);

    // Asserted on the key rather than the value: the jest mock resolves a
    // missing key to undefined where the real library resolves to null, and
    // the behaviour that matters is that nothing is left behind.
    expect(await AsyncStorage.getAllKeys()).not.toContain(SELECTED_ADDRESS_STORAGE_KEY);
  });

  test('a failed write is survived, so the order in progress still works', async () => {
    const setItem = jest.spyOn(AsyncStorage, 'setItem').mockRejectedValue(new Error('disk full'));

    try {
      await expect(writeAddresses([HOME])).resolves.toBeUndefined();
      await expect(writeSelectedAddressId(HOME.id)).resolves.toBeUndefined();
    } finally {
      setItem.mockRestore();
    }
  });

  test('a failed removal is survived too', async () => {
    const removeItem = jest
      .spyOn(AsyncStorage, 'removeItem')
      .mockRejectedValue(new Error('disk full'));

    try {
      await expect(writeSelectedAddressId(null)).resolves.toBeUndefined();
    } finally {
      removeItem.mockRestore();
    }
  });
});
