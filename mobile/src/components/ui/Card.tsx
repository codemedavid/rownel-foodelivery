import React from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { colors, radius, shadows, spacing } from '../../theme';

type Elevation = 'none' | 'sm' | 'md' | 'lg';

interface Props {
  children: React.ReactNode;
  elevation?: Elevation;
  padded?: boolean;
  onPress?: () => void;
  style?: ViewStyle | ViewStyle[];
  accessibilityLabel?: string;
}

/** Neutral surface container — the base of every grouped block in the app. */
export const Card = ({
  children,
  elevation = 'sm',
  padded = true,
  onPress,
  style,
  accessibilityLabel,
}: Props) => {
  const base = [styles.card, shadows[elevation], padded && styles.padded, style];

  if (!onPress) return <View style={base}>{children}</View>;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [...base, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  padded: { padding: spacing.lg },
  pressed: { opacity: 0.85, transform: [{ scale: 0.995 }] },
});
