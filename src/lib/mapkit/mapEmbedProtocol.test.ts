// This protocol crosses a process boundary into a WebView, where a mistake is
// invisible: there is no console anyone reads and no error anyone sees. So the
// tests cover the two directions that matter — a URL the page can always open a
// usable map from, and a command stream that ignores what it does not know
// rather than throwing inside a handler.
import { describe, expect, it } from 'vitest';
import {
  buildMapEmbedQuery,
  buildMapEmbedUrl,
  DEFAULT_CENTER,
  parseMapEmbedCommand,
  readMapEmbedView,
  zoomToCameraDistance,
} from './mapEmbedProtocol';

const MANILA = { latitude: 14.5995, longitude: 120.9842 };

describe('buildMapEmbedUrl', () => {
  it('points at the map page on the given origin', () => {
    // Arrange / Act
    const url = buildMapEmbedUrl('https://row-nel.com', { center: MANILA });

    // Assert — same origin as /api/mapkit-token, which is what authorises it
    expect(url.startsWith('https://row-nel.com/map-embed.html?')).toBe(true);
  });

  it('does not double the slash when the origin has a trailing one', () => {
    // Arrange / Act
    const url = buildMapEmbedUrl('https://row-nel.com/', { center: MANILA });

    // Assert
    expect(url).not.toContain('com//');
  });

  it('carries the centre and zoom the caller asked for', () => {
    // Arrange / Act
    const query = new URLSearchParams(buildMapEmbedQuery({ center: MANILA, zoom: 17 }));

    // Assert
    expect(query.get('lat')).toBe('14.5995');
    expect(query.get('lng')).toBe('120.9842');
    expect(query.get('zoom')).toBe('17');
  });

  it('opens on Manila when the caller has no location yet', () => {
    // Arrange / Act
    const query = new URLSearchParams(buildMapEmbedQuery());

    // Assert — a blank map is worse than a neutral one
    expect(query.get('lat')).toBe(String(DEFAULT_CENTER.latitude));
  });
});

describe('readMapEmbedView', () => {
  it('round-trips what buildMapEmbedQuery wrote', () => {
    // Arrange
    const query = buildMapEmbedQuery({
      center: MANILA,
      zoom: 16,
      isInteractive: false,
      isBoundedToPhilippines: true,
      backgroundColor: '#f6f6f8',
    });

    // Act
    const view = readMapEmbedView(`?${query}`);

    // Assert
    expect(view).toEqual({
      center: MANILA,
      cameraDistance: zoomToCameraDistance(16),
      isInteractive: false,
      isBoundedToPhilippines: true,
      backgroundColor: '#f6f6f8',
    });
  });

  it('opens a usable map when the query string is empty', () => {
    // Arrange / Act — there is nobody in a WebView to report a parse error to
    const view = readMapEmbedView('');

    // Assert
    expect(view.center).toEqual(DEFAULT_CENTER);
    expect(view.isInteractive).toBe(true);
  });

  it('ignores a malformed coordinate instead of centring on NaN', () => {
    // Arrange / Act
    const view = readMapEmbedView('?lat=north&lng=120.9842');

    // Assert — a NaN centre renders a permanently grey map
    expect(view.center.latitude).toBe(DEFAULT_CENTER.latitude);
  });

  it('converts zoom levels to the camera altitude MapKit expects', () => {
    // Arrange / Act
    const close = readMapEmbedView('?zoom=17').cameraDistance;
    const far = readMapEmbedView('?zoom=11').cameraDistance;

    // Assert
    expect(close).toBeLessThan(far);
  });
});

describe('parseMapEmbedCommand', () => {
  it('accepts every command the host can send', () => {
    // Arrange / Act / Assert
    expect(parseMapEmbedCommand('{"type":"setPins","pins":[]}')).toMatchObject({
      type: 'setPins',
    });
    expect(parseMapEmbedCommand('{"type":"setCircle","circle":null}')).toMatchObject({
      type: 'setCircle',
    });
    expect(parseMapEmbedCommand('{"type":"fitPins"}')).toMatchObject({ type: 'fitPins' });
  });

  it('ignores a command it does not recognise', () => {
    // Arrange / Act — an older page paired with a newer app must not throw
    expect(parseMapEmbedCommand('{"type":"setTraffic"}')).toBeNull();
  });

  it('ignores anything that is not JSON', () => {
    // Arrange / Act / Assert — injectJavaScript evaluates a string we built
    expect(parseMapEmbedCommand('not json at all')).toBeNull();
  });

  it('ignores a JSON value that is not an object', () => {
    // Arrange / Act / Assert
    expect(parseMapEmbedCommand('null')).toBeNull();
    expect(parseMapEmbedCommand('[1,2,3]')).toBeNull();
  });
});
