// A wrong or missing origin is the most likely way maps break in a real build,
// and the symptom — a grey rectangle — says nothing about the cause. These
// tests hold the module to failing loudly instead.

import { buildReverseUrl, buildSearchUrl, getWebOrigin, hasWebOrigin, MapsConfigError } from './mapsConfig';

describe('getWebOrigin', () => {
  const original = process.env.EXPO_PUBLIC_WEB_ORIGIN;

  afterEach(() => {
    process.env.EXPO_PUBLIC_WEB_ORIGIN = original;
  });

  it('returns the configured origin', () => {
    // Arrange
    process.env.EXPO_PUBLIC_WEB_ORIGIN = 'https://row-nel.com';

    // Act / Assert
    expect(getWebOrigin()).toBe('https://row-nel.com');
  });

  it('strips a trailing slash, so joined paths never double up', () => {
    // Arrange
    process.env.EXPO_PUBLIC_WEB_ORIGIN = 'https://row-nel.com/';

    // Act / Assert
    expect(getWebOrigin()).toBe('https://row-nel.com');
  });

  it('names the variable when it is missing', () => {
    // Arrange
    delete process.env.EXPO_PUBLIC_WEB_ORIGIN;

    // Act / Assert — the alternative is an unexplained blank map
    expect(() => getWebOrigin()).toThrow(MapsConfigError);
    expect(() => getWebOrigin()).toThrow(/EXPO_PUBLIC_WEB_ORIGIN/);
  });

  it('rejects an origin with no scheme rather than building a broken URL', () => {
    // Arrange
    process.env.EXPO_PUBLIC_WEB_ORIGIN = 'row-nel.com';

    // Act / Assert
    expect(() => getWebOrigin()).toThrow(MapsConfigError);
  });

  it('allows http, so a LAN dev server works', () => {
    // Arrange — localhost on a phone is the phone, so a LAN address is normal
    process.env.EXPO_PUBLIC_WEB_ORIGIN = 'http://192.168.1.10:5173';

    // Act / Assert
    expect(getWebOrigin()).toBe('http://192.168.1.10:5173');
  });

  it('reports whether maps are configured without throwing', () => {
    // Arrange
    delete process.env.EXPO_PUBLIC_WEB_ORIGIN;

    // Act / Assert — screens use this to hide a map rather than crash
    expect(hasWebOrigin()).toBe(false);

    process.env.EXPO_PUBLIC_WEB_ORIGIN = 'https://row-nel.com';
    expect(hasWebOrigin()).toBe(true);
  });
});

describe('the proxy URLs', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_WEB_ORIGIN = 'https://row-nel.com';
  });

  it('point at this app’s own endpoints, not at Apple', () => {
    // Arrange
    const params = new URLSearchParams({ q: 'jollibee' });

    // Act / Assert — the Apple token must never leave the server
    expect(buildSearchUrl(params)).toBe('https://row-nel.com/api/maps-search?q=jollibee');
    expect(buildReverseUrl(new URLSearchParams({ lat: '14.5', lng: '120.9' }))).toBe(
      'https://row-nel.com/api/maps-reverse?lat=14.5&lng=120.9'
    );
  });
});
