import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
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
  } = useUserLocation();

  return (
    <div>
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
