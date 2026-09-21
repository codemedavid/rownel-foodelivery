// The address book: pick where an order goes, or manage the list.
//
// Tapping a row selects it and returns — choosing an address is the reason
// almost everyone opens this screen, so it costs one tap and no confirmation.
// Editing and deleting sit behind their own controls on the row.

import React, { useCallback } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUserLocation } from '../src/context/LocationContext';
import { MAX_SAVED_ADDRESSES, type SavedAddress } from '../src/lib/savedAddresses';
import { colors, radius, shadows, spacing } from '../src/theme';

export default function AddressesScreen() {
  const {
    addresses,
    selectedAddress,
    isAddressBookReady,
    isAddressBookFull,
    deleteAddress,
    selectAddress,
    makeAddressDefault,
    deliverToCurrentLocation,
    locationStatus,
    locationError,
    isUsingSavedAddress,
  } = useUserLocation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const choose = useCallback(
    async (id: string) => {
      await selectAddress(id);
      router.back();
    },
    [router, selectAddress]
  );

  const confirmDelete = useCallback(
    (address: SavedAddress) => {
      Alert.alert(
        `Delete “${address.label}”?`,
        'This removes the address from this device. Your past orders keep the address they were delivered to.',
        [
          { text: 'Keep it', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => void deleteAddress(address.id),
          },
        ]
      );
    },
    [deleteAddress]
  );

  const detectNow = useCallback(async () => {
    await deliverToCurrentLocation();
    router.back();
  }, [router, deliverToCurrentLocation]);

  const isLocating = locationStatus === 'locating';

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
    >
      <Pressable
        onPress={() => void detectNow()}
        disabled={isLocating}
        style={({ pressed }) => [styles.gpsCard, pressed && styles.gpsCardPressed]}
        accessibilityRole="button"
        accessibilityLabel="Deliver to my current location"
      >
        <View style={styles.gpsIcon}>
          <Ionicons name="navigate" size={17} color={colors.primary} />
        </View>
        <View style={styles.gpsText}>
          <Text style={styles.gpsTitle}>
            {isLocating ? 'Finding you…' : 'Deliver to my current location'}
          </Text>
          <Text style={styles.gpsHint}>
            {!isUsingSavedAddress && locationStatus === 'ready'
              ? 'Currently in use'
              : 'Uses your phone’s GPS for this order'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={17} color={colors.textMuted} />
      </Pressable>

      {!!locationError && (
        <View style={styles.noticeRow}>
          <Ionicons name="information-circle-outline" size={15} color={colors.warning} />
          <Text style={styles.noticeText}>{locationError}</Text>
        </View>
      )}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Saved addresses</Text>
        <Text style={styles.sectionCount}>
          {addresses.length}/{MAX_SAVED_ADDRESSES}
        </Text>
      </View>

      {isAddressBookReady && addresses.length === 0 && (
        <View style={styles.empty}>
          <Ionicons name="home-outline" size={26} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No saved addresses yet</Text>
          <Text style={styles.emptyText}>
            Add your home and work addresses once, then pick one at checkout.
          </Text>
        </View>
      )}

      {addresses.map((address) => {
        const isSelected = isUsingSavedAddress && selectedAddress?.id === address.id;
        return (
          <View key={address.id} style={[styles.card, isSelected && styles.cardSelected]}>
            <Pressable
              onPress={() => void choose(address.id)}
              style={styles.cardMain}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`Deliver to ${address.label}: ${address.displayName}`}
            >
              <Ionicons
                name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                size={19}
                color={isSelected ? colors.primary : colors.textMuted}
              />
              <View style={styles.cardText}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardLabel} numberOfLines={1}>
                    {address.label}
                  </Text>
                  {address.isDefault && (
                    <View style={styles.defaultBadge}>
                      <Text style={styles.defaultBadgeText}>Default</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.cardAddress} numberOfLines={2}>
                  {address.displayName}
                </Text>
                {!!address.notes && (
                  <Text style={styles.cardNotes} numberOfLines={1}>
                    {address.notes}
                  </Text>
                )}
              </View>
            </Pressable>

            <View style={styles.cardActions}>
              {!address.isDefault && (
                <Pressable
                  onPress={() => void makeAddressDefault(address.id)}
                  style={styles.action}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`Make ${address.label} my default address`}
                >
                  <Ionicons name="star-outline" size={15} color={colors.textSecondary} />
                  <Text style={styles.actionText}>Set default</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => router.push(`/address/${address.id}`)}
                style={styles.action}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${address.label}`}
              >
                <Ionicons name="create-outline" size={15} color={colors.textSecondary} />
                <Text style={styles.actionText}>Edit</Text>
              </Pressable>
              <Pressable
                onPress={() => confirmDelete(address)}
                style={styles.action}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${address.label}`}
              >
                <Ionicons name="trash-outline" size={15} color={colors.danger} />
                <Text style={[styles.actionText, styles.actionTextDanger]}>Delete</Text>
              </Pressable>
            </View>
          </View>
        );
      })}

      <Pressable
        onPress={() => router.push('/address/new')}
        disabled={isAddressBookFull}
        style={({ pressed }) => [
          styles.addButton,
          pressed && styles.addButtonPressed,
          isAddressBookFull && styles.addButtonDisabled,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Add a new address"
      >
        <Ionicons name="add" size={19} color={colors.onPrimary} />
        <Text style={styles.addButtonText}>Add a new address</Text>
      </Pressable>

      {isAddressBookFull && (
        <Text style={styles.fullNotice}>
          You have saved the maximum of {MAX_SAVED_ADDRESSES} addresses. Delete one to add another.
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  gpsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  gpsCardPressed: { backgroundColor: colors.surfaceSunken },
  gpsIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  gpsText: { flex: 1, gap: 2 },
  gpsTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  gpsHint: { fontSize: 12, color: colors.textSecondary },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.warningLight,
  },
  noticeText: { flex: 1, fontSize: 12, color: colors.warning, lineHeight: 17 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: colors.textSecondary, letterSpacing: 0.4 },
  sectionCount: { fontSize: 12, color: colors.textMuted },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  emptyText: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 19 },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  cardSelected: { borderColor: colors.primary },
  cardMain: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.lg,
  },
  cardText: { flex: 1, gap: 3 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardLabel: { fontSize: 15, fontWeight: '800', color: colors.text },
  defaultBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
  },
  defaultBadgeText: { fontSize: 10, fontWeight: '800', color: colors.primaryDark },
  cardAddress: { fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  cardNotes: { fontSize: 12, color: colors.textMuted, fontStyle: 'italic' },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  action: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  actionText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  actionTextDanger: { color: colors.danger },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  addButtonPressed: { backgroundColor: colors.primaryDark },
  addButtonDisabled: { opacity: 0.5 },
  addButtonText: { fontSize: 15, fontWeight: '800', color: colors.onPrimary },
  fullNotice: { fontSize: 12, color: colors.textSecondary, textAlign: 'center' },
});
