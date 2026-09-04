import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, formatPeso, radius, spacing } from '../../theme';
import { Badge } from '../ui';
import { statusStyle } from '../../lib/statusColors';
import { nextRiderAction } from '../../lib/riderActions';
import type { Order } from '../../lib/adminTypes';

interface Props {
  order: Order;
  onPress: (order: Order) => void;
}

const ACTION_HINT = {
  pickup: 'Tap to confirm pickup',
  deliver: 'Tap to complete delivery',
} as const;

/** One active delivery in the rider's queue. */
export const DeliveryCard = ({ order, onPress }: Props) => {
  const style = statusStyle(order.status);
  const action = nextRiderAction(order);

  return (
    <Pressable
      onPress={() => onPress(order)}
      accessibilityRole="button"
      accessibilityLabel={`Delivery for ${order.customerName}`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.header}>
        <View style={styles.copy}>
          <Text style={styles.name}>{order.customerName}</Text>
          <Text style={styles.meta} numberOfLines={2}>
            {order.address ?? 'No address given'}
          </Text>
        </View>
        <Badge label={style.label} color={style.color} backgroundColor={style.background} />
      </View>
      <View style={styles.footer}>
        <Text style={styles.total}>{formatPeso(order.total)}</Text>
        {!!action && <Text style={styles.action}>{ACTION_HINT[action]}</Text>}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  pressed: { opacity: 0.7 },
  header: { flexDirection: 'row', gap: spacing.md },
  copy: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  meta: { fontSize: 12, color: colors.textSecondary },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  total: { fontSize: 14, fontWeight: '700', color: colors.text },
  action: { fontSize: 12, fontWeight: '600', color: colors.primary },
});
