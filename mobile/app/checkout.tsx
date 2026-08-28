import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../src/lib/supabase';
import { buildMerchantOrderInputs, validateCheckoutForm } from '../src/lib/checkout';
import { getMerchantSubtotal } from '../src/lib/cart';
import {
  getDeliveryFeeTotal,
  quoteMerchants,
  selectPrimaryMerchantId,
} from '../src/lib/deliveryQuotes';
import { appendOrderRecord } from '../src/lib/orderHistory';
import { requestOrderNotificationPermission } from '../src/hooks/useOrderStatusNotifications';
import { useCart } from '../src/context/CartContext';
import { useUserLocation } from '../src/context/LocationContext';
import { colors, formatPeso, radius, spacing } from '../src/theme';
import { PaymentMethod, ServiceType } from '../src/types';

const SERVICE_TYPES: Array<{ value: ServiceType; label: string; emoji: string }> = [
  { value: 'delivery', label: 'Delivery', emoji: '🛵' },
  { value: 'pickup', label: 'Pickup', emoji: '🛍️' },
  { value: 'dine-in', label: 'Dine-in', emoji: '🍽️' },
];

const PAYMENT_METHODS: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'gcash', label: 'GCash' },
  { value: 'maya', label: 'Maya' },
  { value: 'bank-transfer', label: 'Bank transfer' },
];

export default function CheckoutScreen() {
  const {
    cartItems,
    merchantsById,
    merchantIds,
    subtotal,
    clearCart,
    removeMerchant,
  } = useCart();
  const { userLocation } = useUserLocation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [customerName, setCustomerName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [serviceType, setServiceType] = useState<ServiceType>('delivery');
  const [address, setAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('gcash');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const quotes = useMemo(
    () => quoteMerchants(merchantIds, merchantsById, userLocation),
    [merchantIds, merchantsById, userLocation]
  );
  const primaryMerchantId = useMemo(() => selectPrimaryMerchantId(quotes), [quotes]);

  // One fee for the whole basket — the furthest restaurant's (web parity).
  const deliveryFee = serviceType === 'delivery' ? getDeliveryFeeTotal(quotes) : 0;
  const total = subtotal + deliveryFee;

  const handlePlaceOrder = async () => {
    if (cartItems.length === 0) return;

    const validation = validateCheckoutForm({
      customerName,
      contactNumber,
      serviceType,
      address,
    });
    setErrors(validation.errors);
    if (!validation.valid) return;

    const orderInputs = buildMerchantOrderInputs({
      cartItems,
      quotes,
      primaryMerchantId,
      form: {
        customerName,
        contactNumber,
        serviceType,
        address: serviceType === 'delivery' ? address : undefined,
        deliveryLatitude: userLocation?.latitude,
        deliveryLongitude: userLocation?.longitude,
        paymentMethod,
        deliveryMode: 'priority',
        referenceNumber: referenceNumber || undefined,
        notes: notes || undefined,
      },
    });

    setIsSubmitting(true);
    setSubmitError(null);

    // One order per restaurant. If a later one fails we keep only the failed
    // restaurants in the basket so the customer never re-orders what already
    // went through.
    const placedOrderIds: string[] = [];
    const placedMerchantIds: string[] = [];

    try {
      for (const input of orderInputs) {
        // Same server path as the web app: validates pricing, decrements
        // inventory, dispatches riders, and stamps signed-in customers.
        const { data: orderId, error: orderError } = await supabase.rpc('create_order', {
          p: input,
        });
        if (orderError) throw orderError;

        placedOrderIds.push(String(orderId));
        placedMerchantIds.push(input.merchantId);

        await appendOrderRecord({
          orderId: String(orderId),
          merchantName: merchantsById[input.merchantId]?.name ?? 'Restaurant',
          total: input.total,
          placedAt: Date.now(),
        });
      }

      await requestOrderNotificationPermission();

      clearCart();
      router.replace({ pathname: '/order/[id]', params: { id: placedOrderIds[0] } });
    } catch (err) {
      placedMerchantIds.forEach(removeMerchant);

      const message =
        err instanceof Error ? err.message : 'Something went wrong placing your order.';
      setSubmitError(
        placedOrderIds.length > 0
          ? `${placedOrderIds.length} order(s) were placed, but the rest failed: ${message} The restaurants left in your basket were not ordered.`
          : message
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 160 }}>
        <Text style={styles.sectionTitle}>Your details</Text>
        <TextInput
          style={[styles.input, errors.customerName && styles.inputError]}
          placeholder="Full name"
          placeholderTextColor={colors.textMuted}
          value={customerName}
          onChangeText={setCustomerName}
          autoComplete="name"
        />
        {errors.customerName && <Text style={styles.errorText}>{errors.customerName}</Text>}

        <TextInput
          style={[styles.input, errors.contactNumber && styles.inputError]}
          placeholder="Mobile number (09XXXXXXXXX)"
          placeholderTextColor={colors.textMuted}
          value={contactNumber}
          onChangeText={setContactNumber}
          keyboardType="phone-pad"
          autoComplete="tel"
        />
        {errors.contactNumber && <Text style={styles.errorText}>{errors.contactNumber}</Text>}

        <Text style={styles.sectionTitle}>How do you want it?</Text>
        <View style={styles.segmentRow}>
          {SERVICE_TYPES.map((option) => {
            const isActive = serviceType === option.value;
            return (
              <Pressable
                key={option.value}
                style={[styles.segment, isActive && styles.segmentActive]}
                onPress={() => setServiceType(option.value)}
              >
                <Text style={styles.segmentEmoji}>{option.emoji}</Text>
                <Text style={[styles.segmentLabel, isActive && styles.segmentLabelActive]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {serviceType === 'delivery' && (
          <>
            <TextInput
              style={[styles.input, styles.multiline, errors.address && styles.inputError]}
              placeholder="Delivery address (street, barangay, landmark)"
              placeholderTextColor={colors.textMuted}
              value={address}
              onChangeText={setAddress}
              multiline
            />
            {errors.address && <Text style={styles.errorText}>{errors.address}</Text>}
          </>
        )}

        <Text style={styles.sectionTitle}>Payment</Text>
        {PAYMENT_METHODS.map((option) => {
          const isActive = paymentMethod === option.value;
          return (
            <Pressable
              key={option.value}
              style={[styles.paymentRow, isActive && styles.paymentRowActive]}
              onPress={() => setPaymentMethod(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: isActive }}
            >
              <View style={[styles.radio, isActive && styles.radioSelected]}>
                {isActive && <View style={styles.radioDot} />}
              </View>
              <Text style={styles.paymentLabel}>{option.label}</Text>
            </Pressable>
          );
        })}
        <TextInput
          style={styles.input}
          placeholder="Payment reference number (optional)"
          placeholderTextColor={colors.textMuted}
          value={referenceNumber}
          onChangeText={setReferenceNumber}
        />

        <Text style={styles.sectionTitle}>Notes</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="Anything we should know? (optional)"
          placeholderTextColor={colors.textMuted}
          value={notes}
          onChangeText={setNotes}
          multiline
        />

        <View style={styles.summary}>
          {merchantIds.map((merchantId) => (
            <View key={merchantId} style={styles.summaryRow}>
              <Text style={styles.summaryLabel} numberOfLines={1}>
                {merchantsById[merchantId]?.name ?? 'Restaurant'}
              </Text>
              <Text style={styles.summaryValue}>
                {formatPeso(getMerchantSubtotal(cartItems, merchantId))}
              </Text>
            </View>
          ))}
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal</Text>
            <Text style={styles.summaryValue}>{formatPeso(subtotal)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>
              Delivery fee{merchantIds.length > 1 ? ' (one fee for all)' : ''}
            </Text>
            <Text style={styles.summaryValue}>{formatPeso(deliveryFee)}</Text>
          </View>
          {merchantIds.length > 1 && (
            <Text style={styles.multiMerchantNote}>
              You are ordering from {merchantIds.length} restaurants — one order is placed per
              restaurant and you pay a single delivery fee.
            </Text>
          )}
          <View style={[styles.summaryRow, styles.summaryTotalRow]}>
            <Text style={styles.summaryTotalLabel}>Total</Text>
            <Text style={styles.summaryTotalValue}>{formatPeso(total)}</Text>
          </View>
        </View>

        {submitError && <Text style={styles.submitError}>{submitError}</Text>}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <Pressable
          style={[styles.cta, (isSubmitting || cartItems.length === 0) && styles.ctaDisabled]}
          onPress={handlePlaceOrder}
          disabled={isSubmitting || cartItems.length === 0}
          accessibilityRole="button"
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.ctaText}>Place order · {formatPeso(total)}</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  inputError: { borderColor: colors.danger },
  errorText: { color: colors.danger, fontSize: 13, marginBottom: spacing.sm },
  segmentRow: { flexDirection: 'row', gap: spacing.sm },
  segment: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingVertical: spacing.md,
  },
  segmentActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  segmentEmoji: { fontSize: 20 },
  segmentLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginTop: 2 },
  segmentLabelActive: { color: colors.primaryDark },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  paymentRowActive: { borderColor: colors.primary },
  paymentLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  summary: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginTop: spacing.xl,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  summaryLabel: { flex: 1, color: colors.textSecondary, fontSize: 14 },
  multiMerchantNote: {
    color: colors.textSecondary,
    fontSize: 12,
    marginBottom: spacing.sm,
  },
  summaryValue: { fontWeight: '600', color: colors.text, fontSize: 14 },
  summaryTotalRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    marginBottom: 0,
  },
  summaryTotalLabel: { fontWeight: '800', fontSize: 16, color: colors.text },
  summaryTotalValue: { fontWeight: '800', fontSize: 16, color: colors.primary },
  submitError: { color: colors.danger, marginTop: spacing.md, textAlign: 'center' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 15,
    alignItems: 'center',
  },
  ctaDisabled: { backgroundColor: colors.textMuted },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
