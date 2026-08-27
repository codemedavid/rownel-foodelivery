import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import { LocationProvider, useUserLocation, USER_LOCATION_STORAGE_KEY } from './LocationContext';

vi.mock('../lib/osm', () => ({
  reverseGeocode: vi.fn(),
}));

import { reverseGeocode } from '../lib/osm';

const mockedReverseGeocode = vi.mocked(reverseGeocode);
const mockedGetCurrentPosition = vi.mocked(navigator.geolocation.getCurrentPosition);

const SAVED_LOCATION = {
  latitude: 13.6218,
  longitude: 123.1948,
  displayName: 'Naga City, Camarines Sur',
  street: 'Magsaysay Ave',
};

const FAR_COORDS = { latitude: 13.7, longitude: 123.3 }; // ~14 km from saved
const NEARBY_COORDS = { latitude: 13.6219, longitude: 123.1949 }; // ~15 m from saved

const Probe = () => {
  const {
    userLocation,
    locationStatus,
    locationError,
    locationStreet,
    locationDisplayName,
    isManualPromptRequested,
    requestLocation,
  } = useUserLocation();

  return (
    <div>
      <button type="button" data-testid="request-gps" onClick={() => requestLocation(false)}>
        gps
      </button>
      <span data-testid="status">{locationStatus}</span>
      <span data-testid="error">{locationError ?? 'none'}</span>
      <span data-testid="street">{locationStreet}</span>
      <span data-testid="display-name">{locationDisplayName}</span>
      <span data-testid="coords">
        {userLocation ? `${userLocation.latitude},${userLocation.longitude}` : 'none'}
      </span>
      <span data-testid="manual-prompt">{isManualPromptRequested ? 'open' : 'closed'}</span>
    </div>
  );
};

const renderProvider = () =>
  render(
    <LocationProvider>
      <Probe />
    </LocationProvider>
  );

const stubGeolocationSuccess = (coords: { latitude: number; longitude: number }) => {
  mockedGetCurrentPosition.mockImplementation((success) => {
    act(() => {
      success({ coords } as GeolocationPosition);
    });
  });
};

const stubGeolocationError = (message = 'User denied Geolocation') => {
  mockedGetCurrentPosition.mockImplementation((_success, error) => {
    act(() => {
      error?.({ code: 1, message } as GeolocationPositionError);
    });
  });
};

describe('LocationProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    mockedReverseGeocode.mockResolvedValue({
      latitude: FAR_COORDS.latitude,
      longitude: FAR_COORDS.longitude,
      displayName: 'Pili, Camarines Sur',
      street: 'San Roque',
    });
  });

  describe('first open (no saved location)', () => {
    it('requests geolocation, reverse-geocodes, and persists the result', async () => {
      stubGeolocationSuccess(FAR_COORDS);

      renderProvider();

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('ready');
      });
      expect(screen.getByTestId('street')).toHaveTextContent('San Roque');
      expect(screen.getByTestId('display-name')).toHaveTextContent('Pili, Camarines Sur');

      const saved = JSON.parse(localStorage.getItem(USER_LOCATION_STORAGE_KEY) ?? 'null');
      expect(saved).toMatchObject({ street: 'San Roque' });
    });

    it('falls back to raw coordinates when reverse geocoding fails', async () => {
      mockedReverseGeocode.mockRejectedValue(new Error('nominatim down'));
      stubGeolocationSuccess(FAR_COORDS);

      renderProvider();

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('ready');
      });
      expect(screen.getByTestId('street')).toHaveTextContent('Current location');
      expect(screen.getByTestId('coords')).toHaveTextContent(
        `${FAR_COORDS.latitude},${FAR_COORDS.longitude}`
      );
    });

    it('sets error status and requests the manual prompt when permission is denied', async () => {
      stubGeolocationError();

      renderProvider();

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('error');
      });
      expect(screen.getByTestId('manual-prompt')).toHaveTextContent('open');
      expect(screen.getByTestId('error')).not.toHaveTextContent('none');
    });
  });

  describe('subsequent opens (saved location present)', () => {
    beforeEach(() => {
      localStorage.setItem(USER_LOCATION_STORAGE_KEY, JSON.stringify(SAVED_LOCATION));
    });

    it('restores the saved location immediately', async () => {
      stubGeolocationSuccess(NEARBY_COORDS);

      renderProvider();

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('ready');
      });
      expect(screen.getByTestId('coords')).toHaveTextContent(
        `${SAVED_LOCATION.latitude},${SAVED_LOCATION.longitude}`
      );
      expect(screen.getByTestId('street')).toHaveTextContent(SAVED_LOCATION.street);
    });

    it('still re-checks GPS in the background on every open', async () => {
      stubGeolocationSuccess(NEARBY_COORDS);

      renderProvider();

      await waitFor(() => {
        expect(mockedGetCurrentPosition).toHaveBeenCalledTimes(1);
      });
    });

    it('keeps the saved location when the fresh fix is within the refresh threshold', async () => {
      stubGeolocationSuccess(NEARBY_COORDS);

      renderProvider();

      await waitFor(() => {
        expect(mockedGetCurrentPosition).toHaveBeenCalled();
      });
      expect(screen.getByTestId('coords')).toHaveTextContent(
        `${SAVED_LOCATION.latitude},${SAVED_LOCATION.longitude}`
      );
      expect(mockedReverseGeocode).not.toHaveBeenCalled();
    });

    it('updates location and storage when the user has moved beyond the threshold', async () => {
      stubGeolocationSuccess(FAR_COORDS);

      renderProvider();

      await waitFor(() => {
        expect(screen.getByTestId('street')).toHaveTextContent('San Roque');
      });
      expect(screen.getByTestId('coords')).toHaveTextContent(
        `${FAR_COORDS.latitude},${FAR_COORDS.longitude}`
      );

      const saved = JSON.parse(localStorage.getItem(USER_LOCATION_STORAGE_KEY) ?? 'null');
      expect(saved).toMatchObject({ street: 'San Roque' });
    });

    it('ignores a background fix whose accuracy is too poor to trust', async () => {
      // Apparent move of ~0.33 km, but with ±5 km accuracy it could be pure GPS noise.
      stubGeolocationSuccess({
        latitude: SAVED_LOCATION.latitude + 0.003,
        longitude: SAVED_LOCATION.longitude,
        accuracy: 5000,
      } as GeolocationCoordinates);

      renderProvider();

      await waitFor(() => {
        expect(mockedGetCurrentPosition).toHaveBeenCalled();
      });
      expect(screen.getByTestId('coords')).toHaveTextContent(
        `${SAVED_LOCATION.latitude},${SAVED_LOCATION.longitude}`
      );
      expect(mockedReverseGeocode).not.toHaveBeenCalled();
    });

    it('ignores a stale background fix that resolves after a newer manual request', async () => {
      const pendingSuccessCallbacks: PositionCallback[] = [];
      mockedGetCurrentPosition.mockImplementation((success) => {
        pendingSuccessCallbacks.push(success);
      });
      mockedReverseGeocode.mockImplementation(async (latitude: number, longitude: number) => ({
        latitude,
        longitude,
        displayName: latitude === FAR_COORDS.latitude ? 'Pili, Camarines Sur' : 'Stale Town',
        street: latitude === FAR_COORDS.latitude ? 'San Roque' : 'Stale St',
      }));

      renderProvider();

      await waitFor(() => {
        expect(pendingSuccessCallbacks).toHaveLength(1); // background refresh in flight
      });

      fireEvent.click(screen.getByTestId('request-gps')); // user-triggered request
      await waitFor(() => {
        expect(pendingSuccessCallbacks).toHaveLength(2);
      });

      // The newer manual request resolves first...
      await act(async () => {
        pendingSuccessCallbacks[1]({ coords: FAR_COORDS } as GeolocationPosition);
      });
      await waitFor(() => {
        expect(screen.getByTestId('street')).toHaveTextContent('San Roque');
      });

      // ...then the stale background fix resolves with a different position and must be ignored.
      await act(async () => {
        pendingSuccessCallbacks[0]({
          coords: { latitude: 13.9, longitude: 123.5 },
        } as GeolocationPosition);
      });

      expect(screen.getByTestId('street')).toHaveTextContent('San Roque');
      expect(screen.getByTestId('coords')).toHaveTextContent(
        `${FAR_COORDS.latitude},${FAR_COORDS.longitude}`
      );
    });

    it('keeps the saved location without error state when the background refresh is denied', async () => {
      stubGeolocationError();

      renderProvider();

      await waitFor(() => {
        expect(mockedGetCurrentPosition).toHaveBeenCalled();
      });
      expect(screen.getByTestId('status')).toHaveTextContent('ready');
      expect(screen.getByTestId('error')).toHaveTextContent('none');
      expect(screen.getByTestId('manual-prompt')).toHaveTextContent('closed');
      expect(screen.getByTestId('coords')).toHaveTextContent(
        `${SAVED_LOCATION.latitude},${SAVED_LOCATION.longitude}`
      );
    });
  });

  describe('corrupt saved data', () => {
    it('discards invalid JSON and falls back to a fresh geolocation request', async () => {
      localStorage.setItem(USER_LOCATION_STORAGE_KEY, 'not-json{');
      stubGeolocationSuccess(FAR_COORDS);

      renderProvider();

      await waitFor(() => {
        expect(screen.getByTestId('status')).toHaveTextContent('ready');
      });
      expect(screen.getByTestId('street')).toHaveTextContent('San Roque');
    });
  });

  it('throws when useUserLocation is used outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/LocationProvider/);
    spy.mockRestore();
  });
});
