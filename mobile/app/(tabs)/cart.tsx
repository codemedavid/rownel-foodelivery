import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCart } from '../../src/context/CartContext';
import { useUserLocation } from '../../src/context/LocationContext';
import { QuantityStepper } from '../../src/components/QuantityStepper';
import { getMerchantSubtotal } from '../../src/lib/cart';
import {
  getDeliveryFeeTotal,
  quoteMerchants,
  selectPrimaryMerchantId,
} from '../../src/lib/deliveryQuotes';
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
  const {
    cartItems,
    merchantsById,
    merchantIds,
    itemsByMerchant,
    subtotal,
    updateQuantity,
    removeMerchant,
  } = useCart();
  const { userLocation } = useUserLocation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const quotes = useMemo(
    () => quoteMerchants(merchantIds, merchantsById, userLocation),
    [merchantIds, merchantsById, userLocation]
  );
  const primaryMerchantId = useMemo(() => selectPrimaryMerchantId(quotes), [quotes]);
  const deliveryFee = useMemo(() => getDeliveryFeeTotal(quotes), [quotes]);

  const merchantsBelowMinimum = useMemo(
    () =>
      merchantIds.filter((merchantId) => {
        const merchant = merchantsById[merchantId];
        if (!merchant) return false;
        return getMerchantSubtotal(cartItems, merchantId) < merchant.minimumOrder;
      }),
    [merchantIds, merchantsById, cartItems]
  );

  const undeliverableMerchantIds = merchantIds.filter((id) => !quotes[id]?.deliverable);
  const canCheckout = merchantsBelowMinimum.length === 0 && undeliverableMerchantIds.length === 0;

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

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 260 }}>
        {merchantIds.map((merchantId) => {
          const merchant = merchantsById[merchantId];
          const lines = itemsByMerchant[merchantId] ?? [];
          const merchantSubtotal = getMerchantSubtotal(cartItems, merchantId);
          const shortfall = merchant ? merchant.minimumOrder - merchantSubtotal : 0;
          const quote = quotes[merchantId];

          return (
            <View key={merchantId} style={styles.merchantCard}>
              <View style={styles.merchantHeader}>
                <Text style={styles.merchantName} numberOfLines={1}>
                  {merchant?.name ?? 'Restaurant'}
                </Text>
                <Pressable
                  onPress={() => removeMerchant(merchantId)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove all items from ${merchant?.name ?? 'this restaurant'}`}
                  hitSlop={8}
                >
                  <Text style={styles.removeText}>Remove</Text>
                </Pressable>
              </View>

              {shortfall > 0 && (
                <Text style={styles.warning}>
                  Minimum order is {formatPeso(merchant?.minimumOrder ?? 0)} — add{' '}
                  {formatPeso(shortfall)} more.
                </Text>
              )}
              {quote && !quote.deliverable && (
                <Text style={styles.warning}>{quote.reason}</Text>
              )}

              {lines.map((line) => {
                const selections = describeSelections(line);
                return (
                  <View key={line.lineId} style={styles.line}>
                    <View style={styles.lineInfo}>
                      <Text style={styles.lineName}>{line.name}</Text>
                      {selections ? (
                        <Text style={styles.lineSelections}>{selections}</Text>
                      ) : null}
                      <Text style={styles.linePrice}>
                        {formatPeso(line.totalPrice * line.quantity)}
                      </Text>
                    </View>
                    <QuantityStepper
                      size="small"
                      quantity={line.quantity}
                      onDecrease={() => updateQuantity(line.lineId, line.quantity - 1)}
                      onIncrease={() => updateQuantity(line.lineId, line.quantity + 1)}
                    />
                  </View>
                );
              })}

              <View style={styles.merchantFooter}>
                <Text style={styles.merchantSubtotalLabel}>
                  Subtotal · {merchant?.name ?? 'this restaurant'}
                </Text>
                <Text style={styles.merchantSubtotalValue}>{formatPeso(merchantSubtotal)}</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Subtotal</Text>
          <Text style={styles.totalValue}>{formatPeso(subtotal)}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>
            Delivery fee{merchantIds.length > 1 ? ' (one fee for all restaurants)' : ''}
          </Text>
          <Text style={styles.totalValue}>{formatPeso(deliveryFee)}</Text>
        </View>
        {primaryMerchantId && quotes[primaryMerchantId]?.isEstimate && (
          <Text style={styles.estimateNote}>
            Estimated fee — share your location for an exact quote.
          </Text>
        )}
        {!canCheckout && (
          <Text style={styles.warning}>
            {merchantsBelowMinimum.length > 0
              ? 'Some restaurants have not met their minimum order.'
              : 'Some restaurants cannot deliver to your location.'}
          </Text>
        )}
        <Pressable
          style={[styles.cta, !canCheckout && styles.ctaDisabled]}
          onPress={() => router.push('/checkout')}
          disabled={!canCheckout}
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
  merchantCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  merchantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  merchantName: { flex: 1, fontSize: 17, fontWeight: '800', color: colors.text },
  removeText: { color: colors.danger, fontSize: 13, fontWeight: '700' },
  warning: { color: colors.danger, fontSize: 13, marginBottom: spacing.sm },
  estimateNote: { color: colors.textSecondary, fontSize: 12, marginBottom: spacing.sm },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  lineInfo: { flex: 1 },
  lineName: { fontSize: 15, fontWeight: '700', color: colors.text },
  lineSelections: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  linePrice: { fontSize: 14, fontWeight: '700', color: colors.primary, marginTop: spacing.xs },
  merchantFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  merchantSubtotalLabel: { flex: 1, color: colors.textSecondary, fontSize: 13 },
  merchantSubtotalValue: { fontWeight: '700', color: colors.text, fontSize: 14 },
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
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  totalLabel: { flex: 1, color: colors.textSecondary, fontSize: 14 },
  totalValue: { fontWeight: '700', color: colors.text, fontSize: 14 },
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
