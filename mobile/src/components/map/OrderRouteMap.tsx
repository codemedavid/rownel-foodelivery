// The map an order is watched on — by the customer, the rider, or an admin.
//
// One component for all three because they show the same thing from different
// seats: a rider, a merchant, a destination, and sometimes the other riders in
// the area while one is still being found. Which of those exist is the only
// difference, and buildOrderPins already decides that.
//
// The map is display-only. Its job is to answer "where is my food", and a
// customer who pans away from their rider has lost the one thing they opened it
// for. Navigation is a separate, explicit hand-off to the maps app.

import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MapEmbedView } from './MapEmbedView';
import {
  buildOrderPins,
  pickMapCenter,
  type AmbientRider,
  type OrderMapPoints,
} from '../../lib/map/orderPins';
import { NEIGHBOURHOOD_ZOOM } from '../../lib/map/mapEmbedProtocol';
import { colors, spacing } from '../../theme';

const DEFAULT_HEIGHT = 200;

interface LegendEntry {
  color: string;
  label: string;
}

export interface OrderRouteMapProps extends OrderMapPoints {
  height?: number;
  /** Draws a colour key under the map. Off where the pins are self-evident. */
  showsLegend?: boolean;
}

// The pin colours, mirrored from the web app's src/components/map/mapPins.ts.
const LEGEND_COLORS = {
  rider: '#dc2626',
  ambientRider: '#f97316',
  merchant: '#f59e0b',
  destination: '#16a34a',
} as const;

const buildLegend = (
  points: OrderMapPoints,
  ambientRiders: AmbientRider[]
): LegendEntry[] => {
  const entries: LegendEntry[] = [];
  if (points.rider) entries.push({ color: LEGEND_COLORS.rider, label: 'Your rider' });
  if (ambientRiders.length > 0) {
    entries.push({ color: LEGEND_COLORS.ambientRider, label: 'Riders nearby' });
  }
  if (points.merchant) entries.push({ color: LEGEND_COLORS.merchant, label: 'Pickup' });
  if (points.destination) {
    entries.push({ color: LEGEND_COLORS.destination, label: 'Drop-off' });
  }
  return entries;
};

export function OrderRouteMap({
  rider,
  merchant,
  destination,
  ambientRiders,
  height = DEFAULT_HEIGHT,
  showsLegend = true,
}: OrderRouteMapProps) {
  const points = useMemo<OrderMapPoints>(
    () => ({ rider, merchant, destination, ambientRiders }),
    [rider, merchant, destination, ambientRiders]
  );

  const pins = useMemo(() => buildOrderPins(points), [points]);
  const center = useMemo(() => pickMapCenter(points), [points]);

  // Nothing to draw: an empty grey rectangle tells the customer less than the
  // rest of the screen already does.
  if (pins.length === 0) return null;

  const legend = showsLegend ? buildLegend(points, ambientRiders ?? []) : [];

  return (
    <View style={styles.container}>
      <MapEmbedView
        center={center}
        zoom={NEIGHBOURHOOD_ZOOM}
        pins={pins}
        isInteractive={false}
        // Keeps every pin framed as the rider moves, rather than letting them
        // drift off the edge of a fixed view.
        shouldFitPins
        height={height}
        failureMessage="Live map unavailable"
      />

      {legend.length > 0 && (
        <View style={styles.legend}>
          {legend.map((entry) => (
            <View key={entry.label} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: entry.color }]} />
              <Text style={styles.legendLabel}>{entry.label}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 11, color: colors.textSecondary },
});
