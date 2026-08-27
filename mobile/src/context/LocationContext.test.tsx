import React from 'react';
import { Pressable, Text } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
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

const mockedPermissions = ExpoLocation.requestForegroundPermissionsAsync as jest.Mock;
const mockedGetPosition = ExpoLocation.getCurrentPositionAsync as jest.Mock;
const mockedReverseGeocode = ExpoLocation.reverseGeocodeAsync as jest.Mock;

const SAVED_LOCATION = {
  latitude: 13.6218,
  longitude: 123.1948,
  displayName: 'Naga City, Camarines Sur',
  street: 'Magsaysay Ave',
};

const FAR_COORDS = { latitude: 13.7, longitude: 123.3 }; // ~14 km from saved
const NEARBY_COORDS = { latitude: 13.6219, longitude: 123.1949 }; // ~15 m from saved

const grantPermission = () => mockedPermissions.mockResolvedValue({ status: 'granted' });
const denyPermission = () => mockedPermissions.mockResolvedValue({ status: 'denied' });

const stubPosition = (coords: { latitude: number; longitude: number; accuracy?: number }) =>
  mockedGetPosition.mockResolvedValue({ coords });

function Probe() {
  const { userLocation, locationStatus, locationError, locationLabel, requestLocation } =
    useUserLocation();

  return (
    <>
      <Text testID="status">{locationStatus}</Text>
      <Text testID="error">{locationError ?? 'none'}</Text>
      <Text testID="label">{locationLabel}</Text>
      <Text testID="coords">
        {userLocation ? `${userLocation.latitude},${userLocation.longitude}` : 'none'}
      </Text>
      <Pressable testID="request-gps" onPress={() => requestLocation()}>
        <Text>gps</Text>
      </Pressable>
    </>
  );
}

const renderProvider = () =>
  render(
    <LocationProvider>
      <Probe />
    </LocationProvider>
  );

describe('LocationProvider (mobile)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
    mockedReverseGeocode.mockResolvedValue([
      { street: 'San Roque', city: 'Pili', region: 'Camarines Sur' },
    ]);
  });

  describe('first open (nothing saved)', () => {
    it('requests permission, geolocates, reverse-geocodes, and persists', async () => {
      grantPermission();
      stubPosition(FAR_COORDS);

      renderProvider();

      await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
      expect(screen.getByTestId('label')).toHaveTextContent('San Roque');
      expect(screen.getByTestId('coords')).toHaveTextContent(
        `${FAR_COORDS.latitude},${FAR_COORDS.longitude}`
      );

      const saved = JSON.parse((await AsyncStorage.getItem(USER_LOCATION_STORAGE_KEY)) ?? 'null');
      expect(saved).toMatchObject({ street: 'San Roque' });
    });

    it('falls back to raw coordinates when reverse geocoding fails', async () => {
      grantPermission();
      stubPosition(FAR_COORDS);
      mockedReverseGeocode.mockRejectedValue(new Error('geocoder down'));

      renderProvider();

      await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
      expect(screen.getByTestId('label')).toHaveTextContent('Current location');
      expect(screen.getByTestId('coords')).toHaveTextContent(
        `${FAR_COORDS.latitude},${FAR_COORDS.longitude}`
      );
    });

    it('sets error status when permission is denied', async () => {
      denyPermission();

      renderProvider();

      await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'));
      expect(screen.getByTestId('error')).not.toHaveTextContent('none');
      expect(mockedGetPosition).not.toHaveBeenCalled();
    });
  });

  describe('subsequent opens (saved location present)', () => {
    beforeEach(async () => {
      await AsyncStorage.setItem(USER_LOCATION_STORAGE_KEY, JSON.stringify(SAVED_LOCATION));
    });

    it('restores the saved location and still re-checks GPS in the background', async () => {
      grantPermission();
      stubPosition(NEARBY_COORDS);

      renderProvider();

      await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
      expect(screen.getByTestId('label')).toHaveTextContent(SAVED_LOCATION.street);
      await waitFor(() => expect(mockedGetPosition).toHaveBeenCalledTimes(1));
    });

    it('keeps the saved location when the fresh fix is within the refresh threshold', async () => {
      grantPermission();
      stubPosition(NEARBY_COORDS);

      renderProvider();

      await waitFor(() => expect(mockedGetPosition).toHaveBeenCalled());
      expect(screen.getByTestId('coords')).toHaveTextContent(
        `${SAVED_LOCATION.latitude},${SAVED_LOCATION.longitude}`
      );
      expect(mockedReverseGeocode).not.toHaveBeenCalled();
    });

    it('updates location and storage when the user has moved beyond the threshold', async () => {
      grantPermission();
      stubPosition(FAR_COORDS);

      renderProvider();

      await waitFor(() => expect(screen.getByTestId('label')).toHaveTextContent('San Roque'));
      expect(screen.getByTestId('coords')).toHaveTextContent(
        `${FAR_COORDS.latitude},${FAR_COORDS.longitude}`
      );

      const saved = JSON.parse((await AsyncStorage.getItem(USER_LOCATION_STORAGE_KEY)) ?? 'null');
      expect(saved).toMatchObject({ street: 'San Roque' });
    });

    it('ignores a background fix whose accuracy is too poor to trust', async () => {
      grantPermission();
      // Apparent move of ~0.33 km with ±5 km accuracy — could be pure noise.
      stubPosition({
        latitude: SAVED_LOCATION.latitude + 0.003,
        longitude: SAVED_LOCATION.longitude,
        accuracy: 5000,
      });

      renderProvider();

      await waitFor(() => expect(mockedGetPosition).toHaveBeenCalled());
      expect(screen.getByTestId('coords')).toHaveTextContent(
        `${SAVED_LOCATION.latitude},${SAVED_LOCATION.longitude}`
      );
      expect(mockedReverseGeocode).not.toHaveBeenCalled();
    });

    it('keeps the saved location without surfacing an error when permission is denied', async () => {
      denyPermission();

      renderProvider();

      await waitFor(() => expect(mockedPermissions).toHaveBeenCalled());
      expect(screen.getByTestId('status')).toHaveTextContent('ready');
      expect(screen.getByTestId('error')).toHaveTextContent('none');
      expect(screen.getByTestId('coords')).toHaveTextContent(
        `${SAVED_LOCATION.latitude},${SAVED_LOCATION.longitude}`
      );
    });

    it('ignores a stale background fix that resolves after a newer manual request', async () => {
      grantPermission();

      let resolveStale!: (value: unknown) => void;
      const stalePosition = new Promise((resolve) => {
        resolveStale = resolve;
      });
      mockedGetPosition
        .mockReturnValueOnce(stalePosition) // background refresh — resolves last
        .mockResolvedValueOnce({ coords: FAR_COORDS }); // manual request — resolves first
      mockedReverseGeocode.mockImplementation(async ({ latitude }: { latitude: number }) => [
        latitude === FAR_COORDS.latitude
          ? { street: 'San Roque', city: 'Pili', region: 'Camarines Sur' }
          : { street: 'Stale St', city: 'Stale Town', region: 'Nowhere' },
      ]);

      renderProvider();
      await waitFor(() => expect(mockedGetPosition).toHaveBeenCalledTimes(1));

      fireEvent.press(screen.getByTestId('request-gps'));
      await waitFor(() => expect(screen.getByTestId('label')).toHaveTextContent('San Roque'));

      await act(async () => {
        resolveStale({ coords: { latitude: 13.9, longitude: 123.5 } });
      });

      expect(screen.getByTestId('label')).toHaveTextContent('San Roque');
      expect(screen.getByTestId('coords')).toHaveTextContent(
        `${FAR_COORDS.latitude},${FAR_COORDS.longitude}`
      );
    });
  });

  it('discards corrupt saved JSON and falls back to a fresh request', async () => {
    await AsyncStorage.setItem(USER_LOCATION_STORAGE_KEY, 'not-json{');
    grantPermission();
    stubPosition(FAR_COORDS);

    renderProvider();

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    expect(screen.getByTestId('label')).toHaveTextContent('San Roque');
  });
});
