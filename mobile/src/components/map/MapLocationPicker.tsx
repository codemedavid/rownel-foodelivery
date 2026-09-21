// Pin-drop address picker, matching the web checkout's MapLocationPicker.
//
// The pin moves immediately on a tap or a drag, and the address catches up when
// the reverse geocode returns. Doing it the other way round — waiting for the
// address before moving the pin — makes the map feel broken on a slow
// connection, which is most of them.
//
// A failed lookup still selects the location. The coordinates are what the
// rider's navigation actually uses; the text is a label, and a coordinate label
// is a worse one but not a blocking one.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ExpoLocation from 'expo-location';
import { MapEmbedView, type MapStatus } from './MapEmbedView';
import { reverseGeocode } from '../../lib/geocoding';
import { logGeocodingError } from '../../lib/geocodingError';
import { STREET_ZOOM, type MapCircle, type MapPin, type MapPoint } from '../../lib/map/mapEmbedProtocol';
import { colors, radius, spacing } from '../../theme';

const PIN_ID = 'delivery-address';

const COORDINATE_LABEL_PRECISION = 5;

const MAP_HEIGHT = 240;

export interface MapLocationPickerProps {
  /** The location currently chosen, or null before the customer has one. */
  location: MapPoint | null;
  onLocationSelect: (point: MapPoint, address: string, placeId: string) => void;
  /** Draws the merchant's delivery radius around the pin. */
  radiusMetres?: number;
  /** Lets the screen stop its own ScrollView while the map is being panned. */
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
}

const formatCoordinates = ({ latitude, longitude }: MapPoint): string =>
  `${latitude.toFixed(COORDINATE_LABEL_PRECISION)}, ${longitude.toFixed(COORDINATE_LABEL_PRECISION)}`;

export function MapLocationPicker({
  location,
  onLocationSelect,
  radiusMetres,
  onInteractionStart,
  onInteractionEnd,
}: MapLocationPickerProps) {
  const [pinPoint, setPinPoint] = useState<MapPoint | null>(location);
  const [isResolving, setIsResolving] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [status, setStatus] = useState<MapStatus>('loading');

  // Kept in a ref so a parent passing an inline arrow does not restart the
  // callbacks bound into the map.
  const onLocationSelectRef = useRef(onLocationSelect);
  onLocationSelectRef.current = onLocationSelect;

  // Each move gets a generation id, so a slow lookup for a pin the customer has
  // already dragged away from cannot overwrite the newer one.
  const moveGenerationRef = useRef(0);

  /** Moves the pin now; names it when the lookup returns. */
  const movePin = useCallback(async (point: MapPoint) => {
    const moveId = ++moveGenerationRef.current;
    setPinPoint(point);
    setIsResolving(true);

    try {
      const result = await reverseGeocode(point.latitude, point.longitude);
      if (moveId !== moveGenerationRef.current) return;
      onLocationSelectRef.current(point, result.displayName, result.placeId);
    } catch (error: unknown) {
      if (moveId !== moveGenerationRef.current) return;
      // The coordinates are the part the rider needs; the label is not worth
      // failing the whole selection over.
      logGeocodingError('reverse geocode', error);
      onLocationSelectRef.current(point, formatCoordinates(point), '');
    } finally {
      if (moveId === moveGenerationRef.current) setIsResolving(false);
    }
  }, []);

  const handlePinMoved = useCallback(
    (_id: string, point: MapPoint) => {
      void movePin(point);
    },
    [movePin]
  );

  const handlePress = useCallback(
    (point: MapPoint) => {
      void movePin(point);
    },
    [movePin]
  );

  const handleUseGps = useCallback(async () => {
    setIsLocating(true);
    try {
      const { status: permission } = await ExpoLocation.requestForegroundPermissionsAsync();
      if (permission !== 'granted') return;

      const position = await ExpoLocation.getCurrentPositionAsync({
        accuracy: ExpoLocation.Accuracy.Balanced,
      });
      await movePin({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
    } catch (error: unknown) {
      logGeocodingError('gps fix', error);
    } finally {
      setIsLocating(false);
    }
  }, [movePin]);

  // Follow the parent when it chooses a location elsewhere — from the search
  // field above, or from the GPS card.
  useEffect(() => {
    if (!location) return;
    setPinPoint(location);
  }, [location]);

  const pins: MapPin[] = pinPoint
    ? [{ id: PIN_ID, kind: 'location', isDraggable: true, ...pinPoint }]
    : [];

  const circle: MapCircle | null =
    pinPoint && radiusMetres && radiusMetres > 0 ? { ...pinPoint, radiusMetres } : null;

  const isMapUsable = status !== 'failed';

  return (
    <View style={styles.container}>
      <MapEmbedView
        center={pinPoint}
        zoom={STREET_ZOOM}
        pins={pins}
        circle={circle}
        isBoundedToPhilippines
        followCenter={pinPoint}
        onPress={handlePress}
        onPinMoved={handlePinMoved}
        onStatusChange={setStatus}
        onInteractionStart={onInteractionStart}
        onInteractionEnd={onInteractionEnd}
        height={MAP_HEIGHT}
        failureMessage="The map could not load. Type your address above — delivery still works."
      />

      <View style={styles.footer}>
        <Pressable
          onPress={handleUseGps}
          disabled={isLocating}
          style={({ pressed }) => [styles.gpsButton, pressed && styles.gpsButtonPressed]}
          accessibilityRole="button"
          accessibilityLabel="Use my current location"
        >
          {isLocating ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="navigate" size={15} color={colors.primary} />
          )}
          <Text style={styles.gpsLabel}>
            {isLocating ? 'Getting your location…' : 'Use my current location'}
          </Text>
        </Pressable>

        {isResolving && <Text style={styles.hint}>Looking up this spot…</Text>}
      </View>

      {isMapUsable && !pinPoint && (
        <Text style={styles.hint}>
          Tap the map to drop a pin, or drag it to the exact gate or door.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  gpsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    backgroundColor: colors.primarySoft,
  },
  gpsButtonPressed: { backgroundColor: colors.primaryLight },
  gpsLabel: { fontSize: 13, fontWeight: '600', color: colors.primary },
  hint: { flex: 1, fontSize: 12, color: colors.textSecondary },
});
