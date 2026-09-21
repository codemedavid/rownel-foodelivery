// The contract between the standalone map page and the Expo app that hosts it.
//
// MapKit JS is a browser SDK, so React Native cannot run it. The Expo app loads
// /map-embed.html in a WebView instead, served from this app's own origin —
// which is what lets it reuse /api/mapkit-token unchanged, since a MapKit JS
// token is pinned to a domain and a WebView with its own local page has none.
//
// Two channels cross the boundary, and they are deliberately different:
//
//   * The opening view (centre, zoom, whether it can be panned) is URL query
//     state. It is needed before the map exists, and a WebView that reloads —
//     which Android does on its own, on memory pressure — must come back the
//     same way it went in.
//   * Everything after that is a command message, because pins move.
//
// This file is mirrored at mobile/src/lib/map/mapEmbedProtocol.ts. The two are
// separate deploy artefacts and cannot import from each other, so any change
// here has to be made there too — the shapes below are the wire format.

import type { MapPinKind } from '../../components/map/mapPins';

export type { MapPinKind };

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

/** Host -> page. */
export type MapEmbedCommand =
  | { type: 'setPins'; pins: MapPin[] }
  | { type: 'setCircle'; circle: MapCircle | null }
  | { type: 'setCenter'; center: MapPoint; isAnimated?: boolean }
  | { type: 'fitPins' };

/** Page -> host. */
export type MapEmbedEvent =
  | { type: 'ready' }
  | { type: 'failed'; message: string }
  /** The customer tapped a spot on the map. */
  | { type: 'press'; latitude: number; longitude: number }
  /** A draggable pin was let go somewhere new. */
  | { type: 'pinMoved'; id: string; latitude: number; longitude: number };

/**
 * The global the page installs for the host to call. `injectJavaScript` is the
 * only channel react-native-webview offers in this direction, and it evaluates
 * a string — so the host sends JSON and the page parses it, rather than trying
 * to interpolate an object into source code.
 */
export const MAP_EMBED_GLOBAL = '__rownelMapEmbed';

export const EMBED_PATH = '/map-embed.html';

// Manila, as a neutral opening view when the caller has nothing to centre on.
export const DEFAULT_CENTER: MapPoint = { latitude: 14.5995, longitude: 120.9842 };

// MapKit frames the view by camera altitude in metres, while the rest of this
// app thinks in web-mercator zoom levels. Halving the earth's circumference per
// level is the standard correspondence between the two.
const EQUATOR_METRES = 40_075_017;

export const zoomToCameraDistance = (zoom: number): number => EQUATOR_METRES / 2 ** zoom;

export const DEFAULT_ZOOM = 15;

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

/** Query state for the opening view. Pure, so the host can test the URL it builds. */
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

/** The full URL to load in the WebView. `origin` is this web app's deployment. */
export const buildMapEmbedUrl = (origin: string, options: MapEmbedOptions = {}): string =>
  `${origin.replace(/\/+$/, '')}${EMBED_PATH}?${buildMapEmbedQuery(options)}`;

const readNumber = (params: URLSearchParams, key: string, fallback: number): number => {
  const raw = params.get(key);
  if (raw === null || raw.trim() === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
};

const readFlag = (params: URLSearchParams, key: string, fallback: boolean): boolean => {
  const raw = params.get(key);
  if (raw === null) return fallback;
  return raw === '1' || raw === 'true';
};

export interface MapEmbedView {
  center: MapPoint;
  cameraDistance: number;
  isInteractive: boolean;
  isBoundedToPhilippines: boolean;
  backgroundColor: string | null;
}

/**
 * The opening view, read back from the query string. Every value has a working
 * fallback: a missing or malformed parameter opens a usable map rather than a
 * blank one, because there is no one to report a parse error to in a WebView.
 */
export const readMapEmbedView = (search: string): MapEmbedView => {
  const params = new URLSearchParams(search);

  return {
    center: {
      latitude: readNumber(params, 'lat', DEFAULT_CENTER.latitude),
      longitude: readNumber(params, 'lng', DEFAULT_CENTER.longitude),
    },
    cameraDistance: zoomToCameraDistance(readNumber(params, 'zoom', DEFAULT_ZOOM)),
    isInteractive: readFlag(params, 'interactive', true),
    isBoundedToPhilippines: readFlag(params, 'bounded', false),
    backgroundColor: params.get('bg'),
  };
};

/**
 * Reads a command off the wire. Returns null for anything unrecognised, so an
 * older page paired with a newer app ignores what it cannot do instead of
 * throwing inside an event handler no one is watching.
 */
export const parseMapEmbedCommand = (raw: string): MapEmbedCommand | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const command = parsed as { type?: unknown };

  switch (command.type) {
    case 'setPins':
    case 'setCircle':
    case 'setCenter':
    case 'fitPins':
      return parsed as MapEmbedCommand;
    default:
      return null;
  }
};
