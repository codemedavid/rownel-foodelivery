// An Apple map, drawn by MapKit JS inside a WebView.
//
// Every map in this app is this component. MapKit JS is a browser SDK, so the
// web deployment serves a purpose-built page and this loads it — from that same
// origin, which is the only way its domain-pinned Maps token authorises.
//
// The URL is built once, from the first render's props. Rebuilding it on a prop
// change would reload the WebView, throwing away the map and whatever the
// customer had panned to. Everything after the first render is sent as a
// command instead.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import {
  buildMapEmbedUrl,
  EMBED_PATH,
  parseMapEmbedEvent,
  toInjectedCommand,
  type MapCircle,
  type MapEmbedCommand,
  type MapPin,
  type MapPoint,
} from '../../lib/map/mapEmbedProtocol';
import { getWebOrigin } from '../../lib/map/mapsConfig';
import { colors, radius, spacing } from '../../theme';

export type MapStatus = 'loading' | 'ready' | 'failed';

const DEFAULT_HEIGHT = 220;

// Generous: MapKit's SDK comes off Apple's CDN over a phone connection, and a
// slow map is still a map. Past this it is not slow, it is not coming.
const LOAD_TIMEOUT_MS = 20_000;

export interface MapEmbedViewProps {
  /** Where the map opens. Later changes are sent as a recentre, not a reload. */
  center?: MapPoint | null;
  /** Web-mercator zoom level the map opens at. */
  zoom?: number;
  pins?: MapPin[];
  circle?: MapCircle | null;
  /** False for a display-only map the customer should not pan or zoom. */
  isInteractive?: boolean;
  /** Confines panning to the Philippines, so a pin cannot be dropped abroad. */
  isBoundedToPhilippines?: boolean;
  /** Reframes the camera to show every pin whenever the set of them changes. */
  shouldFitPins?: boolean;
  /** Recentres on this point when it changes. Independent of the opening view. */
  followCenter?: MapPoint | null;
  onPress?: (point: MapPoint) => void;
  onPinMoved?: (id: string, point: MapPoint) => void;
  onStatusChange?: (status: MapStatus) => void;
  /**
   * Fired as the customer starts and stops touching the map. A map inside a
   * ScrollView is otherwise unusable: the parent claims the pan and the map
   * never moves, so the screen turns its own scrolling off in between.
   */
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
  height?: number;
  style?: StyleProp<ViewStyle>;
  /** Shown over the map when it cannot load. */
  failureMessage?: string;
}

const FAILURE_FALLBACK = 'The map could not load.';

export function MapEmbedView({
  center,
  zoom,
  pins,
  circle = null,
  isInteractive = true,
  isBoundedToPhilippines = false,
  shouldFitPins = false,
  followCenter,
  onPress,
  onPinMoved,
  onStatusChange,
  onInteractionStart,
  onInteractionEnd,
  height = DEFAULT_HEIGHT,
  style,
  failureMessage = FAILURE_FALLBACK,
}: MapEmbedViewProps) {
  const webViewRef = useRef<WebView>(null);
  const [status, setStatus] = useState<MapStatus>('loading');

  // Held in refs so an inline arrow function from the parent does not make the
  // effects below re-run — and, for the URL, so panning is never undone.
  const onPressRef = useRef(onPress);
  onPressRef.current = onPress;
  const onPinMovedRef = useRef(onPinMoved);
  onPinMovedRef.current = onPinMoved;
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;

  const openingView = useRef({ center, zoom, isInteractive, isBoundedToPhilippines });

  // A missing EXPO_PUBLIC_WEB_ORIGIN is a build problem. Failing to a panel
  // that says so beats a WebView stuck on a malformed URL.
  const source = useMemo(() => {
    try {
      const view = openingView.current;
      return {
        uri: buildMapEmbedUrl(getWebOrigin(), {
          center: view.center,
          zoom: view.zoom,
          isInteractive: view.isInteractive,
          isBoundedToPhilippines: view.isBoundedToPhilippines,
          backgroundColor: colors.surfaceSunken,
        }),
      };
    } catch {
      return null;
    }
  }, []);

  const updateStatus = useCallback((next: MapStatus) => {
    setStatus(next);
    onStatusChangeRef.current?.(next);
  }, []);

  useEffect(() => {
    if (!source) updateStatus('failed');
  }, [source, updateStatus]);

  // A WebView can load a perfectly healthy page that simply is not this one.
  // An SPA catch-all rewrite serving the storefront at this path answers 200,
  // so neither onError nor onHttpError fires and `ready` never arrives —
  // leaving the customer watching a spinner for as long as they are willing
  // to. Giving up tells them to type the address instead.
  useEffect(() => {
    if (status !== 'loading') return;
    const timer = setTimeout(() => updateStatus('failed'), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [status, updateStatus]);

  const send = useCallback((command: MapEmbedCommand) => {
    webViewRef.current?.injectJavaScript(toInjectedCommand(command));
  }, []);

  const isReady = status === 'ready';

  // Compared by value, not by identity. Callers build these inline from the
  // data they are rendering, so a new array arrives on every parent render —
  // and a dependency on identity would cross the WebView bridge each time,
  // for a map that has not changed.
  const pinsKey = JSON.stringify(pins ?? []);
  const circleKey = JSON.stringify(circle);

  // Pins are re-sent on every change, including the first one after the page
  // signals ready — a command sent before that is evaluated against a page with
  // no handler installed and is silently lost.
  useEffect(() => {
    if (!isReady) return;
    send({ type: 'setPins', pins: JSON.parse(pinsKey) as MapPin[] });
    if (shouldFitPins) send({ type: 'fitPins' });
  }, [isReady, pinsKey, shouldFitPins, send]);

  useEffect(() => {
    if (!isReady) return;
    send({ type: 'setCircle', circle: JSON.parse(circleKey) as MapCircle | null });
  }, [isReady, circleKey, send]);

  useEffect(() => {
    if (!isReady || !followCenter) return;
    send({ type: 'setCenter', center: followCenter, isAnimated: true });
  }, [isReady, followCenter, send]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const parsed = parseMapEmbedEvent(event.nativeEvent.data);
      if (!parsed) return;

      switch (parsed.type) {
        case 'ready':
          updateStatus('ready');
          return;
        case 'failed':
          updateStatus('failed');
          return;
        case 'press':
          onPressRef.current?.({ latitude: parsed.latitude, longitude: parsed.longitude });
          return;
        case 'pinMoved':
          onPinMovedRef.current?.(parsed.id, {
            latitude: parsed.latitude,
            longitude: parsed.longitude,
          });
          return;
      }
    },
    [updateStatus]
  );

  /**
   * Keeps the WebView on the map page, so a link inside a MapKit info bubble
   * cannot navigate it somewhere unexpected.
   *
   * Matched on the path, not the whole URL: row-nel.com answers 307 and sends
   * the WebView on to www.row-nel.com, so comparing against the URL we asked
   * for would refuse the very redirect we were sent on — and a refused
   * navigation leaves a blank frame with nothing to explain it. The path
   * identifies the page; the host is allowed to move.
   */
  const shouldAllowNavigation = useCallback(({ url }: { url: string }): boolean => {
    if (url === 'about:blank') return true;
    const [withoutQuery] = url.split('?');
    return withoutQuery.endsWith(EMBED_PATH);
  }, []);

  return (
    <View
      style={[styles.frame, { height }, style]}
      onTouchStart={onInteractionStart}
      onTouchEnd={onInteractionEnd}
      onTouchCancel={onInteractionEnd}
    >
      {!!source && (
        <WebView
          ref={webViewRef}
          source={source}
          originWhitelist={['https://*']}
          onMessage={handleMessage}
          onError={() => updateStatus('failed')}
          onHttpError={() => updateStatus('failed')}
          onShouldStartLoadWithRequest={shouldAllowNavigation}
          // The map is the whole page; letting the WebView scroll as well only
          // competes with the map's own panning.
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          javaScriptEnabled
          domStorageEnabled
          setSupportMultipleWindows={false}
          // Without this, panning an Android WebView inside a ScrollView stalls.
          nestedScrollEnabled
          androidLayerType="hardware"
          style={styles.webView}
          // The WebView's own white flash before first paint, suppressed so the
          // loading state below is what the customer actually sees.
          containerStyle={styles.webViewContainer}
          testID="map-embed-webview"
        />
      )}

      {status === 'loading' && (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator size="small" color={colors.textMuted} />
        </View>
      )}

      {status === 'failed' && (
        <View style={styles.overlay}>
          <Ionicons name="map-outline" size={22} color={colors.textMuted} />
          <Text style={styles.failureText}>{failureMessage}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSunken,
  },
  webView: { flex: 1, backgroundColor: 'transparent' },
  webViewContainer: { backgroundColor: 'transparent' },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surfaceSunken,
  },
  failureText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
