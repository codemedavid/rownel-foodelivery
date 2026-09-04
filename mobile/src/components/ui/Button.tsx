import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';
import { colors, radius, spacing } from '../../theme';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  isLoading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  size?: 'sm' | 'md';
}

const VARIANT_STYLES: Record<Variant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: colors.primary, fg: '#fff' },
  secondary: { bg: colors.surface, fg: colors.text, border: colors.border },
  danger: { bg: colors.primaryLight, fg: colors.danger },
  ghost: { bg: 'transparent', fg: colors.primary },
};

export const Button = ({
  label,
  onPress,
  variant = 'primary',
  isLoading = false,
  disabled = false,
  style,
  size = 'md',
}: Props) => {
  const v = VARIANT_STYLES[variant];
  const isInactive = disabled || isLoading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isInactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: isInactive }}
      style={({ pressed }) => [
        styles.base,
        size === 'sm' && styles.small,
        { backgroundColor: v.bg, borderColor: v.border ?? v.bg },
        (pressed || isInactive) && { opacity: 0.6 },
        style,
      ]}
    >
      {isLoading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <Text style={[styles.label, size === 'sm' && styles.smallLabel, { color: v.fg }]}>{label}</Text>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: 13,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  small: { paddingVertical: 8, paddingHorizontal: spacing.md },
  label: { fontSize: 15, fontWeight: '800' },
  smallLabel: { fontSize: 13 },
});
