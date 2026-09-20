import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, radius, spacing } from '../../theme';

interface Props {
  label: string;
  isActive?: boolean;
  onPress: () => void;
}

/** Pill-shaped filter control used for categories and menu sections. */
export const Chip = ({ label, isActive = false, onPress }: Props) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityState={{ selected: isActive }}
    style={({ pressed }) => [
      styles.chip,
      isActive && styles.chipActive,
      pressed && styles.pressed,
    ]}
  >
    <Text style={[styles.label, isActive && styles.labelActive]}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  chip: {
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.text, borderColor: colors.text },
  pressed: { opacity: 0.7 },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'capitalize',
  },
  labelActive: { color: colors.onPrimary },
});
