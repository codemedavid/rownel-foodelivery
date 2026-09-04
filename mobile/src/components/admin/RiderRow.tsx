import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { RiderPresenceStatus, RiderSummary } from '../../lib/adminTypes';
import { isRiderAtCapacity } from '../../lib/riderSorting';
import { timeAgo } from '../../lib/formatters';
import { colors, radius, spacing } from '../../theme';
import { Badge } from '../ui/Badge';

const PRESENCE_STYLES: Record<RiderPresenceStatus, { label: string; color: string; bg: string }> = {
  available: { label: 'Available', color: colors.success, bg: '#dcfce7' },
  busy: { label: 'Busy', color: '#b45309', bg: '#fef3c7' },
  offline: { label: 'Offline', color: colors.textSecondary, bg: '#f3f4f6' },
};

interface Props {
  rider: RiderSummary;
  isSelected?: boolean;
  onPress?: (rider: RiderSummary) => void;
}

export const RiderRow = ({ rider, isSelected, onPress }: Props) => {
  const presence = PRESENCE_STYLES[rider.presenceStatus] ?? PRESENCE_STYLES.offline;
  const atCapacity = isRiderAtCapacity(rider);
  return (
    <Pressable
      onPress={onPress ? () => onPress(rider) : undefined}
      disabled={!onPress || atCapacity}
      accessibilityRole="button"
      accessibilityState={{ disabled: atCapacity, selected: !!isSelected }}
      style={({ pressed }) => [
        styles.row,
        isSelected && styles.selected,
        (pressed || atCapacity) && { opacity: 0.6 },
      ]}
    >
      <View style={styles.text}>
        <Text style={styles.name}>{rider.name}</Text>
        <Text style={styles.meta}>
          {rider.vehicleType} · {rider.plateNumber}
          {rider.lastLocationUpdate ? ` · seen ${timeAgo(rider.lastLocationUpdate)}` : ''}
        </Text>
      </View>
      <View style={styles.right}>
        <Badge label={presence.label} color={presence.color} backgroundColor={presence.bg} />
        <Text style={[styles.load, atCapacity && { color: colors.danger }]}>
          {rider.activeOrderCount}/{rider.maxOrders} orders
        </Text>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selected: { borderColor: colors.primary },
  text: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  meta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  right: { alignItems: 'flex-end', gap: 4 },
  load: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
});
