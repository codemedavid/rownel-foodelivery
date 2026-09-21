// Add or edit one saved address. `/address/new` adds; `/address/<id>` edits.
//
// The screen owns navigation and the "where did this draft come from" decision;
// the form owns the fields. A new address opens pre-filled from the last GPS
// fix when there is one, so the common case is: check the pin, name it, save.

import React, { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AddressForm } from '../../src/components/address/AddressForm';
import { useUserLocation } from '../../src/context/LocationContext';
import {
  createEmptyDraft,
  draftFromAddress,
  findAddress,
  type AddressDraft,
} from '../../src/lib/savedAddresses';
import { colors, spacing } from '../../src/theme';

const NEW_ADDRESS_ID = 'new';

export default function AddressEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    addresses,
    isAddressBookReady,
    saveAddress,
    deleteAddress,
    userLocation,
    locationDisplayName,
    isUsingSavedAddress,
  } = useUserLocation();

  const [isSaving, setIsSaving] = useState(false);
  const [isMapActive, setIsMapActive] = useState(false);

  const isNew = !id || id === NEW_ADDRESS_ID;
  const existing = isNew ? null : findAddress(addresses, id);

  // Computed once per mount: re-deriving it would throw away edits in progress
  // whenever the address list or a GPS fix updated underneath.
  const initialDraft = useMemo<AddressDraft>(() => {
    if (existing) return draftFromAddress(existing);

    const empty = createEmptyDraft();
    // A GPS fix already taken is a free head start; a saved address's
    // coordinates are not, because this is meant to be a *different* place.
    if (isUsingSavedAddress || !userLocation) return empty;

    return {
      ...empty,
      displayName: locationDisplayName,
      latitude: userLocation.latitude,
      longitude: userLocation.longitude,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async (draft: AddressDraft) => {
    setIsSaving(true);
    const saved = await saveAddress(draft);
    setIsSaving(false);

    if (!saved) {
      Alert.alert(
        'Address book is full',
        'Delete an address you no longer use, then save this one.'
      );
      return;
    }
    router.back();
  };

  const handleDelete = () => {
    if (!existing) return;
    Alert.alert(
      `Delete “${existing.label}”?`,
      'This removes the address from this device.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteAddress(existing.id);
            router.back();
          },
        },
      ]
    );
  };

  // The list is read from storage asynchronously; judging "not found" before it
  // lands would flash an error on a perfectly good address.
  if (!isNew && !existing) {
    return (
      <View style={styles.missing}>
        <Stack.Screen options={{ title: 'Address' }} />
        <Text style={styles.missingText}>
          {isAddressBookReady ? 'This address is no longer saved.' : 'Loading…'}
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: isNew ? 'Add address' : 'Edit address' }} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!isMapActive}
        showsVerticalScrollIndicator={false}
      >
        <AddressForm
          initialDraft={initialDraft}
          isSaving={isSaving}
          canSetDefault={addresses.length > 0 && !(existing?.isDefault ?? false)}
          onSave={handleSave}
          onDelete={existing ? handleDelete : undefined}
          onInteractionStart={() => setIsMapActive(true)}
          onInteractionEnd={() => setIsMapActive(false)}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  missingText: { fontSize: 14, color: colors.textSecondary },
});
