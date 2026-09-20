import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCart } from '../../src/context/CartContext';
import { useUserLocation } from '../../src/context/LocationContext';
import { QuantityStepper } from '../../src/components/QuantityStepper';
import { EmptyState } from '../../src/components/ui';
import { getMerchantSubtotal } from '../../src/lib/cart';
import {
  getDeliveryFeeTotal,
  quoteMerchants,
  selectPrimaryMerchantId,
} from '../../src/lib/deliveryQuotes';
import { colors, formatPeso, radius, shadows, spacing } from '../../src/theme';
import { CartItem } from '../../src/types';

const FOOTER_CLEARANCE = 280;

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
        <EmptyState
          icon="basket-outline"
          title="Your basket is empty"
          body="Add something delicious from a restaurant near you."
          actionLabel="Browse restaurants"
          onActionPress={() => router.dismissTo('/')}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {merchantIds.map((merchantId) => {
          const merchant = merchantsById[merchantId];
          const lines = itemsByMerchant[merchantId] ?? [];
          const merchantSubtotal = getMerchantSubtotal(cartItems, merchantId);
          const shortfall = merchant ? merchant.minimumOrder - merchantSubtotal : 0;
          const quote = quotes[merchantId];

          return (
            <View key={merchantId} style={styles.merchantCard}>
              <View style={styles.merchantHeader}>
                <View style={styles.merchantIcon}>
                  <Ionicons name="storefront" size={16} color={colors.primary} />
                </View>
                <Text style={styles.merchantName} numberOfLines={1}>
                  {merchant?.name ?? 'Restaurant'}
                </Text>
                <Pressable
                  onPress={() => removeMerchant(merchantId)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove all items from ${merchant?.name ?? 'this restaurant'}`}
                  hitSlop={8}
                  style={styles.removeButton}
                >
                  <Ionicons name="trash-outline" size={16} color={colors.danger} />
                </Pressable>
              </View>

              {shortfall > 0 && (
                <Notice
                  tone="warning"
                  text={`Minimum order is ${formatPeso(merchant?.minimumOrder ?? 0)} — add ${formatPeso(shortfall)} more.`}
                />
              )}
              {quote && !quote.deliverable && !!quote.reason && (
                <Notice tone="danger" text={quote.reason} />
              )}

              {lines.map((line) => {
                const selections = describeSelections(line);
                return (
                  <View key={line.lineId} style={styles.line}>
                    {line.image ? (
                      <Image source={{ uri: line.image }} style={styles.thumb} contentFit="cover" />
                    ) : (
                      <View style={[styles.thumb, styles.thumbFallback]}>
                        <Ionicons name="fast-food-outline" size={18} color={colors.textMuted} />
                      </View>
                    )}
                    <View style={styles.lineInfo}>
                      <Text style={styles.lineName} numberOfLines={2}>
                        {line.name}
                      </Text>
                      {selections ? (
                        <Text style={styles.lineSelections} numberOfLines={2}>
                          {selections}
                        </Text>
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
                <Text style={styles.merchantSubtotalLabel}>Subtotal</Text>
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
        <View style={styles.grandTotalRow}>
          <Text style={styles.grandTotalLabel}>Total</Text>
          <Text style={styles.grandTotalValue}>{formatPeso(subtotal + deliveryFee)}</Text>
        </View>

        {primaryMerchantId && quotes[primaryMerchantId]?.isEstimate && (
          <Text style={styles.estimateNote}>
            Estimated fee — share your location for an exact quote.
          </Text>
        )}
        {!canCheckout && (
          <Notice
            tone="danger"
            text={
              merchantsBelowMinimum.length > 0
                ? 'Some restaurants have not met their minimum order.'
                : 'Some restaurants cannot deliver to your location.'
            }
          />
        )}

        <Pressable
          style={({ pressed }) => [
            styles.cta,
            !canCheckout && styles.ctaDisabled,
            pressed && canCheckout && styles.ctaPressed,
          ]}
          onPress={() => router.push('/checkout')}
          disabled={!canCheckout}
          accessibilityRole="button"
        >
          <Text style={styles.ctaText}>Go to checkout</Text>
          <Ionicons name="arrow-forward" size={18} color={colors.onPrimary} />
        </Pressable>
      </View>
    </View>
  );
}

function Notice({ tone, text }: { tone: 'warning' | 'danger'; text: string }) {
  const isWarning = tone === 'warning';
  return (
    <View style={[styles.notice, { backgroundColor: isWarning ? colors.warningLight : colors.dangerLight }]}>
      <Ionicons
        name={isWarning ? 'alert-circle-outline' : 'close-circle-outline'}
        size={15}
        color={isWarning ? colors.warning : colors.danger}
      />
      <Text style={[styles.noticeText, { color: isWarning ? colors.warning : colors.danger }]}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: FOOTER_CLEARANCE },

  merchantCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  merchantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  merchantIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  merchantName: { flex: 1, fontSize: 16, fontWeight: '800', color: colors.text },
  removeButton: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
    backgroundColor: colors.dangerLight,
    alignItems: 'center',
    justifyContent: 'center',
  },

  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  noticeText: { flex: 1, fontSize: 12.5, fontWeight: '600' },

  line: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  thumb: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.surfaceSunken },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  lineInfo: { flex: 1 },
  lineName: { fontSize: 14.5, fontWeight: '700', color: colors.text },
  lineSelections: { fontSize: 12.5, color: colors.textSecondary, marginTop: 2 },
  linePrice: { fontSize: 14, fontWeight: '800', color: colors.text, marginTop: spacing.xs },

  merchantFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  merchantSubtotalLabel: { flex: 1, color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  merchantSubtotalValue: { fontWeight: '800', color: colors.text, fontSize: 14 },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    ...shadows.lg,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  totalLabel: { flex: 1, color: colors.textSecondary, fontSize: 13.5 },
  totalValue: { fontWeight: '700', color: colors.text, fontSize: 13.5 },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    marginBottom: spacing.md,
  },
  grandTotalLabel: { fontSize: 15, fontWeight: '800', color: colors.text },
  grandTotalValue: { fontSize: 18, fontWeight: '800', color: colors.primary },
  estimateNote: { color: colors.textSecondary, fontSize: 12, marginBottom: spacing.sm },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 16,
  },
  ctaPressed: { backgroundColor: colors.primaryDark },
  ctaDisabled: { backgroundColor: colors.textMuted },
  ctaText: { color: colors.onPrimary, fontWeight: '800', fontSize: 16 },
});
