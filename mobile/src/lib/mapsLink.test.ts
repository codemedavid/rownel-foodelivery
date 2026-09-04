import { Linking } from 'react-native';
import { buildMapsUrl, openDirections } from './mapsLink';

describe('buildMapsUrl', () => {
  it('prefers coordinates and uses Apple Maps on iOS', () => {
    expect(buildMapsUrl({ latitude: 14.5995, longitude: 120.9842 }, 'ios')).toBe(
      'http://maps.apple.com/?daddr=14.5995,120.9842'
    );
  });

  it('uses Google Maps directions elsewhere', () => {
    expect(buildMapsUrl({ latitude: 14.5995, longitude: 120.9842 }, 'android')).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=14.5995,120.9842'
    );
  });

  it('falls back to the address when coordinates are missing', () => {
    expect(buildMapsUrl({ address: '12 Rizal St, Manila' }, 'android')).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=12%20Rizal%20St%2C%20Manila'
    );
    expect(buildMapsUrl({ address: '12 Rizal St' }, 'ios')).toBe('http://maps.apple.com/?daddr=12%20Rizal%20St');
  });

  it('returns null when there is nothing to navigate to', () => {
    expect(buildMapsUrl({}, 'ios')).toBeNull();
    expect(buildMapsUrl({ address: '   ' }, 'ios')).toBeNull();
    expect(buildMapsUrl({ latitude: 1 }, 'ios')).toBeNull();
  });
});

describe('openDirections', () => {
  const openURL = jest.spyOn(Linking, 'openURL');

  beforeEach(() => {
    openURL.mockReset();
    openURL.mockResolvedValue(true);
  });

  it('opens the maps app and reports success', async () => {
    await expect(openDirections({ latitude: 14.5995, longitude: 120.9842 })).resolves.toBe(true);
    expect(openURL).toHaveBeenCalledTimes(1);
    expect(openURL.mock.calls[0][0]).toContain('14.5995,120.9842');
  });

  it('does nothing when there is no destination', async () => {
    await expect(openDirections({})).resolves.toBe(false);
    expect(openURL).not.toHaveBeenCalled();
  });

  it('reports failure instead of throwing when the maps app cannot open', async () => {
    openURL.mockRejectedValue(new Error('no handler'));
    await expect(openDirections({ address: 'Manila' })).resolves.toBe(false);
  });
});
