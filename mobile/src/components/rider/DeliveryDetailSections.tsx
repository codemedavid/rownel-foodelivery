import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, formatPeso, radius, spacing } from '../../theme';
import { Button } from '../ui';
import { describeItemOptions } from '../../lib/orderItemOptions';
import type { Order } from '../../lib/adminTypes';

const CASH_METHODS = new Set(['cash', 'cod']);

interface PickupSectionProps {
  storeName?: string;
  storeAddress?: string;
  storePhone?: string;
  onNavigate: () => void;
  onCall: () => void;
}

/** Where the rider collects the order. */
export const PickupSection = ({ storeName, storeAddress, storePhone, onNavigate, onCall }: PickupSectionProps) => (
  <View style={styles.card}>
    <Text style={styles.sectionTitle}>Pick up from</Text>
    <Text style={styles.name}>{storeName ?? 'Store'}</Text>
    <Text style={styles.body}>{storeAddress ?? 'No store address on file'}</Text>
    {!!storePhone && <Text style={styles.meta}>{storePhone}</Text>}
    <View style={styles.actions}>
      <Button label="Navigate" icon="navigate-outline" variant="secondary" size="sm" onPress={onNavigate} style={styles.action} />
      {!!storePhone && (
        <Button label="Call store" icon="call-outline" variant="secondary" size="sm" onPress={onCall} style={styles.action} />
      )}
    </View>
  </View>
);

interface DropOffSectionProps {
  order: Order;
  onNavigate: () => void;
  onCall: () => void;
}

/** Who receives the order and any instructions they left. */
export const DropOffSection = ({ order, onNavigate, onCall }: DropOffSectionProps) => (
  <View style={styles.card}>
    <Text style={styles.sectionTitle}>Deliver to</Text>
    <Text style={styles.name}>{order.customerName}</Text>
    <Text style={styles.meta}>{order.contactNumber}</Text>
    <Text style={styles.body}>{order.address ?? 'No address given'}</Text>
    {order.distanceKm != null && (
      <Text style={styles.meta}>{order.distanceKm.toFixed(1)} km from the store</Text>
    )}
    {!!order.notes && (
      <View style={styles.notesBox}>
        <Text style={styles.notesLabel}>Customer notes</Text>
        <Text style={styles.notes}>{order.notes}</Text>
      </View>
    )}
    <View style={styles.actions}>
      <Button label="Navigate" icon="navigate-outline" variant="secondary" size="sm" onPress={onNavigate} style={styles.action} />
      <Button label="Call customer" icon="call-outline" variant="secondary" size="sm" onPress={onCall} style={styles.action} />
    </View>
  </View>
);

/** Every item with its options, the money breakdown, and how it was paid. */
export const OrderSummarySection = ({ order }: { order: Order }) => {
  const deliveryFee = order.deliveryFee ?? 0;
  const itemsTotal = order.order_items.reduce((sum, item) => sum + item.subtotal, 0);
  const isCash = CASH_METHODS.has(order.paymentMethod.toLowerCase());
  const itemCount = order.order_items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>
        Order · {itemCount} item{itemCount === 1 ? '' : 's'}
      </Text>
      {order.order_items.length === 0 && <Text style={styles.meta}>No items on this order.</Text>}
      {order.order_items.map((item) => (
        <View key={item.id} style={styles.itemRow}>
          <View style={styles.itemCopy}>
            <Text style={styles.itemName}>
              {item.quantity}× {item.name}
            </Text>
            {describeItemOptions(item.variation, item.addOns).map((line) => (
              <Text key={line} style={styles.itemOption}>
                {line}
              </Text>
            ))}
          </View>
          <Text style={styles.itemPrice}>{formatPeso(item.subtotal)}</Text>
        </View>
      ))}

      <View style={styles.divider} />
      <View style={styles.itemRow}>
        <Text style={styles.meta}>Items</Text>
        <Text style={styles.meta}>{formatPeso(itemsTotal)}</Text>
      </View>
      <View style={styles.itemRow}>
        <Text style={styles.meta}>Delivery fee</Text>
        <Text style={styles.meta}>{formatPeso(deliveryFee)}</Text>
      </View>
      <View style={styles.itemRow}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalValue}>{formatPeso(order.total)}</Text>
      </View>

      <View style={[styles.paymentBox, isCash && styles.paymentBoxCash]}>
        <Text style={[styles.paymentText, isCash && styles.paymentTextCash]}>
          {isCash
            ? `Collect ${formatPeso(order.total)} cash from the customer`
            : `Paid via ${order.paymentMethod.toUpperCase()} — nothing to collect`}
        </Text>
        {!!order.referenceNumber && <Text style={styles.meta}>Ref: {order.referenceNumber}</Text>}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, gap: spacing.sm },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  name: { fontSize: 17, fontWeight: '800', color: colors.text },
  body: { fontSize: 14, color: colors.text, lineHeight: 20 },
  meta: { fontSize: 12.5, color: colors.textSecondary },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  action: { flex: 1 },
  notesBox: { backgroundColor: colors.accentLight, borderRadius: radius.sm, padding: spacing.md, gap: 2 },
  notesLabel: { fontSize: 11.5, fontWeight: '800', color: '#b45309', textTransform: 'uppercase' },
  notes: { fontSize: 14, color: colors.text },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  itemCopy: { flex: 1, gap: 1 },
  itemName: { fontSize: 14.5, fontWeight: '600', color: colors.text },
  itemOption: { fontSize: 12.5, color: colors.textSecondary },
  itemPrice: { fontSize: 14, color: colors.textSecondary },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  totalLabel: { fontSize: 15, fontWeight: '800', color: colors.text },
  totalValue: { fontSize: 15, fontWeight: '800', color: colors.primary },
  paymentBox: { backgroundColor: colors.primaryLight, borderRadius: radius.sm, padding: spacing.md, gap: 2 },
  paymentBoxCash: { backgroundColor: colors.accentLight },
  paymentText: { fontSize: 13.5, fontWeight: '700', color: colors.primaryDark },
  paymentTextCash: { color: '#b45309' },
});
