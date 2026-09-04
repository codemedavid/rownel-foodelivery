import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../../theme';

interface Props {
  label: string;
  value: string;
  hint?: string;
}

export const StatCard = ({ label, value, hint }: Props) => (
  <View style={styles.card}>
    <Text style={styles.label}>{label}</Text>
    <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
      {value}
    </Text>
    {!!hint && <Text style={styles.hint}>{hint}</Text>}
  </View>
);

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 140,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  label: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  value: { fontSize: 20, fontWeight: '800', color: colors.text },
  hint: { fontSize: 11, color: colors.textMuted },
});
