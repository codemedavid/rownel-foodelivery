import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, shadows, spacing } from '../../theme';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  isLoading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  size?: 'sm' | 'md' | 'lg';
  icon?: keyof typeof Ionicons.glyphMap;
}

const VARIANT_STYLES: Record<Variant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: colors.primary, fg: colors.onPrimary },
  secondary: { bg: colors.surface, fg: colors.text, border: colors.borderStrong },
  danger: { bg: colors.dangerLight, fg: colors.danger },
  ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
};

const ICON_SIZE = { sm: 15, md: 17, lg: 19 } as const;

export const Button = ({
  label,
  onPress,
  variant = 'primary',
  isLoading = false,
  disabled = false,
  style,
  size = 'md',
  icon,
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
        size === 'lg' && styles.large,
        { backgroundColor: v.bg, borderColor: v.border ?? v.bg },
        variant === 'primary' && !isInactive && shadows.sm,
        pressed && styles.pressed,
        isInactive && styles.inactive,
        style,
      ]}
    >
      {isLoading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <View style={styles.content}>
          {!!icon && <Ionicons name={icon} size={ICON_SIZE[size]} color={v.fg} />}
          <Text
            style={[
              styles.label,
              size === 'sm' && styles.smallLabel,
              size === 'lg' && styles.largeLabel,
              { color: v.fg },
            ]}
          >
            {label}
          </Text>
        </View>
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
  small: { paddingVertical: 8, paddingHorizontal: spacing.md, borderRadius: radius.sm },
  large: { paddingVertical: 16, borderRadius: radius.lg },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pressed: { opacity: 0.75, transform: [{ scale: 0.985 }] },
  inactive: { opacity: 0.5 },
  label: { fontSize: 15, fontWeight: '800', letterSpacing: 0.1 },
  smallLabel: { fontSize: 13 },
  largeLabel: { fontSize: 16 },
});
