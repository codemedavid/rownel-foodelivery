// The map the Expo app draws inside a WebView.
//
// This is a second Vite entry point, not part of the React bundle: it ships
// MapKit JS and the pin factories and nothing else, because it is loaded over a
// phone connection every time a customer opens the checkout.
//
// It is served from this app's own origin on purpose. MapKit JS tokens are
// pinned to a domain, and a WebView showing a local HTML string has no origin
// Apple will accept — so the page lives at /map-embed.html and authorises
// through the very same /api/mapkit-token the browser uses.
//
// The host drives it through window.__rownelMapEmbed; see mapEmbedProtocol.ts.

import type { Annotation, CircleOverlay, Map as MapkitMap } from '@apple/mapkit-loader';
import { loadMapkit } from '../lib/mapkit/loadMapkit';
import { PHILIPPINES_REGION } from '../lib/geocoding';
import { PIN_FACTORIES } from '../components/map/mapPins';
import {
  MAP_EMBED_GLOBAL,
  parseMapEmbedCommand,
  readMapEmbedView,
  type MapCircle,
  type MapEmbedCommand,
  type MapEmbedEvent,
  type MapPin,
  type MapPoint,
} from '../lib/mapkit/mapEmbedProtocol';

// How much of the map is left as margin when framing several pins at once.
const FIT_PADDING = 64;

// A lone pin has no span to fit, so it gets a fixed street-level altitude.
const SINGLE_PIN_CAMERA_DISTANCE = 2_000;

const CIRCLE_STYLE = {
  fillColor: '#22c55e',
  fillOpacity: 0.1,
  strokeColor: '#16a34a',
  lineWidth: 2,
} as const;

interface ReactNativeWebViewBridge {
  postMessage: (message: string) => void;
}

declare global {
  interface Window {
    ReactNativeWebView?: ReactNativeWebViewBridge;
    [MAP_EMBED_GLOBAL]?: { command: (raw: string) => void };
  }
}

/**
 * Sends one event to the host. Falls back to the plain window when there is no
 * bridge, which is what makes the page openable in a desktop browser for
 * debugging rather than being inert outside the app.
 */
const emit = (event: MapEmbedEvent): void => {
  const message = JSON.stringify(event);
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(message);
    return;
  }
  window.parent?.postMessage(message, '*');
};

const view = readMapEmbedView(window.location.search);

if (view.backgroundColor) {
  document.body.style.backgroundColor = view.backgroundColor;
}

const container = document.getElementById('map');

/** Every pin currently on the map, by the id the host gave it. */
const annotations = new Map<string, Annotation>();
let circleOverlay: CircleOverlay | null = null;

const toPoint = (pin: MapPin | MapPoint): MapPoint => ({
  latitude: pin.latitude,
  longitude: pin.longitude,
});

const isUsablePoint = (point: MapPoint): boolean =>
  Number.isFinite(point.latitude) && Number.isFinite(point.longitude);

const start = async (): Promise<void> => {
  if (!container) {
    emit({ type: 'failed', message: 'The map container is missing from the page.' });
    return;
  }

  let mapkit: Awaited<ReturnType<typeof loadMapkit>>;
  let map: MapkitMap;

  try {
    mapkit = await loadMapkit();
    map = new mapkit.Map(container, {
      center: new mapkit.Coordinate(view.center.latitude, view.center.longitude),
      cameraDistance: view.cameraDistance,
      isScrollEnabled: view.isInteractive,
      isZoomEnabled: view.isInteractive,
      isRotationEnabled: false,
      showsCompass: 'hidden',
      showsScale: 'hidden',
      // The phone has its own zoom controls in the gesture; on-screen ones
      // only cover the map on a small display.
      showsZoomControl: false,
      showsMapTypeControl: false,
      ...(view.isBoundedToPhilippines ? { cameraBoundary: PHILIPPINES_REGION } : {}),
    });
  } catch (error: unknown) {
    // The host shows its own failure panel; it only needs to know that it must.
    emit({
      type: 'failed',
      message: error instanceof Error ? error.message : 'Apple Maps could not start.',
    });
    return;
  }

  const coordinate = (point: MapPoint) =>
    new mapkit.Coordinate(point.latitude, point.longitude);

  map.addEventListener('click', (event: Event) => {
    const { pointOnPage } = event as Event & { pointOnPage: DOMPoint };
    const tapped = map.convertPointOnPageToCoordinate(pointOnPage);
    emit({ type: 'press', latitude: tapped.latitude, longitude: tapped.longitude });
  });

  const addPin = (pin: MapPin): void => {
    const createElement = PIN_FACTORIES[pin.kind];
    // An unknown kind means the app is newer than the page. Drawing nothing is
    // better than throwing: the rest of the pins still appear.
    if (!createElement) return;

    const annotation = new mapkit.Annotation(coordinate(toPoint(pin)), createElement, {
      draggable: pin.isDraggable ?? false,
      anchorOffset: new DOMPoint(0, -16),
    });

    if (pin.isDraggable) {
      annotation.addEventListener('drag-end', () => {
        const { latitude, longitude } = annotation.coordinate;
        emit({ type: 'pinMoved', id: pin.id, latitude, longitude });
      });
    }

    map.addAnnotation(annotation);
    annotations.set(pin.id, annotation);
  };

  /**
   * Moves the pins that are still present, adds the new ones and removes the
   * gone. Replacing the whole set instead would make a tracked rider blink out
   * and back on every position update rather than gliding.
   */
  const setPins = (pins: MapPin[]): void => {
    const usable = pins.filter((pin) => isUsablePoint(pin));
    const incoming = new Set(usable.map((pin) => pin.id));

    for (const [id, annotation] of annotations) {
      if (incoming.has(id)) continue;
      map.removeAnnotation(annotation);
      annotations.delete(id);
    }

    for (const pin of usable) {
      const existing = annotations.get(pin.id);
      if (existing) {
        existing.coordinate = coordinate(toPoint(pin));
        continue;
      }
      addPin(pin);
    }
  };

  const setCircle = (circle: MapCircle | null): void => {
    if (circleOverlay) {
      map.removeOverlay(circleOverlay);
      circleOverlay = null;
    }
    if (!circle || !isUsablePoint(circle) || !(circle.radiusMetres > 0)) return;

    circleOverlay = new mapkit.CircleOverlay(coordinate(circle), circle.radiusMetres, {
      style: new mapkit.Style(CIRCLE_STYLE),
    });
    map.addOverlay(circleOverlay);
  };

  /** Frames everything currently drawn, so no pin sits off-screen. */
  const fitPins = (): void => {
    const placed = [...annotations.values()];
    if (placed.length === 0) return;

    if (placed.length === 1) {
      map.setCenterAnimated(placed[0].coordinate, true);
      map.cameraDistance = SINGLE_PIN_CAMERA_DISTANCE;
      return;
    }

    map.showItems(placed, {
      animate: true,
      padding: new mapkit.Padding(FIT_PADDING, FIT_PADDING, FIT_PADDING, FIT_PADDING),
    });
  };

  const apply = (command: MapEmbedCommand): void => {
    switch (command.type) {
      case 'setPins':
        setPins(command.pins);
        return;
      case 'setCircle':
        setCircle(command.circle);
        return;
      case 'setCenter':
        if (!isUsablePoint(command.center)) return;
        map.setCenterAnimated(coordinate(command.center), command.isAnimated ?? true);
        return;
      case 'fitPins':
        fitPins();
        return;
    }
  };

  window[MAP_EMBED_GLOBAL] = {
    command: (raw: string) => {
      const command = parseMapEmbedCommand(raw);
      if (command) apply(command);
    },
  };

  // Only now: the host queues its first pins on this, and a command arriving
  // before the global exists would be dropped silently.
  emit({ type: 'ready' });
};

void start();
