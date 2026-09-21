import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../src/lib/supabase';
import {
  buildMerchantOrderInputs,
  resolveDeliveryMode,
  validateCheckoutForm,
} from '../src/lib/checkout';
import { getMerchantSubtotal } from '../src/lib/cart';
import {
  getDeliveryFeeTotal,
  hasEconomyOption,
  quoteMerchants,
  selectPrimaryMerchantId,
} from '../src/lib/deliveryQuotes';
import { appendOrderRecord } from '../src/lib/orderHistory';
import { requestOrderNotificationPermission } from '../src/hooks/useOrderStatusNotifications';
import { useCart } from '../src/context/CartContext';
import { useUserLocation } from '../src/context/LocationContext';
import { AddressAutocompleteInput } from '../src/components/AddressAutocompleteInput';
import { MapLocationPicker } from '../src/components/map/MapLocationPicker';
import type { AddressCandidate } from '../src/lib/geocoding';
import type { MapPoint } from '../src/lib/map/mapEmbedProtocol';
import { colors, formatPeso, radius, shadows, spacing } from '../src/theme';
import { DeliveryMode, PaymentMethod } from '../src/types';

type IconName = keyof typeof Ionicons.glyphMap;

// Delivery is the only service type — customers choose how fast it moves,
// exactly like the web checkout's "Delivery Option" block.
const DELIVERY_MODES: Array<{
  value: DeliveryMode;
  label: string;
  eta: string;
  icon: IconName;
}> = [
  { value: 'priority', label: 'RUSH ORDER', eta: '30 – 45 mins', icon: 'flash-outline' },
  { value: 'economy', label: 'PASABUY', eta: '45 – 120 mins', icon: 'bicycle-outline' },
];

const PAYMENT_METHODS: Array<{ value: PaymentMethod; label: string; icon: IconName }> = [
  { value: 'gcash', label: 'GCash', icon: 'phone-portrait-outline' },
  { value: 'maya', label: 'Maya', icon: 'card-outline' },
  { value: 'bank-transfer', label: 'Bank transfer', icon: 'business-outline' },
];

/** Titled card that groups one step of the checkout form. */
function Section({
  icon,
  title,
  children,
}: {
  icon: IconName;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIcon}>
          <Ionicons name={icon} size={15} color={colors.primary} />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <View style={styles.errorRow}>
      <Ionicons name="alert-circle" size={14} color={colors.danger} />
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

export default function CheckoutScreen() {
  const {
    cartItems,
    merchantsById,
    merchantIds,
    subtotal,
    clearCart,
    removeMerchant,
  } = useCart();
  const {
    userLocation,
    locationDisplayName,
    locationLabel,
    locationNotes,
    selectedAddress,
    isAddressBookReady,
  } = useUserLocation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [customerName, setCustomerName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('priority');
  const [address, setAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('gcash');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Where the order actually goes. It starts as the phone's GPS fix and is
  // replaced the moment the customer moves the pin or picks a suggestion —
  // the map is the authority once they have touched it, because a gate on the
  // far side of a block is metres from the fix and a different fee away.
  const [pinnedLocation, setPinnedLocation] = useState<MapPoint | null>(null);

  // A map inside a ScrollView loses every pan to the parent, so the screen
  // stops scrolling for as long as the customer is touching the map.
  const [isMapActive, setIsMapActive] = useState(false);

  // Both modes are quoted so each option can show its own price up front,
  // mirroring the web checkout.
  // The pin wins over the GPS fix: it is what the customer last said is right.
  const deliveryPoint = pinnedLocation ?? userLocation;

  const priorityQuotes = useMemo(
    () => quoteMerchants(merchantIds, merchantsById, deliveryPoint, 'priority'),
    [merchantIds, merchantsById, deliveryPoint]
  );
  const economyQuotes = useMemo(
    () => quoteMerchants(merchantIds, merchantsById, deliveryPoint, 'economy'),
    [merchantIds, merchantsById, deliveryPoint]
  );

  const quotes = deliveryMode === 'economy' ? economyQuotes : priorityQuotes;
  const primaryMerchantId = useMemo(() => selectPrimaryMerchantId(quotes), [quotes]);

  const modeFees: Record<DeliveryMode, number> = {
    priority: getDeliveryFeeTotal(priorityQuotes),
    economy: getDeliveryFeeTotal(economyQuotes),
  };

  const offersEconomy = useMemo(
    () => hasEconomyOption(merchantIds, merchantsById),
    [merchantIds, merchantsById]
  );

  // One fee for the whole basket — the furthest restaurant's (web parity).
  const deliveryFee = getDeliveryFeeTotal(quotes);
  const total = subtotal + deliveryFee;

  // Prefill from the chosen delivery address, but never overwrite what the
  // customer has typed or pinned themselves on this screen.
  const isAddressEditedRef = useRef(false);
  useEffect(() => {
    if (isAddressEditedRef.current || !locationDisplayName) return;
    setAddress(locationDisplayName);
  }, [locationDisplayName]);

  // A saved address's door notes are rider instructions, so they belong in the
  // notes field rather than buried in the address line.
  const isNotesEditedRef = useRef(false);
  useEffect(() => {
    if (isNotesEditedRef.current || !locationNotes) return;
    setNotes(locationNotes);
  }, [locationNotes]);

  const handleAddressChange = (value: string) => {
    isAddressEditedRef.current = true;
    setAddress(value);
  };

  /** A suggestion carries its own coordinate, so the pin moves with the text. */
  const handleSuggestionSelect = (candidate: AddressCandidate) => {
    isAddressEditedRef.current = true;
    setAddress(candidate.displayName);
    setPinnedLocation({ latitude: candidate.latitude, longitude: candidate.longitude });
  };

  /** The pin moved on the map; the address follows what it reverse-geocoded to. */
  const handlePinSelect = (point: MapPoint, resolvedAddress: string) => {
    isAddressEditedRef.current = true;
    setPinnedLocation(point);
    setAddress(resolvedAddress);
  };

  const undeliverableMerchantId = merchantIds.find((id) => quotes[id]?.deliverable === false);
  const undeliverableReason = undeliverableMerchantId
    ? quotes[undeliverableMerchantId]?.reason
    : undefined;

  // Web parity: an address outside a restaurant's radius blocks the order.
  const canPlaceOrder = cartItems.length > 0 && !undeliverableMerchantId;

  const handlePlaceOrder = async () => {
    if (!canPlaceOrder) return;

    const validation = validateCheckoutForm({
      customerName,
      contactNumber,
      serviceType: 'delivery',
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
        serviceType: 'delivery',
        address,
        deliveryLatitude: deliveryPoint?.latitude,
        deliveryLongitude: deliveryPoint?.longitude,
        paymentMethod,
        deliveryMode: resolveDeliveryMode(offersEconomy, deliveryMode),
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
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!isMapActive}
        keyboardShouldPersistTaps="handled"
      >
        <Section icon="person-outline" title="Your details">
          <TextInput
            style={[styles.input, errors.customerName && styles.inputError]}
            placeholder="Full name"
            placeholderTextColor={colors.textMuted}
            value={customerName}
            onChangeText={setCustomerName}
            autoComplete="name"
          />
          <FieldError message={errors.customerName} />

          <TextInput
            style={[styles.input, errors.contactNumber && styles.inputError]}
            placeholder="Mobile number (09XXXXXXXXX)"
            placeholderTextColor={colors.textMuted}
            value={contactNumber}
            onChangeText={setContactNumber}
            keyboardType="phone-pad"
            autoComplete="tel"
          />
          <FieldError message={errors.contactNumber} />
        </Section>

        <Section icon="location-outline" title="Delivery address">
          <Pressable
            style={styles.locationCard}
            onPress={() => router.push('/addresses')}
            accessibilityRole="button"
            accessibilityLabel="Change the delivery address"
          >
            <Ionicons
              name={selectedAddress ? 'bookmark' : 'navigate-circle-outline'}
              size={18}
              color={colors.primary}
            />
            <View style={styles.locationTextGroup}>
              <Text style={styles.locationTitle}>
                {selectedAddress ? locationLabel : 'Current location (GPS)'}
              </Text>
              <Text style={styles.locationValue} numberOfLines={2}>
                {locationDisplayName ||
                  (isAddressBookReady ? 'No address set — tap to add one' : 'Loading…')}
              </Text>
            </View>
            <Text style={styles.locationAction}>Change</Text>
          </Pressable>

          <AddressAutocompleteInput
            value={address}
            onChangeText={handleAddressChange}
            onSelect={handleSuggestionSelect}
            proximity={deliveryPoint}
            placeholder="House/unit no., street, barangay, landmark"
            hasError={!!errors.address}
            isMultiline
          />
          <FieldError message={errors.address} />

          <MapLocationPicker
            location={deliveryPoint}
            onLocationSelect={handlePinSelect}
            onInteractionStart={() => setIsMapActive(true)}
            onInteractionEnd={() => setIsMapActive(false)}
          />

          <Text style={styles.hint}>
            Edits here apply to this order only. To keep an address for next
            time, tap Change above and save it.
          </Text>
        </Section>

        <Section icon="bicycle-outline" title="Delivery option">
          <View style={styles.segmentRow}>
            {DELIVERY_MODES.map((option) => {
              const isActive = deliveryMode === option.value;
              return (
                <Pressable
                  key={option.value}
                  style={[styles.segment, isActive && styles.segmentActive]}
                  onPress={() => setDeliveryMode(option.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isActive }}
                >
                  <View style={styles.segmentTop}>
                    <Ionicons
                      name={option.icon}
                      size={16}
                      color={isActive ? colors.primary : colors.textSecondary}
                    />
                    <Text style={[styles.segmentLabel, isActive && styles.segmentLabelActive]}>
                      {option.label}
                    </Text>
                  </View>
                  <Text style={[styles.segmentPrice, isActive && styles.segmentPriceActive]}>
                    {formatPeso(modeFees[option.value])}
                  </Text>
                  <Text style={styles.segmentEta}>{option.eta}</Text>
                </Pressable>
              );
            })}
          </View>
          {undeliverableReason && (
            <View style={styles.errorRow}>
              <Ionicons name="alert-circle" size={14} color={colors.danger} />
              <Text style={styles.errorText}>{undeliverableReason}</Text>
            </View>
          )}
        </Section>

        <Section icon="wallet-outline" title="Payment">
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
                <Ionicons
                  name={option.icon}
                  size={18}
                  color={isActive ? colors.primary : colors.textSecondary}
                />
                <Text style={[styles.paymentLabel, isActive && styles.paymentLabelActive]}>
                  {option.label}
                </Text>
                <View style={[styles.radio, isActive && styles.radioSelected]}>
                  {isActive && <Ionicons name="checkmark" size={12} color={colors.onPrimary} />}
                </View>
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
        </Section>

        <Section icon="chatbubble-ellipses-outline" title="Notes">
          <TextInput
            style={[styles.input, styles.multiline]}
            placeholder="Anything we should know? (optional)"
            placeholderTextColor={colors.textMuted}
            value={notes}
            onChangeText={(value) => {
              isNotesEditedRef.current = true;
              setNotes(value);
            }}
            multiline
          />
        </Section>

        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>Order summary</Text>
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
          <View style={styles.summaryDivider} />
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

        {submitError && (
          <View style={styles.submitErrorBox}>
            <Ionicons name="alert-circle" size={16} color={colors.danger} />
            <Text style={styles.submitError}>{submitError}</Text>
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <Pressable
          style={({ pressed }) => [
            styles.cta,
            (isSubmitting || !canPlaceOrder) && styles.ctaDisabled,
            pressed && styles.ctaPressed,
          ]}
          onPress={handlePlaceOrder}
          disabled={isSubmitting || !canPlaceOrder}
          accessibilityRole="button"
        >
          {isSubmitting ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <>
              <Ionicons name="lock-closed" size={16} color={colors.onPrimary} />
              <Text style={styles.ctaText}>Place order · {formatPeso(total)}</Text>
            </>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: 170 },

  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text, letterSpacing: -0.2 },

  input: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: spacing.md,
    paddingVertical: 13,
    fontSize: 15,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  multiline: { minHeight: 76, textAlignVertical: 'top' },
  inputError: { borderColor: colors.danger, backgroundColor: colors.dangerLight },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: spacing.sm },
  errorText: { flex: 1, color: colors.danger, fontSize: 12.5, fontWeight: '600' },

  segmentRow: { flexDirection: 'row', gap: spacing.sm },
  segment: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingVertical: spacing.md,
  },
  segmentActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  segmentTop: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  segmentLabel: { fontSize: 12.5, fontWeight: '800', color: colors.textSecondary, letterSpacing: 0.3 },
  segmentLabelActive: { color: colors.primaryDark },
  segmentPrice: { fontSize: 16, fontWeight: '800', color: colors.text },
  segmentPriceActive: { color: colors.primary },
  segmentEta: { fontSize: 11.5, color: colors.textMuted, fontWeight: '600' },

  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  locationTextGroup: { flex: 1 },
  locationAction: { fontSize: 13, fontWeight: '800', color: colors.primary },
  locationTitle: { fontSize: 11.5, fontWeight: '800', color: colors.textMuted, letterSpacing: 0.3 },
  locationValue: { fontSize: 13.5, fontWeight: '600', color: colors.text, marginTop: 2 },
  hint: { fontSize: 11.5, color: colors.textMuted, lineHeight: 16 },

  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  paymentRowActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  paymentLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  paymentLabelActive: { fontWeight: '800' },
  radio: {
    width: 20,
    height: 20,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { borderColor: colors.primary, backgroundColor: colors.primary },

  summary: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadows.sm,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.md,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  summaryDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  summaryLabel: { flex: 1, color: colors.textSecondary, fontSize: 14 },
  summaryValue: { fontWeight: '700', color: colors.text, fontSize: 14 },
  multiMerchantNote: { color: colors.textMuted, fontSize: 12, marginBottom: spacing.sm },
  summaryTotalRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    marginBottom: 0,
  },
  summaryTotalLabel: { fontWeight: '800', fontSize: 16, color: colors.text },
  summaryTotalValue: { fontWeight: '800', fontSize: 20, color: colors.primary },

  submitErrorBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.dangerLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  submitError: { flex: 1, color: colors.danger, fontSize: 13, fontWeight: '600', lineHeight: 19 },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    ...shadows.lg,
  },
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
