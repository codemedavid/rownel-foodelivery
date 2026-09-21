// This protocol crosses into a WebView, where a mistake is invisible — no
// console anyone reads, no error anyone sees. The two directions are tested
// separately because they fail differently: a bad URL opens a grey rectangle,
// while a bad command throws inside a handler nothing is listening to.
//
// The command test that matters most is the escaping one. Addresses contain
// apostrophes and quotes, and injectJavaScript evaluates a string we built.

import {
  buildMapEmbedQuery,
  buildMapEmbedUrl,
  DEFAULT_CENTER,
  EMBED_PATH,
  MAP_EMBED_GLOBAL,
  parseMapEmbedEvent,
  toInjectedCommand,
} from './mapEmbedProtocol';

/**
 * The WebView's navigation guard, mirrored from MapEmbedView so the redirect
 * case is pinned by a test. row-nel.com answers 307 and hands the WebView on
 * to www.row-nel.com; a guard that compared against the URL we asked for would
 * refuse that and render a blank frame.
 */
const isAllowedNavigation = (url: string): boolean => {
  if (url === 'about:blank') return true;
  const [withoutQuery] = url.split('?');
  return withoutQuery.endsWith(EMBED_PATH);
};

const MANILA = { latitude: 14.5995, longitude: 120.9842 };

describe('buildMapEmbedUrl', () => {
  it('points at the map page on the web deployment', () => {
    // Arrange / Act
    const url = buildMapEmbedUrl('https://row-nel.com', { center: MANILA });

    // Assert — same origin as /api/mapkit-token, which is what authorises it
    expect(url.startsWith('https://row-nel.com/map-embed.html?')).toBe(true);
  });

  it('does not double the slash when the origin has a trailing one', () => {
    // Arrange / Act / Assert
    expect(buildMapEmbedUrl('https://row-nel.com/', {})).not.toContain('com//');
  });

  it('carries the opening view as query state', () => {
    // Arrange / Act
    const query = new URLSearchParams(
      buildMapEmbedQuery({
        center: MANILA,
        zoom: 17,
        isInteractive: false,
        isBoundedToPhilippines: true,
      })
    );

    // Assert — the page must come back the same way after an Android reload
    expect(query.get('lat')).toBe('14.5995');
    expect(query.get('zoom')).toBe('17');
    expect(query.get('interactive')).toBe('0');
    expect(query.get('bounded')).toBe('1');
  });

  it('opens on Manila when the caller has no location yet', () => {
    // Arrange / Act
    const query = new URLSearchParams(buildMapEmbedQuery());

    // Assert
    expect(query.get('lat')).toBe(String(DEFAULT_CENTER.latitude));
  });
});

describe('toInjectedCommand', () => {
  it('calls the page’s global with the command as JSON', () => {
    // Arrange / Act
    const script = toInjectedCommand({ type: 'fitPins' });

    // Assert
    expect(script).toContain(MAP_EMBED_GLOBAL);
    expect(script).toContain('fitPins');
  });

  it('guards against the global not being installed yet', () => {
    // Arrange / Act — a command can race the page's own startup
    const script = toInjectedCommand({ type: 'fitPins' });

    // Assert
    expect(script).toContain(`window.${MAP_EMBED_GLOBAL} &&`);
  });

  it('ends with a value, which injectJavaScript requires on iOS', () => {
    // Arrange / Act / Assert — without it the bridge warns on every call
    expect(toInjectedCommand({ type: 'fitPins' }).trimEnd().endsWith('true;')).toBe(true);
  });

  it('escapes a quote in the payload instead of breaking the script', () => {
    // Arrange — apostrophes and quotes are ordinary in Philippine place names
    const command = {
      type: 'setPins' as const,
      pins: [
        {
          id: `Ricky's "Best" Lechon`,
          kind: 'location' as const,
          ...MANILA,
        },
      ],
    };

    // Act
    const script = toInjectedCommand(command);

    // Assert — the script must still be one valid statement, and round-trip
    const payload = script.slice(script.indexOf('command(') + 'command('.length, script.lastIndexOf(')'));
    expect(JSON.parse(JSON.parse(payload))).toEqual(command);
  });
});

describe('parseMapEmbedEvent', () => {
  it('reads the ready signal the page sends once it can take commands', () => {
    // Arrange / Act / Assert
    expect(parseMapEmbedEvent('{"type":"ready"}')).toEqual({ type: 'ready' });
  });

  it('reads a failure with the page’s own message', () => {
    // Arrange / Act
    const event = parseMapEmbedEvent('{"type":"failed","message":"no token"}');

    // Assert
    expect(event).toEqual({ type: 'failed', message: 'no token' });
  });

  it('supplies a message when the page sent none', () => {
    // Arrange / Act
    const event = parseMapEmbedEvent('{"type":"failed"}');

    // Assert — the host renders this directly; undefined would render blank
    expect(event).toMatchObject({ type: 'failed' });
    expect((event as { message: string }).message).not.toBe('');
  });

  it('reads a tap on the map', () => {
    // Arrange / Act
    const event = parseMapEmbedEvent('{"type":"press","latitude":14.5,"longitude":120.9}');

    // Assert
    expect(event).toEqual({ type: 'press', latitude: 14.5, longitude: 120.9 });
  });

  it('reads a dragged pin with the id it was given', () => {
    // Arrange / Act
    const event = parseMapEmbedEvent(
      '{"type":"pinMoved","id":"delivery-address","latitude":14.5,"longitude":120.9}'
    );

    // Assert
    expect(event).toEqual({
      type: 'pinMoved',
      id: 'delivery-address',
      latitude: 14.5,
      longitude: 120.9,
    });
  });

  it('rejects a coordinate event with no usable coordinate', () => {
    // Arrange / Act — moving a pin to NaN would blank the map
    expect(parseMapEmbedEvent('{"type":"press","latitude":null,"longitude":120.9}')).toBeNull();
    expect(parseMapEmbedEvent('{"type":"press"}')).toBeNull();
  });

  it('rejects a pin move with no id to match it to', () => {
    // Arrange / Act / Assert
    expect(
      parseMapEmbedEvent('{"type":"pinMoved","latitude":14.5,"longitude":120.9}')
    ).toBeNull();
  });

  it('ignores an event type it does not know', () => {
    // Arrange / Act — a newer page paired with an older app must not throw
    expect(parseMapEmbedEvent('{"type":"longPress"}')).toBeNull();
  });

  it('ignores anything that is not a JSON object', () => {
    // Arrange / Act / Assert — any page could post a message to this handler
    expect(parseMapEmbedEvent('not json')).toBeNull();
    expect(parseMapEmbedEvent('null')).toBeNull();
    expect(parseMapEmbedEvent('"ready"')).toBeNull();
  });
});

describe('the WebView navigation guard', () => {
  it('allows the apex-to-www redirect the live site performs', () => {
    // Arrange / Act / Assert — row-nel.com 307s to www.row-nel.com
    expect(isAllowedNavigation('https://row-nel.com/map-embed.html?lat=14.6')).toBe(true);
    expect(isAllowedNavigation('https://www.row-nel.com/map-embed.html?lat=14.6')).toBe(true);
  });

  it('allows a LAN dev server over http', () => {
    // Arrange / Act / Assert
    expect(isAllowedNavigation('http://192.168.1.10:5173/map-embed.html?zoom=15')).toBe(true);
  });

  it('blocks a link out of a MapKit info bubble', () => {
    // Arrange / Act / Assert — the WebView must stay on the map page
    expect(isAllowedNavigation('https://maps.apple.com/?ll=14.6,121')).toBe(false);
    expect(isAllowedNavigation('https://www.row-nel.com/checkout')).toBe(false);
  });

  it('allows the blank page a WebView starts on', () => {
    // Arrange / Act / Assert
    expect(isAllowedNavigation('about:blank')).toBe(true);
  });
});
