import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, spacing } from '../../theme';
import { describeOrderStatus } from '../../lib/orderStatusDisplay';

interface Props {
  status?: string | null;
}

/** Colour-coded order status chip shared by the order list and detail screens. */
export const StatusPill = ({ status }: Props) => {
  const { label, color, background, icon } = describeOrderStatus(status);
  return (
    <View style={[styles.pill, { backgroundColor: background }]}>
      <Ionicons name={icon} size={13} color={color} />
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
  },
  label: { fontSize: 12, fontWeight: '800' },
});
