import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCart } from '../../src/context/CartContext';
import { QuantityStepper } from '../../src/components/QuantityStepper';
import { colors, formatPeso, radius, spacing } from '../../src/theme';
import { CartItem } from '../../src/types';

const describeSelections = (line: CartItem): string => {
  const parts: string[] = [];
  if (line.selectedVariations) {
    parts.push(...Object.values(line.selectedVariations).map((v) => v.name));
  }
  if (line.selectedAddOns) {
    parts.push(
      ...line.selectedAddOns.map((a) =>
        (a.quantity ?? 1) > 1 ? `${a.name} ×${a.quantity}` : a.name
      )
    );
  }
  return parts.join(' · ');
};

export default function CartScreen() {
  const { cartItems, merchant, subtotal, updateQuantity } = useCart();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  if (cartItems.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyEmoji}>🧺</Text>
        <Text style={styles.emptyTitle}>Your basket is empty</Text>
        <Text style={styles.emptyText}>Add something delicious from a restaurant.</Text>
        <Pressable style={styles.browseButton} onPress={() => router.dismissTo('/')}>
          <Text style={styles.browseText}>Browse restaurants</Text>
        </Pressable>
      </View>
    );
  }

  const deliveryFee = merchant?.deliveryFee ?? 0;
  const belowMinimum = merchant ? subtotal < merchant.minimumOrder : false;

  return (
    <View style={styles.container}>
      <FlatList
        data={cartItems}
        keyExtractor={(line) => line.lineId}
        ListHeaderComponent={
          merchant ? <Text style={styles.merchantName}>{merchant.name}</Text> : null
        }
        renderItem={({ item: line }) => {
          const selections = describeSelections(line);
          return (
            <View style={styles.line}>
              <View style={styles.lineInfo}>
                <Text style={styles.lineName}>{line.name}</Text>
                {selections ? <Text style={styles.lineSelections}>{selections}</Text> : null}
                <Text style={styles.linePrice}>{formatPeso(line.totalPrice * line.quantity)}</Text>
              </View>
              <QuantityStepper
                size="small"
                quantity={line.quantity}
                onDecrease={() => updateQuantity(line.lineId, line.quantity - 1)}
                onIncrease={() => updateQuantity(line.lineId, line.quantity + 1)}
              />
            </View>
          );
        }}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 220 }}
      />

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Subtotal</Text>
          <Text style={styles.totalValue}>{formatPeso(subtotal)}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Delivery fee (if delivery)</Text>
          <Text style={styles.totalValue}>{formatPeso(deliveryFee)}</Text>
        </View>
        {belowMinimum && merchant && (
          <Text style={styles.minimumWarning}>
            Minimum order is {formatPeso(merchant.minimumOrder)} — add{' '}
            {formatPeso(merchant.minimumOrder - subtotal)} more.
          </Text>
        )}
        <Pressable
          style={[styles.cta, belowMinimum && styles.ctaDisabled]}
          onPress={() => router.push('/checkout')}
          disabled={belowMinimum}
          accessibilityRole="button"
        >
          <Text style={styles.ctaText}>Go to checkout</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { fontSize: 19, fontWeight: '800', color: colors.text, marginTop: spacing.md },
  emptyText: { color: colors.textSecondary, marginTop: spacing.xs },
  browseButton: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  browseText: { color: '#fff', fontWeight: '700' },
  merchantName: { fontSize: 17, fontWeight: '800', color: colors.text, marginBottom: spacing.md },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  lineInfo: { flex: 1 },
  lineName: { fontSize: 15, fontWeight: '700', color: colors.text },
  lineSelections: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  linePrice: { fontSize: 14, fontWeight: '700', color: colors.primary, marginTop: spacing.xs },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  totalLabel: { color: colors.textSecondary, fontSize: 14 },
  totalValue: { fontWeight: '700', color: colors.text, fontSize: 14 },
  minimumWarning: { color: colors.danger, fontSize: 13, marginBottom: spacing.sm },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  ctaDisabled: { backgroundColor: colors.textMuted },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
