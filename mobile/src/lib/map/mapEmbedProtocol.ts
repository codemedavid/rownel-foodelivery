// The contract between this app and the MapKit JS page it hosts in a WebView.
//
// MapKit JS is a browser SDK, so React Native cannot run it. The web app serves
// a purpose-built page at /map-embed.html and this app loads that URL — from
// the web app's own origin, which is what lets it reuse the existing
// domain-pinned /api/mapkit-token. A WebView showing local HTML has no origin
// Apple would accept, so the page has to come off the network.
//
// MIRROR: this file is the twin of the web app's
// src/lib/mapkit/mapEmbedProtocol.ts. They are separate deploy artefacts and
// cannot import from each other, so the shapes below ARE the wire format and
// any change must be made in both. The page tolerates commands it does not
// recognise, so an app update can ship ahead of a web deploy.

export type MapPinKind =
  | 'tracked-rider'
  | 'ambient-rider'
  | 'delivery'
  | 'merchant'
  | 'location';

export interface MapPoint {
  latitude: number;
  longitude: number;
}

export interface MapPin extends MapPoint {
  /** Stable across updates: it is how a moved pin is matched to an existing one. */
  id: string;
  kind: MapPinKind;
  /** Only the address picker's pin is draggable. */
  isDraggable?: boolean;
}

/** A filled circle, used to show a merchant's delivery radius. */
export interface MapCircle extends MapPoint {
  radiusMetres: number;
}

/** App -> page. */
export type MapEmbedCommand =
  | { type: 'setPins'; pins: MapPin[] }
  | { type: 'setCircle'; circle: MapCircle | null }
  | { type: 'setCenter'; center: MapPoint; isAnimated?: boolean }
  | { type: 'fitPins' };

/** Page -> app. */
export type MapEmbedEvent =
  | { type: 'ready' }
  | { type: 'failed'; message: string }
  /** The customer tapped a spot on the map. */
  | { type: 'press'; latitude: number; longitude: number }
  /** A draggable pin was let go somewhere new. */
  | { type: 'pinMoved'; id: string; latitude: number; longitude: number };

/** The global the page installs for this app to call through injectJavaScript. */
export const MAP_EMBED_GLOBAL = '__rownelMapEmbed';

export const EMBED_PATH = '/map-embed.html';

// Manila, as a neutral opening view when the caller has nothing to centre on.
export const DEFAULT_CENTER: MapPoint = { latitude: 14.5995, longitude: 120.9842 };

export const DEFAULT_ZOOM = 15;

/** Street level: close enough to read the block a pin sits on. */
export const STREET_ZOOM = 16;

/** Wide enough to show a rider and a destination several barangays apart. */
export const NEIGHBOURHOOD_ZOOM = 13;

export interface MapEmbedOptions {
  center?: MapPoint | null;
  /** Web-mercator zoom level the map opens at. */
  zoom?: number;
  /** False for a display-only map the customer should not pan or zoom. */
  isInteractive?: boolean;
  /** Confines panning to the Philippines, so a pin cannot be dropped abroad. */
  isBoundedToPhilippines?: boolean;
  /** Page background, so the map's frame matches the screen around it. */
  backgroundColor?: string;
}

const flag = (value: boolean): string => (value ? '1' : '0');

/** Query state for the opening view. Pure, so the URL is testable on its own. */
export const buildMapEmbedQuery = (options: MapEmbedOptions = {}): string => {
  const center = options.center ?? DEFAULT_CENTER;
  const params = new URLSearchParams({
    lat: String(center.latitude),
    lng: String(center.longitude),
    zoom: String(options.zoom ?? DEFAULT_ZOOM),
    interactive: flag(options.isInteractive ?? true),
    bounded: flag(options.isBoundedToPhilippines ?? false),
  });
  if (options.backgroundColor) params.set('bg', options.backgroundColor);
  return params.toString();
};

/** The full URL to load in the WebView. `origin` is the web app's deployment. */
export const buildMapEmbedUrl = (origin: string, options: MapEmbedOptions = {}): string =>
  `${origin.replace(/\/+$/, '')}${EMBED_PATH}?${buildMapEmbedQuery(options)}`;

/**
 * Wraps a command as source for `injectJavaScript`, which evaluates a string
 * rather than passing a value. The JSON is embedded as a string literal so the
 * page parses it, instead of being interpolated into the source itself where a
 * quote in an address would break the script.
 */
export const toInjectedCommand = (command: MapEmbedCommand): string => {
  // JSON.stringify twice: once for the payload, once to make that payload a
  // safely escaped JavaScript string literal.
  const payload = JSON.stringify(JSON.stringify(command));
  // The trailing `true;` is required by injectJavaScript on iOS — without a
  // value the bridge warns about an unhandled evaluation result.
  return `window.${MAP_EMBED_GLOBAL} && window.${MAP_EMBED_GLOBAL}.command(${payload}); true;`;
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * Reads an event the page sent. Returns null for anything unrecognised: the
 * page and the app ship separately, and a WebView message is not a place to
 * throw — nobody would see it.
 */
export const parseMapEmbedEvent = (raw: string): MapEmbedEvent | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const event = parsed as Record<string, unknown>;

  switch (event.type) {
    case 'ready':
      return { type: 'ready' };

    case 'failed':
      return {
        type: 'failed',
        message: typeof event.message === 'string' ? event.message : 'The map could not load.',
      };

    case 'press':
      if (!isFiniteNumber(event.latitude) || !isFiniteNumber(event.longitude)) return null;
      return { type: 'press', latitude: event.latitude, longitude: event.longitude };

    case 'pinMoved':
      if (!isFiniteNumber(event.latitude) || !isFiniteNumber(event.longitude)) return null;
      if (typeof event.id !== 'string') return null;
      return {
        type: 'pinMoved',
        id: event.id,
        latitude: event.latitude,
        longitude: event.longitude,
      };

    default:
      return null;
  }
};
