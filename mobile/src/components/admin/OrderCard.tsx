import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Order } from '../../lib/adminTypes';
import { statusStyle } from '../../lib/statusColors';
import { serviceTypeLabel, shortOrderId, timeAgo } from '../../lib/formatters';
import { colors, formatPeso, radius, spacing } from '../../theme';
import { Badge } from '../ui/Badge';

interface Props {
  order: Order;
  merchantName?: string;
  onPress: (order: Order) => void;
}

export const OrderCard = React.memo(({ order, merchantName, onPress }: Props) => {
  const style = statusStyle(order.status);
  const itemCount = order.order_items.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <Pressable
      onPress={() => onPress(order)}
      accessibilityRole="button"
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.8 }]}
    >
      <View style={styles.header}>
        <Text style={styles.ref}>#{shortOrderId(order.id)}</Text>
        <Text style={styles.time}>{timeAgo(order.createdAt)}</Text>
      </View>
      <Text style={styles.customer} numberOfLines={1}>
        {order.customerName}
      </Text>
      {!!merchantName && (
        <Text style={styles.merchant} numberOfLines={1}>
          {merchantName}
        </Text>
      )}
      <Text style={styles.meta}>
        {serviceTypeLabel(order.serviceType)} · {itemCount} item{itemCount === 1 ? '' : 's'} ·{' '}
        {formatPeso(order.total)}
      </Text>
      <View style={styles.footer}>
        <Badge label={style.label} color={style.color} backgroundColor={style.background} />
        {order.serviceType === 'delivery' && (
          <Text style={styles.rider}>
            {order.assignedRiderId ? '🛵 Rider assigned' : 'No rider yet'}
          </Text>
        )}
      </View>
    </Pressable>
  );
});
OrderCard.displayName = 'OrderCard';

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: 3,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between' },
  ref: { fontSize: 13, fontWeight: '800', color: colors.primary },
  time: { fontSize: 12, color: colors.textMuted },
  customer: { fontSize: 16, fontWeight: '700', color: colors.text },
  merchant: { fontSize: 13, color: colors.textSecondary },
  meta: { fontSize: 13, color: colors.textSecondary },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  rider: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
});
