import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../../theme';

interface Props {
  emoji: string;
  title: string;
  body?: string;
}

export const EmptyState = ({ emoji, title, body }: Props) => (
  <View style={styles.wrap}>
    <Text style={styles.emoji}>{emoji}</Text>
    <Text style={styles.title}>{title}</Text>
    {!!body && <Text style={styles.body}>{body}</Text>}
  </View>
);

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', padding: spacing.xxl, gap: spacing.sm },
  emoji: { fontSize: 40 },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  body: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 19 },
});
