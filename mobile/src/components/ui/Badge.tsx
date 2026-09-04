import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { radius, spacing } from '../../theme';

interface Props {
  label: string;
  color: string;
  backgroundColor: string;
}

export const Badge = ({ label, color, backgroundColor }: Props) => (
  <View style={[styles.badge, { backgroundColor }]}>
    <Text style={[styles.text, { color }]}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  badge: {
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.3 },
});
