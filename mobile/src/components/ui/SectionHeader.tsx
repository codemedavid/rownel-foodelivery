import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../../theme';

interface Props {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onActionPress?: () => void;
}

export const SectionHeader = ({ title, subtitle, actionLabel, onActionPress }: Props) => (
  <View style={styles.row}>
    <View style={styles.text}>
      <Text style={styles.title}>{title}</Text>
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
    {!!actionLabel && !!onActionPress && (
      <Pressable onPress={onActionPress} accessibilityRole="button" hitSlop={8}>
        <Text style={styles.action}>{actionLabel}</Text>
      </Pressable>
    )}
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  text: { flex: 1 },
  title: { ...typography.heading, fontSize: 19 },
  subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  action: { fontSize: 13, fontWeight: '800', color: colors.primary },
});
