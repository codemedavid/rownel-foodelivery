import React from 'react';
import { Pressable, Text } from 'react-native';
import { act, render, screen, waitFor } from '@testing-library/react-native';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
  reverseGeocodeAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ExpoLocation from 'expo-location';
import {
  LocationProvider,
  useUserLocation,
  USER_LOCATION_STORAGE_KEY,
} from './LocationContext';
import { SAVED_ADDRESSES_STORAGE_KEY } from '../lib/addressStorage';
import type { SavedAddress } from '../lib/savedAddresses';

const mockedGetPermissions = ExpoLocation.getForegroundPermissionsAsync as jest.Mock;
const mockedRequestPermissions = ExpoLocation.requestForegroundPermissionsAsync as jest.Mock;
const mockedGetPosition = ExpoLocation.getCurrentPositionAsync as jest.Mock;
const mockedGetLastKnown = ExpoLocation.getLastKnownPositionAsync as jest.Mock;
const mockedExpoReverse = ExpoLocation.reverseGeocodeAsync as jest.Mock;

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

const WORK: SavedAddress = {
  ...HOME,
  id: 'addr-work',
  label: 'Work',
  displayName: 'Vigan City Hall, Vigan',
  street: 'Vigan City Hall',
  latitude: 17.5712,
  longitude: 120.3874,
  notes: '',
  isDefault: false,
  updatedAt: 2_000,
};

const GPS_COORDS = { latitude: 17.58, longitude: 120.39 };

const grantPermission = () => {
  mockedGetPermissions.mockResolvedValue({ granted: true, canAskAgain: true });
  mockedRequestPermissions.mockResolvedValue({ granted: true, canAskAgain: true });
};

const denyPermission = () => {
  mockedGetPermissions.mockResolvedValue({ granted: false, canAskAgain: true });
  mockedRequestPermissions.mockResolvedValue({ granted: false, canAskAgain: true });
};

const seedAddresses = (addresses: SavedAddress[]) =>
  AsyncStorage.setItem(SAVED_ADDRESSES_STORAGE_KEY, JSON.stringify(addresses));

function Probe() {
  const {
    userLocation,
    locationLabel,
    locationDisplayName,
    locationNotes,
    locationStatus,
    locationError,
    isUsingSavedAddress,
    isAddressBookReady,
    addresses,
    requestLocation,
    deliverToCurrentLocation,
    saveAddress,
    deleteAddress,
    selectAddress,
  } = useUserLocation();

  return (
    <>
      <Text testID="ready">{String(isAddressBookReady)}</Text>
      <Text testID="status">{locationStatus}</Text>
      <Text testID="error">{locationError ?? 'none'}</Text>
      <Text testID="label">{locationLabel}</Text>
      <Text testID="display">{locationDisplayName || 'none'}</Text>
      <Text testID="notes">{locationNotes || 'none'}</Text>
      <Text testID="saved">{String(isUsingSavedAddress)}</Text>
      <Text testID="count">{String(addresses.length)}</Text>
      <Text testID="coords">
        {userLocation ? `${userLocation.latitude},${userLocation.longitude}` : 'none'}
      </Text>
      <Pressable testID="gps" onPress={() => void requestLocation()}>
        <Text>gps</Text>
      </Pressable>
      <Pressable testID="use-gps" onPress={() => void deliverToCurrentLocation()}>
        <Text>use gps</Text>
      </Pressable>
      <Pressable
        testID="add"
        onPress={() =>
          void saveAddress({
            label: 'Lola',
            displayName: "Lola's house, San Vicente",
            latitude: 17.56,
            longitude: 120.38,
            notes: 'Blue gate',
            isDefault: false,
          })
        }
      >
        <Text>add</Text>
      </Pressable>
      <Pressable testID="select-work" onPress={() => void selectAddress('addr-work')}>
        <Text>select work</Text>
      </Pressable>
      <Pressable testID="delete-home" onPress={() => void deleteAddress('addr-home')}>
        <Text>delete home</Text>
      </Pressable>
    </>
  );
}

// Rendered inside act() because the provider's first job is an async storage
// read: without it every test logs an update-outside-act warning.
const renderProvider = async () => {
  await act(async () => {
    render(
      <LocationProvider>
        <Probe />
      </LocationProvider>
    );
  });
};

const waitForReady = () => waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'));

const press = async (testID: string) => {
  await act(async () => {
    screen.getByTestId(testID).props.onClick?.();
    screen.getByTestId(testID).props.onPress?.();
  });
};

describe('LocationProvider (mobile)', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    grantPermission();
    mockedGetLastKnown.mockResolvedValue(null);
    mockedGetPosition.mockResolvedValue({ coords: GPS_COORDS });
    mockedExpoReverse.mockResolvedValue([]);
    // Offline by default: the Apple reverse-geocode proxy is never reachable
    // in tests unless a case stubs it.
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
  });

  describe('launch', () => {
    test('never touches GPS on startup — the app opens instantly', async () => {
      await renderProvider();
      await waitForReady();

      expect(mockedGetPermissions).not.toHaveBeenCalled();
      expect(mockedRequestPermissions).not.toHaveBeenCalled();
      expect(mockedGetPosition).not.toHaveBeenCalled();
      expect(screen.getByTestId('status')).toHaveTextContent('idle');
    });

    test('opens on "Set your address" when nothing is saved', async () => {
      await renderProvider();
      await waitForReady();

      expect(screen.getByTestId('label')).toHaveTextContent('Set your address');
      expect(screen.getByTestId('coords')).toHaveTextContent('none');
    });

    test('restores the saved default address', async () => {
      await seedAddresses([HOME, WORK]);

      await renderProvider();
      await waitForReady();

      expect(screen.getByTestId('label')).toHaveTextContent('Home');
      expect(screen.getByTestId('display')).toHaveTextContent('12 Rizal Street, Vigan, Ilocos Sur');
      expect(screen.getByTestId('notes')).toHaveTextContent('Green gate');
      expect(screen.getByTestId('coords')).toHaveTextContent('17.5747,120.3869');
      expect(screen.getByTestId('saved')).toHaveTextContent('true');
    });

    test('migrates the single location an older build stored', async () => {
      await AsyncStorage.setItem(
        USER_LOCATION_STORAGE_KEY,
        JSON.stringify({
          latitude: 17.5747,
          longitude: 120.3869,
          displayName: '12 Rizal Street, Vigan',
          street: '12 Rizal Street',
        })
      );

      await renderProvider();
      await waitForReady();

      expect(screen.getByTestId('count')).toHaveTextContent('1');
      expect(screen.getByTestId('display')).toHaveTextContent('12 Rizal Street, Vigan');
      expect(await AsyncStorage.getItem(SAVED_ADDRESSES_STORAGE_KEY)).toContain('12 Rizal Street');
    });
  });

  describe('GPS on demand', () => {
    test('reports the coordinate as soon as it has one', async () => {
      await renderProvider();
      await waitForReady();

      await press('gps');

      await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
      expect(screen.getByTestId('coords')).toHaveTextContent('17.58,120.39');
    });

    test('shows the cached fix before the fresh one arrives', async () => {
      mockedGetLastKnown.mockResolvedValue({ coords: { latitude: 17.57, longitude: 120.38 } });

      // A fresh fix still in flight: the cached one must already be usable.
      let releaseFreshFix = () => undefined as void;
      mockedGetPosition.mockReturnValue(
        new Promise((resolve) => {
          releaseFreshFix = () => resolve({ coords: GPS_COORDS });
        })
      );

      await renderProvider();
      await waitForReady();
      await press('gps');

      await waitFor(() => expect(screen.getByTestId('coords')).toHaveTextContent('17.57,120.38'));
      expect(screen.getByTestId('status')).toHaveTextContent('ready');

      // Let it land, so the deadline timer is cleared before teardown.
      await act(async () => {
        releaseFreshFix();
      });
      await waitFor(() => expect(screen.getByTestId('coords')).toHaveTextContent('17.58,120.39'));
    });

    test('does not re-prompt when permission is already granted', async () => {
      await renderProvider();
      await waitForReady();
      await press('gps');

      await waitFor(() => expect(mockedGetPermissions).toHaveBeenCalled());
      expect(mockedRequestPermissions).not.toHaveBeenCalled();
    });

    test('explains a denied permission instead of failing silently', async () => {
      denyPermission();

      await renderProvider();
      await waitForReady();
      await press('gps');

      await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'));
      expect(screen.getByTestId('error')).toHaveTextContent(/Location permission is off/);
    });

    test('names the fix with the on-device geocoder when the proxy is unreachable', async () => {
      mockedExpoReverse.mockResolvedValue([
        { streetNumber: '7', street: 'Quirino Blvd', city: 'Vigan', region: 'Ilocos Sur' },
      ]);

      await renderProvider();
      await waitForReady();
      await press('gps');

      await waitFor(() => expect(screen.getByTestId('label')).toHaveTextContent('7 Quirino Blvd'));
    });
  });

  describe('precedence', () => {
    test('a saved address is not replaced by a GPS fix', async () => {
      await seedAddresses([HOME]);

      await renderProvider();
      await waitForReady();
      await press('gps');

      await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
      expect(screen.getByTestId('coords')).toHaveTextContent('17.5747,120.3869');
      expect(screen.getByTestId('label')).toHaveTextContent('Home');
    });

    test('"deliver to my current location" overrides the saved address', async () => {
      await seedAddresses([HOME]);

      await renderProvider();
      await waitForReady();
      await press('use-gps');

      await waitFor(() => expect(screen.getByTestId('coords')).toHaveTextContent('17.58,120.39'));
      expect(screen.getByTestId('saved')).toHaveTextContent('false');
    });

    test('a failed GPS fix leaves the saved address in place', async () => {
      await seedAddresses([HOME]);
      denyPermission();

      await renderProvider();
      await waitForReady();
      await press('use-gps');

      await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'));
      expect(screen.getByTestId('coords')).toHaveTextContent('17.5747,120.3869');
      expect(screen.getByTestId('saved')).toHaveTextContent('true');
    });
  });

  describe('managing the book', () => {
    test('a saved address becomes the live one and reaches storage', async () => {
      await renderProvider();
      await waitForReady();

      await press('add');

      await waitFor(() => expect(screen.getByTestId('label')).toHaveTextContent('Lola'));
      expect(screen.getByTestId('coords')).toHaveTextContent('17.56,120.38');
      expect(screen.getByTestId('notes')).toHaveTextContent('Blue gate');

      const stored = await AsyncStorage.getItem(SAVED_ADDRESSES_STORAGE_KEY);
      expect(stored).toContain("Lola's house");
    });

    test('selecting another address switches where the order goes', async () => {
      await seedAddresses([HOME, WORK]);

      await renderProvider();
      await waitForReady();
      await press('select-work');

      await waitFor(() => expect(screen.getByTestId('label')).toHaveTextContent('Work'));
      expect(screen.getByTestId('coords')).toHaveTextContent('17.5712,120.3874');
    });

    test('deleting the live address falls back to the remaining one', async () => {
      await seedAddresses([HOME, WORK]);

      await renderProvider();
      await waitForReady();
      await press('delete-home');

      await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'));
      expect(screen.getByTestId('label')).toHaveTextContent('Work');
      expect(screen.getByTestId('coords')).toHaveTextContent('17.5712,120.3874');
    });

    test('deleting the only address leaves the app asking for one', async () => {
      await seedAddresses([HOME]);

      await renderProvider();
      await waitForReady();
      await press('delete-home');

      await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('0'));
      expect(screen.getByTestId('label')).toHaveTextContent('Set your address');
      expect(screen.getByTestId('coords')).toHaveTextContent('none');
    });
  });
});
