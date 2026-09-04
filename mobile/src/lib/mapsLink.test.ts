import { buildMapsUrl } from './mapsLink';

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
