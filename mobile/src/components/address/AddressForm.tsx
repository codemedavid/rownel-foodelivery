// Add or edit one saved address.
//
// The field the customer types in is the authority on wording. A suggestion or
// a dragged pin sets the *coordinate*, and after that they can keep typing —
// adding "Unit 4B", "green gate", "tapat ng barangay hall" — without the pin
// jumping or the text being rewritten under them. That is the whole point of
// entering an address by hand: a map service does not know the landmarks
// Philippine addresses are actually given in.
//
// The pin fills the text field only while it is still empty, so the common
// "drop a pin on a new address" path costs no typing at all.

import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AddressAutocompleteInput } from '../AddressAutocompleteInput';
import { MapLocationPicker } from '../map/MapLocationPicker';
import { suggestAddresses, type AddressCandidate } from '../../lib/geocoding';
import { logGeocodingError } from '../../lib/geocodingError';
import {
  ADDRESS_NOTES_MAX_LENGTH,
  SUGGESTED_ADDRESS_LABELS,
  validateAddressDraft,
  type AddressDraft,
} from '../../lib/savedAddresses';
import type { MapPoint } from '../../lib/map/mapEmbedProtocol';
import { colors, radius, spacing } from '../../theme';

export interface AddressFormProps {
  initialDraft: AddressDraft;
  isSaving: boolean;
  /** Hidden for the first address — it becomes the default on its own. */
  canSetDefault: boolean;
  onSave: (draft: AddressDraft) => void;
  onDelete?: () => void;
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
}

export function AddressForm({
  initialDraft,
  isSaving,
  canSetDefault,
  onSave,
  onDelete,
  onInteractionStart,
  onInteractionEnd,
}: AddressFormProps) {
  const [draft, setDraft] = useState<AddressDraft>(initialDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLocatingText, setIsLocatingText] = useState(false);

  // What the last pin move reverse-geocoded to. Offered as a one-tap fill
  // rather than overwriting an address the customer wrote themselves.
  const [pinAddress, setPinAddress] = useState('');

  // Read inside callbacks that must not be re-created on every keystroke.
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const update = useCallback((patch: Partial<AddressDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  }, []);

  const clearError = useCallback((field: string) => {
    setErrors((current) => {
      if (!current[field]) return current;
      return Object.fromEntries(Object.entries(current).filter(([key]) => key !== field));
    });
  }, []);

  const handleAddressTextChange = useCallback(
    (displayName: string) => {
      update({ displayName });
      clearError('displayName');
    },
    [clearError, update]
  );

  /** A suggestion carries its coordinate, so there is no second lookup. */
  const handleSuggestionSelect = useCallback(
    (candidate: AddressCandidate) => {
      update({
        displayName: candidate.displayName,
        latitude: candidate.latitude,
        longitude: candidate.longitude,
      });
      setPinAddress('');
      clearError('displayName');
      clearError('coordinates');
    },
    [clearError, update]
  );

  const handlePinSelect = useCallback(
    (point: MapPoint, resolvedAddress: string) => {
      const hasTypedAddress = draftRef.current.displayName.trim().length > 0;

      update({
        latitude: point.latitude,
        longitude: point.longitude,
        // An empty field is filled for free; a written one is left alone.
        ...(hasTypedAddress ? {} : { displayName: resolvedAddress }),
      });
      setPinAddress(hasTypedAddress ? resolvedAddress : '');
      clearError('coordinates');
    },
    [clearError, update]
  );

  const usePinAddress = useCallback(() => {
    update({ displayName: pinAddress });
    setPinAddress('');
    clearError('displayName');
  }, [clearError, pinAddress, update]);

  /**
   * Last resort before refusing to save: look up whatever they typed. A
   * customer who wrote a complete address by hand should not be forced onto the
   * map just because they never touched the suggestion list.
   */
  const resolveTypedAddress = useCallback(async (current: AddressDraft): Promise<AddressDraft> => {
    setIsLocatingText(true);
    try {
      const [match] = await suggestAddresses(current.displayName, { limit: 1 });
      if (!match) return current;
      return { ...current, latitude: match.latitude, longitude: match.longitude };
    } catch (error: unknown) {
      logGeocodingError('address lookup before save', error);
      return current;
    } finally {
      setIsLocatingText(false);
    }
  }, []);

  const handleSave = useCallback(async () => {
    let candidate = draftRef.current;

    const hasCoordinates = candidate.latitude !== null && candidate.longitude !== null;
    const hasEnoughText = candidate.displayName.trim().length > 0;

    if (!hasCoordinates && hasEnoughText) {
      candidate = await resolveTypedAddress(candidate);
      setDraft(candidate);
    }

    const validation = validateAddressDraft(candidate);
    setErrors(validation.errors);
    if (!validation.valid) return;

    onSave(candidate);
  }, [onSave, resolveTypedAddress]);

  const isBusy = isSaving || isLocatingText;
  const pinPoint: MapPoint | null =
    draft.latitude !== null && draft.longitude !== null
      ? { latitude: draft.latitude, longitude: draft.longitude }
      : null;

  return (
    <View style={styles.container}>
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Name this address</Text>
        <View style={styles.chipRow}>
          {SUGGESTED_ADDRESS_LABELS.map((label) => {
            const isActive = draft.label.trim().toLowerCase() === label.toLowerCase();
            return (
              <Pressable
                key={label}
                onPress={() => {
                  update({ label });
                  clearError('label');
                }}
                style={[styles.chip, isActive && styles.chipActive]}
                accessibilityRole="radio"
                accessibilityState={{ selected: isActive }}
              >
                <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        <TextInput
          style={[styles.input, errors.label && styles.inputError]}
          placeholder="Or type your own, like Lola's house"
          placeholderTextColor={colors.textMuted}
          value={draft.label}
          onChangeText={(label) => {
            update({ label });
            clearError('label');
          }}
          accessibilityLabel="Address name"
        />
        <FieldError message={errors.label} />
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Full address</Text>
        <Text style={styles.fieldHint}>
          Type it exactly as you would tell a rider. Search a landmark to place the pin, then keep
          editing the text — the pin stays where you put it.
        </Text>
        <AddressAutocompleteInput
          value={draft.displayName}
          onChangeText={handleAddressTextChange}
          onSelect={handleSuggestionSelect}
          proximity={pinPoint}
          placeholder="House/unit no., street, barangay, city"
          hasError={!!errors.displayName}
          isMultiline
        />
        <FieldError message={errors.displayName} />
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Pin on the map</Text>
        <Text style={styles.fieldHint}>
          Drag the pin to your exact gate or door. This is what your rider navigates to.
        </Text>
        <MapLocationPicker
          location={pinPoint}
          onLocationSelect={handlePinSelect}
          onInteractionStart={onInteractionStart}
          onInteractionEnd={onInteractionEnd}
        />
        {!!pinAddress && (
          <Pressable
            onPress={usePinAddress}
            style={styles.pinSuggestion}
            accessibilityRole="button"
            accessibilityLabel={`Use the pinned address: ${pinAddress}`}
          >
            <Ionicons name="return-down-forward" size={14} color={colors.primary} />
            <Text style={styles.pinSuggestionText} numberOfLines={2}>
              Use “{pinAddress}” as the address
            </Text>
          </Pressable>
        )}
        <FieldError message={errors.coordinates} />
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Notes for the rider (optional)</Text>
        <TextInput
          style={[styles.input, styles.notesInput, errors.notes && styles.inputError]}
          placeholder="Unit/floor, gate colour, landmark, who to call"
          placeholderTextColor={colors.textMuted}
          value={draft.notes}
          onChangeText={(notes) => {
            update({ notes });
            clearError('notes');
          }}
          multiline
          maxLength={ADDRESS_NOTES_MAX_LENGTH}
          accessibilityLabel="Notes for the rider"
        />
        <FieldError message={errors.notes} />
      </View>

      {canSetDefault && (
        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <Text style={styles.fieldLabel}>Make this my default</Text>
            <Text style={styles.fieldHint}>New orders start here.</Text>
          </View>
          <Switch
            value={draft.isDefault}
            onValueChange={(isDefault) => update({ isDefault })}
            trackColor={{ true: colors.primaryLight, false: colors.borderStrong }}
            thumbColor={draft.isDefault ? colors.primary : colors.surface}
            accessibilityLabel="Make this my default address"
          />
        </View>
      )}

      <Pressable
        onPress={() => void handleSave()}
        disabled={isBusy}
        style={({ pressed }) => [
          styles.saveButton,
          pressed && styles.saveButtonPressed,
          isBusy && styles.saveButtonDisabled,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Save this address"
      >
        {isBusy ? (
          <ActivityIndicator size="small" color={colors.onPrimary} />
        ) : (
          <Ionicons name="checkmark" size={18} color={colors.onPrimary} />
        )}
        <Text style={styles.saveButtonText}>
          {isLocatingText ? 'Finding it on the map…' : 'Save address'}
        </Text>
      </Pressable>

      {!!onDelete && (
        <Pressable
          onPress={onDelete}
          style={styles.deleteButton}
          accessibilityRole="button"
          accessibilityLabel="Delete this address"
        >
          <Ionicons name="trash-outline" size={16} color={colors.danger} />
          <Text style={styles.deleteButtonText}>Delete address</Text>
        </Pressable>
      )}
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

const styles = StyleSheet.create({
  container: { gap: spacing.xl },
  field: { gap: spacing.sm },
  fieldLabel: { fontSize: 14, fontWeight: '800', color: colors.text },
  fieldHint: { fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  chipTextActive: { color: colors.primary },
  input: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.text,
  },
  notesInput: { minHeight: 72, textAlignVertical: 'top' },
  inputError: { borderColor: colors.danger },
  pinSuggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  pinSuggestionText: { flex: 1, fontSize: 12, fontWeight: '600', color: colors.primary },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  switchText: { flex: 1, gap: 2 },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  saveButtonPressed: { backgroundColor: colors.primaryDark },
  saveButtonDisabled: { opacity: 0.7 },
  saveButtonText: { fontSize: 15, fontWeight: '800', color: colors.onPrimary },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  deleteButtonText: { fontSize: 14, fontWeight: '700', color: colors.danger },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  errorText: { flex: 1, fontSize: 12, color: colors.danger },
});
