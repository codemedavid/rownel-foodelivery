import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '../../theme';
import { Button } from './Button';

interface Props {
  /** Legacy emoji glyph — `icon` renders a nicer tinted tile when provided. */
  emoji?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  actionLabel?: string;
  onActionPress?: () => void;
}

export const EmptyState = ({
  emoji,
  icon,
  title,
  body,
  actionLabel,
  onActionPress,
}: Props) => (
  <View style={styles.wrap}>
    <View style={styles.tile}>
      {icon ? (
        <Ionicons name={icon} size={30} color={colors.primary} />
      ) : (
        <Text style={styles.emoji}>{emoji ?? '✨'}</Text>
      )}
    </View>
    <Text style={styles.title}>{title}</Text>
    {!!body && <Text style={styles.body}>{body}</Text>}
    {!!actionLabel && !!onActionPress && (
      <Button label={actionLabel} onPress={onActionPress} style={styles.action} />
    )}
  </View>
);

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', padding: spacing.xxl, gap: spacing.sm },
  tile: {
    width: 68,
    height: 68,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  emoji: { fontSize: 32 },
  title: { fontSize: 17, fontWeight: '800', color: colors.text },
  body: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 300,
  },
  action: { marginTop: spacing.md, paddingHorizontal: spacing.xxl },
});
