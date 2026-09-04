import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { DailySalesPoint } from '../../lib/adminTypes';
import { maxOf } from '../../lib/analytics';
import { colors, formatPeso, radius, spacing } from '../../theme';

const BAR_AREA_HEIGHT = 120;
const MAX_LABELS = 7;

/** Plain-View bar chart of daily sales; no chart library needed. */
export const DailyBars = ({ points }: { points: readonly DailySalesPoint[] }) => {
  if (points.length === 0) return null;
  const max = maxOf(points.map((p) => p.sales));
  const labelEvery = Math.max(1, Math.ceil(points.length / MAX_LABELS));
  return (
    <View style={styles.wrap}>
      <View style={styles.bars}>
        {points.map((point, index) => {
          const height = max > 0 ? Math.max(2, (point.sales / max) * BAR_AREA_HEIGHT) : 2;
          return (
            <View key={point.day} style={styles.column}>
              <View style={[styles.bar, { height }]} accessibilityLabel={`${point.day}: ${formatPeso(point.sales)}`} />
              <Text style={styles.label} numberOfLines={1}>
                {index % labelEvery === 0 ? point.day.slice(5) : ''}
              </Text>
            </View>
          );
        })}
      </View>
      <Text style={styles.max}>Peak day {formatPeso(max)}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: BAR_AREA_HEIGHT + 20 },
  column: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  bar: { width: '100%', backgroundColor: colors.primary, borderRadius: 3 },
  label: { fontSize: 9, color: colors.textMuted, marginTop: 4 },
  max: { fontSize: 11, color: colors.textSecondary, marginTop: spacing.xs, textAlign: 'right' },
});
