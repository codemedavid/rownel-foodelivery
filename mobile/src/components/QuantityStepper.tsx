import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../theme';

type Props = {
  quantity: number;
  onDecrease: () => void;
  onIncrease: () => void;
  size?: 'small' | 'large';
};

export function QuantityStepper({ quantity, onDecrease, onIncrease, size = 'large' }: Props) {
  const isSmall = size === 'small';
  return (
    <View style={[styles.row, isSmall && styles.rowSmall]}>
      <Pressable
        style={[styles.button, isSmall && styles.buttonSmall]}
        onPress={onDecrease}
        accessibilityRole="button"
        accessibilityLabel="Decrease quantity"
      >
        <Text style={styles.buttonText}>−</Text>
      </Pressable>
      <Text style={[styles.quantity, isSmall && styles.quantitySmall]}>{quantity}</Text>
      <Pressable
        style={[styles.button, styles.buttonPrimary, isSmall && styles.buttonSmall]}
        onPress={onIncrease}
        accessibilityRole="button"
        accessibilityLabel="Increase quantity"
      >
        <Text style={[styles.buttonText, styles.buttonPrimaryText]}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  rowSmall: { gap: 10 },
  button: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  buttonSmall: { width: 28, height: 28 },
  buttonPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  buttonText: { fontSize: 18, fontWeight: '700', color: colors.text, lineHeight: 20 },
  buttonPrimaryText: { color: '#fff' },
  quantity: { fontSize: 17, fontWeight: '800', color: colors.text, minWidth: 24, textAlign: 'center' },
  quantitySmall: { fontSize: 15, minWidth: 20 },
});
