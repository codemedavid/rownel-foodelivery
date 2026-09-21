// Address field with Apple Maps autocomplete, matching the web checkout's.
//
// The list indexes businesses and landmarks as well as street addresses:
// Philippine customers locate themselves by store name far more often than by
// house number. Each row already carries its coordinate, so picking one drops
// the pin immediately — there is no second lookup to wait through.
//
// Typing always works. If the lookup fails, the field says so in one line and
// keeps whatever the customer wrote: an address they typed themselves still
// gets the order delivered.

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAddressSuggestions } from '../hooks/useAddressSuggestions';
import type { AddressCandidate, ProximityPoint } from '../lib/geocoding';
import { colors, radius, shadows, spacing } from '../theme';

// Tall enough to show about four rows before the list scrolls, which keeps the
// map below it on screen while the customer chooses.
const MAX_LIST_HEIGHT = 208;

export interface AddressAutocompleteInputProps {
  value: string;
  onChangeText: (value: string) => void;
  onSelect: (candidate: AddressCandidate) => void;
  /** Ranks nearby results first — usually the pin or the phone's GPS fix. */
  proximity?: ProximityPoint | null;
  placeholder?: string;
  isMultiline?: boolean;
  hasError?: boolean;
  inputStyle?: StyleProp<TextStyle>;
}

export function AddressAutocompleteInput({
  value,
  onChangeText,
  onSelect,
  proximity,
  placeholder = 'Search a street, barangay or landmark',
  isMultiline = false,
  hasError = false,
  inputStyle,
}: AddressAutocompleteInputProps) {
  // The list is hidden while the customer is not in the field, and re-hidden
  // the moment they pick a row, so it never covers what they picked.
  const [isFocused, setIsFocused] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  const { candidates, isLoading, errorMessage } = useAddressSuggestions(value, proximity);

  const isListVisible = isFocused && !isDismissed && candidates.length > 0;

  const handleChangeText = (next: string) => {
    setIsDismissed(false);
    onChangeText(next);
  };

  const handleSelect = (candidate: AddressCandidate) => {
    setIsDismissed(true);
    onSelect(candidate);
  };

  return (
    <View style={styles.container}>
      <View style={styles.inputRow}>
        <TextInput
          style={[
            styles.input,
            isMultiline && styles.multiline,
            hasError && styles.inputError,
            inputStyle,
          ]}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          value={value}
          onChangeText={handleChangeText}
          onFocus={() => setIsFocused(true)}
          // Delayed so a tap on a row lands before the list is torn down.
          onBlur={() => setTimeout(() => setIsFocused(false), 150)}
          multiline={isMultiline}
          autoCorrect={false}
          accessibilityLabel="Delivery address"
        />
        {isLoading && (
          <ActivityIndicator style={styles.spinner} size="small" color={colors.textMuted} />
        )}
      </View>

      {!!errorMessage && (
        <View style={styles.noticeRow}>
          <Ionicons name="information-circle-outline" size={14} color={colors.textSecondary} />
          <Text style={styles.noticeText}>{errorMessage}</Text>
        </View>
      )}

      {isListVisible && (
        <View style={styles.list}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            style={{ maxHeight: MAX_LIST_HEIGHT }}
          >
            {candidates.map((candidate, index) => (
              <Pressable
                key={`${candidate.placeId}-${index}`}
                onPress={() => handleSelect(candidate)}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                accessibilityRole="button"
                accessibilityLabel={candidate.displayName}
              >
                <Ionicons name="location-outline" size={16} color={colors.primary} />
                <View style={styles.rowText}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {candidate.name}
                  </Text>
                  {!!candidate.context && (
                    <Text style={styles.rowContext} numberOfLines={1}>
                      {candidate.context}
                    </Text>
                  )}
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'relative', zIndex: 10 },
  inputRow: { justifyContent: 'center' },
  input: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    paddingRight: spacing.xl + spacing.sm,
    fontSize: 15,
    color: colors.text,
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  inputError: { borderColor: colors.danger },
  spinner: { position: 'absolute', right: spacing.md },
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  noticeText: { flex: 1, fontSize: 12, color: colors.textSecondary },
  list: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadows.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowPressed: { backgroundColor: colors.surfaceSunken },
  rowText: { flex: 1 },
  rowName: { fontSize: 14, fontWeight: '600', color: colors.text },
  rowContext: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
});
